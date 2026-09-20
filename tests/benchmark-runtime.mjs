// Real handler + SQL in disposable PGlite. Never sends network requests.
import {mkdir,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import {edgeFixture} from './helpers/edge-fixture.mjs';
const label=process.argv[2]||'after';
const sourcePath=process.argv[3];
const stages=(process.env.LOAD_STAGES||'1,4,8,16,32').split(',').map(Number);
const ticks=Number(process.env.LOAD_TICKS||5),interval=2000;
const samples=[];
const summarize=values=>{
 const sorted=[...values].sort((a,b)=>a-b);
 return {n:sorted.length,p50:+(sorted[Math.ceil(sorted.length*.5)-1]||0).toFixed(2),p95:+(sorted[Math.ceil(sorted.length*.95)-1]||0).toFixed(2),max:+(sorted.at(-1)||0).toFixed(2)};
};
const fixture=await edgeFixture({fresh:true,sourcePath,log:{log(){},warn(){},error(){}}});
const {handler,db,metrics}=fixture;
async function request(action,args={},category=action){
 const t=performance.now(),q=metrics.queries;
 const response=await handler(new Request('http://isolated.test/test-api',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'127.0.0.1'},body:JSON.stringify({action,...args})}));
 const text=await response.text(),body=JSON.parse(text);
 samples.push({category,ms:performance.now()-t,status:response.status,bytes:Buffer.byteLength(text),queries:metrics.queries-q});
 if(!response.ok)throw Error(`${action}: ${response.status} ${body.error}`);
 return body;
}
const settings={doctor:false,detective:false,lawyer:false,jailer:false,discussion_mode:'off',full_trial:false};
async function room(index){
 const login=await request('hostLogin',{pin:'12345678'});
 const created=await request('create',{hostAccessToken:login.hostAccessToken,mafiaCount:1,detectiveCount:0,enabledRoles:settings});
 const auth={code:created.code,hostToken:created.hostToken};
 const seats=[];
 for(let i=0;i<8;i++){
  const id=`r${index}p${i}`,p=await request('join',{code:created.code,id,name:id});
  seats.push({code:created.code,id,playerToken:p.playerToken});
 }
 let state=await request('state',auth,'setupState');
 state=await request('start',{...auth,lifecycleVersion:state.lifecycleVersion,mafiaCount:1,detectiveCount:0,enabledRoles:settings});
 for(const seat of seats)await request('acknowledgeRole',{...seat,lifecycleVersion:state.lifecycleVersion},'reveal');
 state=await request('beginNight',{...auth,lifecycleVersion:state.lifecycleVersion});
 state=await request('resolveNight',{...auth,lifecycleVersion:state.lifecycleVersion});
 state=await request('startVote',{...auth,lifecycleVersion:state.lifecycleVersion});
 for(const seat of seats)await request('vote',{...seat,lifecycleVersion:state.lifecycleVersion,target:'SKIP'});
 return {auth,seats};
}
try{
 const rooms=[],load=[];
 for(const count of stages){
  while(rooms.length<count)rooms.push(await room(rooms.length));
  // Refresh all participants before each stage, including rooms from prior stages.
  const actors=rooms.flatMap(r=>[r.auth,...r.seats]);
  const start=performance.now(),q=metrics.queries,from=samples.length;
  for(let tick=0;tick<ticks;tick++){
   const due=start+tick*interval;
   if(performance.now()<due)await new Promise(r=>setTimeout(r,due-performance.now()));
   await Promise.allSettled(actors.map(actor=>request('state',actor,'load')));
  }
  const slice=samples.slice(from),latency=summarize(slice.map(s=>s.ms));
  const errors=slice.filter(s=>s.status!==200).length,seconds=(performance.now()-start)/1000;
  const result={rooms:count,players:count*8,controllers:count,requests:slice.length,seconds:+seconds.toFixed(2),throughput:+(slice.length/seconds).toFixed(2),latency,errors,queries:metrics.queries-q,passed:errors===0&&latency.p95<=1000&&latency.max<=2000};
  load.push(result);console.log(JSON.stringify(result));
  if(!result.passed)break;
 }
 const groups={};
 for(const category of new Set(samples.map(s=>s.category))){const rows=samples.filter(s=>s.category===category);groups[category]={latency:summarize(rows.map(s=>s.ms)),bytes:summarize(rows.map(s=>s.bytes)),queries:category==='load'?undefined:summarize(rows.map(s=>s.queries)),errors:rows.filter(s=>s.status!==200).length};}
 const report={label,at:new Date().toISOString(),environment:{node:process.version,cpu:cpus()[0].model,adapter:'PGlite single serialized SQL connection, in-process handler, no network',playersPerRoom:8,pollIntervalMs:interval,ticks,thresholds:{p95Ms:1000,maxMs:2000,errors:0}},groups,load,testedCapacity:load.filter(s=>s.passed).at(-1)||null};
 await mkdir('artifacts/assurance',{recursive:true});await writeFile(`artifacts/assurance/${label}-runtime.json`,JSON.stringify(report,null,2));
}finally{await db.close();}
