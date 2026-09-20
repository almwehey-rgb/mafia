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
 await page.setViewportSize({width:390,height:844});
 for(const kids of [true,false])for(const role of ['mafia_boss','mafia','detective','doctor','citizen']){
 await page.evaluate(({kids,role})=>{game={code:'TEST',matchId:'kids',phase:'reveal',players:[],enabledRoles:{kids_mode:kids},me:{id:'me',role,alive:true,acknowledged:false,mafiaTeam:[]}};playerId='me';renderPlayer();},{kids,role});
 const img=page.locator('.personal-role-card img');await img.evaluate(i=>i.decode());
 assert.ok((await img.getAttribute('src')).includes(kids?'role-cards-kids/':'role-cards-v3/'));
 assert.ok(await img.evaluate(i=>i.naturalWidth>0));
 await page.locator('.personal-role-card').click();
 assert.equal(await page.locator('.personal-role-card').getAttribute('aria-pressed'),'true');
 await page.evaluate(()=>renderPlayer());
 assert.equal(await page.locator('.personal-role-card').getAttribute('aria-pressed'),'true');
 }
 await page.evaluate(()=>{game.enabledRoles.kids_mode=true;showGuide();});
 assert.equal(await page.locator('.role-reader img').count(),5);
 for(const img of await page.locator('.role-reader img').all()){
  await img.evaluate(i=>i.decode());
  assert.ok((await img.getAttribute('src')).includes('role-cards-kids/'));
  assert.equal(await img.evaluate(i=>getComputedStyle(i).objectFit),'contain');
 }
 await page.evaluate(()=>{enabledRoles.kids_mode=true;document.querySelector('#app').innerHTML=interactiveRoleCard('doctor',{review:true,count:1});});
 assert.match(await page.locator('.role-reader img').getAttribute('src'),/role-cards-kids\/doctor.webp/);
 // A stale kids setup must never override a normal match, even in its guide.
 await page.evaluate(()=>{game.enabledRoles.kids_mode=false;enabledRoles.kids_mode=true;showGuide(true);});
 assert.equal(await page.locator('.role-reader img').count(),14);
 assert.equal(await page.locator('img[src*="role-cards-kids"]').count(),0);
 assert.equal(await page.getByRole('button',{name:'كروت الأطفال',exact:true}).count(),0);
 await page.evaluate(()=>{document.querySelector('#app').innerHTML=interactiveRoleCard('doctor',{review:true,image:'/assets/role-cards-kids/doctor.webp'});});
 assert.equal(await page.locator('img[src*="role-cards-kids"]').count(),0);
 // Draft settings control only lobby cards; switching off takes effect at once.
 for(const kids of [true,false]){
  await page.evaluate(kids=>{game.phase='lobby';enabledRoles.kids_mode=kids;showGuide();},kids);
  assert.equal(await page.locator('img[src*="role-cards-kids"]').count(),kids?5:0);
 }
 await page.evaluate(()=>{game.enabledRoles.kids_mode=true;});
 await page.evaluate(()=>{game.me.role='doctor';game.phase='reveal';renderPlayer();});
 const card=await page.locator('.personal-role-card').boundingBox();
 assert.ok(Math.abs(card.width/card.height-394/661)<.01);
 await page.screenshot({path:'artifacts/kids-frame-fixed.png',fullPage:true});
 await page.evaluate(()=>{renderHost=()=>{};schedulePreferenceSave=()=>{};game.players=Array.from({length:8},(_,i)=>({id:String(i)}));});
 for(const preset of ['quick','balanced','pro','chaos']){
 await page.evaluate(preset=>{applyPreset('kids');applyPreset(preset);document.querySelector('#app').innerHTML=roleCard('doctor','', 'الطبيب',1);},preset);
 assert.equal(await page.evaluate(()=>enabledRoles.kids_mode),false);
 assert.ok((await page.locator('#app img').getAttribute('src')).includes('role-cards-v3/'));
 }
 await page.evaluate(()=>{applyPreset('kids');document.querySelector('#app').innerHTML=roleCard('doctor','','الطبيب',1);});
 assert.ok((await page.locator('#app img').getAttribute('src')).includes('role-cards-kids/'));
 assert.deepEqual(errors,[]);console.log('PASS: five kids roles use approved images; all five normal roles retain originals; decoding, flip and polling pass.');
}finally{await browser.close();}
