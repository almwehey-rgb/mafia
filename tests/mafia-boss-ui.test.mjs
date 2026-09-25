import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const journey=await readFile(new URL('../src/client/journey-ui.js',import.meta.url),'utf8');
const playerView=await readFile(new URL('../src/client/player-view.js',import.meta.url),'utf8');

function bossGame(){
 return {code:'1234',round:1,phase:'night',enabledRoles:{discussion_mode:'turns'},me:{id:'boss',role:'mafia_boss',alive:true,acknowledged:true,discussionChoiceLocked:false,mafiaTeam:[{id:'boss',name:'الزعيم'},{id:'mate',name:'زميل'}]}};
}

test('Mafia boss sees only leadership handoff and fake detective claim',()=>{
 const context={game:bossGame(),roleAcknowledged:()=>true,discussionText:arabic=>arabic};
 vm.createContext(context);vm.runInContext(journey,context);
 const card=vm.runInContext('leaderElectionCard()',context);
 assert.match(card,/تنازل عن الزعامة/);
 assert.match(card,/ادّعِ أنك محقق مزيف/);
 assert.equal((card.match(/<button /g)||[]).length,2);
 assert.doesNotMatch(card,/البقاء متخفي|اختيار الاغتيال النهائي|صرت زعيم المافيا/);
 context.game.me.discussionClaim=true;
 context.game.me.discussionChoiceLocked=true;
 assert.equal((vm.runInContext('leaderElectionCard()',context).match(/<button /g)||[]).length,1);
 context.game.me.role='mafia';
 assert.equal(vm.runInContext('leaderElectionCard()',context),'');
});

test('Fake detective claim saves the choice and redraws the boss screen',async()=>{
 let sent,rendered=false;
 const context={game:bossGame(),playerId:'boss',playerToken:'secret',discussionText:arabic=>arabic,withBusy:(_label,task)=>task(),api:async payload=>{sent=payload;return {...context.game,me:{...context.game.me,discussionClaim:true,discussionChoiceLocked:true}};},renderPlayer:()=>{rendered=true;},alert:()=>assert.fail('Unexpected alert')};
 vm.createContext(context);vm.runInContext(journey,context);
 context.renderPlayer=()=>{rendered=true;};
 await vm.runInContext('setBossDiscussionClaim()',context);
 assert.equal(sent.action,'setDiscussionClaim');
 assert.equal(sent.claim,true);
 assert.equal(rendered,true);
});

test('Acknowledged role renders night screen without missing bossDiscussionChoice',()=>{
 const app={innerHTML:'',insertAdjacentHTML(){}};
 const context={game:bossGame(),$:()=>app,document:{querySelector:()=>null},setTimeout:()=>0,mountPlayerTools:()=>{},setRoomTag:()=>{},renderNight:()=>{app.innerHTML='night';}};
 vm.createContext(context);vm.runInContext(playerView,context);
 assert.doesNotThrow(()=>vm.runInContext('renderPlayerContent()',context));
 assert.equal(app.innerHTML,'night');
});
