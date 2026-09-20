import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!=='https://mafia.test')return route.abort();const file=u.pathname==='/'?'/game.html':u.pathname;try {await route.fulfill({body:await readFile(new URL('../dist'+file,import.meta.url)),contentType:({'html':'text/html','js':'text/javascript','css':'text/css','webp':'image/webp'})[file.split('.').pop()]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:''});}});

try {
await mkdir('artifacts/review-flip',{recursive:true});
await page.goto('https://mafia.test/');
await page.evaluate(()=>{game={code:'1234',phase:'lobby',round:0,players:Array.from({length:20},(_,i)=>({id:'p'+i,name:'لاعب '+i,alive:true,connected:true})),enabledRoles:{}};hostToken='test';lobbyPane='setup';setupStep=3;mafiaCount=3;detectiveCount=2;for(const r of ['doctor','detective','lawyer','jailer','vigilante','witch','serial_killer','jester','revealer','cupid','escort'])enabledRoles[r]=true;renderHost();});
const before=await page.evaluate(()=>JSON.stringify({enabledRoles,roles:roleDistribution()}));
assert.equal(await page.locator('[data-review-role]').count(),14);
const counts=await page.locator('.review-role-count').allTextContents();
const numbers=counts.map(s=>Number(s.replace('×','').trim()));assert.deepEqual(numbers,[...numbers].sort((a,b)=>b-a));
for(const role of await page.locator('[data-review-role]').evaluateAll(cards=>cards.map(c=>c.dataset.reviewRole))){
 const card=page.locator('[data-review-role="'+role+'"]');
 const size=await card.boundingBox();await card.click();
 assert.equal(await card.getAttribute('data-view'),'details');
 assert.equal(await card.locator('.role-details-view').getAttribute('aria-hidden'),'false');
 assert.ok((await card.locator('.role-rule-sections section').count())>=3);
 await page.evaluate(()=>renderHost());assert.equal(await card.getAttribute('data-view'),'details');
 const after=await card.boundingBox();assert.equal(size.height,after.height);assert.equal(size.width,after.width);
 await card.press('Enter');assert.equal(await card.getAttribute('data-view'),'image');
 await card.press('Space');assert.equal(await card.getAttribute('data-view'),'details');
 await card.press('Enter');
}
assert.equal(await page.evaluate(()=>JSON.stringify({enabledRoles,roles:roleDistribution()})),before);
assert.equal(await page.locator('.review-role-cards [onclick*="toggleRole"]').count(),0);
assert.equal(await page.locator('.review-role-cards .role-allies').count(),0);
for(const width of [320,390,1280]){
 await page.setViewportSize({width,height:844});
 const card=page.locator('[data-review-role="citizen"]');await card.click();
 await card.scrollIntoViewIfNeeded();
 await card.evaluate(async element=>{await Promise.all(element.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});
 await page.screenshot({path:'artifacts/review-flip/review-'+width+'.png',fullPage:false});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.equal(await page.locator('.host-progress').count(),1);
 await card.press('Enter');
}
await page.evaluate(()=>setSetupStep(2));
assert.ok(await page.locator('.role-preview [onclick*="toggleRole"]').count()>0);
assert.equal(await page.locator('[data-review-role]').count(),0);
assert.deepEqual(errors,[]);console.log('PASS: all 14 review cards flip by click/Enter/Space, retain state across renders, preserve counts and selections, and fit 320/390/1280 screens.');
}finally{await browser.close();}
