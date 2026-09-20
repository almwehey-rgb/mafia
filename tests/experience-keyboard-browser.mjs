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
 await page.evaluate(()=>{playerId='me';game={code:'1234',phase:'night',round:2,players:[{id:'me',name:'أنا',alive:true},{id:'other',name:'هدف',alive:true}],enabledRoles:{},me:{id:'me',role:'doctor',alive:true,acknowledged:true,doctorAvailable:true}};renderPlayer();});
 for(const width of [320,390,768,1280])for(const height of [900,350])for(const sheet of ['will','report']){
  await page.setViewportSize({width,height});await page.evaluate(sheet=>sheet==='will'?openWill():openReport(),sheet);
  const input=page.locator('.game-sheet textarea');await input.fill('ملاحظات مطولة '.repeat(20));
  await input.press('Tab');
  const focused=await page.evaluate(()=>{const e=document.activeElement,b=e.getBoundingClientRect();return {button:e.tagName==='BUTTON',top:b.top,bottom:b.bottom,height:innerHeight}});
  assert.ok(focused.button&&focused.top>=0&&focused.bottom<=focused.height+1,JSON.stringify({sheet,width,height,focused}));
  assert.ok(await page.evaluate(()=>{const b=document.querySelector('.sheet-card').getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight+1}));
  await page.keyboard.press('Escape');assert.equal(await page.locator('.game-sheet').count(),0);
 }
 await page.evaluate(()=>{game.phase='verdict';game.accusedPlayer='other';game.me.voted=true;renderPlayer();});
 assert.equal(await page.locator('.verdict-grid button').count(),2);
 await page.evaluate(()=>{game.phase='night';game.me.role='witch';game.me.charges={life:true,poison:true};game.me.acted=false;renderPlayer();api=()=>new Promise(resolve=>window.completePotion=()=>resolve({...game,me:{...game.me,acted:true}}));witchAction('SAVE','other');});
 assert.ok((await page.locator('#actionFeedback').textContent()).includes('هدف'));
 await page.evaluate(()=>window.completePotion());
 await page.waitForFunction(()=>document.querySelector('#actionFeedback')?.classList.contains('success'));
 assert.deepEqual(errors,[]);console.log('PASS: 16 resized mobile/desktop dialog cases, keyboard reachability, verdict can change, potion target feedback');
}finally{await browser.close();}
