import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
 const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!=='https://mafia.test')return route.abort();
  const file=url.pathname==='/'?'/index.html':url.pathname;
  try {
   const body=await readFile(new URL('../dist'+file,import.meta.url));
   requests.push({path:file,bytes:body.length});
   await route.fulfill({body,contentType:({html:'text/html',js:'text/javascript',css:'text/css',png:'image/png',webp:'image/webp'})[file.split('.').pop()]||'application/octet-stream'});
  } catch {await route.fulfill({status:404,body:''});}
 });
 await page.goto('https://mafia.test/');

 await page.locator('#hostPin').waitFor();
 await page.waitForLoadState('networkidle');
 assert(!requests.some(r=>['/qrcode.js','/admin.js','/admin-qr.js'].includes(r.path)),'Optional features stay off startup path');
 assert.equal(await page.locator('.home-role-gallery .role-presentation').count(),0,'Offscreen cards are not built');
 await page.locator('.home-role-gallery').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelectorAll('.home-role-gallery .role-presentation').length===14);
 assert.equal(await page.locator('.home-role-gallery .role-presentation').count(),14);
 assert(!requests.some(r=>/role-cards-v3\/[^/]+(?<!-thumb)\.webp$/.test(r.path)),'Home must not download full-size card backgrounds');
 assert(!requests.some(r=>/noir-(boss|doctor|detective)\.png$/.test(r.path)));
 assert(!requests.some(r=>r.path==='/assets/mafia-gold-icon.png'));
 const card=page.locator('.home-role-gallery .turning-role').first();
 await card.click();
 assert.equal(await card.getAttribute('data-view'),'details');
 await card.evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished)));
 await page.screenshot({path:'artifacts/performance-mobile.png'});
 await page.setViewportSize({width:1280,height:900});
 await page.screenshot({path:'artifacts/performance-desktop.png'});
 await page.evaluate(()=>loadFeatureScript('/qrcode.js'));
 // Exercise the actual lobby and ensure background observers do not rebuild it.
 await page.evaluate(()=>{
  hostToken='local-test-host';game={code:'1234',phase:'lobby',players:Array.from({length:8},(_,i)=>({id:String(i),name:'لاعب '+i,alive:true,connected:true})),enabledRoles:{}};
  window.qrBuilds=0;window.qrPayloads=[];
  const original=qrcode;
  qrcode=(...args)=>{window.qrBuilds++;const qr=original(...args),add=qr.addData;qr.addData=value=>{window.qrPayloads.push(value);return add(value);};return qr;};
  renderHost();renderHost();
 });
 const qr=page.locator('.lobby-join img.qr');
 await qr.evaluate(image=>image.decode());
 assert.equal(await page.evaluate(()=>window.qrBuilds),1,'Lobby reuses generated QR');
 assert.deepEqual(await page.evaluate(()=>window.qrPayloads),['https://mafia.test/game.html?room=1234']);
 await page.evaluate(()=>{
  window.lobbyRenders=0;const original=renderHost;
  renderHost=(...args)=>{window.lobbyRenders++;return original(...args);};
 });
 await page.locator('.lang-toggle').click();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.evaluate(()=>window.lobbyRenders),1,'Language change renders once');
 assert.equal(await page.locator('html').getAttribute('lang'),'en');
 await page.locator('.theme-toggle').click();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.evaluate(()=>window.lobbyRenders),1,'Theme change does not rebuild lobby');
 await page.locator('.lang-toggle').click();
 assert.equal(await page.locator('html').getAttribute('lang'),'ar');
 // Nested clock updates should not schedule lobby layout work.
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const fitCount=await page.evaluate(async()=>{
  let fits=0;const original=requestAnimationFrame;
  window.requestAnimationFrame=callback=>{if(callback.name==='fitLobby')fits++;return original(callback);};
  try {
   const clock=document.createElement('span');document.querySelector('.lobby-join').append(clock);
   for(let i=0;i<5;i++){clock.textContent=String(i);await new Promise(resolve=>original(()=>original(resolve)));}
   clock.remove();return fits;
  } finally {window.requestAnimationFrame=original;}
 });
 assert.equal(fitCount,0,'Timer ticks do not refit lobby');
 await page.screenshot({path:'artifacts/performance-lobby.png'});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,resourceBytes:requests.reduce((n,r)=>n+r.bytes,0),requests:requests.length,errors},null,2));
} finally {await browser.close();}

