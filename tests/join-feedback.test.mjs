import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('Expired-seat retry explains active-match rejection without saving a new session', async()=>{
 const source=readFileSync(new URL('../dist/game.js',import.meta.url),'utf8');
 const start=source.indexOf('function joinErrorMessage(');
 const end=source.indexOf('\n}',source.indexOf('async function joinRoom()',start))+2;
 let calls=0,saves=0;const alerts=[];
 const context=vm.createContext({
  $:selector=>({value:selector==='#roomCode'?'7311':'Late'}),
  localStorage:{getItem:()=>JSON.stringify({playerId:'old',playerToken:'expired'}),setItem:key=>{if(!key.startsWith('mafia-pending-join-'))saves++;}},
  sessionKey:code=>code,crypto:{randomUUID:()=> 'new'},profileToken:'profile',
  withBusy:(_label,fn)=>fn(),api:async()=>{throw {code:++calls===1?'SESSION_INVALID':'GAME_STARTED'};},
  normalizeEntryDigits:value=>value,showJoinFeedback:message=>alerts.push(message),
  alert:message=>alerts.push(message),saveSession:()=>saves++,renderPlayer:()=>saves++,startPolling:()=>saves++
 });
 vm.runInContext(source.slice(start,end),context);
 await vm.runInContext('joinRoom()',context);
 assert.equal(calls,2);assert.equal(saves,0);assert.equal(alerts.length,1);
 assert.match(alerts[0],/المباراة بدأت/);assert.match(alerts[0],/متفرج/);
});
