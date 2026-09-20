import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('Lifecycle migration works with production constraints and the phase-clock trigger',async()=>{
 const db=new PGlite();try{
  await db.exec(readFileSync(new URL('./fixtures/production-schema.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/202609120001_room_lifecycle.sql',import.meta.url),'utf8'));
  await db.exec("insert into mafia_rooms(code,host_token) values('8754','host'); insert into mafia_players(room_code,id,name,session_token) values('8754','a','A','a-token'),('8754','b','B','b-token')");
  const assignments=JSON.stringify([{id:'a',role:'mafia',state:{}},{id:'b',role:'citizen',state:{}}]);
  const start=async(version)=>(await db.query('select mafia_start_match($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',['8754',version,'host',null,null,assignments,'{}',1,0,3])).rows[0].result;
  assert.equal((await start(0)).ok,true);
  assert.equal((await db.query("select phase from mafia_rooms where code='8754'")).rows[0].phase,'reveal');
  await db.exec("update mafia_rooms set phase='finished',winner='mafia' where code='8754'");
  assert.equal((await db.query("select mafia_return_to_lobby('8754',1,'host',null,null) result")).rows[0].result.ok,true);
  assert.equal((await start(2)).ok,true);
  const room=(await db.query("select * from mafia_rooms where code='8754'")).rows[0];
  assert.equal(Number(room.lifecycle_version),3);assert.equal(room.winner,null);assert.equal(room.phase_paused_at,null);
  await db.exec("update mafia_rooms set phase='finished',winner='village',stats_recorded=true where code='8754'; update mafia_players set alive=false,vote_target='b',investigation_result='old',role_state='{\"spent\":true}' where room_code='8754'");
  assert.equal((await start(3)).ok,true);
  const replay=(await db.query("select * from mafia_rooms where code='8754'")).rows[0];
  assert.notEqual(replay.match_id,room.match_id);assert.equal(replay.winner,null);assert.equal(replay.stats_recorded,false);
  assert.equal(replay.phase,'reveal');assert.equal(replay.round,1);
  const seats=(await db.query("select * from mafia_players where room_code='8754' order by id")).rows;
  assert.deepEqual(seats.map(p=>p.session_token),['a-token','b-token']);
  for(const p of seats){assert.equal(p.alive,true);assert.equal(p.vote_target,null);assert.equal(p.investigation_result,null);assert.equal(p.role_state.spent,undefined);}
 }finally{await db.close();}
});

// PostgreSQL executed in an isolated WASM database, never the production project.
// Core columns were checked against information_schema on 2026-09-12.
const schema = `
create role anon; create role authenticated; create role service_role;
create table mafia_rooms (
 code text primary key, host_token text not null, host_player_id text,
 phase text not null default 'lobby', round integer not null default 0,
 mafia_count integer not null default 2,detective_count integer not null default 1,detective_questions integer not null default 3,
 phase_started_at timestamptz not null default now(), phase_paused_at timestamptz,
 enabled_roles jsonb not null default '{}', jailed_player text, accused_player text,
 jailer_executions integer not null default 3, doctor_last_target text,
 linked_players jsonb not null default '[]', last_event text, last_deaths jsonb not null default '[]',
 last_eliminated text,last_saved boolean not null default false,winner text,winner_player text,
 stats_recorded boolean not null default false);
create table mafia_players (
 room_code text references mafia_rooms(code), id text, name text not null,
 is_bot boolean not null default false,last_seen timestamptz not null default now(),joined_at timestamptz not null default now(),
 session_token text, role text, role_state jsonb not null default '{}', alive boolean not null default true,
 action_target text,vote_target text,investigation_result text,will_text text not null default '',
 replacement_code text,replacement_expires_at timestamptz,primary key(room_code,id));
create table mafia_messages(room_code text, content text);
create table mafia_reports(room_code text);
create table mafia_snapshots(room_code text);
`;

async function fixture() {
 const db=new PGlite();await db.exec(schema);
 await db.exec(readFileSync(new URL('../supabase/migrations/202609120001_room_lifecycle.sql',import.meta.url),'utf8'));
 await db.exec(`insert into mafia_rooms(code,host_token,phase,round,enabled_roles,winner,stats_recorded,phase_paused_at)
 values('8754','host','lobby',5,'{"doctor":true,"discussion_state":{"secret":1},"pending_shot":{},"admin_access":{}}','mafia',true,now()),
 ('9999','other','lobby',3,'{}','village',true,null);
 insert into mafia_players(room_code,id,name,session_token,role,role_state,alive,action_target,vote_target,investigation_result,will_text,replacement_code)
 values('8754','a','A','token-a','detective','{"spent":true}',false,'b','b','secret','will','replace'),
 ('8754','b','B','token-b','mafia','{}',true,'a','a','secret','will',null),
 ('9999','z','Other','other','doctor','{}',true,null,null,null,'',null);
 insert into mafia_messages values('8754','secret'),('9999','keep');
 insert into mafia_reports values('8754');insert into mafia_snapshots values('8754');update mafia_rooms set phase='finished';`);
 const call=async(version=0,host='host',id=null,token=null)=>(await db.query(
  'select mafia_return_to_lobby($1,$2,$3,$4,$5) result',['8754',version,host,id,token])).rows[0].result;
 return {db,call};
}

test('Postgres lobby reset is authenticated, clears match secrets and preserves seats and other rooms',async()=>{
 const {db,call}=await fixture();try {
  assert.equal((await call(0,null)).error,'UNAUTHORIZED');
  assert.equal((await call(0,'wrong')).error,'UNAUTHORIZED');
  assert.equal((await call(null)).error,'STALE_GAME');
  assert.equal((await call(1)).error,'STALE_GAME');
  assert.deepEqual(await call(),{ok:true});
  const room=(await db.query("select * from mafia_rooms where code='8754'")).rows[0];
  assert.equal(room.phase,'lobby');assert.equal(room.round,0);assert.equal(Number(room.lifecycle_version),1);
  assert.equal(room.winner,null);assert.equal(room.stats_recorded,false);assert.equal(room.phase_paused_at,null);
  assert.deepEqual(room.enabled_roles,{doctor:true});
  const players=(await db.query("select * from mafia_players where room_code='8754' order by id")).rows;
  assert.equal(players.length,2);assert.equal(players[0].session_token,'token-a');assert.equal(players[0].name,'A');
  for(const p of players){assert.equal(p.role,null);assert.deepEqual(p.role_state,{});assert.equal(p.alive,true);
   for(const k of ['action_target','vote_target','investigation_result','replacement_code','replacement_expires_at'])assert.equal(p[k],null);
   assert.equal(p.will_text,'');}
  for(const table of ['mafia_messages','mafia_reports','mafia_snapshots'])assert.equal((await db.query(`select * from ${table} where room_code='8754'`)).rows.length,0);
  assert.equal((await db.query("select content from mafia_messages where room_code='9999'")).rows[0].content,'keep');
  assert.equal((await call()).error,'STALE_GAME');
  assert.equal((await call(1)).error,'INVALID_ACTION');
 }finally{await db.close();}
});

test('Postgres lobby reset rolls back every mutation on database failure and is not publicly callable',async()=>{
 const {db,call}=await fixture();try{
  const rights=(await db.query(`select has_function_privilege('anon','mafia_return_to_lobby(text,bigint,text,text,text)','EXECUTE') anon,
  has_function_privilege('authenticated','mafia_return_to_lobby(text,bigint,text,text,text)','EXECUTE') authenticated,
  has_function_privilege('service_role','mafia_return_to_lobby(text,bigint,text,text,text)','EXECUTE') service`)).rows[0];
  assert.deepEqual(rights,{anon:false,authenticated:false,service:true});
  await db.exec("alter table mafia_rooms add constraint injected_failure check (phase <> 'lobby')");
  await assert.rejects(call());
  assert.equal((await db.query("select role from mafia_players where id='a'")).rows[0].role,'detective');
  assert.equal((await db.query("select * from mafia_messages where room_code='8754'")).rows.length,1);
  assert.equal((await db.query("select phase from mafia_rooms where code='8754'")).rows[0].phase,'finished');
 }finally{await db.close();}
});

test('Postgres start commits one fresh assignment and rejects duplicate or changed-roster attempts',async()=>{
 const {db,call}=await fixture();try{
  await call();
  const assignments=[{id:'a',role:'mafia_boss',state:{ack:false}},{id:'b',role:'citizen',state:{ack:false}}];
  const start=async(version,roles=assignments)=>(await db.query(
   'select mafia_start_match($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',
   ['8754',version,'host',null,null,JSON.stringify(roles),JSON.stringify({doctor:false}),1,0,3])).rows[0].result;
  assert.equal((await start(1,assignments.slice(0,1))).error,'ROSTER_CHANGED');
  assert.deepEqual(await start(1),{ok:true});
  assert.equal((await start(1)).error,'STALE_GAME');
  assert.equal((await start(2)).error,'INVALID_ACTION');
  await assert.rejects(db.query("insert into mafia_players(room_code,id,name) values('8754','late','Late')"),/GAME_STARTED/);
  await assert.rejects(db.query("delete from mafia_players where room_code='8754' and id='b'"),/GAME_STARTED/);
  const room=(await db.query("select * from mafia_rooms where code='8754'")).rows[0];
  assert.equal(room.phase,'reveal');assert.equal(room.round,1);assert.equal(Number(room.lifecycle_version),2);
  assert.equal((await db.query("select role from mafia_players where id='a'")).rows[0].role,'mafia_boss');
  await db.exec("update mafia_rooms set phase='finished' where code='8754'");
  assert.deepEqual(await call(2),{ok:true});
  await db.exec("delete from mafia_players where room_code='8754' and id='b'; insert into mafia_players(room_code,id,name,session_token) values('8754','c','C','token-c'),('8754','d','D','token-d')");
  assert.equal((await start(3)).error,'ROSTER_CHANGED');
  assert.deepEqual(await start(3,[{id:'a',role:'citizen',state:{}},{id:'c',role:'mafia_boss',state:{}},{id:'d',role:'citizen',state:{}}]),{ok:true});
  assert.equal((await db.query("select role from mafia_players where id='a'")).rows[0].role,'citizen');
 }finally{await db.close();}
});

test('Membership checks enforce capacity and unique names inside PostgreSQL',async()=>{
 const {db,call}=await fixture();try{
  await call();
  await assert.rejects(db.query("insert into mafia_players(room_code,id,name) values('8754','copy',' a ')"),/NAME_TAKEN/);
  for(let i=0;i<18;i++)await db.query('insert into mafia_players(room_code,id,name) values($1,$2,$3)',['8754','extra'+i,'Extra '+i]);
  await assert.rejects(db.query("insert into mafia_players(room_code,id,name) values('8754','overflow','Overflow')"),/ROOM_FULL/);
  assert.equal(Number((await db.query("select count(*) n from mafia_players where room_code='8754'")).rows[0].n),20);
 }finally{await db.close();}
});

test('Explicit departure revokes the seat, cleans votes/actions and transfers the controller',async()=>{
 const {db}=await fixture();try{
  await db.exec(`update mafia_rooms set phase='vote',host_player_id='a',winner=null where code='8754';
   update mafia_players set alive=true where room_code='8754';`);
  const leave=async(token='token-a')=>(await db.query('select mafia_leave_room($1,$2,$3,$4,$5) result',['8754',0,null,'a',token])).rows[0].result;
  assert.equal((await leave('wrong')).error,'UNAUTHORIZED');
  assert.deepEqual(await leave(),{ok:true,hostPlayerId:'b',lifecycleVersion:1,replayed:false});
  const a=(await db.query("select * from mafia_players where room_code='8754' and id='a'")).rows[0];
  assert.equal(a.alive,false);assert.equal(a.session_token,null);assert.ok(a.left_at);assert.equal(a.role_state.elimination.reason,'player_left');
  const b=(await db.query("select * from mafia_players where room_code='8754' and id='b'")).rows[0];
  assert.equal(b.vote_target,null);assert.equal(b.action_target,null);
  const room=(await db.query("select * from mafia_rooms where code='8754'")).rows[0];assert.notEqual(room.host_token,'host');
  assert.deepEqual(await leave(),{ok:true,hostPlayerId:'b',lifecycleVersion:1,replayed:true});
  assert.equal((await leave('wrong')).error,'UNAUTHORIZED');
  await db.query('select mafia_leave_room($1,$2,$3,$4,$5)',['8754',1,null,'b','token-b']);
  assert.equal((await db.query("select winner from mafia_rooms where code='8754'")).rows[0].winner,'cancelled');
 }finally{await db.close();}
});

test('Departure advances the active speaker without waiting for a revoked session',async()=>{
 const {db}=await fixture();try{
  const at=Date.now();
  await db.query("update mafia_rooms set phase='day',enabled_roles=$1 where code='8754'",[JSON.stringify({discussion_state:{mode:'turns',order:['a','b'],cursor:0,version:0,seconds:30,turnStartedAt:at,pausedAt:null,finished:false}})]);
  await db.query('select mafia_leave_room($1,$2,$3,$4,$5)',['8754',0,null,'a','token-a']);
  const d=(await db.query("select enabled_roles->'discussion_state' d from mafia_rooms where code='8754'")).rows[0].d;
  assert.deepEqual(d.order,['b']);assert.equal(d.cursor,0);assert.equal(d.finished,false);assert.equal(d.version,1);
 }finally{await db.close();}
});

test('Presence preserves roles during a brief disconnection and transfers control after the grace period',async()=>{
 const {db}=await fixture();try{
  await db.exec("update mafia_rooms set phase='night',host_seen_at=now(),winner=null where code='8754'; update mafia_players set alive=true,last_seen=now()-interval '2 minutes' where room_code='8754'");
  const presence=async(host=null,id='b',token='token-b')=>(await db.query('select mafia_presence($1,$2,$3,$4) result',['8754',host,id,token])).rows[0].result;
  assert.equal((await presence(null,'b','wrong')).error,'UNAUTHORIZED');
  assert.deepEqual(await presence(),{ok:true});
  assert.equal((await db.query("select host_token from mafia_rooms where code='8754'")).rows[0].host_token,'host');
  await db.exec("update mafia_rooms set host_seen_at=now()-interval '46 seconds' where code='8754'");
  assert.deepEqual(await presence(),{ok:true});
  const room=(await db.query("select * from mafia_rooms where code='8754'")).rows[0];assert.equal(room.host_player_id,'b');assert.notEqual(room.host_token,'host');
  assert.equal((await presence('host',null,null)).error,'UNAUTHORIZED');
  assert.deepEqual(await presence(null,'a','token-a'),{ok:true});
  const a=(await db.query("select * from mafia_players where room_code='8754' and id='a'")).rows[0];assert.equal(a.role,'detective');assert.equal(a.session_token,'token-a');assert.equal(a.left_at,null);
  assert.equal((await db.query("select host_player_id from mafia_rooms where code='8754'")).rows[0].host_player_id,'b');
 }finally{await db.close();}
});

test('Night departure clears potion targets without refunding a detective question',async()=>{
 const {db,call}=await fixture();try{
  await call();
  await db.exec("insert into mafia_players(room_code,id,name,session_token,role,action_target) values('8754','witch','Witch','w','witch','POISON:b');update mafia_players set role='detective',action_target='b' where id='a'; update mafia_rooms set phase='night',round=2 where code='8754'");
  await db.query('select mafia_leave_room($1,$2,$3,$4,$5)',['8754',1,null,'b','token-b']);
  assert.equal((await db.query("select action_target from mafia_players where id='a'")).rows[0].action_target,'SKIP');
  assert.equal((await db.query("select action_target from mafia_players where id='witch'")).rows[0].action_target,null);
 }finally{await db.close();}
});

test('Departure during trial or a committed final shot releases the pending phase',async()=>{
 for(const kind of ['trial','shooter','target']){
  const {db}=await fixture();try{
   const pending={playerId:'a',target:'b',resolving:true,nextPhase:'night',nextRound:3};
   await db.query("update mafia_rooms set phase=$1,round=2,accused_player='b',winner=null,enabled_roles=$2 where code='8754'",[kind==='trial'?'verdict':'day',JSON.stringify(kind==='trial'?{}:{pending_shot:pending})]);
   await db.exec("update mafia_players set role='vigilante',role_state='{\"bullets\":1}',alive=false where id='a'");
   const id=kind==='shooter'?'a':'b';
   await db.query('select mafia_leave_room($1,$2,$3,$4,$5)',['8754',0,null,id,'token-'+id]);
   const r=(await db.query("select * from mafia_rooms where code='8754'")).rows[0];
   assert.equal(r.phase,'night');assert.equal(r.round,3);assert.equal(r.enabled_roles.pending_shot,undefined);
   if(kind==='trial')assert.equal(r.accused_player,null);
   else assert.equal((await db.query("select role_state->>'bullets' n from mafia_players where id='a'")).rows[0].n,'0');
  }finally{await db.close();}
 }
});

test('A connected eliminated player can keep the room managed when no living player is connected',async()=>{
 const {db}=await fixture();try{
  await db.exec("update mafia_rooms set phase='night',host_seen_at=now()-interval '1 minute' where code='8754';update mafia_players set last_seen=now()-interval '1 minute' where room_code='8754';update mafia_players set alive=false where id='b'");
  await db.query('select mafia_presence($1,$2,$3,$4)',['8754',null,'b','token-b']);
  const r=(await db.query("select * from mafia_rooms where code='8754'")).rows[0];
  assert.equal(r.host_player_id,'b');assert.equal(r.enabled_roles.controller_spectator,true);
  const b=(await db.query("select * from mafia_players where id='b'")).rows[0];assert.equal(b.alive,false);assert.equal(b.role,'mafia');
 }finally{await db.close();}
});

test('A delayed write from an old match cannot change the new lobby or its players/messages',async()=>{
 const {db,call}=await fixture();try{
  await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-mafia-room':'8754','x-mafia-generation':'0'})]);
  assert.deepEqual(await call(),{ok:true});
  for(const sql of ["update mafia_players set alive=false,role='mafia' where room_code='8754'",
   "update mafia_rooms set phase='night' where code='8754'",
   "insert into mafia_messages values('8754','old secret')",
   "delete from mafia_players where room_code='8754'"]){await assert.rejects(db.exec(sql),/STALE_GAME/);}
  assert.equal((await db.query("select phase from mafia_rooms where code='8754'")).rows[0].phase,'lobby');
  assert.equal((await db.query("select count(*) n from mafia_players where room_code='8754' and alive and role is null")).rows[0].n,2);
  await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-mafia-room':'8754','x-mafia-generation':'1'})]);
  await db.exec("update mafia_players set last_seen=now() where room_code='8754'");
 }finally{await db.close();}
});

test('Departure and controller takeover fence writes that were already in flight in the same game',async()=>{
 for(const transition of ['leave','takeover']){
  const {db}=await fixture();try{
   await db.exec("update mafia_rooms set phase='night',host_seen_at=now()-interval '1 minute' where code='8754';update mafia_players set alive=true,last_seen=now()-interval '1 minute' where room_code='8754'");
   if(transition==='leave'){
    await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-mafia-room':'8754','x-mafia-generation':'0'})]);
    await db.query('select mafia_leave_room($1,$2,$3,$4,$5)',['8754',0,null,'a','token-a']);
   }else await db.query('select mafia_presence($1,$2,$3,$4)',['8754',null,'b','token-b']);
   await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-mafia-room':'8754','x-mafia-generation':'0'})]);
   await assert.rejects(db.exec("update mafia_players set action_target='a' where room_code='8754' and id='b'"),/STALE_GAME/);
   await assert.rejects(db.exec("update mafia_rooms set phase='day' where code='8754'"),/STALE_GAME/);
   assert.equal(Number((await db.query("select lifecycle_version from mafia_rooms where code='8754'")).rows[0].lifecycle_version),1);
  }finally{await db.close();}
 }
});
