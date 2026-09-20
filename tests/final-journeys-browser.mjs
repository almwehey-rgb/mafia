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
 for(const count of [4,7,10,14,20]) {
  const started=Date.now();
  const host=await participant(1280),player=await participant(390);
  await host.page.locator('#hostPin').fill('12345678');
  await host.page.locator('[onclick="loginHost()"]').click();
  await host.page.locator('[onclick="createRoom()"]').click();
  await host.page.waitForFunction(()=>game?.code);
  const savedHost=await host.page.evaluate(()=>JSON.parse(localStorage.getItem('mafia-session')));
  const auth={code:savedHost.code,hostToken:savedHost.hostToken};
  await player.page.goto('https://mafia.test/?room='+auth.code);
  await player.page.locator('#playerName').fill('لاعب القبول');
  await player.page.locator('[onclick="joinRoom()"]').click();
  await player.page.waitForFunction(()=>game?.me?.id);
  const seat=await player.page.evaluate(()=>JSON.parse(localStorage.getItem('mafia-session')));
  const seats=[{code:auth.code,id:seat.playerId,playerToken:seat.playerToken}];
  for(let i=1;i<count;i++) {
   const joined=await call('join',{code:auth.code,id:'p'+i,name:'لاعب '+i});
   seats.push({code:auth.code,id:'p'+i,playerToken:joined.playerToken});
  }
  const settings={doctor:count>=7,detective:true,lawyer:false,jailer:false,full_trial:false,discussion_mode:'turns'};
  await call('start',{...auth,mafiaCount:1,detectiveCount:1,enabledRoles:settings});
  await player.page.waitForFunction(()=>game?.phase==='reveal');
  const initial=await player.page.evaluate(()=>({id:game.me.id,role:game.me.role,match:game.matchId}));
  for(const credentials of seats){const view=await call('state',credentials);assert.ok(view.players.every(p=>!('role' in p)));await call('acknowledgeRole',credentials);}
  await player.page.reload();
  await player.page.locator('button[onclick^="resumeGame("]').click();
  await player.page.waitForFunction(()=>game?.me?.role);
  assert.deepEqual(await player.page.evaluate(()=>({id:game.me.id,role:game.me.role,match:game.matchId})),initial);
  await call('beginNight',auth);
  await player.page.waitForFunction(()=>game?.phase==='night');
  player.control.offline=true;
  await player.page.waitForFunction(()=>document.querySelector('#reconnect').classList.contains('show'));
  player.control.offline=false;
  await player.page.waitForFunction(()=>!document.querySelector('#reconnect').classList.contains('show'));
  assert.equal(await player.page.evaluate(()=>game.me.role),initial.role);
  await host.page.reload();
  await host.page.locator('button[onclick^="resumeGame("]').click();
  await host.page.waitForFunction(()=>game?.phase==='night');
  assert.equal(await host.page.evaluate(()=>game.canControl),true);
  // Close the actual host tab, then advance only the database heartbeat clock.
  // This tests takeover after grace without spending a minute per matrix entry.
  await host.context.close();
  await db.query("update mafia_rooms set host_seen_at=now()-interval '1 minute' where code=$1",[auth.code]);
  await player.page.waitForFunction(()=>game?.canControl===true);
  const denied=await handler(new Request('https://isolated.test/',{method:'POST',body:JSON.stringify({action:'state',...auth})}));
  assert.equal(denied.status,403);
  const controller=seats[0];
  const roles=(await db.query('select id,role from mafia_players where room_code=$1',[auth.code])).rows;
  const boss=roles.find(p=>p.role==='mafia_boss').id;
  const detective=roles.find(p=>p.role==='detective').id;
  await call('act',{...seats.find(p=>p.id===detective),target:boss});
  await call('resolveNight',controller);
  const discussion=await call('startDiscussion',controller);
  await call('finishDiscussion',{...controller,discussionId:discussion.discussion.id});
  await call('startVote',controller);
  for(const credentials of seats)await call('vote',{...credentials,target:credentials.id===boss?'SKIP':boss});
  const finished=await call('resolveVote',controller);
  assert.equal(finished.phase,'finished');assert.equal(finished.winner,'village');
  await player.page.waitForFunction(()=>game?.phase==='finished');
  if(await player.page.evaluate(()=>game.me.alive && game.me.isHost)) {
   assert.ok(await player.page.getByText('افتح تحكم المضيف لإعادة المباراة.',{exact:true}).isVisible());
  }
  await player.page.screenshot({path:`artifacts/final-journey-${count}.png`,fullPage:true});
  // Eliminating a controller can legitimately transfer authority again.
  const finalHostId=(await db.query('select host_player_id from mafia_rooms where code=$1',[auth.code])).rows[0].host_player_id;
  await call('returnToLobby',seats.find(p=>p.id===finalHostId));
  await player.page.waitForFunction(()=>game?.phase==='lobby');
  assert.equal(await player.page.locator('.personal-role-card').count(),0);
  assert.equal((await db.query('select count(*)::int n from mafia_players where room_code=$1',[auth.code])).rows[0].n,count);
  const stats=(await db.query('select games,wins from mafia_profiles where profile_token in (select profile_token from mafia_players where room_code=$1)',[auth.code])).rows;
  assert.ok(stats.every(p=>p.games===1));assert.equal(stats.reduce((sum,p)=>sum+p.wins,0),count-1);
  report.push({players:count,settings,winner:finished.winner,scriptDurationMs:Date.now()-started,human:false,checks:['UI login/create/join','private role','player refresh','network interruption/recovery','host refresh','host close/takeover','revoked old host','match completion','exactly-once statistics','lobby privacy']});
  console.log('PASS final journey: '+count+' players');await player.context.close();
 }
 assert.deepEqual(errors,[]);
} finally {
 await writeFile('artifacts/final-journeys.json',JSON.stringify({report,errors},null,2));
 await browser.close();await db.close();
}
