import test from 'node:test';
import assert from 'node:assert/strict';
import {edgeFixture} from './helpers/edge-fixture.mjs';

test('Assurance: permissions, secrets, reconnect, shared-network spectators, failed writes and role resolution',async()=>{
 const {db,handler}=await edgeFixture({fresh:true});
 const call=async(action,args={})=>{
  const room=(await db.query("select lifecycle_version from mafia_rooms where code='8642'")).rows[0];
  const response=await handler(new Request('https://isolated.test/',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'192.0.2.1'},body:JSON.stringify({action,code:'8642',lifecycleVersion:room?.lifecycle_version,...args})}));
  return {status:response.status,body:await response.json()};
 };
 const host={hostToken:'host-secret'};
 const auth=i=>({id:'p'+i,playerToken:'seat-secret-'+i});
 async function seed(roles,phase='night',settings={}){
  await db.exec('delete from mafia_rooms;delete from mafia_profiles;');
  await db.query('insert into mafia_rooms(code,host_token,enabled_roles) values($1,$2,$3)',['8642',host.hostToken,JSON.stringify({doctor:false,lawyer:false,jailer:false,full_trial:false,...settings})]);
  for(let i=0;i<roles.length;i++){
   await db.query('insert into mafia_profiles(profile_token,nickname) values($1,$2)',['profile-secret-'+i,'Player '+i]);
   await db.query('insert into mafia_players(room_code,id,name,session_token,profile_token,role,role_state,will_text) values($1,$2,$3,$4,$5,$6,$7,$8)',['8642','p'+i,'Player '+i,'seat-secret-'+i,'profile-secret-'+i,roles[i],JSON.stringify({ack:true,bullets:1,life:true,poison:true}),'private-will-'+i]);
  }
  await db.query("update mafia_rooms set phase=$1,round=2,phase_started_at=now()-interval '5 minutes' where code='8642'",[phase]);
  await db.exec("update mafia_rooms set phase_started_at=now()-interval '5 minutes' where code='8642'");
 }
 const ok=result=>{assert.equal(result.status,200,JSON.stringify(result));return result.body;};
 try{
  await seed(['mafia_boss','detective','citizen','doctor']);
  const view=ok(await call('state',auth(2)));
  assert.equal(view.me.role,'citizen');
  assert.ok(view.players.every(p=>!('role' in p)&&!('will' in p)));
  for(const secret of ['seat-secret-','profile-secret-','host-secret','private-will-0','private-will-1','private-will-3'])assert.ok(!JSON.stringify(view).includes(secret));
  for(const action of ['start','beginNight','resolveNight','startVote','resolveVote','endGame','kick','warnPlayer','expelPlayer','transferHost','createReplacement','createAdminInvite','revokeAdminAccess','adminState','moderationLog','listSnapshots','restoreSnapshot','systemStatus','togglePause','addBot']){
   const denied=await call(action,{...auth(2),target:'p0',snapshotId:1});
   assert.ok(denied.status>=400,action+' allowed');
   assert.ok(!JSON.stringify(denied.body).includes('seat-secret-'));
  }
  assert.equal((await call('state',{id:'p0',playerToken:'seat-secret-2'})).status,403);
  const invitation=ok(await call('createAdminInvite',host));
  const admin=ok(await call('redeemAdminInvite',{inviteToken:invitation.inviteToken}));
  const overview=ok(await call('adminState',{adminToken:admin.adminToken,history:true}));
  assert.equal(overview.players[0].role,'mafia_boss');
  assert.ok(!JSON.stringify(overview).includes('seat-secret-'));
  assert.ok((await call('resolveNight',{adminToken:admin.adminToken})).status>=400);
  ok(await call('revokeAdminAccess',host));
  assert.equal((await call('adminState',{adminToken:admin.adminToken})).status,403);
  for(const phase of ['reveal','night','day','vote','finished']){
   await db.query("update mafia_rooms set phase=$1 where code='8642'",[phase]);
   const recovered=ok(await call('join',{...auth(2),name:'Changed'}));
   assert.equal(recovered.me.id,'p2');assert.equal(recovered.me.role,'citizen');assert.equal(recovered.me.name,'Player 2');
  }
  await db.exec("update mafia_players set session_token='rotated' where id='p2'");
  assert.equal((await call('state',auth(2))).status,403);
  assert.equal((await call('join',{...auth(2),name:'Player 2'})).status,403);
  const spectators=[];
  for(let i=0;i<12;i++){const v=ok(await call('joinSpectator',{id:'s'+i,name:'Viewer '+i}));spectators.push({id:v.spectator.id,spectatorToken:v.spectatorToken});}
  // 360 polls from one IP must be budgeted per authenticated spectator.
  for(let n=0;n<30;n++)for(const spectator of spectators){const v=ok(await call('spectatorState',spectator));assert.ok(!v.me);assert.ok(!('nightReady' in v));}
  console.log('PASS assurance: authority matrix, revoked sessions, private views, five reconnect phases, 12 spectators / one IP');

  await seed(['mafia_boss','citizen','citizen'],'vote');
  await db.exec("alter table mafia_players add constraint injected_vote_failure check(vote_target is null)");
  assert.equal((await call('vote',{...auth(1),target:'p0'})).status,500);
  assert.equal((await db.query("select vote_target from mafia_players where id='p1'")).rows[0].vote_target,null);
  await db.exec('alter table mafia_players drop constraint injected_vote_failure');
  ok(await call('vote',{...auth(1),target:'p0'}));
  const stale=(await db.query("select lifecycle_version from mafia_rooms where code='8642'")).rows[0].lifecycle_version;
  await db.exec("update mafia_rooms set lifecycle_version=lifecycle_version+1 where code='8642'");
  assert.equal((await call('vote',{...auth(1),target:'p2',lifecycleVersion:stale})).status,409);
  assert.equal((await db.query("select vote_target from mafia_players where id='p1'")).rows[0].vote_target,'p0');

  await seed(['mafia_boss','doctor','witch','citizen','citizen']);
  ok(await call('act',{...auth(0),target:'p3'}));ok(await call('act',{...auth(1),target:'p3'}));ok(await call('act',{...auth(2),target:'POISON:p3'}));
  const saved=ok(await call('resolveNight',host));assert.ok(!saved.lastDeaths.includes('p3'));
  assert.equal((await db.query("select role_state from mafia_players where id='p2'")).rows[0].role_state.poison,false);
  await seed(['mafia_boss','escort','doctor','citizen','citizen']);
  ok(await call('act',{...auth(0),target:'p3'}));ok(await call('act',{...auth(1),target:'p2'}));ok(await call('act',{...auth(2),target:'p3'}));
  assert.ok(ok(await call('resolveNight',host)).lastDeaths.includes('p3'));
  await seed(['mafia_boss','cupid','citizen','citizen','citizen']);
  const raced=await Promise.all([call('act',{...auth(1),target:'p2'}),call('act',{...auth(1),target:'p3'})]);
  assert.deepEqual(raced.map(r=>r.status).sort(),[200,409]);
  const chosen=(await db.query("select action_target from mafia_players where id='p1'")).rows[0].action_target;
  ok(await call('act',{...auth(1),target:chosen==='p2'?'p3':'p2'}));
  ok(await call('act',{...auth(0),target:'p2'}));
  const linked=ok(await call('resolveNight',host));assert.ok(linked.lastDeaths.includes('p2')&&linked.lastDeaths.includes('p3'));
  await seed(['mafia_boss','serial_killer']);
  ok(await call('act',{...auth(0),target:'p1'}));ok(await call('act',{...auth(1),target:'p0'}));
  const draw=ok(await call('resolveNight',host));assert.equal(draw.phase,'finished');assert.equal(draw.winner,'draw');
  assert.deepEqual((await db.query('select games,wins from mafia_profiles')).rows,[{games:1,wins:0},{games:1,wins:0}]);
  await seed(['mafia_boss','jailer','doctor','citizen','citizen'],'day');
  ok(await call('jail',{...auth(1),target:'p3'}));
  await db.exec("update mafia_rooms set phase='night',round=2 where code='8642'");
  ok(await call('act',{...auth(0),target:'p3'}));ok(await call('act',{...auth(2),target:'p3'}));ok(await call('act',{...auth(1),target:'EXECUTE'}));
  const executed=ok(await call('resolveNight',host));assert.ok(executed.lastDeaths.includes('p3'));assert.equal(executed.jailerExecutions,2);
  await seed(['mafia_boss','jester','lawyer','citizen','citizen'],'day');
  ok(await call('lawyerProtect',{...auth(2),target:'p1'}));
  await db.exec("update mafia_rooms set phase='vote' where code='8642';update mafia_players set vote_target=case when id='p1' then 'SKIP' else 'p1' end;");
  const protectedJester=ok(await call('resolveVote',host));assert.notEqual(protectedJester.winner,'jester');assert.ok(!protectedJester.lastDeaths.includes('p1'));
  await seed(['mafia_boss','jester','citizen','citizen'],'vote');
  await db.exec("update mafia_players set vote_target=case when id='p1' then 'SKIP' else 'p1' end;");
  assert.equal(ok(await call('resolveVote',host)).winner,'jester');
  for(const size of [6,10,14]){
   await seed(Array(size).fill('citizen'),'lobby');
   const settings={doctor:true,lawyer:size>=10,jailer:size>=10,witch:size>=10,serial_killer:size>=10,cupid:size===14,escort:size===14,revenge:false,vigilante:size===14,jester:size===14,revealer:size===14,full_trial:false,discussion_mode:'off'};
   let state=ok(await call('start',{...host,mafiaCount:1,detectiveCount:1,enabledRoles:settings}));
   for(let i=0;i<size;i++)ok(await call('acknowledgeRole',auth(i)));
   state=ok(await call('beginNight',host));
   for(let turn=0;turn<12&&state.phase!=='finished';turn++){
    await db.exec("update mafia_rooms set phase_started_at=now()-interval '5 minutes' where code='8642'");
    if(state.phase==='night')state=ok(await call('resolveNight',host));
    else if(state.phase==='day')state=ok(await call('startVote',host));
    else if(state.phase==='vote'){
     const players=(await db.query("select id,role from mafia_players where room_code='8642' and alive order by id")).rows;
     const target=players.find(p=>['mafia','mafia_boss','serial_killer'].includes(p.role));assert.ok(target);
     for(const p of players)ok(await call('vote',{...auth(Number(p.id.slice(1))),target:p.id===target.id?'SKIP':target.id}));
     state=ok(await call('resolveVote',host));
    }else assert.fail('Unexpected phase '+state.phase);
   }
   assert.equal(state.phase,'finished');assert.equal(state.winner,'village');
   assert.ok((await db.query('select games from mafia_profiles')).rows.every(p=>p.games===1));
  }
  console.log('PASS assurance: jail execution bypasses protection, lawyer prevents jester victory, jester victory, complete 6/10/14-seat games');
  console.log('PASS assurance: rejected writes, stale requests, protection/poison/block/link priority, Cupid race, simultaneous-death draw');
 }finally{await db.close();}
});
