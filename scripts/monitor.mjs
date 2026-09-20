import {MonitorRules} from './monitor-rules.mjs';
const endpoint=process.env.MAFIA_MONITOR_URL;
if(!endpoint)throw Error('Set MAFIA_MONITOR_URL to the exact test or production API URL');
const url=new URL(endpoint);
if(url.protocol!=='https:'&&url.hostname!=='127.0.0.1')throw Error('HTTPS required outside loopback');
const rules=new MonitorRules({staleMs:Number(process.env.MAFIA_STALE_MINUTES||15)*60000});
const hostAccessToken=process.env.MAFIA_MONITOR_HOST_TOKEN;
const once=process.argv.includes('--once');
do{
 const started=Date.now();let sample={ok:false,durationMs:0,rooms:[]};
 try{
  const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(hostAccessToken?{action:'operationsStatus',hostAccessToken}:{action:'health'}),signal:AbortSignal.timeout(10000)});
  const body=await response.json();sample={ok:response.ok&&body.status==='ok',durationMs:Date.now()-started,rooms:body.rooms||[]};
 }catch{sample.durationMs=Date.now()-started;}
 const events=rules.inspect(sample);
 for(const event of events)console.log(JSON.stringify(event));
 if(once){console.log(JSON.stringify({event:'mafia.monitor.sample',ok:sample.ok,durationMs:sample.durationMs,rooms:sample.rooms.length,coverage:hostAccessToken?'health-and-active-phases':'health-only'}));if(!sample.ok)process.exitCode=1;}
 else await new Promise(r=>setTimeout(r,30000));
}while(!once);
