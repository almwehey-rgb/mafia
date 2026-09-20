import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/Talmuehii/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!=='https://mafia.test')return route.abort();const file=u.pathname==='/'?'/game.html':u.pathname;try {await route.fulfill({body:await readFile(new URL('../dist'+file,import.meta.url)),contentType:({'html':'text/html','js':'text/javascript','css':'text/css','webp':'image/webp'})[file.split('.').pop()]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:''});}});
try {
await mkdir('artifacts/design-review',{recursive:true});
await page.goto('https://mafia.test/');
await page.evaluate(()=>{localStorage.setItem('mafia-session',JSON.stringify({code:'1234'}));renderHostHome();});
await page.screenshot({path:'artifacts/design-review/home-before.png',fullPage:true});
console.log('Resume bounds',await page.locator('.cinema-resume').boundingBox());
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
assert.deepEqual(errors,[]);console.log('PASS: repeated +/- and refresh preserve open/closed disclosure state; no page errors');
}finally{await browser.close();}
