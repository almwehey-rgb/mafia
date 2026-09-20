import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {startLocalRuntime} from './helpers/local-runtime.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const old={dist:'artifacts/assurance/before-stable',sourcePath:'tests/fixtures/previous-release.ts'};
const server=await startLocalRuntime(old);
const browser=await chromium.launch({headless:true,channel:'msedge'});
let code,version=0;const errors=[];
async function call(action,args={}){
 const res=await fetch(server.url+'/test-api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,code,lifecycleVersion:version,...args})});
 const body=await res.json();assert.equal(res.status,200,action+': '+body.error);if(body.lifecycleVersion!==undefined)version=body.lifecycleVersion;return body;
}
try{
 const login=await call('hostLogin',{pin:'12345678'}),created=await call('create',{hostAccessToken:login.hostAccessToken});code=created.code;
 const host={hostToken:created.hostToken},seats=[];
 for(let i=0;i<4;i++){const id='deploy'+i;const p=await call('join',{id,name:id});seats.push({id,playerToken:p.playerToken});}
 await call('state',host);
 await call('start',{...host,mafiaCount:1,detectiveCount:0,enabledRoles:{doctor:false,detective:false,lawyer:false,jailer:false,discussion_mode:'off',full_trial:false}});
 const me=await call('state',seats[0]);
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===server.url?route.continue():route.abort());
 await context.addInitScript(session=>localStorage.setItem('mafia-session',JSON.stringify(session)),{code,host:false,hostToken:'',playerId:seats[0].id,playerToken:seats[0].playerToken});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.url+'/game');
 await page.getByRole('button',{name:'مواصلة',exact:true}).click();
 await page.locator('button[onclick="acknowledgeRole()"]').waitFor();
 await server.deploy({dist:'dist'});
 // Existing JS stays open while its next request reaches the new backend.
 await page.locator('button[onclick="acknowledgeRole()"]').click();
 await page.waitForFunction(()=>game?.me?.acknowledged===true);
 assert.equal((await call('state',seats[0])).me.role,me.me.role);
 await page.reload();await page.getByRole('button',{name:'مواصلة',exact:true}).click();
 await page.waitForFunction(()=>game?.me?.acknowledged===true);
 assert.equal(await page.evaluate(()=>game.matchId),me.matchId);
 await server.deploy(old);
 await page.reload();await page.getByRole('button',{name:'مواصلة',exact:true}).click();
 await page.waitForFunction(()=>game?.me?.acknowledged===true);
 assert.equal(await page.evaluate(()=>game.matchId),me.matchId);
 assert.equal((await call('state',seats[0])).me.role,me.me.role);
 assert.deepEqual(errors,[]);
 await writeFile('artifacts/assurance/deployment-browser.json',JSON.stringify({passed:true,environment:'loopback HTTP with atomic release switch and persistent disposable DB',upgradeWithOpenPage:true,reloadAfterUpgrade:true,rollbackReload:true,sessionAndRolePreserved:true,errors},null,2));
 console.log('PASS: active browser survives frontend/backend upgrade, refresh and rollback');
}finally{await browser.close();await server.close();}
