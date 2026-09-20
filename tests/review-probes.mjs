import assert from 'node:assert/strict';
import {edgeFixture} from './helpers/edge-fixture.mjs';
const {db,handler}=await edgeFixture({fresh:true});
async function call(action,extra={}) {
 const room=(await db.query("select * from mafia_rooms where code='8765'")).rows[0];
 const r=await handler(new Request('https://isolated.test/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,code:'8765',hostToken:'host',lifecycleVersion:room.lifecycle_version,...extra})}));
 return {status:r.status,body:await r.json()};
}
async function seed(roles,phase='night',round=2){
 await db.exec("delete from mafia_rooms; insert into mafia_rooms(code,host_token,enabled_roles) values('8765','host','{\"full_trial\":false,\"doctor\":false,\"lawyer\":false,\"jailer\":false}');");
 for(let i=0;i<roles.length;i++)await db.query('insert into mafia_players(room_code,id,name,session_token,role,role_state) values($1,$2,$3,$4,$5,$6)',['8765','p'+i,'Player '+i,'t'+i,roles[i],JSON.stringify({ack:true})]);
 await db.query("update mafia_rooms set phase=$1,round=$2,phase_started_at=now()-interval '5 minutes' where code='8765'",[phase,round]);
 await db.exec("update mafia_rooms set phase_started_at=now()-interval '5 minutes' where code='8765'");
}
try{
 await seed(['mafia_boss','witch','citizen','citizen','citizen'],'vote');
 await db.exec("update mafia_players set vote_target='SKIP';update mafia_players set is_bot=true,role_state='{\"ack\":true,\"life\":false,\"poison\":false}' where id='p1'");
 const vote=await call('resolveVote');assert.equal(vote.status,200);
 const witch=(await db.query("select action_target,role_state from mafia_players where id='p1'")).rows[0];
 assert.equal(witch.action_target,null);assert.equal(witch.role_state.poison,false);
 // Defense in depth: a stale/invalid stored action must not spend poison twice.
 const target='p2';await db.query("update mafia_players set action_target=$1 where id='p1'",['POISON:'+target]);
 await db.exec("update mafia_players set action_target='SKIP' where id='p0'");
 const night=await call('resolveNight');assert.equal(night.status,200);assert.ok(!night.body.lastDeaths.includes(target));
 console.log('PASS: spent bot poison is neither chosen nor executed');

 await seed(['mafia_boss','citizen','citizen'],'night',1);
 const result=await call('resolveNight');assert.equal(result.status,200);
 const stored=(await db.query("select phase_started_at from mafia_rooms where code='8765'")).rows[0];
 const drift=new Date(stored.phase_started_at).getTime()-result.body.phaseClock.startedAt;
 assert.equal(drift,0);console.log('PASS: transition response matches committed phase clock');

 await seed(['mafia','mafia','citizen','citizen','citizen'],'reveal',1);
 await db.exec("update mafia_rooms set enabled_roles=enabled_roles||'{\"leader_election\":{\"pending\":true}}'; update mafia_players set role_state='{}' where id='p0'");
 const raced=await Promise.all([call('electMafiaLeader',{hostToken:null,id:'p0',playerToken:'t0',target:'p1'}),call('acknowledgeRole',{hostToken:null,id:'p0',playerToken:'t0'})]);
 // Concurrent mutations are fenced. Retry the rejected request with the fresh
 // lifecycle version, as the client does, then verify neither choice was lost.
 for(let i=0;i<raced.length;i++)if(raced[i].status===409){
  assert.ok(['STALE_GAME','STALE_ACTION'].includes(raced[i].body.error));
  raced[i]=await call(i===0?'electMafiaLeader':'acknowledgeRole',{hostToken:null,id:'p0',playerToken:'t0',...(i===0?{target:'p1'}:{})});
 }
 const state=(await db.query("select role_state from mafia_players where id='p0'")).rows[0].role_state;
 assert.deepEqual(raced.map(x=>x.status),[200,200]);assert.equal(state.leaderVote,'p1');assert.equal(state.ack,true);
 console.log('PASS: concurrent acknowledgement preserves the leader vote');

 await seed(['mafia_boss','escort','doctor','citizen','citizen']);
 await db.exec("update mafia_players set action_target='SKIP' where id='p0'");
 const blockedDoctor=await call('act',{hostToken:null,id:'p1',playerToken:'t1',target:'p2'});
 const blockedCitizen=await call('act',{hostToken:null,id:'p1',playerToken:'t1',target:'p3'});
 for(const result of [blockedDoctor,blockedCitizen])for(const key of ['nightReady','lawyerReady','jailerReady'])assert.ok(!(key in result.body));
 const host=await call('state');assert.equal(host.body.nightReady,false);
 const spectator=await call('joinSpectator',{hostToken:null,name:'Viewer',id:'viewer'});
 assert.equal(spectator.status,200);
 for(const key of ['nightReady','lawyerReady','jailerReady'])assert.ok(!(key in spectator.body));
 console.log('PASS: readiness is hidden from players/spectators and available to host');
 const exposed=(await db.query("select tablename from pg_tables where schemaname='public' and tablename like 'mafia_%' and not rowsecurity")).rows;
 assert.deepEqual(exposed,[]);
 await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role anon');await tx.query('select * from mafia_players');}),/permission denied/);
 await db.transaction(async tx=>{await tx.exec('set local role service_role');assert.ok((await tx.query('select * from mafia_players')).rows.length);});
 console.log('PASS: fresh bootstrap, all migrations, RLS and service-only access');
}finally{await db.close();}
