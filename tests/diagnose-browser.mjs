import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),pending=new Set();
page.on('request',r=>pending.add(r.url()));page.on('requestfinished',r=>pending.delete(r.url()));page.on('requestfailed',r=>{pending.delete(r.url());console.log('FAILED',r.url(),r.failure());});page.on('pageerror',e=>console.log('ERROR',e.message));
await page.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:4373'?route.continue():route.abort());
try{await page.goto('http://127.0.0.1:4373/game',{waitUntil:'networkidle',timeout:8000});}
catch{console.log(JSON.stringify({pending:[...pending],text:await page.locator('body').innerText()}));}
await browser.close();
