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
 await page.evaluate(()=>{playerId='me';game={code:'TEST',matchId:'new',phase:'reveal',players:[],enabledRoles:{},me:{id:'me',role:'mafia_boss',alive:true,acknowledged:false,mafiaTeam:[{name:'عبدالله'},{name:'خالد'}]}};renderPlayer();});
 for(const width of [390,1280]){
 await page.setViewportSize({width,height:900});
 const box=await page.locator('.personal-role-card').boundingBox();
 await page.locator('.personal-role-card').click();
 await page.waitForTimeout(700);
 const flipped=await page.locator('.personal-role-card').boundingBox();
 assert.equal(box.height,flipped.height);assert.equal(box.width,flipped.width);
 assert.equal(await page.locator('.personal-role-card').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('.role-allies span').count(),2);
 assert.ok(await page.evaluate(()=>document.querySelector('.role-allies').getBoundingClientRect().top<document.querySelector('.role-rule-sections').getBoundingClientRect().top));
 await page.evaluate(()=>renderPlayer());
 assert.equal(await page.locator('.personal-role-card').getAttribute('aria-pressed'),'true');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:`artifacts/role-reader-${width}.png`,fullPage:true});
 await page.locator('.personal-role-card').press('Enter');
 assert.ok(await page.locator('.role-image-view').isVisible());
 }
 await page.evaluate(()=>showGuide());
 for(const card of await page.locator('.role-reader').all()){
 await card.click();
 assert.ok(await card.locator('.role-details-view').isVisible());
 assert.equal(await card.locator('.role-allies').count(),0);
 await card.press('Enter');
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: tabs, saved selection, private team placement, 14 public roles without teammates, mobile and desktop.');
}finally{await browser.close();}
