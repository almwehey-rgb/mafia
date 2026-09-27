// Isolated browser + real Edge handler + disposable SQL database. No production calls.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {edgeFixture} from './helpers/edge-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const {db,handler}=await edgeFixture({fresh:true,log:{log(){},error(){}}});
const browser=await chromium.launch({headless:true,channel:'msedge'});
const errors=[];
async function page(){
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='unsxzbrpqvppecjnirqx.supabase.co'){
   const response=await handler(new Request(url,{method:route.request().method(),headers:{'content-type':'application/json','x-forwarded-for':String(context)},body:route.request().postData()}));
   return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  }
  if(url.origin!=='https://mafia.test')return route.abort();
  const file=url.pathname==='/'?'/game.html':url.pathname;
  try{await route.fulfill({body:await readFile(new URL('../dist'+file,import.meta.url)),contentType:({html:'text/html',js:'text/javascript',css:'text/css',webp:'image/webp'})[file.split('.').pop()]||'application/octet-stream'});}
  catch{await route.fulfill({status:404,body:''});}
 });
 await p.goto('https://mafia.test/');return p;
}
try{
 const owner=await page();
 await owner.locator('#hostPin').fill('12345678');
 await owner.getByRole('button',{name:'الدخول إلى اللعبة ←',exact:true}).click();
 await owner.getByRole('button',{name:'إدارة رموز الاستضافة'}).click();
 await owner.locator('#codeLabel').fill('أحمد');await owner.locator('#codeGames').fill('5');
 await owner.getByRole('button',{name:'إنشاء رمز',exact:true}).click();
 await owner.locator('.host-code-item').waitFor();
 const code=(await owner.locator('.host-code-item code').textContent()).trim();
 assert.ok(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
 await owner.screenshot({path:new URL('../artifacts/host-code-manager-mobile.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/i,'$1'),fullPage:true});
 const guest=await page();
 await guest.getByText('عندي رمز استضافة',{exact:true}).click();
 await guest.locator('#hostPassCode').fill(code);
 await guest.getByRole('button',{name:'دخول برمز الاستضافة',exact:true}).click();
 await guest.getByText('رصيدك:',{exact:false}).waitFor();
 assert.equal(await guest.getByRole('button',{name:'إدارة رموز الاستضافة'}).count(),0);
 assert.match(await guest.locator('.cinema-actions .status').innerText(),/5/);
 await guest.reload();await guest.getByText('رصيدك:',{exact:false}).waitFor();
 assert.match(await guest.locator('.cinema-actions .status').innerText(),/5/);
 await owner.getByRole('button',{name:'إيقاف',exact:true}).click();
 await owner.getByRole('button',{name:'تفعيل',exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS mobile owner creation/list/revocation, guest redemption and reload, hidden owner tools, no horizontal overflow or JS errors');
}finally{await browser.close();await db.close();}
