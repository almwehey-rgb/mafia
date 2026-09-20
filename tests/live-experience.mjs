import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const base='https://mafia-night-iota.vercel.app';
const manifest=JSON.parse(await readFile('artifacts/experience-release-manifest.json','utf8'));
const failures=[];let checked=0;
for(let i=0;i<manifest.length;i+=6)await Promise.all(manifest.slice(i,i+6).map(async f=>{const r=await fetch(base+'/'+f.file);const bytes=Buffer.from(await r.arrayBuffer());if(r.status!==200||createHash('sha256').update(bytes).digest('hex')!==f.sha256)failures.push(f.file);else checked++;}));
assert.deepEqual(failures,[],'Published files match staged release');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,channel:'msedge'});const errors=[];const failed=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)failed.push({url:r.url(),status:r.status()});});
 await page.goto(base,{waitUntil:'load'});await page.locator('#hostPin').waitFor();
 const release=await page.evaluate(()=>window.MAFIA_RELEASE);
 assert.equal(release,JSON.parse(await readFile('artifacts/experience-release/release.json','utf8')).release);
 await page.locator('[onclick="joinForm()"]').click();await page.locator('#roomCode').fill('١٢٣٤');assert.equal(await page.locator('#roomCode').inputValue(),'1234');await page.locator('#roomCode').press('Enter');assert.ok(await page.locator('#playerName').evaluate(e=>e===document.activeElement));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'artifacts/experience-live-join.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 const report={url:base,release,checked,failures,errors,failed,verifiedAt:new Date().toISOString(),productionGameMutation:false};await writeFile('artifacts/experience-live-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
