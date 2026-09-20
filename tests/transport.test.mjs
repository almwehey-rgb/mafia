import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=await readFile(new URL('../src/client/transport.js',import.meta.url),'utf8');
test('concurrent reads share one request; mutations remain separate; failures are retryable',async()=>{
 let count=0,release;
 const gate=new Promise(r=>release=r);
 const context={Map,JSON,Number,Error,structuredClone,AbortSignal,Date,API:'http://local.test',game:{code:'1234',lifecycleVersion:1},navigator:{onLine:true},document:{getElementById:()=>null},fetch:async()=>{count++;await gate;return {ok:true,json:async()=>({value:1})};}};
 vm.createContext(context);vm.runInContext(source,context);
 const first=context.api({action:'state'}),second=context.api({action:'state'});
 assert.equal(count,1);release();const [a,b]=await Promise.all([first,second]);assert.deepEqual(a,b);assert.notEqual(a,b);
 await Promise.all([context.api({action:'vote'}),context.api({action:'vote'})]);assert.equal(count,3);
 context.fetch=async()=>{count++;throw Error('network');};
 await assert.rejects(context.api({action:'state'}),e=>e.code==='NETWORK_ERROR');
 context.fetch=async()=>{count++;return {ok:false,status:403,json:async()=>({error:'UNAUTHORIZED'})};};
 await assert.rejects(context.api({action:'state'}),e=>e.code==='UNAUTHORIZED'&&e.status===403);
});
