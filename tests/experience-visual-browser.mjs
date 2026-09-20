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
 await page.setViewportSize({width:390,height:844});await page.goto('https://mafia.test/');
 await page.evaluate(()=>{document.body.classList.add('light');renderHostHome();});
 await page.addScriptTag({path:'artifacts/a11y-tools/package/axe.min.js'});
 for(const bottom of [false,true]){await page.evaluate(bottom=>scrollTo(0,bottom?document.body.scrollHeight:0),bottom);const violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:['color-contrast']})).violations);assert.deepEqual(violations,[]);}
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'artifacts/experience/home-final-light.png',fullPage:true});
 await page.evaluate(()=>{playerId='me';game={code:'1234',phase:'night',round:2,players:[{id:'me',name:'أنا',alive:true}],enabledRoles:{},me:{id:'me',role:'doctor',alive:true,acknowledged:true,doctorAvailable:true}};renderPlayer();openWill();});
 await page.setViewportSize({width:320,height:350});await page.locator('#willText').fill('نص تجربة الوصية');await page.locator('#willText').press('Tab');
 await page.screenshot({path:'artifacts/experience/dialog-final-small.png',fullPage:false});
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
