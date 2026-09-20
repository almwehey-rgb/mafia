import {chromium} from 'file:///C:/Users/Talmuehii/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {readFile,writeFile} from 'node:fs/promises';
const c=JSON.parse(await readFile('.test-assurance/credentials.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],failed=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});
 await page.goto(process.env.PREVIEW_URL||'https://mafia-night-cdeeswi0a-tm-d73f.vercel.app/game.html?_vercel_share=7bDGNumxHUVyGqsUIxFQNhPkrll289bP');
 await page.locator('#hostPin').fill(c.pin);await page.locator('[onclick="loginHost()"]').click();
 await page.locator('[onclick="createRoom()"]').waitFor();
 await page.screenshot({path:'artifacts/preview-phone-ready.png',fullPage:true});
 const result={passed:errors.length===0&&failed.length===0,title:await page.title(),errors,failed};await writeFile('artifacts/preview-ready.json',JSON.stringify(result));console.log(JSON.stringify(result));
 if(!result.passed)throw Error('Preview errors');
}finally{await browser.close();}
