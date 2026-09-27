import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/client/qr-scanner.js',import.meta.url),'utf8');
function setup({denied=false,pending=false}={}){
 let stopped=0,joined=null,resolveMedia;
 const stream={getTracks:()=>[{stop:()=>stopped++}]};
 const video={readyState:2,play:async()=>{},srcObject:null},status={textContent:''};
 const context={URL,location:{origin:'https://mafia.test'},setTimeout:()=>1,clearTimeout(){},openSheet(){},joinForm:code=>joined=code,
 document:{addEventListener(){},getElementById:id=>id==='roomScanVideo'?video:status,createElement:()=>({getContext:()=>({})})},
 window:{addEventListener(){},BarcodeDetector:class{async detect(){return [{rawValue:'https://mafia.test/game?room=9550'}]}}},
 navigator:{mediaDevices:{getUserMedia:()=>denied?Promise.reject({name:'NotAllowedError'}):pending?new Promise(resolve=>resolveMedia=resolve):Promise.resolve(stream)}}};
 vm.createContext(context);vm.runInContext(source,context);context.closeSheet=()=>context.stopRoomScanner();
 return {context,status,video,stream,resolve:()=>resolveMedia(stream),stopped:()=>stopped,joined:()=>joined};
}
test('Accepts room codes and same-site room links, rejects unrelated QR content',()=>{
 const {context:c}=setup();assert.equal(c.scannedRoomCode('9550'),'9550');assert.equal(c.scannedRoomCode('https://mafia.test/game.html?room=9550'),'9550');
 for(const value of ['https://evil.test/game?room=9550','javascript:alert(1)','https://mafia.test/admin?room=9550','12345'])assert.equal(c.scannedRoomCode(value),null);
});
test('Successful scan stops camera and opens room entry',async()=>{
 const f=setup();await f.context.openRoomScanner();await Promise.resolve();assert.equal(f.joined(),'9550');assert.equal(f.stopped(),1);assert.equal(f.video.srcObject,null);
});
test('Permission denied shows manual entry guidance',async()=>{
 const f=setup({denied:true});await f.context.openRoomScanner();assert.match(f.status.textContent,/اسمح باستخدام الكاميرا/);assert.equal(f.joined(),null);
});
test('Closing while permission is pending stops late camera stream',async()=>{
 const f=setup({pending:true});const task=f.context.openRoomScanner();f.context.stopRoomScanner();f.resolve();await task;assert.equal(f.stopped(),1);assert.equal(f.joined(),null);
});
