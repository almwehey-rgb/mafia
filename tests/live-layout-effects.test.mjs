import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const journey=await readFile(new URL('../src/client/journey-ui.js',import.meta.url),'utf8');
const css=await readFile(new URL('../dist/compact-live.css',import.meta.url),'utf8');

test('each elimination reason has a distinct visual cue',()=>{
  const context={};
  vm.createContext(context);vm.runInContext(journey,context);
  for(const [reason,kind] of Object.entries({mafia_kill:'mafia',vote_eliminated:'vote',trial_guilty:'vote',serial_kill:'serial',witch_poison:'poison',jailer_executed:'execution',vigilante_kill:'shot',lovers_died:'lovers',host_expelled:'expelled'})){
    assert.equal(vm.runInContext(`eliminationKind('${reason}')`,context),kind);
    assert.match(css,new RegExp(`effect-${kind}`));
  }
  assert.match(css,/prefers-reduced-motion: reduce/);
  for(const cue of ['exit-flash','exit-ring','exit-burst','exit-shake'])assert.match(css,new RegExp(cue));
});

test('exit scene lasts five seconds, can close, and does not replay on polling',()=>{
  let appended=0,removed=0,duration,vibrations=0;
  const effect={className:'',innerHTML:'',setAttribute(){},addEventListener(){},querySelector:()=>({focus(){}}),remove(){removed++;}};
  const context={
    game:{code:'1234',matchId:'one',phase:'day',round:1,serverTime:100000,me:{id:'a',alive:false},eliminations:[{id:'a',name:'Player A',reason:'mafia_kill',round:1,at:99000}]},
    document:{body:{appendChild(){appended++;}},visibilityState:'visible',createElement:()=>effect,getElementById:()=>appended>removed?effect:null},
    window:{matchMedia:()=>({matches:false})},navigator:{vibrate:()=>{vibrations++;}},
    discussionText:arabic=>arabic,escapeHtml:value=>value,
    setTimeout:(_fn,ms)=>{duration=ms;return 1;},clearTimeout:()=>{},
  };
  vm.createContext(context);vm.runInContext(journey,context);
  vm.runInContext('showEliminationEffect()',context);
  assert.equal(duration,5000);
  assert.equal(appended,1);
  assert.equal(vibrations,1);
  assert.match(effect.className,/effect-mafia/);
  assert.match(effect.innerHTML,/تجاوز/);
  assert.match(effect.innerHTML,/elimination-effect-flash/);
  assert.match(effect.innerHTML,/elimination-effect-ring/);
  vm.runInContext('showEliminationEffect()',context);
  assert.equal(appended,1);
  vm.runInContext('closeEliminationEffect()',context);
  assert.equal(removed,1);
});

test('exit scene appears only for the eliminated player, with their own cause',()=>{
  let appended=0,vibrations=0;
  const effect={className:'',innerHTML:'',setAttribute(){},addEventListener(){},querySelector:()=>({focus(){}})};
  const game={code:'5678',matchId:'two',phase:'night',round:2,serverTime:100000,me:{id:'alive',alive:true},eliminations:[
    {id:'a',name:'Player A',reason:'mafia_kill',round:1,at:99000},
    {id:'b',name:'Player B',reason:'lovers_died',round:1,at:99000},
  ]};
  const context={game,
    document:{body:{appendChild(){appended++;}},visibilityState:'visible',createElement:()=>effect,getElementById:()=>null},
    window:{matchMedia:()=>({matches:false})},navigator:{vibrate:()=>{vibrations++;}},
    discussionText:arabic=>arabic,escapeHtml:value=>value,
    setTimeout:()=>1,clearTimeout:()=>{},
  };
  vm.createContext(context);vm.runInContext(journey,context);
  vm.runInContext('showEliminationEffect()',context);
  game.me={id:'a',alive:true};
  vm.runInContext('showEliminationEffect()',context);
  game.me=null;
  vm.runInContext('showEliminationEffect()',context);
  assert.equal(appended,0);
  assert.equal(vibrations,0);
  game.me={id:'b',alive:false};
  vm.runInContext('showEliminationEffect()',context);
  assert.equal(appended,1);
  assert.equal(vibrations,1);
  assert.match(effect.className,/effect-lovers/);
  assert.match(effect.innerHTML,/Player B/);
  assert.doesNotMatch(effect.innerHTML,/Player A/);
});

test('a saved elimination does not replay after reload or round change, but a new elimination does',()=>{
  const saved=new Map(),storage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)};
  const game={code:'7777',matchId:'match-a',phase:'day',round:1,serverTime:100000,me:{id:'a',alive:false},eliminations:[{id:'a',name:'Player A',reason:'mafia_kill',round:1,at:99000}]};
  let shown=0;
  const context=()=>vm.createContext({game,localStorage:storage,
    document:{body:{appendChild(){shown++;}},visibilityState:'hidden',createElement:()=>({setAttribute(){},addEventListener(){},querySelector:()=>({focus(){}})}),getElementById:()=>null},
    window:{matchMedia:()=>({matches:false})},navigator:{},discussionText:arabic=>arabic,escapeHtml:value=>value,
    setTimeout:()=>1,clearTimeout:()=>{},
  });
  const first=context();vm.runInContext(journey,first);vm.runInContext('showEliminationEffect()',first);
  assert.equal(shown,1);
  const reloaded=context();vm.runInContext(journey,reloaded);vm.runInContext('showEliminationEffect()',reloaded);
  game.phase='night';game.round=2;game.serverTime=102000;
  vm.runInContext('showEliminationEffect()',reloaded);
  assert.equal(shown,1);
  game.eliminations[0].at=101000;
  vm.runInContext('showEliminationEffect()',reloaded);
  assert.equal(shown,2);
});

test('old exit notices disappear outside the day result and recent vote result window',()=>{
  const game={phase:'day',round:2,serverTime:100000,eliminations:[{id:'a',name:'Player A',reason:'mafia_kill',round:2,at:50000}]};
  const context=vm.createContext({game,discussionText:arabic=>arabic,escapeHtml:value=>value,Date});
  vm.runInContext(journey,context);
  assert.match(vm.runInContext('eliminationNotice()',context),/Player A/);
  game.phase='vote';
  assert.equal(vm.runInContext('eliminationNotice()',context),'');
  game.phase='night';game.round=3;game.eliminations=[{id:'b',name:'Player B',reason:'vote_eliminated',round:2,at:99000}];
  assert.match(vm.runInContext('eliminationNotice()',context),/Player B/);
  game.serverTime=120000;
  assert.equal(vm.runInContext('eliminationNotice()',context),'');
});
