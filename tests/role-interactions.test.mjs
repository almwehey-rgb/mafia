import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {edgeFixture} from './helpers/edge-fixture.mjs';

test('Role interaction matrix: attacks, protections, blocks, valid targets, private views and winner counts',async()=>{
 const {db,handler}=await edgeFixture({fresh:true});const evidence=[];
 const roles=['mafia_boss','serial_killer','witch','doctor','jailer','escort','citizen','detective','cupid','revealer','vigilante','lawyer','jester','mafia'];
 async function seed(){
  await db.exec("delete from mafia_rooms;insert into mafia_rooms(code,host_token,enabled_roles) values('8653','host','{\"full_trial\":false,\"lawyer\":false,\"jailer\":false}');");
  for(let i=0;i<roles.length;i++)await db.query("insert into mafia_players(room_code,id,name,session_token,role,role_state) values('8653',$1,$2,$3,$4,'{\"ack\":true,\"life\":true,\"poison\":true,\"bullets\":1}')",['p'+i,'Role '+i,'secret-'+i,roles[i]]);
  await db.exec("update mafia_rooms set phase='night',round=2 where code='8653';update mafia_rooms set phase_started_at=now()-interval '5 minutes' where code='8653';");
 }
 async function call(action,args={}){
  const room=(await db.query("select lifecycle_version from mafia_rooms where code='8653'")).rows[0];
  const response=await handler(new Request('https://isolated.test/',{method:'POST',body:JSON.stringify({action,code:'8653',lifecycleVersion:room.lifecycle_version,...args})}));
  return {status:response.status,body:await response.json()};
 }
 try{
  for(const attack of ['mafia','serial','poison'])for(const protection of ['none','doctor','witch','jail'])for(const blocked of ['none','attacker','protector']){
   // One witch cannot choose SAVE and POISON in one night; tested as a single-choice rule elsewhere.
   if(attack==='poison'&&protection==='witch')continue;
   await seed();const attacker={mafia:0,serial:1,poison:2}[attack],protector={doctor:3,witch:2,jail:4}[protection];
   await db.query("update mafia_players set action_target=$1 where room_code='8653' and id=$2",[attack==='poison'?'POISON:p6':'p6','p'+attacker]);
   if(protection==='doctor')await db.exec("update mafia_players set action_target='p6' where id='p3'");
   if(protection==='witch')await db.exec("update mafia_players set action_target='SAVE:p6' where id='p2'");
   if(protection==='jail')await db.exec("update mafia_rooms set jailed_player='p6' where code='8653'");
   if(blocked==='attacker'||(blocked==='protector'&&protector!==undefined))await db.query("update mafia_players set action_target=$1 where id='p5'",['p'+(blocked==='attacker'?attacker:protector)]);
   const result=await call('resolveNight',{hostToken:'host'});assert.equal(result.status,200,JSON.stringify(result));
   const protectedTarget=protection==='jail'||(protection!=='none'&&blocked!=='protector');
   const shouldDie=blocked!=='attacker'&&!protectedTarget;
   assert.equal(result.body.lastDeaths.includes('p6'),shouldDie,`${attack}/${protection}/${blocked}`);
   evidence.push({attack,protection,blocked,shouldDie,passed:true});
  }
  await seed();
  for(let i=0;i<roles.length;i++){
   const auth={id:'p'+i,playerToken:'secret-'+i};const result=await call('state',auth);assert.equal(result.status,200);assert.equal(result.body.me.role,roles[i]);
   assert.ok(result.body.players.every(p=>!('role' in p)));
   assert.ok(!JSON.stringify(result.body).includes('secret-'));
   const invalid=await call('act',{...auth,target:'missing-player'});assert.ok(invalid.status>=400,roles[i]+' accepted missing target');
   const wrongPhase=await call('vote',{...auth,target:'p6'});assert.ok(wrongPhase.status>=400);
   evidence.push({role:roles[i],privateView:true,missingTargetRejected:true,wrongPhaseRejected:true});
  }
  // Independent winner oracle across every small population, including both hostile factions.
  for(let mafia=0;mafia<=3;mafia++)for(let serial=0;serial<=2;serial++)for(let citizens=0;citizens<=3;citizens++){
   await seed();await db.exec("update mafia_players set alive=false");
   const alive=[...Array(mafia).fill('mafia'),...Array(serial).fill('serial_killer'),...Array(citizens).fill('citizen')];
   for(let i=0;i<alive.length;i++)await db.query("update mafia_players set alive=true,role=$1 where id=$2",[alive[i],'p'+i]);
   const result=await call('resolveNight',{hostToken:'host'});assert.equal(result.status,200);
   const expected=alive.length===0?'draw':mafia===0&&serial===0?'village':mafia===0&&serial>=citizens?'serial_killer':serial===0&&mafia>=citizens?'mafia':null;
   assert.equal(result.body.winner,expected,JSON.stringify({mafia,serial,citizens}));
   assert.equal(result.body.phase,expected?'finished':'day');
   evidence.push({mafia,serial,citizens,expected,passed:true});
  }
  writeFileSync('artifacts/role-interactions.json',JSON.stringify({cases:evidence.length,evidence},null,2));
  console.log('PASS '+evidence.length+' independently checked interaction/permission/winner cases');
 }finally{await db.close();}
});
