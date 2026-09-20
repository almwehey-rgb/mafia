// Run with PLAYWRIGHT_MODULE pointing to an installed playwright/index.mjs.
// All requests are served from dist or blocked; no live game is contacted.
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
const page=await browser.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!=='https://mafia.test')return route.abort();
  const file=url.pathname==='/'?'/game.html':url.pathname;
  try{
    const body=await readFile(new URL('../dist'+file,import.meta.url));
    const ext=file.split('.').pop();
    await route.fulfill({body,contentType:({html:'text/html',js:'text/javascript',css:'text/css',png:'image/png',webp:'image/webp'})[ext]||'application/octet-stream'});
  }catch{await route.fulfill({status:404,body:''});}
});
try {
 await page.goto('https://mafia.test/');
 await page.evaluate(()=>{game={code:'1234',phase:'lobby',players:Array.from({length:14},(_,i)=>({id:String(i),name:'لاعب '+i,alive:true,connected:true})),enabledRoles:{}};setupStep=2;lobbyPane='setup';renderHost();});
 for(const width of [390,1280]){
 await page.evaluate(()=>{localStorage.setItem('mafia-lang','en');document.documentElement.lang='en';document.documentElement.dir='ltr';document.body.classList.add('light');renderHost();});
 await page.setViewportSize({width,height:900});await page.waitForTimeout(300);
 assert.equal(await page.locator('.illustrated-role').count(),13);
 for(const img of await page.locator('.illustrated-role img').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(i=>i.decode());}
 const card=page.locator('[data-role="doctor"]');const before=await card.getAttribute('aria-pressed');await card.click();assert.notEqual(await card.getAttribute('aria-pressed'),before);await card.press('Enter');assert.equal(await card.getAttribute('aria-pressed'),before);
 assert.ok(await page.locator('[data-role="mafia"]').isDisabled());assert.ok(await page.locator('[data-role="citizen"]').isDisabled());
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const badges=await page.locator('[data-role=doctor]').evaluate(c=>{const a=c.querySelector('.selection-mark').getBoundingClientRect(),b=c.querySelector('.selection-count').getBoundingClientRect();return a.right<=b.left||b.right<=a.left});assert.ok(badges,'Selection badge and count do not overlap');
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'artifacts/selection-light-en-'+width+'.png',fullPage:true});
 }
 assert.deepEqual(errors,[]);console.log('PASS: illustrated selection, loaded images, click and keyboard toggle, required roles locked, mobile and desktop, no browser errors.');
}finally{await browser.close();}
