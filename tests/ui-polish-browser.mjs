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
 await page.evaluate(()=>{
 window.auditReset=()=>{closeSheet();document.querySelector('.player-tools')?.remove();hostToken='';playerId='0';game={code:'1234',matchId:'audit',phase:'lobby',round:2,players:Array.from({length:14},(_,i)=>({id:String(i),name:i===0?'عبدالله محمد العبدالرحمن':'لاعب '+i,alive:true,connected:true})),enabledRoles:{discussion_mode:'turns'},discussion:{id:'audit',mode:'turns',seconds:120,order:['0','1','2'],cursor:0,turnStartedAt:Date.now(),roulette:{candidates:['0','1'],winner:'0',at:Date.now()-5000}},me:{id:'0',name:'عبدالله محمد العبدالرحمن',role:'doctor',alive:true,acknowledged:true,doctorAvailable:true},roleReadyCount:8,voteCount:5,lastDeaths:[],accusedPlayer:'0',winner:'village'};};
 api=async()=>({profile:{nickname:'عبدالله محمد العبدالرحمن',games:100,wins:75,recovery_code:'ABC123456789'},leaderboard:[{nickname:'عبدالله محمد العبدالرحمن',wins:123,games:234}],seasonLeaderboard:[],season:'2026'});
 });
 const report=[];
 for(const width of [320,390,1280])for(const view of ['home','profile','setup1','host-day','player-night','player-verdict']){
 await page.setViewportSize({width,height:900});
 try{
 await page.evaluate(async view=>{
 auditReset();
 const simple={login:renderHostLogin,home:renderHostHome,join:joinForm,spectator:spectatorForm,replacement:replacementForm,recovery:recoveryForm,guide:showGuide,training:showTrainingHelp,profile:showProfile,leaderboard:showLeaderboard};
 if(simple[view])return await simple[view]();
 if(view.startsWith('setup')||['room','players'].includes(view)){setupStep=Number(view.slice(-1))||1;lobbyPane=view.startsWith('setup')?'setup':view;return renderHost();}
 if(view==='will'){game.phase='night';renderPlayer();openWill();return;}
 const [who,phase]=view.split('-');game.phase=phase;if(phase==='reveal')game.me.acknowledged=false;who==='host'?renderHost():renderPlayer();
 },view);
 await page.waitForTimeout(80);
 const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('#app *')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&(b.right>innerWidth+1||b.left< -1)&&getComputedStyle(e).position!=='absolute'}).slice(0,6).map(e=>e.className)}));
 report.push({view,width,...overflow});
 await page.screenshot({path:'artifacts/audit-'+view+'-'+width+'.png',fullPage:true});
 }catch(e){report.push({view,width,error:e.message});}
 }
 await page.setViewportSize({width:390,height:900});
 await page.evaluate(()=>{auditReset();game.phase='night';renderPlayer();});
 await page.waitForTimeout(100);
 assert.equal(await page.locator('.player-tools').count(),1);
 assert.equal(await page.locator('.player-tools').evaluate(el=>getComputedStyle(el).position),'static');
 assert.ok(await page.locator('.player-tools svg').count()>=2);
 await page.locator('[onclick="openWill()"]').click();
 assert.ok(await page.locator('#willText').isVisible());
 await page.evaluate(()=>closeSheet());
 await page.locator('.lang-toggle').click();
 await page.waitForTimeout(100);
 assert.ok((await page.locator('.player-tools').innerText()).includes('My will'));
 assert.ok(await page.locator('.player-tools svg').count()>=2);
 await page.locator('.theme-toggle').click();
 await page.screenshot({path:'artifacts/polish-light-en.png',fullPage:true});
 await page.locator('.lang-toggle').click();
 await page.waitForTimeout(100);
 assert.ok((await page.locator('.player-tools').innerText()).includes('وصيتي'));
 await page.locator('[onclick="openReport()"]').click();
 assert.ok(await page.locator('#reportReason').isVisible());
 assert.equal(errors.length,0,errors.join('; '));
 assert.deepEqual(report.filter(r=>r.error||r.scroll>r.width),[]);
 console.log('Polish: icons, tool placement, will/report dialogs, Arabic/English and light mode passed.');
 console.log(JSON.stringify(report.filter(r=>r.error||r.scroll>r.width),null,2));console.log('Browser errors:',errors);await (await import('node:fs/promises')).writeFile('artifacts/ui-polish-audit.json',JSON.stringify(report,null,2));
}finally{await browser.close();}
