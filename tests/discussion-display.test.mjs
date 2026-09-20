import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('Draw shows saved winner and queue follows server order without revealing roles',()=>{
 const players=[{id:'a',name:'أحمد <b>'},{id:'b',name:'بدر'},{id:'c',name:'خالد'}];
 const c=vm.createContext({game:{players},localStorage:{getItem:()=> 'ar'},nameOf:id=>players.find(p=>p.id===id)?.name,escapeHtml:s=>s.replaceAll('<','&lt;').replaceAll('>','&gt;'),Date});
 vm.runInContext(readFileSync(new URL('../dist/discussion.js',import.meta.url),'utf8'),c);
 const view={id:'draw',mode:'turns',index:0,status:'active',order:['b','a','c'],roulette:{candidates:['b','a'],winner:'b',at:Date.now()}};
 const html=c.discussionRoulette(view);
 assert.match(html,/draw-selected/);assert.match(html,/fair-draw-disc/);assert.match(html,/الثاني/);assert.match(html,/&lt;b&gt;/);
 assert.equal((html.match(/class="fair-draw-sector"/g)||[]).length,2);
 assert.match(html,/بدر/);assert.match(html,/أحمد &lt;b&gt;/);
 assert.match(html,/0deg 180deg/);assert.match(html,/180deg 360deg/);
 assert.doesNotMatch(html,/حقيقي|مزيف|mafia|detective/);
 const first=c.discussionQueue(view);assert.ok(first.indexOf('بدر')<first.indexOf('أحمد'));assert.match(first,/aria-current="step"/);
 const second=c.discussionQueue({...view,index:1,status:'paused'});
 assert.ok(second.indexOf('أحمد')<second.indexOf('خالد'));assert.ok(second.indexOf('خالد')<second.indexOf('بدر'));
 assert.match(second,/متوقف مؤقتًا/);assert.match(second,/التالي/);assert.match(second,/أنهوا دورهم/);
 assert.doesNotMatch(c.discussionRoulette({...view,index:1}),/<details[^>]+ open>/);
 assert.equal(c.discussionRoulette({...view,complete:true}),'');
});

test('Equal wheel sectors land the saved winner under the pointer for either outcome',()=>{
 const c=vm.createContext({localStorage:{getItem:()=> 'ar'},Date});
 vm.runInContext(readFileSync(new URL('../dist/discussion.js',import.meta.url),'utf8'),c);
 for(const candidates of [['a','b'],['b','a'],['a','b','c']])for(const winner of candidates){
  const geometry=c.openingDrawGeometry(candidates,winner);
  const pointerAngle=(360-geometry.rotation%360)%360;
  assert.equal(candidates[Math.floor(pointerAngle/geometry.size)],winner);
  assert.equal(geometry.size*candidates.length,360);
  assert.equal(geometry.chance,candidates.length===2?50:33.3);
 }
});

test('Three-way draws show their actual equal share instead of claiming 50/50',()=>{
 const c=vm.createContext({localStorage:{getItem:()=> 'en'},nameOf:id=>id,escapeHtml:s=>s,Date});
 vm.runInContext(readFileSync(new URL('../dist/discussion.js',import.meta.url),'utf8'),c);
 const html=c.discussionRoulette({mode:'turns',index:0,order:['c','a','b'],roulette:{candidates:['a','b','c'],winner:'c',at:Date.now()}});
 assert.equal((html.match(/class="fair-draw-sector"/g)||[]).length,3);
 assert.match(html,/>a<|>b<|>c</);
 assert.doesNotMatch(html,/50%/);
});
