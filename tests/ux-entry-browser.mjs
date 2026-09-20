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
 await page.evaluate(()=>joinForm());
 assert.equal(await page.locator('#roomCode').evaluate(el=>el===document.activeElement),true);
 await page.locator('[onclick="joinRoom()"]').click();
 assert.equal(await page.locator('#roomCode').getAttribute('aria-invalid'),'true');
 await page.locator('#roomCode').fill('١٢٣٤');
 assert.equal(await page.locator('#roomCode').inputValue(),'1234');
 await page.locator('#roomCode').press('Enter');
 assert.equal(await page.locator('#playerName').evaluate(el=>el===document.activeElement),true);
 await page.locator('[onclick="joinRoom()"]').click();
 assert.equal(await page.locator('#playerName').getAttribute('aria-invalid'),'true');
 for(const width of [320,390,1280]){
 await page.setViewportSize({width,height:900});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'artifacts/ux-join-'+width+'.png',fullPage:true});
 }
 await page.evaluate(()=>{document.querySelector('.entry-back').focus();openSheet('اختبار','<input id="modalTest"><button id="modalLast">تم</button>');});
 assert.equal(await page.locator('[role="dialog"]').count(),1);
 await page.locator('.close-sheet').press('Shift+Tab');
 assert.equal(await page.locator('#modalLast').evaluate(el=>el===document.activeElement),true);
 await page.locator('#modalLast').press('Tab');
 assert.equal(await page.locator('.close-sheet').evaluate(el=>el===document.activeElement),true);
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('[role="dialog"]').count(),0);
 assert.equal(await page.locator('.entry-back').evaluate(el=>el===document.activeElement),true);
 await page.evaluate(()=>joinForm('۱۲۳۴'));
 assert.equal(await page.locator('#roomCode').inputValue(),'1234');
 assert.equal(await page.locator('#playerName').evaluate(el=>el===document.activeElement),true);
 const guarded=await page.evaluate(async()=>{
  game={code:'1234',lifecycleVersion:1};document.getElementById('reconnect').classList.add('show');
  let sent=0;const original=window.fetch;window.fetch=async()=>{sent++;throw Error('Should not send');};
  try{await api({action:'vote',code:'1234',target:'p1'});return {sent,blocked:false};}catch(error){return {sent,blocked:error.code==='RECONNECTING'};}finally{window.fetch=original;document.getElementById('reconnect').classList.remove('show');}
 });
 assert.deepEqual(guarded,{sent:0,blocked:true});
 assert.deepEqual(errors,[]);console.log('PASS: input guidance, Arabic digits, keyboard navigation, dialogs, and 3 viewport sizes');
}finally{await browser.close();}
