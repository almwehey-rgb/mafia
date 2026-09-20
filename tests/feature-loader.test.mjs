import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=await readFile(new URL('../dist/feature-loader.js',import.meta.url),'utf8');
function fixture(load){
 const requests=[],alerts=[];
 const context={window:{},alert:message=>alerts.push(message),document:{
  createElement:()=>({remove(){}}),
  head:{append(script){requests.push(script.src);queueMicrotask(()=>load(script,context));}}
 }};
 vm.runInNewContext(source,context);
 return {context,requests,alerts};
}
test('concurrent feature calls share one script request and preserve arguments',async()=>{
 const {context,requests,alerts}=fixture((script,ctx)=>{
  ctx.window.openAdminView=value=>value;script.onload();
 });
 assert.deepEqual(await Promise.all([context.window.openAdminView('first'),context.window.openAdminView('second')]),['first','second']);
 assert.deepEqual(requests,['/admin.js']);assert.equal(alerts.length,0);
});
test('failed downloads can be retried',async()=>{
 let attempt=0;
 const {context,requests,alerts}=fixture((script,ctx)=>{
  if(++attempt===1)script.onerror();else{ctx.window.openAdminView=()=>42;script.onload();}
 });
 await context.window.openAdminView();
 assert.equal(await context.window.openAdminView(),42);
 assert.equal(requests.length,2);assert.equal(alerts.length,1);
});
test('loaded scripts with missing initialization report failure and allow retry',async()=>{
 let attempt=0;
 const {context,requests,alerts}=fixture((script,ctx)=>{
  if(++attempt===2)ctx.window.openAdminView=()=>42;
  script.onload();
 });
 context.window.MAFIA_ASSETS={'/admin.js':'/admin.js?v=test-version'};
 await context.window.openAdminView();
 assert.equal(alerts.length,1);
 assert.equal(await context.window.openAdminView(),42);
 assert.equal(requests.length,2);
 assert(requests.every(src=>src==='/admin.js?v=test-version'));
});
test('QR dependency loads before the QR feature',async()=>{
 const {context,requests}=fixture((script,ctx)=>{
  if(script.src==='/qrcode.js')ctx.window.qrcode={};
  else {assert(ctx.window.qrcode);ctx.window.showAdminQR=()=>true;}
  script.onload();
 });
 assert.equal(await context.window.showAdminQR(),true);
 assert.deepEqual(requests,['/qrcode.js','/admin-qr.js']);
});
