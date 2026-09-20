import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const label=process.argv[2],url=process.argv[3];
const browser=await chromium.launch({headless:true,channel:'msedge'});
const results=[];
try {
 for(let i=0;i<3;i++){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage(),cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:500000,uploadThroughput:125000});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  let bytes=0;const errors=[],failed=[];
  cdp.on('Network.loadingFinished',e=>bytes+=e.encodedDataLength);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});
  await page.addInitScript(()=>{
   window.metrics={lcp:0,cls:0};
   new PerformanceObserver(list=>{for(const entry of list.getEntries())window.metrics.lcp=entry.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
   new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)window.metrics.cls+=entry.value;}).observe({type:'layout-shift',buffered:true});
  });
  await page.goto(url,{waitUntil:'load',timeout:120000});
  await page.locator('#hostPin').waitFor({timeout:30000});
  await page.waitForLoadState('networkidle',{timeout:60000});
  await page.waitForTimeout(1500);
  const result=await page.evaluate(()=>{const nav=performance.getEntriesByType('navigation')[0];return {...window.metrics,fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime,domContentLoaded:nav.domContentLoadedEventEnd,load:nav.loadEventEnd,ttfb:nav.responseStart,resourceCount:performance.getEntriesByType('resource').length,finalUrl:location.href};});
  Object.assign(result,{run:i+1,bytes,errors,failed});results.push(result);
  if(i===0)await page.screenshot({path:`artifacts/live-${label}.png`});
  console.log(JSON.stringify(result));await context.close();
 }
 const median=key=>results.map(r=>r[key]).sort((a,b)=>a-b)[1];
 const summary=Object.fromEntries(['lcp','fcp','load','ttfb','bytes','cls','resourceCount'].map(k=>[k,median(k)]));
 await writeFile(`artifacts/live-${label}.json`,JSON.stringify({url,label,conditions:{runs:3,width:390,height:844,downloadMbps:4,latencyMs:80,cpuSlowdown:4,cache:'cold',serviceWorkers:'blocked for comparable first visit'},summary,results},null,2));
 console.log(JSON.stringify({label,summary}));
} finally {await browser.close();}
