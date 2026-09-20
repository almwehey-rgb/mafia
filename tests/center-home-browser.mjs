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
  for(const home of [false,true]){
   await page.evaluate(home=>home?renderHostHome():renderHostLogin(),home);
   const box=await page.locator(home?'.noir-home':'.auth-card').boundingBox();
   assert.ok(Math.abs(box.x+box.width/2-width/2)<4,`Centered at ${width}: ${JSON.stringify(box)}`);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:`artifacts/center-${width}-${home}.png`,fullPage:true});
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS: login and host home centered at 390, 768 and 1280; no overflow or browser errors.');
}finally{await browser.close();}
