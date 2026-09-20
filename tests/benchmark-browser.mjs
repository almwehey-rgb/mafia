// Development benchmark: loopback only; disposable local database.
import {writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const label=process.argv[2]||'after',base=process.argv[3]||'http://127.0.0.1:4373';
assert.equal(new URL(base).hostname,'127.0.0.1','Benchmark must stay on loopback');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
const runs=[];
try{
 for(let run=0;run<5;run++){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:500000,uploadThroughput:250000});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.addInitScript(()=>{
   window.benchmark={lcp:0,renders:0};
   new PerformanceObserver(list=>{window.benchmark.lcp=list.getEntries().at(-1).startTime;}).observe({type:'largest-contentful-paint',buffered:true});
   document.addEventListener('DOMContentLoaded',()=>{
    const app=document.querySelector('#app');
    new MutationObserver(records=>{window.benchmark.renders+=records.filter(r=>r.target===app&&r.type==='childList').length;}).observe(app,{childList:true});
   });
  });
  await page.goto(base+'/game',{waitUntil:'networkidle'});
  await page.locator('#hostPin').waitFor({state:'visible'});
  const startup=await page.evaluate(()=>({lcp:window.benchmark.lcp,dom:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,paint:performance.getEntriesByName('first-contentful-paint')[0]?.startTime,requests:performance.getEntriesByType('resource').length+1,bytes:[...performance.getEntriesByType('resource'),...performance.getEntriesByType('navigation')].reduce((n,r)=>n+r.transferSize,0)}));
  await page.locator('#hostPin').fill('12345678');
  const login=await page.evaluate(()=>performance.now());
  await page.getByRole('button',{name:'الدخول إلى اللعبة ←',exact:true}).click();
  await page.getByRole('button',{name:'⊕ إنشاء غرفة',exact:true}).waitFor({state:'visible'});
  const loginMs=await page.evaluate(t=>performance.now()-t,login);
  // Render timings use deterministic state; API timings are measured separately.
  const rendering=await page.evaluate(async()=>{
   clearTimeout(pollTimer);pollingEpoch++;
   const players=Array.from({length:8},(_,i)=>({id:'p'+i,name:'لاعب '+i,alive:true,connected:true}));
   playerId='p0';hostToken='';game={code:'1234',phase:'reveal',round:1,lifecycleVersion:1,players,enabledRoles:{},me:{id:'p0',name:'لاعب 0',alive:true,role:'citizen',acknowledged:false},phaseClock:{startedAt:Date.now(),seconds:60},discussion:null};
   const timed=async fn=>{const t=performance.now();fn();await Promise.all([...document.querySelectorAll('#app img')].filter(img=>img.getBoundingClientRect().top<innerHeight).map(img=>img.decode().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return performance.now()-t;};
   const revealMs=await timed(()=>renderPlayer());
   game.phase='vote';game.me.acknowledged=true;
   const voteMs=await timed(()=>renderPlayer());
   const before=window.benchmark.renders;
   const idleMs=await timed(()=>{for(let i=0;i<1000;i++)renderStateKey({...game,serverTime:Date.now()});});
   return {revealMs,voteMs,stateKey1000Ms:idleMs,idleRenders:window.benchmark.renders-before};
  });
  assert.deepEqual(errors,[]);
  runs.push({startup,loginMs,...rendering,errors});
  await context.close();
 }
 await mkdir('artifacts/assurance',{recursive:true});
 const result={label,conditions:{browser:'msedge',viewport:'390x844',cache:'disabled',serviceWorkers:'blocked',latencyMs:80,downloadBytesPerSecond:500000,cpuThrottle:4,runs:5,renderScenario:'deterministic 8-player citizen reveal/vote including visible image decoding; backend separately benchmarked'},runs};
 await writeFile(`artifacts/assurance/${label}-browser.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}finally{await browser.close();}
