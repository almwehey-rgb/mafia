import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const origin='https://mafia-night-iota.vercel.app';
const manifest=JSON.parse(await readFile('artifacts/citizen-release-manifest.json','utf8'));
const failures=[];
for(let i=0;i<manifest.length;i+=5)await Promise.all(manifest.slice(i,i+5).map(async entry=>{
 const res=await fetch(origin+'/'+entry.file,{cache:'no-store'});
 const bytes=Buffer.from(await res.arrayBuffer());
 if(!res.ok||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)failures.push(entry.file);
}));
assert.deepEqual(failures,[],'Live files must match the tested release');
const health=await fetch('https://unsxzbrpqvppecjnirqx.supabase.co/functions/v1/mafia-room',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'health'})});
assert.equal(health.status,200);
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
// Render disposable state against real published assets; never write a live room.
await page.route('**/functions/v1/**',r=>r.fulfill({json:{ok:true}}));
try{
 await page.goto(origin+'/',{waitUntil:'networkidle'});
 for(const kids of [true,false]){
  await page.evaluate(kids=>{game={code:'PREVIEW',matchId:'test',phase:'reveal',round:1,players:[],enabledRoles:{kids_mode:kids},me:{id:'me',name:'معاينة',role:'doctor',alive:true,acknowledged:false}};playerId='me';renderPlayer();},kids);
  for(const role of kids?['mafia','mafia_boss','doctor','detective','citizen']:await page.evaluate(()=>Object.keys(roleNames))){
   await page.evaluate(role=>{game.me.role=role;renderPlayer();},role);
   const img=page.locator('.personal-role-card img');await img.evaluate(i=>i.decode());
   assert.ok((await img.getAttribute('src')).includes(kids?'/role-cards-kids/':'/role-cards-v3/'));
   if(!kids)assert.equal(await img.evaluate(i=>i.naturalWidth),1024);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.screenshot({path:`artifacts/published-cards-${kids?'kids':'normal'}.png`,fullPage:true});
 }
 await page.evaluate(()=>{game={players:[{id:'a',name:'أحمد'},{id:'b',name:'خالد'}]};document.querySelector('#app').innerHTML=discussionRoulette({mode:'turns',index:0,order:['a','b'],roulette:{candidates:['b','a'],winner:'a',at:Date.now(),duration:6000}});});
 assert.equal(await page.locator('.draw-final').isVisible(),false);
 await page.waitForTimeout(6200);
 assert.ok(await page.locator('.draw-final').isVisible());
 await page.screenshot({path:'artifacts/published-draw.png',fullPage:true});
 assert.deepEqual(errors,[]);
 const report={url:origin,filesVerified:manifest.length,health:health.status,kidsCards:5,normalCards:14,normalWidth:1024,drawSeconds:6,errors};
 await writeFile('artifacts/cards-publication-verified.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
