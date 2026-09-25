import test from 'node:test';
import assert from 'node:assert/strict';
import {edgeFixture} from './helpers/edge-fixture.mjs';

test('Mafia and Doctor consecutive-target rules are independent and keep the Mafia target private', async () => {
  const {db, handler} = await edgeFixture({fresh:true});
  try {
    await db.query('insert into mafia_rooms(code,host_token,enabled_roles) values($1,$2,$3)', ['8126','host',JSON.stringify({mafia_no_repeat:true,doctor_no_repeat:true,mafia_kill_start_round:2})]);
    const roles=['mafia_boss','mafia','doctor','citizen','citizen','citizen'];
    for(let i=0;i<roles.length;i++) await db.query('insert into mafia_players(room_code,id,name,session_token,role,role_state) values($1,$2,$3,$4,$5,$6)', ['8126',`p${i}`,`Player ${i}`,`secret-${i}`,roles[i],JSON.stringify({ack:true})]);
    await db.exec("update mafia_rooms set phase='night',round=2,phase_started_at=now()-interval '5 minutes' where code='8126'");
    async function call(action,args={}) {
      const {lifecycle_version}= (await db.query("select lifecycle_version from mafia_rooms where code='8126'")).rows[0];
      const response=await handler(new Request('https://isolated.test/',{method:'POST',body:JSON.stringify({action,code:'8126',lifecycleVersion:lifecycle_version,...args})}));
      return {status:response.status,body:await response.json()};
    }
    const auth=i=>({id:`p${i}`,playerToken:`secret-${i}`});
    assert.equal((await call('act',{...auth(0),target:'p3'})).status,200);
    assert.equal((await call('act',{...auth(1),target:'p3'})).status,200);
    assert.equal((await call('act',{...auth(2),target:'p3'})).status,200);
    assert.equal((await call('resolveNight',{hostToken:'host'})).status,200);
    await db.exec("update mafia_rooms set phase='night',round=3,phase_started_at=now()-interval '5 minutes' where code='8126'");
    const boss=(await call('state',auth(0))).body;
    const doctor=(await call('state',auth(2))).body;
    const citizen=(await call('state',auth(4))).body;
    assert.equal(boss.me.mafiaLastTarget,'p3');
    assert.equal(doctor.me.doctorLastTarget,'p3');
    assert.equal(citizen.me.mafiaLastTarget,undefined);
    assert.equal(citizen.me.doctorLastTarget,undefined);
    assert.equal((await call('act',{...auth(0),target:'p3'})).status,400);
    assert.equal((await call('act',{...auth(1),target:'p3'})).status,400);
    assert.equal((await call('act',{...auth(2),target:'p3'})).status,400);
    assert.equal((await call('act',{...auth(0),target:'p4'})).status,200);
    assert.equal((await call('act',{...auth(2),target:'p4'})).status,200);
    await db.exec("update mafia_rooms set enabled_roles=jsonb_set(enabled_roles,'{doctor_no_repeat}','false'::jsonb) where code='8126'");
    assert.equal((await call('act',{...auth(0),target:'p3'})).status,400);
    assert.equal((await call('act',{...auth(2),target:'p3'})).status,200);
    await db.exec("update mafia_rooms set enabled_roles=jsonb_set(jsonb_set(enabled_roles,'{doctor_no_repeat}','true'::jsonb),'{mafia_no_repeat}','false'::jsonb) where code='8126'");
    assert.equal((await call('act',{...auth(0),target:'p3'})).status,200);
    assert.equal((await call('act',{...auth(2),target:'p3'})).status,400);
    await db.exec("update mafia_rooms set enabled_roles=jsonb_set(jsonb_set(enabled_roles,'{mafia_no_repeat}','false'::jsonb),'{doctor_no_repeat}','false'::jsonb) where code='8126'");
    assert.equal((await call('act',{...auth(0),target:'p3'})).status,200);
    assert.equal((await call('act',{...auth(2),target:'p3'})).status,200);
    assert.equal((await call('act',{...auth(0),target:'SKIP'})).status,200);
    assert.equal((await call('act',{...auth(1),target:'SKIP'})).status,200);
    assert.equal((await call('resolveNight',{hostToken:'host'})).status,200);
    await db.exec("update mafia_rooms set phase='night',round=4,phase_started_at=now()-interval '5 minutes',enabled_roles=jsonb_set(enabled_roles,'{mafia_no_repeat}','true'::jsonb) where code='8126'");
    assert.equal((await call('state',auth(0))).body.me.mafiaLastTarget,null);
    assert.equal((await call('act',{...auth(0),target:'p3'})).status,200);
  } finally { await db.close(); }
});
