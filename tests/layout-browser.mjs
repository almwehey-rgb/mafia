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
 for(const width of [390,768,1280]){
  await page.setViewportSize({width,height:900});
  await page.locator('.home-role-gallery').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelectorAll('.home-role-gallery .role-reader').length===14);
 assert.equal(await page.locator('.home-role-gallery .role-reader').count(),14);
  await page.locator('.home-role-gallery').scrollIntoViewIfNeeded();
  for(const image of await page.locator('.home-role-gallery img').all()){await image.scrollIntoViewIfNeeded();await image.evaluate(i=>i.decode());}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow '+width);
  const first=page.locator('.home-role-gallery .role-reader').first();await first.press('Enter');assert.equal(await first.getAttribute('aria-pressed'),'true');await first.press('Enter');
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'artifacts/layout-entry-'+width+'.png',fullPage:true});
 }
 await page.evaluate(()=>renderHostHome());
 await page.screenshot({path:'artifacts/layout-home-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'artifacts/layout-home-mobile.png',fullPage:true});
 for(const view of ['joinForm','spectatorForm','showGuide']){
 await page.evaluate(name=>window[name](),view);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),view+' fits mobile');
 }
 assert.deepEqual(errors,[]);console.log('PASS: 14 loaded characters, mobile/tablet/desktop layouts, keyboard flips, host home, join and spectator forms, guide; no script errors.');
}finally{await browser.close();}
