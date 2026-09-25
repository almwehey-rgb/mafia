import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const journey=await readFile(new URL('../src/client/journey-ui.js',import.meta.url),'utf8');
const playerView=await readFile(new URL('../src/client/player-view.js',import.meta.url),'utf8');
const roleCards=await readFile(new URL('../src/client/role-cards.js',import.meta.url),'utf8');
const roleDefinitions=await readFile(new URL('../src/client/role-definitions.js',import.meta.url),'utf8');

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

test('New Mafia boss gets a private role card before any leadership controls render',()=>{
 const app={innerHTML:''};
 const game={...bossGame(),phase:'reveal',matchId:'new-match',players:[],me:{...bossGame().me,acknowledged:false}};
 let enhanced=0;
 const context={game,Map,$:()=>app,document:{querySelector:()=>null},escapeHtml:value=>String(value),discussionText:arabic=>arabic,
  renderWithNotices:()=>assert.fail('Post-reveal controls must not run before role acknowledgement'),
  enhanceJourney:()=>{enhanced++;}};
 vm.createContext(context);
 vm.runInContext(roleDefinitions+roleCards+playerView,context);
 vm.runInContext(journey.slice(journey.indexOf('function renderPlayer(){'),journey.indexOf('function playerStepStatus()')),context);
 assert.doesNotThrow(()=>vm.runInContext('renderPlayer()',context));
 assert.match(app.innerHTML,/mafia_boss\.webp/);
 assert.match(app.innerHTML,/زعيم المافيا/);
 assert.match(app.innerHTML,/فهمت دوري/);
 assert.match(app.innerHTML,/زميل/);
 assert.doesNotMatch(app.innerHTML,/تنازل عن الزعامة|محقق مزيف/);
 assert.equal(enhanced,1);
});
