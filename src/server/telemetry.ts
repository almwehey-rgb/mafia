// Allowlisted operational fields only. Never record headers, request bodies,
// credentials, player names, role assignments or action targets.
const requestTotals={requests:0,failed:0,slow:0};
function observeRoom(room:any) {
  const scope=requestDatabase.getStore();
  if(scope)scope.observation={room:room.code,phase:room.phase,version:room.lifecycle_version||0,phaseStartedAt:room.phase_started_at};
}
function recordResponse(response:Response) {
  const scope=requestDatabase.getStore()!;
  const durationMs=Math.max(0,Date.now()-(scope.started||Date.now()));
  requestTotals.requests++;if(response.status>=500)requestTotals.failed++;if(durationMs>=1000)requestTotals.slow++;
  response.headers.set('X-Request-Id',scope.requestId||'');
  response.headers.set('Server-Timing',`app;dur=${durationMs}`);
  response.headers.set('Cache-Control','no-store');
  const shouldLog=Deno.env.get('MAFIA_LOG_ALL')==='true'||response.status>=400||durationMs>=1000||requestTotals.requests%20===0;
  if(shouldLog)console.log(JSON.stringify({event:'mafia.request',requestId:scope.requestId,action:scope.action||'unknown',status:response.status,durationMs,...scope.observation}));
  return response;
}
async function operationsStatus(body:any) {
  if(!await validHostAccess(body.hostAccessToken))return out({error:'UNAUTHORIZED'},403);
  const {data,error}=await db.from('mafia_rooms').select('code,phase,round,phase_started_at,lifecycle_version').in('phase',['reveal','night','day','vote','nomination','trial','verdict']).limit(1000);
  if(error)throw error;
  return out({status:'ok',time:Date.now(),instanceMetrics:{...requestTotals},rooms:data||[],truncated:(data||[]).length===1000});
}
