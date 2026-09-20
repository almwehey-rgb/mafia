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
 await page.evaluate(()=>{game={code:'TEST',phase:'lobby',players:Array.from({length:10},(_,i)=>({id:String(i),name:'لاعب '+i,alive:true})),enabledRoles:{}};setupStep=3;document.querySelector('#app').innerHTML=setupPanel({mafia:3,doctor:1,detectives:1,lawyer:0,jailer:0,vigilante:0,witch:0,serialKiller:0,jester:0,revealer:0,cupid:0,escort:0,citizens:5,selectedTotal:5,valid:true});});
 for(const width of [390,1280]){
 await page.setViewportSize({width,height:900});
 assert.equal(await page.locator('.review-role-cards .role-toggle').count(),5);
 assert.equal(await page.locator('.review-role-cards .role-toggle').first().getAttribute('data-role'),'citizen');
 assert.ok(await page.getByRole('button',{name:'تعديل الأدوار',exact:true}).isVisible());
 assert.ok(await page.getByRole('button',{name:'توزيع الأدوار وبدء اللعبة',exact:true}).isEnabled());
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 assert.ok((await page.locator('[data-role=mafia] img').getAttribute('src')).includes('/mafia-thumb.webp'));
 assert.ok((await page.locator('[data-role=mafia_boss] img').getAttribute('src')).includes('/mafia_boss-thumb.webp'));
 assert.deepEqual(errors,[]);console.log('PASS: review shows only selected roles, sorted by count, edit/start controls and responsive layout.');
}finally{await browser.close();}
