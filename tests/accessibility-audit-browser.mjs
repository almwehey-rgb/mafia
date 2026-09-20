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
 window.auditReset=()=>{closeSheet();document.querySelector('.player-tools')?.remove();hostToken='';playerId='0';game={code:'1234',matchId:'audit',phase:'lobby',round:2,players:Array.from({length:20},(_,i)=>({id:String(i),name:i===0?'اسمطويلبدونمسافاتجدا':'لاعب باسم طويل '+i,alive:true,connected:true})),enabledRoles:{discussion_mode:'turns'},discussion:{id:'audit',mode:'turns',seconds:120,order:['0','1','2'],cursor:0,turnStartedAt:Date.now(),roulette:{candidates:['0','1'],winner:'0',at:Date.now()-5000}},me:{id:'0',name:'عبدالله محمد العبدالرحمن',role:'doctor',alive:true,acknowledged:true,doctorAvailable:true},roleReadyCount:8,voteCount:5,lastDeaths:[],accusedPlayer:'0',winner:'village'};};
 api=async()=>({profile:{nickname:'عبدالله محمد العبدالرحمن',games:100,wins:75,recovery_code:'ABC123456789'},leaderboard:[{nickname:'عبدالله محمد العبدالرحمن',wins:123,games:234}],seasonLeaderboard:[],season:'2026'});
 });
 const views=['login','home','join','spectator','replacement','recovery','guide','training','profile','leaderboard','setup1','setup2','setup3','room','players','host-reveal','host-night','host-day','host-trial','host-verdict','host-vote','host-paused','host-finished','player-reveal','player-night','player-day','player-trial','player-verdict','player-vote','player-paused','player-finished','will','report','manage','moderation','discipline','chat'];
 const report=[];await page.addScriptTag({path:'artifacts/a11y-tools/package/axe.min.js'});
 for(const lang of ['ar','en'])for(const theme of ['dark','light'])for(const view of views){const width=390;await page.evaluate(lang=>{localStorage.setItem('mafia-lang',lang);document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr'},lang);await page.evaluate(theme=>document.body.classList.toggle('light',theme==='light'),theme);
 await page.setViewportSize({width,height:900});
 try{
 await page.evaluate(async view=>{
 auditReset();
 const simple={login:renderHostLogin,home:renderHostHome,join:joinForm,spectator:spectatorForm,replacement:replacementForm,recovery:recoveryForm,guide:showGuide,training:showTrainingHelp,profile:showProfile,leaderboard:showLeaderboard};
 if(simple[view])return await simple[view]();
 if(view.startsWith('setup')||['room','players'].includes(view)){hostToken='local-audit-host';setupStep=Number(view.slice(-1))||1;lobbyPane=view.startsWith('setup')?'setup':view;return renderHost();}
 if(['report','manage','moderation','discipline','chat'].includes(view)){game.phase='night';hostToken=['manage','moderation','discipline'].includes(view)?'audit-host':'';renderPlayer();if(view==='report')openReport();if(view==='manage')showMatchTools();if(view==='moderation')await showModeration();if(view==='discipline')openDiscipline('1','expelPlayer');if(view==='chat'){game.me.role='mafia';renderChatSheet({channel:'mafia',messages:Array.from({length:30},(_,i)=>({id:i,author_id:'1',author_name:'لاعب',content:'رسالةطويلةبدونمسافات'.repeat(8)})),hasMore:false});}return;}
 if(view==='will'){game.phase='night';renderPlayer();openWill();return;}
 const [who,phase]=view.split('-');hostToken=who==='host'?'local-audit-host':'';game.phase=phase;if(phase==='reveal')game.me.acknowledged=false;who==='host'?renderHost():renderPlayer();
 },view);
 await page.waitForTimeout(80);
 const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('#app *')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&(b.right>innerWidth+1||b.left< -1)&&getComputedStyle(e).position!=='absolute'}).slice(0,6).map(e=>e.className)}));
 const audit=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.length}))};});report.push({view,width,theme,lang,...overflow,...audit});
 
 }catch(e){report.push({view,width,error:e.message});}
 }
 console.log(JSON.stringify(report.filter(r=>r.error||r.violations?.length).map(r=>({view:r.view,theme:r.theme,error:r.error,violations:r.violations})),null,2));console.log('Browser errors:',errors);await (await import('node:fs/promises')).writeFile('artifacts/accessibility-audit.json',JSON.stringify(report,null,2));
 assert.deepEqual(report.filter(r=>r.error||r.scroll>r.width),[], 'Every view must render without horizontal overflow');
 assert.deepEqual(errors,[], 'No browser runtime errors');
 assert.equal(report.reduce((n,r)=>n+(r.violations?.length||0),0),0,'No automated accessibility violations');
 console.log('PASS '+report.length+' accessibility screen variants');
}finally{await browser.close();}
