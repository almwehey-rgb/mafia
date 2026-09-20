import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!=='https://mafia.test')return route.abort();
  const file=url.pathname==='/'?'/game.html':url.pathname;
  try{await route.fulfill({body:await readFile(new URL('../dist'+file,import.meta.url)),contentType:({html:'text/html',js:'text/javascript',css:'text/css',webp:'image/webp'})[file.split('.').pop()]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:''});}
 });
 await page.goto('https://mafia.test/');
 await page.evaluate(()=>{playerId='me';game={code:'1234',matchId:'focus',phase:'reveal',round:1,players:[{id:'me',name:'لاعب',alive:true}],enabledRoles:{},me:{id:'me',role:'doctor',alive:true,acknowledged:false}};renderPlayer();});
 const acknowledge=page.locator('[onclick="acknowledgeRole()"]');
 await acknowledge.focus();
 await page.evaluate(()=>{game.roleReadyCount=1;renderPlayer();});
 assert.ok(await acknowledge.evaluate(e=>e===document.activeElement),'State refresh must preserve focused confirmation');
 await page.locator('.personal-role-card').focus();
 await page.evaluate(()=>renderPlayer());
 assert.ok(await page.locator('.personal-role-card').evaluate(e=>e===document.activeElement));
 await page.keyboard.press('Enter');
 assert.equal(await page.locator('.personal-role-card').getAttribute('aria-pressed'),'true');
 await acknowledge.focus();
 await page.evaluate(()=>{game.matchId='another-match';renderPlayer();});
 assert.ok(!await acknowledge.evaluate(e=>e===document.activeElement),'A new match must not inherit action focus');
 assert.deepEqual(errors,[]);console.log('PASS: role confirmation/card focus survive same-phase refresh; a new match does not inherit action focus.');
}finally{await browser.close();}
