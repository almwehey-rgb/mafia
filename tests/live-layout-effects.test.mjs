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
});

test('exit scene lasts five seconds, can close, and does not replay on polling',()=>{
  let appended=0,removed=0,duration,vibrations=0;
  const effect={className:'',innerHTML:'',setAttribute(){},addEventListener(){},querySelector:()=>({focus(){}}),remove(){removed++;}};
  const context={
    game:{code:'1234',matchId:'one',round:1,me:{id:'a',alive:false},eliminations:[{id:'a',name:'Player A',reason:'mafia_kill'}]},
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
  vm.runInContext('showEliminationEffect()',context);
  assert.equal(appended,1);
  vm.runInContext('closeEliminationEffect()',context);
  assert.equal(removed,1);
});

test('exit scene appears only for the eliminated player, with their own cause',()=>{
  let appended=0,vibrations=0;
  const effect={className:'',innerHTML:'',setAttribute(){},addEventListener(){},querySelector:()=>({focus(){}})};
  const game={code:'5678',matchId:'two',round:2,me:{id:'alive',alive:true},eliminations:[
    {id:'a',name:'Player A',reason:'mafia_kill'},
    {id:'b',name:'Player B',reason:'lovers_died'},
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
