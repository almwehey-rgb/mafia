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
 await page.evaluate(()=>{game={players:[{id:'a',name:'عبدالله محمد العبدالرحمن'},{id:'b',name:'تركي'}]};document.querySelector('#app').innerHTML=discussionRoulette({mode:'turns',index:0,order:['a','b'],roulette:{candidates:['b','a'],winner:'a',at:Date.now()-7000}})});
 for (const width of [390,1280]) {
  await page.setViewportSize({width,height:900});
  for (const light of [false,true]) {
   await page.evaluate(light=>document.body.classList.toggle('light',light),light);
   assert.ok(await page.locator('.draw-selected').isVisible());
   assert.equal(await page.locator('.draw-final').innerText(),'عبدالله محمد العبدالرحمن');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:`artifacts/draw-${width}-${light}.png`,fullPage:true});
  }
 }
 await page.evaluate(()=>{document.querySelector('#app').innerHTML=discussionRoulette({mode:'turns',index:0,order:['a','b'],roulette:{candidates:['b','a'],winner:'a',at:Date.now()}})});
 assert.equal(await page.locator('.draw-final').isVisible(),false);
 assert.equal(await page.locator('.draw-order').isVisible(),false);
 await page.waitForTimeout(6200);
 assert.ok(await page.locator('.draw-final').isVisible());
 assert.equal(await page.locator('.draw-final').innerText(),'عبدالله محمد العبدالرحمن');
 assert.ok(await page.locator('.draw-order').isVisible());
 await page.locator('.clear-draw summary').click();
 assert.equal(await page.locator('.draw-selected').isVisible(),false);
 assert.deepEqual(errors,[]);
 console.log('PASS: clear draw, long names, mobile/desktop, dark/light, collapse, no browser errors.');
}finally{await browser.close();}
