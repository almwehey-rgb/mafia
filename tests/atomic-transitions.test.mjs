import test from 'node:test';
import assert from 'node:assert/strict';
import {edgeFixture} from './helpers/edge-fixture.mjs';

async function seed(db,phase='vote'){
 await db.exec(`insert into mafia_rooms(code,host_token,enabled_roles) values('8754','host','{"full_trial":false,"doctor":false,"jailer":false,"lawyer":false}');
 insert into mafia_profiles(profile_token,nickname) values('p-a','A'),('p-b','B'),('p-c','C');
 insert into mafia_players(room_code,id,name,session_token,profile_token,role,vote_target,action_target) values
 ('8754','a','A','token-a','p-a','detective','b','b'),
 ('8754','b','B','token-b','p-b','mafia_boss','SKIP',null),
 ('8754','c','C','token-c','p-c','citizen','b',null);`);
 await db.query('update mafia_rooms set phase=$1,round=1 where code=$2',[phase,'8754']);
}
async function call(handler,action,extra={}){
 const r=await handler(new Request('https://isolated.test/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,code:'8754',hostToken:'host',lifecycleVersion:0,...extra})}));
 return {status:r.status,body:await r.json()};
}
async function snapshot(db){
 const result={};for(const table of ['mafia_rooms','mafia_players','mafia_profiles','mafia_season_stats','mafia_snapshots'])result[table]=(await db.query('select * from '+table)).rows;
 return result;
}

test('Night resolution rolls back investigations, snapshots and phase on a database failure',async()=>{
 const {db,handler}=await edgeFixture();try{
  await seed(db,'night');
  await db.exec("alter table mafia_rooms add constraint injected_phase_failure check(phase <> 'day')");
  const before=await snapshot(db);
  assert.equal((await call(handler,'resolveNight')).status,500);
  assert.deepEqual(await snapshot(db),before);
  await db.exec('alter table mafia_rooms drop constraint injected_phase_failure');
  const retry=await call(handler,'resolveNight');assert.equal(retry.status,200);assert.equal(retry.body.phase,'day');
  const rows=(await db.query("select investigation_result from mafia_players where id='a'")).rows;
  assert.equal(JSON.parse(rows[0].investigation_result).length,1);
 }finally{await db.close();}
});

test('Victory commits once under competing handlers and rolls back every write if statistics fail',async()=>{
 const {db,handler}=await edgeFixture();try{
  await seed(db);
  await db.exec('alter table mafia_profiles add constraint injected_stats_failure check(games=0)');
  const before=await snapshot(db);
  assert.equal((await call(handler,'resolveVote')).status,500);
  assert.deepEqual(await snapshot(db),before);
  await db.exec('alter table mafia_profiles drop constraint injected_stats_failure');
  const attempts=await Promise.all([call(handler,'resolveVote'),call(handler,'resolveVote')]);
  assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
  const state=await snapshot(db);
  assert.equal(state.mafia_rooms[0].phase,'finished');assert.equal(state.mafia_rooms[0].winner,'village');
  assert.equal(Number(state.mafia_rooms[0].lifecycle_version),1);assert.equal(state.mafia_rooms[0].stats_recorded,true);
  assert.equal(state.mafia_snapshots.length,1);
  for(const p of state.mafia_profiles)assert.equal(p.games,1);
  assert.equal(state.mafia_profiles.find(p=>p.profile_token==='p-b').wins,0);
  assert.equal(state.mafia_profiles.find(p=>p.profile_token==='p-a').wins,1);
  for(const p of state.mafia_season_stats)assert.equal(p.games,1);
  assert.equal((await call(handler,'resolveVote')).status,409);
 }finally{await db.close();}
});

test('Polling recovers a committed departure when its victory follow-up failed',async()=>{
 const {db,handler}=await edgeFixture();try{
  await seed(db);
  await db.exec('alter table mafia_profiles add constraint injected_stats_failure check(games=0)');
  const credentials={hostToken:null,id:'b',playerToken:'token-b'};
  assert.equal((await call(handler,'leave',credentials)).status,500);
  let state=await snapshot(db);
  assert.equal(state.mafia_rooms[0].enabled_roles.departure_pending,true);
  assert.equal(state.mafia_players.find(p=>p.id==='b').session_token,null);
  assert.equal(state.mafia_rooms[0].winner,null);
  await db.exec('alter table mafia_profiles drop constraint injected_stats_failure');
  const recovered=await call(handler,'state');
  assert.equal(recovered.status,200);assert.equal(recovered.body.phase,'finished');assert.equal(recovered.body.winner,'village');
  state=await snapshot(db);assert.equal(state.mafia_rooms[0].enabled_roles.departure_pending,undefined);
  for(const p of state.mafia_profiles)assert.equal(p.games,1);
  assert.equal((await call(handler,'leave',credentials)).status,200);
  assert.deepEqual(await snapshot(db),state);
 }finally{await db.close();}
});

test('The commit rejects changed votes and revoked authority, permits heartbeats, and is service-only',async()=>{
 const {db}=await edgeFixture();try{
  await seed(db);
  const prepare=async()=>{
   const state=await snapshot(db);const room=state.mafia_rooms[0];
   return [room,state.mafia_players,{...room,phase:'night',round:2},state.mafia_players,[],[],false].map(v=>typeof v==='object'?JSON.stringify(v):v);
  };
  const sql='select mafia_commit_transition($1,$2,$3,$4,$5,$6,$7) result';
  for(const mutation of ["update mafia_players set vote_target='c' where id='a'","update mafia_rooms set host_token='revoked' where code='8754'","update mafia_players set session_token='replaced' where id='a'"]){
   const args=await prepare();await db.exec(mutation);const before=await snapshot(db);
   assert.equal((await db.query(sql,args)).rows[0].result.error,'STALE_GAME');
   assert.deepEqual(await snapshot(db),before);
  }
  const args=await prepare();
  await db.exec("update mafia_players set last_seen=now()+interval '1 second';update mafia_rooms set host_seen_at=now()+interval '1 second'");
  assert.equal((await db.query(sql,args)).rows[0].result.ok,true);
  await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query(sql,args);}),/permission denied/);
 }finally{await db.close();}
});

test('Snapshot restore is atomic, preserves current admin authority, and rejects changed seats',async()=>{
 const {db,handler}=await edgeFixture();try{
  await seed(db);
  const original=await snapshot(db);
  const savedRoom={...original.mafia_rooms[0],enabled_roles:{...original.mafia_rooms[0].enabled_roles,admin_access:{sessionHash:'old-access'}}};
  const saved=(await db.query('insert into mafia_snapshots(room_code,phase,round,reason,room_state,players_state) values($1,$2,$3,$4,$5,$6) returning id',
   ['8754','vote',1,'before_vote',JSON.stringify(savedRoom),JSON.stringify(original.mafia_players)])).rows[0];
  await db.exec("update mafia_rooms set phase='night',round=2,enabled_roles=enabled_roles||'{\"admin_access\":{\"sessionHash\":\"current-access\"}}';update mafia_players set alive=false where id='a';alter table mafia_rooms add constraint injected_restore_failure check(phase<>'vote')");
  const before=await snapshot(db);
  assert.equal((await call(handler,'restoreSnapshot',{snapshotId:saved.id})).status,500);
  assert.deepEqual(await snapshot(db),before);
  await db.exec('alter table mafia_rooms drop constraint injected_restore_failure');
  const restored=await call(handler,'restoreSnapshot',{snapshotId:saved.id});assert.equal(restored.status,200);assert.equal(restored.body.phase,'vote');
  const room=(await db.query("select * from mafia_rooms where code='8754'")).rows[0];
  assert.equal(room.enabled_roles.admin_access.sessionHash,'current-access');
  assert.equal((await db.query("select alive from mafia_players where id='a'")).rows[0].alive,true);
  await db.exec("update mafia_players set session_token='replacement-session' where id='a'");
  assert.equal((await call(handler,'restoreSnapshot',{snapshotId:saved.id,lifecycleVersion:1})).body.error,'SNAPSHOT_ROSTER_CHANGED');
  await db.exec("update mafia_rooms set phase='finished',stats_recorded=true");
  assert.equal((await call(handler,'restoreSnapshot',{snapshotId:saved.id,lifecycleVersion:1})).body.error,'SNAPSHOT_RESTORE_UNAVAILABLE');
 }finally{await db.close();}
});

test('Concurrent seat replacement grants one new session and preserves the seat role without inheriting a profile',async()=>{
 const {db,handler}=await edgeFixture();try{
  await seed(db);
  await db.exec("update mafia_players set replacement_code='ABC123',replacement_expires_at=now()+interval '5 minutes' where id='a'");
  const args={hostToken:null,replacementCode:'ABC123',name:'Replacement'};
  assert.equal((await call(handler,'claimSeat',{...args,name:'B'})).body.error,'NAME_TAKEN');
  const attempts=await Promise.all([call(handler,'claimSeat',args),call(handler,'claimSeat',args)]);
  assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
  const granted=attempts.find(r=>r.status===200).body;
  assert.equal(granted.playerId,'a');assert.notEqual(granted.profileToken,'p-a');
  const seat=(await db.query("select * from mafia_players where id='a'")).rows[0];
  assert.equal(seat.role,'detective');assert.equal(seat.action_target,'b');assert.equal(seat.session_token,granted.playerToken);
  assert.equal(seat.replacement_code,null);
  assert.equal((await call(handler,'state',{hostToken:null,id:'a',playerToken:'token-a'})).status,403);
  assert.equal((await call(handler,'claimSeat',args)).status,404);
  assert.equal((await db.query('select count(*) n from mafia_players')).rows[0].n,3);
  assert.equal((await db.query('select games from mafia_profiles where profile_token=$1',[granted.profileToken])).rows[0].games,0);
 }finally{await db.close();}
});

test('Lobby kick revokes pending controller requests and bot refills use an available name',async()=>{
 const {db,handler}=await edgeFixture();try{
  await seed(db);await db.exec("update mafia_rooms set phase='lobby',host_player_id='a'");
  const kicked=await call(handler,'kick',{target:'a'});assert.equal(kicked.status,200);assert.equal(kicked.body.lifecycleVersion,1);
  assert.equal(kicked.body.hostPlayerId,'b');
  assert.equal((await call(handler,'kick',{hostToken:null,id:'a',playerToken:'token-a',target:'c'})).status,409);
  assert.equal((await call(handler,'state',{hostToken:null,id:'a',playerToken:'token-a'})).status,403);
  for(let i=0;i<2;i++)assert.equal((await call(handler,'addBot',{lifecycleVersion:1})).status,200);
  const bot=(await db.query("select id from mafia_players where name='BOT 1'")).rows[0];
  assert.equal((await call(handler,'kick',{target:bot.id,lifecycleVersion:1})).status,200);
  assert.equal((await call(handler,'addBot',{lifecycleVersion:2})).status,200);
  const botNames=(await db.query("select name from mafia_players where is_bot order by name")).rows.map(p=>p.name);
  assert.equal(botNames.length,2);assert.equal(new Set(botNames).size,2);assert.ok(botNames.every(name=>name && !/^BOT [12]$/.test(name)));
 }finally{await db.close();}
});
