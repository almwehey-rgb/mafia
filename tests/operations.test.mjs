import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {edgeFixture} from './helpers/edge-fixture.mjs';
import {MonitorRules} from '../scripts/monitor-rules.mjs';
test('upgrade and rollback preserve an active game; monitoring identifies a private fault',async()=>{
 const logs=[];
 const fixture=await edgeFixture({fresh:true,sourcePath:'tests/fixtures/previous-release.ts',log:{log:s=>logs.push(s),warn:s=>logs.push(s),error:s=>logs.push(s)},environment:{MAFIA_LOG_ALL:'true'}});
 const {db}=fixture;let handler=fixture.handler,version=0,code;
 const call=async(action,args={},status=200)=>{
  const response=await handler(new Request('http://isolated.test/test-api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,code,lifecycleVersion:version,...args})}));
  const body=await response.json();assert.equal(response.status,status,`${action}: ${body.error}`);
  if(body.lifecycleVersion!==undefined)version=body.lifecycleVersion;
  return {body,response};
 };
 try{
  const login=(await call('hostLogin',{pin:'12345678'})).body;
  const created=(await call('create',{hostAccessToken:login.hostAccessToken})).body;code=created.code;
  const host={hostToken:created.hostToken},seats=[];
  for(let i=0;i<4;i++){const id='ops'+i;const joined=(await call('join',{id,name:id})).body;seats.push({id,playerToken:joined.playerToken});}
  await call('state',host);
  const settings={doctor:false,detective:false,lawyer:false,jailer:false,full_trial:false,discussion_mode:'off'};
  await call('start',{...host,mafiaCount:1,detectiveCount:0,enabledRoles:settings});
  const before=(await call('state',seats[0])).body;
  handler=fixture.reload().handler;
  const upgraded=(await call('state',seats[0])).body;
  assert.equal(upgraded.matchId,before.matchId);assert.equal(upgraded.me.role,before.me.role);assert.equal(upgraded.phase,'reveal');
  for(const seat of seats)await call('acknowledgeRole',seat);
  await call('beginNight',host);await call('resolveNight',host);
  handler=fixture.reload('tests/fixtures/previous-release.ts').handler;
  const rolledBack=(await call('state',seats[0])).body;
  assert.equal(rolledBack.matchId,before.matchId);assert.equal(rolledBack.me.role,before.me.role);
  await call('startVote',host);
  for(const seat of seats)await call('vote',{...seat,target:'SKIP'});
  await call('resolveVote',host);
  handler=fixture.reload().handler;
  await call('operationsStatus',{},403);
  assert.equal((await handler(new Request('http://isolated.test/test-api',{method:'POST',body:'{'}))).status,400);
  assert.equal((await handler(new Request('http://isolated.test/test-api',{method:'PUT'}))).status,405);
  // Deliberately stale public phase clock, then demonstrate deduplicated alerts.
  await db.query("update mafia_rooms set phase_started_at=clock_timestamp()-interval '1 hour' where code=$1",[code]);
  const status=(await call('operationsStatus',{hostAccessToken:login.hostAccessToken})).body;
  assert.equal(status.rooms.length,1);assert(!JSON.stringify(status).includes('role'));
  const monitor=new MonitorRules();let alerts=[];
  for(let i=0;i<4;i++)alerts.push(...monitor.inspect({ok:true,durationMs:1,rooms:status.rooms}));
  assert.equal(alerts.filter(a=>a.key.startsWith('room.stalled')).length,1);
  const secret='private-token-DO-NOT-LOG';
  await db.exec(`create function fail_ops_test() returns trigger language plpgsql as $$begin raise exception '${secret}';end$$; create trigger ops_failure before insert on mafia_host_sessions for each row execute function fail_ops_test();`);
  const failures=[];
  for(let i=0;i<4;i++){
   const result=await call('hostLogin',{pin:'12345678'},500);
   assert.match(result.response.headers.get('x-request-id'),/^[a-f0-9-]{36}$/);
   failures.push(...monitor.inspect({ok:false,durationMs:1}));
  }
  assert.equal(failures.filter(a=>a.key==='requests.failed').length,1);
  assert(!logs.join('\n').includes(secret));
  assert(!logs.join('\n').includes(seats[0].playerToken));
  assert(!logs.join('\n').includes(login.hostAccessToken));
  const structured=logs.filter(s=>s.startsWith('{')).map(JSON.parse);
  assert(structured.some(e=>e.action==='hostLogin'&&e.status===500));
  await mkdir('artifacts/assurance',{recursive:true});
  await writeFile('artifacts/assurance/operations.json',JSON.stringify({passed:true,environment:'disposable local SQL + isolated Edge runtime reload',upgradePhase:'reveal',rollbackPhase:'day',resumedVoting:true,matchAndRolesPreserved:true,errorDetected:true,stalledDetected:true,duplicatesSuppressed:true,secretsExcluded:true,structuredEvents:structured.length},null,2));
 }finally{await db.close();}
});
