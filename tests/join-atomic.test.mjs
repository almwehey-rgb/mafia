import test from 'node:test';
import assert from 'node:assert/strict';
import {edgeFixture} from './helpers/edge-fixture.mjs';

test('Join is atomic on profile failure and repeatable after a lost response',async()=>{
 const {db,handler}=await edgeFixture({fresh:true});
 try{
  await db.exec("insert into mafia_rooms(code,host_token) values('8432','host');alter table mafia_profiles add constraint injected_profile_failure check(nickname<>'FailJoin');");
  const payload={action:'join',code:'8432',id:'join-retry',name:'FailJoin',playerToken:'d700c707-3f2a-4625-bede-a85f5405ae9c',profileToken:'join-profile'};
  async function join(body){const r=await handler(new Request('https://isolated.test/',{method:'POST',body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}
  assert.equal((await join(payload)).status,500);
  assert.equal(Number((await db.query('select count(*) n from mafia_players')).rows[0].n),0,'failed join left a seat behind');
  assert.equal(Number((await db.query('select count(*) n from mafia_profiles')).rows[0].n),0);
  await db.exec('alter table mafia_profiles drop constraint injected_profile_failure');
  const raced=await Promise.all([join(payload),join(payload)]);
  for(const result of raced){assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.body.playerToken,payload.playerToken);}
  assert.equal(Number((await db.query('select count(*) n from mafia_players')).rows[0].n),1);
  assert.equal(Number((await db.query('select count(*) n from mafia_profiles')).rows[0].n),1);
  const retry=await join(payload);assert.equal(retry.status,200);assert.equal(retry.body.me.id,payload.id);
  assert.equal((await join({...payload,playerToken:'wrong-token'})).status,403);
  await db.exec("insert into mafia_profiles(profile_token,nickname) values('existing-profile','Before');alter table mafia_players add constraint injected_seat_failure check(name<>'FailSeat');");
  assert.equal((await join({...payload,id:'fail-seat',name:'FailSeat',profileToken:'existing-profile'})).status,500);
  assert.equal((await db.query("select nickname from mafia_profiles where profile_token='existing-profile'")).rows[0].nickname,'Before');
  assert.equal(Number((await db.query("select count(*) n from mafia_players where id='fail-seat'")).rows[0].n),0);
  await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role anon');await tx.query("select mafia_join_seat('8432','intruder','Intruder','d700c707-3f2a-4625-bede-a85f5405ae9c','intruder')");}),/permission denied/);
 }finally{await db.close();}
});
