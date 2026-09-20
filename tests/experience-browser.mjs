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
 await mkdir('artifacts/experience',{recursive:true});
 await page.goto('https://mafia.test/');
 for(const lang of ['ar','en'])for(const theme of ['dark','light'])for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:844});
  await page.evaluate(({lang,theme})=>{localStorage.setItem('mafia-lang',lang);localStorage.setItem('mafia-theme',theme);document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';document.body.classList.toggle('light',theme==='light');},{lang,theme});
  for(const screen of ['join','setup','review','reveal','night','paused','finished']){
   await page.evaluate(screen=>{
    if(screen==='join'){joinForm();return;}
    playerId='me';hostToken='';spectatorMode=false;game={code:'1234',matchId:'ux',round:2,phase:screen,players:[{id:'me',name:'أنا',alive:true,connected:true},{id:'other',name:'لاعب جديد باسم طويل',alive:true,connected:true}],enabledRoles:{},phaseClock:{startedAt:Date.now(),seconds:60},me:{id:'me',role:'doctor',alive:true,doctorAvailable:true,acknowledged:screen!=='reveal',selectedIds:[]}};
    if(screen==='setup'||screen==='review'){game.phase='lobby';lobbyPane='setup';setupStep=screen==='setup'?1:3;renderHost();}else renderPlayer();
   },screen);
   await page.waitForTimeout(60);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),[screen,width,lang,theme].join(' '));
   if(width===390)await page.screenshot({path:'artifacts/experience/'+screen+'-'+lang+'-'+theme+'.png',fullPage:true});
  }
 }
 await page.evaluate(()=>{game.phase='night';game.me.acted=false;renderPlayer();window.calls=0;api=()=>{window.calls++;return new Promise(resolve=>window.finishAction=()=>resolve({...game,me:{...game.me,acted:true}}));};});
 await page.locator('[data-target="other"]').click();
 assert.equal(await page.locator('[data-target="other"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('[data-target="other"]').isDisabled(),true);
 await page.evaluate(()=>playerAction('act','other'));
 assert.equal(await page.evaluate(()=>window.calls),1);
 await page.evaluate(()=>window.finishAction());
 await page.waitForFunction(()=>document.querySelector('#actionFeedback')?.classList.contains('success'));
 await page.evaluate(()=>{game.me.acted=false;renderPlayer();api=async()=>{throw Error('offline')};});
 await page.locator('[data-target="other"]').click();
 await page.waitForFunction(()=>document.querySelector('#actionFeedback')?.classList.contains('error'));
 assert.equal(await page.locator('[data-target="other"]').isDisabled(),false);
 await page.evaluate(()=>{hostToken='host';game.phase='lobby';lobbyPane='players';renderHost();});
 await page.locator('.player-management summary').first().click();
 assert.ok(await page.locator('.player-management .kick').first().isVisible());
 await page.evaluate(()=>{game.phase='night';renderHost();showMatchTools();});
 assert.equal(await page.locator('.shell').getAttribute('inert'),'');
 assert.equal(await page.locator('.phase-bar [onclick="endGame()"]').count(),0);
 await page.keyboard.press('Escape');assert.equal(await page.locator('.shell').getAttribute('inert'),null);
 assert.deepEqual(errors,[]);console.log('PASS: 112 responsive screen variants, sending/success/failure, duplicate prevention, modal isolation, host tools');
}finally{await browser.close();}
