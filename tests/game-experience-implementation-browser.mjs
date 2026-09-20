// Focused regression coverage for the 2026-09-19 game-experience pass.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
const page=await browser.newPage({viewport:{width:390,height:844}});
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

try{
 await page.goto('https://mafia.test/');
 await page.evaluate(()=>{
  playerId='host';hostToken='host-token';
  game={code:'1234',phase:'lobby',round:0,players:[{id:'host',name:'المضيف',alive:true,connected:true}],enabledRoles:{},settings:{},me:{id:'host',alive:true}};
  setupStep=1;lobbyPane='setup';renderHost();
 });
 await page.locator('button[onclick="applyPreset(\'quick\')"]').click();
 assert.equal(await page.evaluate(()=>setupStep),3);
 assert.ok(await page.getByText(/الأدوار المختارة/).count());

 await page.evaluate(()=>{
  playerId='me';hostToken='';
  game={code:'1234',phase:'reveal',round:1,players:[{id:'me',name:'أنا',alive:true,connected:true}],enabledRoles:{doctor:1},settings:{},me:{id:'me',role:'doctor',alive:true,acknowledged:false}};
  renderPlayer();
 });
 assert.ok((await page.locator('.role-quick-summary').innerText()).trim().length>20);
 assert.ok(await page.locator('.role-acknowledge').getByRole('button').isVisible());
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));

 await page.evaluate(()=>{
  game={code:'1234',phase:'night',round:2,players:[{id:'me',name:'أنا',alive:true},{id:'target',name:'الهدف',alive:true}],enabledRoles:{mafia:1,mafia_kill_enabled:true},settings:{},me:{id:'me',role:'mafia',alive:true,acknowledged:true,acted:false,mafiaTeam:[{id:'me',name:'أنا'}]}};
  window.sent=[];api=async payload=>{window.sent.push(payload);return {...game,me:{...game.me,acted:true}}};
  renderPlayer();
 });
 await page.getByRole('button',{name:/الهدف/}).click();
 assert.equal(await page.locator('[role="dialog"]').count(),1);
 assert.equal(await page.evaluate(()=>window.sent.length),0);
 await page.getByRole('button',{name:/تأكيد الاختيار/}).click();
 await page.waitForFunction(()=>window.sent.length===1);
 assert.equal(await page.evaluate(()=>window.sent[0].target),'target');
 assert.deepEqual(errors,[]);
 console.log('PASS: quick setup, role guidance, mobile reveal and sensitive-action confirmation');
}finally{await browser.close();}
