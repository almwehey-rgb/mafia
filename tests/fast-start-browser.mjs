import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let release;const gate=new Promise(resolve=>release=resolve);let delayed=true;
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!=='https://mafia.test')return route.abort();
  if(url.pathname==='/game.js'&&delayed)await gate;
  try {const file=url.pathname==='/'?'/index.html':url.pathname;const body=await readFile(new URL('../dist'+file,import.meta.url));await route.fulfill({body,contentType:({html:'text/html',js:'text/javascript',css:'text/css',webp:'image/webp',png:'image/png'})[file.split('.').pop()]||'application/octet-stream'});}catch {await route.fulfill({status:404,body:''});}
 });
 await page.goto('https://mafia.test/',{waitUntil:'commit'});
 await page.locator('#hostPin').waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>typeof window.loginHost),'undefined');
 await page.locator('#hostPin').fill('1234');
 assert(await page.locator('button[onclick="loginHost()"]').isDisabled());
 delayed=false;release();await page.waitForLoadState('networkidle');
 assert.equal(await page.locator('#hostPin').inputValue(),'1234');
 assert(await page.locator('button[onclick="loginHost()"]').isEnabled());
 assert.equal(await page.evaluate(()=>typeof window.qrcode),'undefined');
 await page.evaluate(()=>{game={code:'1234',phase:'lobby',players:[],enabledRoles:{}};renderHost();});
 await page.waitForFunction(()=>document.querySelector('.host-lobby img.qr')?.naturalWidth>1);
 await page.evaluate(async()=>{hostToken='';await openAdminView();await showAdminQR();});
 assert.equal(await page.evaluate(()=>typeof closeAdminView),'function');
 await page.goto('https://mafia.test/?room=1234');
 assert.equal(await page.locator('#roomCode').inputValue(),'1234');
 await page.evaluate(()=>renderHostLogin());
 assert(await page.locator('#hostPin').isVisible());
 assert.deepEqual(errors,[]);console.log('PASS: visible login before game JS; typed input preserved; optional QR/admin load on demand; room link opens join form.');
}finally{await browser.close();}
