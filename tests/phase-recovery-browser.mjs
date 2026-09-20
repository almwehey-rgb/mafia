// Local browser -> actual Edge handler -> fresh PostgreSQL WASM.
// Scripted matches are functional checks, never human balance evidence.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {edgeFixture} from './helpers/edge-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const {db,handler}=await edgeFixture({fresh:true,sourcePath:new URL('../.test-assurance/production-edge.ts',import.meta.url)});
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
 const control={offline:false,dropJoinResponse:false};
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname.includes('/functions/v1/mafia-room')) {
   if(control.offline)return route.abort('internetdisconnected');
   const response=await handler(new Request('https://isolated.test/',{method:request.method(),headers:request.headers(),body:request.postData()||undefined}));
   if(control.dropJoinResponse&&JSON.parse(request.postData()||'{}').action==='join') {control.dropJoinResponse=false;return route.abort('connectionreset');}
   return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  }
  if(url.origin!=='https://mafia.test')return route.abort();
  try{
   const file=url.pathname==='/'?'/game.html':url.pathname;
   const body=await readFile(new URL('../.test-assurance/production'+file,import.meta.url));
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
 const login=await call('hostLogin',{pin:'12345678'}),room=await call('create',{hostAccessToken:login.hostAccessToken});
 const auth={code:room.code,hostToken:room.hostToken};
 const player=await participant(390);
 await player.page.goto('https://mafia.test/?room='+room.code);
 player.control.dropJoinResponse=true;
 await player.page.locator('#playerName').fill('اختبار الاستعادة');await player.page.locator('[onclick="joinRoom()"]').click();
 await player.page.waitForFunction(()=>document.querySelector('#joinRoomBtn')?.disabled===false||document.querySelector('[onclick="joinRoom()"]')?.disabled===false);
 const pending=await player.page.evaluate(code=>JSON.parse(localStorage.getItem('mafia-pending-join-'+code)),room.code);
 assert.ok(pending?.playerId);assert.ok(pending?.playerToken);
 await player.page.reload();
 await player.page.locator('#playerName').fill('اختبار الاستعادة');await player.page.locator('[onclick="joinRoom()"]').click();
 await player.page.waitForFunction(()=>game?.me?.id);
 const identity=await player.page.evaluate(()=>({id:game.me.id,token:playerToken}));
 assert.equal(identity.id,pending.playerId);assert.equal(identity.token,pending.playerToken);
 assert.equal((await db.query('select count(*)::int n from mafia_players where room_code=$1',[room.code])).rows[0].n,1);
 for(let i=0;i<4;i++)await call('join',{code:room.code,id:'p'+i,name:'Seat '+i});
 await call('start',{...auth,mafiaCount:1,detectiveCount:1,enabledRoles:{doctor:false,jailer:false,lawyer:false,full_trial:false,discussion_mode:'off'}});
 await player.page.waitForFunction(()=>game?.me?.role);
 const expected=await player.page.evaluate(()=>({id:game.me.id,role:game.me.role,match:game.matchId}));
 for(const phase of ['reveal','night','day','vote','finished']){
  await db.query('update mafia_rooms set phase=$1,host_seen_at=now() where code=$2',[phase,room.code]);
  await player.page.waitForFunction(phase=>game?.phase===phase,phase);
  player.control.offline=true;
  await player.page.waitForFunction(()=>document.querySelector('#reconnect').classList.contains('show'));
  const rejected=await player.page.evaluate(async()=>{try{await api({action:'vote',code:game.code,target:'p1'});return false;}catch(error){return error.code==='RECONNECTING';}});
  assert.equal(rejected,true,phase+' allowed unsafe mutation');
  await player.page.reload();
  await player.page.locator('button[onclick^="resumeGame("]').waitFor();
  player.control.offline=false;
  await player.page.locator('button[onclick^="resumeGame("]').click();
  await player.page.waitForFunction(phase=>game?.phase===phase,phase);
  assert.deepEqual(await player.page.evaluate(()=>({id:game.me.id,role:game.me.role,match:game.matchId})),expected);
  // Closing and reopening the tab retains the browser profile and server seat.
  await player.page.close();player.page=await player.context.newPage();player.page.on('dialog',d=>d.accept());player.page.on('pageerror',e=>errors.push(e.message));
  await player.page.goto('https://mafia.test/');await player.page.locator('button[onclick^="resumeGame("]').click();
  await player.page.waitForFunction(()=>game?.me?.role);
  assert.deepEqual(await player.page.evaluate(()=>({id:game.me.id,role:game.me.role,match:game.matchId})),expected);
  report.push({phase,offline:true,reload:true,reopen:true,sameSeat:true,sameRole:true,unsafeMutationBlocked:true});
 }
 assert.deepEqual(errors,[]);await writeFile('artifacts/phase-recovery.json',JSON.stringify({passed:true,report},null,2));console.log(JSON.stringify({passed:true,phases:report.length,errors}));
 await player.context.close();
}finally{await browser.close();await db.close();}
