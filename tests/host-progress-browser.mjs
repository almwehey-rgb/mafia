import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!=='https://mafia.test')return route.abort();const file=u.pathname==='/'?'/game.html':u.pathname;try {await route.fulfill({body:await readFile(new URL('../dist'+file,import.meta.url)),contentType:({'html':'text/html','js':'text/javascript','css':'text/css','webp':'image/webp'})[file.split('.').pop()]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:''});}});
try {
await mkdir('artifacts/design-review',{recursive:true});
await page.goto('https://mafia.test/');
await page.evaluate(()=>{localStorage.setItem('mafia-session',JSON.stringify({code:'1234'}));renderHostHome();});
await page.screenshot({path:'artifacts/design-review/home-before.png',fullPage:true});

await page.evaluate(()=>{game={code:'1234',phase:'lobby',round:0,players:Array.from({length:8},(_,i)=>({id:'p'+i,name:'لاعب '+i,alive:true,connected:true})),enabledRoles:{}};hostToken='test';lobbyPane='setup';setupStep=1;renderHost();});
const details=page.locator('[data-disclosure-key="setup-counts"]');
await details.locator('summary').click();
const plus=details.locator('button').nth(1);
await plus.click();await plus.click();
assert.equal(await details.evaluate(e=>e.open),true);
await details.locator('button').first().click();
assert.equal(await details.evaluate(e=>e.open),true);
await page.evaluate(()=>renderHost());assert.equal(await details.evaluate(e=>e.open),true);
await details.locator('summary').click();await page.evaluate(()=>renderHost());assert.equal(await details.evaluate(e=>e.open),false);
await details.locator('summary').click();
await page.screenshot({path:'artifacts/design-review/settings-after.png',fullPage:true});
await page.evaluate(()=>setSetupStep(3));const rules=page.locator('[data-disclosure-key="setup-rules"]');assert.equal(await rules.evaluate(e=>e.open),true);
await rules.locator('summary').click();await page.evaluate(()=>renderHost());assert.equal(await rules.evaluate(e=>e.open),false);

await page.evaluate(()=>setSetupStep(1));
const dock=page.locator('.host-progress');
assert.equal(await dock.count(),1);
assert.equal(await page.locator('.setup-tabs button').count(),3);
await dock.locator('[data-progress-primary]').click();
assert.equal(await page.evaluate(()=>setupStep),2);
await dock.locator('[data-progress-primary]').click();
assert.equal(await page.evaluate(()=>setupStep),3);
assert.equal(await page.locator('.setup-card button[onclick="startGame()"]').count(),0);
await dock.locator('.host-progress-back').click();assert.equal(await page.evaluate(()=>setupStep),2);
await page.evaluate(()=>setLobbyPane('players'));
await dock.locator('[data-progress-primary]').click();assert.equal(await page.evaluate(()=>lobbyPane),'setup');
await page.evaluate(()=>{game.players=game.players.slice(0,1);renderHost();});
assert.equal(await dock.locator('[data-progress-primary]').isDisabled(),true);
await page.evaluate(()=>{game.players=Array.from({length:8},(_,i)=>({id:'p'+i,name:'لاعب '+i,alive:true,connected:true}));game.phase='night';game.round=2;game.lastDeaths=[];game.phaseClock={startedAt:Date.now(),seconds:60};game.nightReady=false;renderHost();});
assert.equal(await dock.locator('[data-progress-primary]').isDisabled(),true);
await page.evaluate(()=>{game.phaseClock.startedAt=Date.now()-61000;updatePhaseTimer();});
assert.equal(await dock.locator('[data-progress-primary]').isDisabled(),false);
assert.match(await page.locator('#hostProgressStatus').innerText(),/جاهز/);
await page.evaluate(()=>{window.calledAction='';hostAction=async action=>{window.calledAction=action;};});
await dock.locator('[data-progress-primary]').click();assert.equal(await page.evaluate(()=>window.calledAction),'resolveNight');
for(const phase of ['reveal','day','nomination','trial','verdict','vote','paused']) {
 await page.evaluate(phase=>{game.phase=phase;game.roleReadyCount=0;game.voteCount=0;game.lawyerReady=true;game.jailerReady=true;game.accusedPlayer='p0';game.phaseClock={startedAt:Date.now(),seconds:60};renderHost();},phase);
 assert.equal(await dock.count(),1,phase);
 assert.equal(await dock.locator('[data-progress-primary]').count(),1,phase);
}
await page.evaluate(()=>{game.phase='lobby';setSetupStep(3);});
for(const [width,height] of [[390,844],[320,568],[1280,800]]){
 await page.setViewportSize({width,height});
 await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:'artifacts/design-review/progress-setup-'+width+'.png',fullPage:false});
 let b=await dock.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width+1&&b.y+b.height<=height,JSON.stringify(b));
 await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
 const panel=await page.locator('.setup-card').boundingBox();b=await dock.boundingBox();assert.ok(panel.y+panel.height<=b.y, 'Content clears dock '+width);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
}
await page.setViewportSize({width:390,height:844});
await page.evaluate(()=>{game.phase='night';game.nightReady=false;renderHost();scrollTo(0,0);});
await page.screenshot({path:'artifacts/design-review/progress-night.png',fullPage:false});
await page.evaluate(()=>{game=null;renderHostHome();});assert.equal(await dock.count(),0);
assert.deepEqual(errors,[]);console.log('PASS: setup forward/back, invalid start guard, all live phase controls, timer unlock, correct action dispatch, 320/390/1280 layout, disclosure persistence and no page errors');
}finally{await browser.close();}
