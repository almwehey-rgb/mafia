// Local browser -> actual Edge handler -> fresh PostgreSQL WASM.
// Scripted matches are functional checks, never human balance evidence.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {edgeFixture} from './helpers/edge-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const {db,handler}=await edgeFixture({fresh:true});
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
const errors=[],report=[];
await mkdir('artifacts',{recursive:true});
async function call(action,args={}) {
 const room=args.code?(await db.query('select lifecycle_version from mafia_rooms where code=$1',[args.code])).rows[0]:null;
 const response=await handler(new Request('https://isolated.test/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,lifecycleVersion:room?.lifecycle_version,...args})}));
 const body=await response.json();assert.equal(response.status,200,action+': '+JSON.stringify(body));return body;
}
async function participant(width) {
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
 const control={offline:false};
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname.includes('/functions/v1/mafia-room')) {
   if(control.offline)return route.abort('internetdisconnected');
   const response=await handler(new Request('https://isolated.test/',{method:request.method(),headers:request.headers(),body:request.postData()||undefined}));
   return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  }
  if(url.origin!=='https://mafia.test')return route.abort();
  try{
   const file=url.pathname==='/'?'/game.html':url.pathname;
   const body=await readFile(new URL('../dist'+file,import.meta.url));
   await route.fulfill({body,contentType:({html:'text/html',js:'text/javascript',css:'text/css',png:'image/png',webp:'image/webp',svg:'image/svg+xml'})[file.split('.').pop()]||'application/octet-stream'});
  }catch{await route.fulfill({status:404,body:''});}
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept());
 await page.goto('https://mafia.test/');
 await page.waitForFunction(()=>typeof loginHost==='function');
 return {context,page,control};
}
try {
 const host=await participant(390);const players=[];
 await host.page.locator('#hostPin').fill('12345678');await host.page.locator('#hostPin').press('Enter');
 await host.page.locator('[onclick="createRoom()"]').click();await host.page.waitForFunction(()=>game?.code);
 const code=await host.page.evaluate(()=>game.code);
 for(let i=0;i<5;i++){
  const p=await participant([320,390,768,1280,390][i]);players.push(p);
  await p.page.evaluate(()=>joinForm());await p.page.locator('#roomCode').fill(code);await p.page.locator('#roomCode').press('Enter');
  assert.ok(await p.page.locator('#playerName').evaluate(e=>e===document.activeElement));
  await p.page.locator('#playerName').fill('جديد '+i);await p.page.locator('#playerName').press('Enter');await p.page.waitForFunction(()=>game?.me?.id);
 }
 await host.page.waitForFunction(()=>game.players.length===5);
 await host.page.locator('[onclick="applyPreset(\'quick\')"]').click();
 await host.page.locator('[onclick="setSetupStep(3)"]').first().click();
 await host.page.locator('[onclick="startGame()"]').click();
 for(const p of players){
  await p.page.waitForFunction(()=>game.phase==='reveal');
  await p.page.locator('.personal-role-card').focus();await p.page.keyboard.press('Enter');
  assert.equal(await p.page.locator('.personal-role-card').getAttribute('aria-pressed'),'true');
  await p.page.locator('[onclick="acknowledgeRole()"]').focus();await p.page.keyboard.press('Enter');await p.page.waitForFunction(()=>game.me.acknowledged);
 }
 await host.page.locator('[onclick="hostAction(\'beginNight\')"]').click();
 let detective;for(const p of players){await p.page.waitForFunction(()=>game.phase==='night');if(await p.page.evaluate(()=>game.me.role==='detective'))detective=p;}
 assert.ok(detective);
 await detective.page.locator('.pick').first().focus();await detective.page.keyboard.press('Enter');
 await detective.page.waitForFunction(()=>game.me.acted);
 assert.ok(await detective.page.locator('#actionFeedback').textContent());
 await host.page.locator('[onclick="hostAction(\'togglePause\')"]').first().click();await host.page.waitForFunction(()=>game.phase==='paused');
 await host.page.locator('.btn[onclick="hostAction(\'togglePause\')"]').click();await host.page.waitForFunction(()=>game.phase==='night');
 await host.page.locator('[onclick="showMatchTools()"]').click();
 await host.page.locator('[onclick="showModeration()"]').click();
 await host.page.waitForFunction(()=>!document.querySelector('.game-sheet')&&document.querySelector('.admin-list'));
 assert.equal(await host.page.locator('.shell').getAttribute('inert'),null);
 await host.page.locator('[onclick="renderHost()"]').click();
 await host.page.locator('[onclick="showMatchTools()"]').click();await host.page.locator('[onclick="endGame()"]').click();await host.page.waitForFunction(()=>game.phase==='finished');
 assert.equal(await host.page.locator('.game-sheet').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: five scripted players join by keyboard, confirm roles, detective acts; host pauses, resumes, manages and ends through UI. Not human usability evidence.');
}finally{await browser.close();await db.close();}
