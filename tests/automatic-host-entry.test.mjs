import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../src/client/'+path,import.meta.url),'utf8');
const journey=await read('journey-ui.js'),entry=await read('room-entry.js'),actions=await read('host-actions.js');
function fixture(cancel=false){
 const calls=[];let counter=0;
 const context={game:{code:'1234',phase:'lobby',players:[],enabledRoles:{},lifecycleVersion:0},enabledRoles:{automatic_game:false},playerId:'',playerToken:'',hostToken:'host',profileToken:'',phaseDuration:60,mafiaCount:1,detectiveCount:1,detectiveQuestions:3,
 prompt:()=>cancel?null:'صاحب الرمز',crypto:{randomUUID:()=>`id-${++counter}`},saveSession:()=>{},localStorage:{removeItem(){}},signalPhase(){},rememberEvent(){},hostCodeError:()=>'',alert:()=>assert.fail('Unexpected alert'),withBusy:(_label,run)=>run()};
 context.api=async body=>{calls.push(body);if(body.action==='join')return {...context.game,players:[{id:body.id,name:body.name}],me:{id:body.id},playerToken:body.playerToken};if(body.action==='start')return {...context.game,phase:'reveal',enabledRoles:body.enabledRoles,me:null};if(body.action==='state')return {...context.game,me:{id:context.playerId,role:'mafia_boss'}};throw Error(body.action);};
 vm.createContext(context);vm.runInContext(journey+entry+actions,context);
 context.schedulePreferenceSave=()=>{};context.renderHost=()=>{};
 return {context,calls,run:code=>vm.runInContext(code,context)};
}
test('Automatic mode seats the owner once and fetches their private role on start',async()=>{
 const f=fixture();await f.run('setAutomaticGame(true)');assert.equal(f.context.enabledRoles.automatic_game,true);assert.equal(f.calls[0].action,'join');
 await f.run('setAutomaticGame(true)');assert.equal(f.calls.length,1);
 await f.run('startGame()');assert.deepEqual(f.calls.map(x=>x.action),['join','start','state']);assert.equal(f.context.game.me.role,'mafia_boss');
});
test('Cancelling the player name does not silently enable automatic mode or start',async()=>{
 const f=fixture(true);await f.run('setAutomaticGame(true)');assert.equal(f.context.enabledRoles.automatic_game,false);assert.equal(f.calls.length,0);
 f.context.enabledRoles.automatic_game=true;await f.run('startGame()');assert.equal(f.calls.length,0);
});
test('Returning all players to lobby requires confirmation and cancels active match first',async()=>{
 const f=fixture();f.context.game.phase='night';f.context.confirm=()=>false;
 await f.run('returnToLobby()');assert.equal(f.calls.length,0);
 f.context.confirm=()=>true;f.context.api=async body=>{f.calls.push(body);return {...f.context.game,phase:body.action==='endGame'?'finished':'lobby',lifecycleVersion:f.context.game.lifecycleVersion+1};};
 await f.run('returnToLobby()');assert.deepEqual(f.calls.map(x=>x.action),['endGame','returnToLobby']);assert.equal(f.calls[1].lifecycleVersion,1);assert.equal(f.context.game.phase,'lobby');
});
