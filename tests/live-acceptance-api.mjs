// Network test confined to the temporary acceptance function and synthetic room.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const endpoint='https://unsxzbrpqvppecjnirqx.supabase.co/functions/v1/mafia-room-acceptance';
const credentials=JSON.parse(await readFile('.test-assurance/credentials.json','utf8'));
let requests=0;
async function call(action,args={}){
 const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,code:credentials.code,...args}),signal:AbortSignal.timeout(25000)});requests++;
 return {status:r.status,body:await r.json()};
}
assert.equal((await call('health')).status,200);
assert.equal((await call('state',{code:'9682',hostToken:'invalid'})).status,404);
assert.equal((await call('state',{id:'another-player',playerToken:'invalid'})).status,403);
const login=await call('hostLogin',{pin:credentials.pin});assert.equal(login.status,200);
const room=await call('create',{hostAccessToken:login.body.hostAccessToken});assert.equal(room.status,200);assert.equal(room.body.code,credentials.code);
const unauthorized=await call('adminState',{id:'invalid',playerToken:'invalid'});assert.equal(unauthorized.status,403);
const watchers=[];
for(let i=0;i<12;i++){
 const joined=await call('joinSpectator',{id:'audit-viewer-'+i,name:'اختبار اتصال '+i});assert.equal(joined.status,200);
 watchers.push({id:joined.body.spectator.id,spectatorToken:joined.body.spectatorToken});
}
for(let cycle=0;cycle<25;cycle++){
 for(const auth of watchers){const state=await call('spectatorState',auth);assert.equal(state.status,200,JSON.stringify(state));assert.ok(!state.body.me);assert.ok(!('nightReady' in state.body));assert.ok(!JSON.stringify(state.body).includes(room.body.hostToken));}
}
const report={passed:true,endpoint,code:credentials.code,requests,checks:['test endpoint rejects other rooms','invalid player session rejected','host login/create works','admin requires authority','12 authenticated spectators share one network without throttling','public spectator views contain no host credential or private readiness']};
await writeFile('artifacts/live-acceptance-api.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
