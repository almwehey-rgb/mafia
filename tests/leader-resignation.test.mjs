import test from 'node:test';import assert from 'node:assert/strict';import {edgeFixture} from './helpers/edge-fixture.mjs';
test('Resignation elects a replacement atomically and keeps votes private',async()=>{
 const {db,handler}=await edgeFixture({fresh:true});
 try{
 await db.exec("insert into mafia_rooms(code,host_token,enabled_roles) values('7654','host','{}');");
 for(const [id,role] of [['a','mafia_boss'],['b','mafia'],['c','mafia'],['d','citizen']])await db.query("insert into mafia_players(room_code,id,name,session_token,role,role_state) values('7654',$1,$1,$2,$3,'{\"ack\":true}')",[id,'token-'+id,role]);
 await db.exec("update mafia_rooms set phase='night',round=2 where code='7654'");
 async function call(id,target){const room=(await db.query("select lifecycle_version from mafia_rooms where code='7654'")).rows[0];const r=await handler(new Request('https://test/',{method:'POST',body:JSON.stringify({action:'electMafiaLeader',code:'7654',id,playerToken:'token-'+id,target,lifecycleVersion:room.lifecycle_version})}));return {status:r.status,body:await r.json()};}
 assert.equal((await call('b','RESIGN')).status,409);
 assert.equal((await call('a','RESIGN')).status,200);
 assert.equal((await call('d','b')).status,403);
 assert.equal((await call('b','a')).status,400);
 const vote=await call('a','b');assert.equal(vote.status,200);assert.equal(vote.body.enabledRoles.leader_election,undefined);
 assert.equal((await call('a','c')).status,409);
 assert.equal((await call('b','b')).status,200);
 assert.equal((await call('c','b')).status,200);
 const roles=(await db.query("select id,role from mafia_players where room_code='7654' order by id")).rows;
 assert.equal(roles.find(p=>p.id==='a').role,'mafia');assert.equal(roles.find(p=>p.id==='b').role,'mafia_boss');assert.equal(roles.filter(p=>p.role==='mafia_boss').length,1);
 }finally{await db.close();}
});
