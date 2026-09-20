import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'file:///C:/Users/Talmuehii/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='https://mafia-night-iota.vercel.app';
const manifest=JSON.parse(await readFile('.test-assurance/manifest.json','utf8'));
const checks=[];
for(const file of ['game.html','game.js','index.html']){
 const r=await fetch(base+'/'+file,{cache:'no-store'});assert.equal(r.status,200);
 const hash=createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');
 assert.equal(hash,manifest.find(e=>e.kind==='production'&&e.file===file).sha256);checks.push(file+' matches tested release');
}
for(const action of ['health','state','adminState']){
 const r=await fetch('https://unsxzbrpqvppecjnirqx.supabase.co/functions/v1/mafia-room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,code:'9681',id:'unauthorized-release-check',playerToken:'invalid'}),signal:AbortSignal.timeout(25000)});
 assert.equal(r.status,action==='health'?200:403);const body=await r.json();
 if(action!=='health'){assert.ok(body.error);assert.equal(body.players,undefined);assert.equal(body.me,undefined);}
 checks.push(action+' expected status '+r.status);
}
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],failed=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});
 await page.goto(base+'/game.html');await page.locator('#hostPin').waitFor();
 await page.screenshot({path:'artifacts/production-assurance.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 const report={passed:true,url:base,checks,errors,failed,verifiedAt:new Date().toISOString()};
 await writeFile('artifacts/production-assurance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
