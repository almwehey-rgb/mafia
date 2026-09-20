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
 assert.match(html,/draw-selected/);assert.doesNotMatch(html,/roulette-disc/);assert.match(html,/الثاني/);assert.match(html,/&lt;b&gt;/);
 assert.doesNotMatch(html,/حقيقي|مزيف|mafia|detective/);
 const first=c.discussionQueue(view);assert.ok(first.indexOf('بدر')<first.indexOf('أحمد'));assert.match(first,/aria-current="step"/);
 const second=c.discussionQueue({...view,index:1,status:'paused'});
 assert.ok(second.indexOf('أحمد')<second.indexOf('خالد'));assert.ok(second.indexOf('خالد')<second.indexOf('بدر'));
 assert.match(second,/متوقف مؤقتًا/);assert.match(second,/التالي/);assert.match(second,/أنهوا دورهم/);
 assert.doesNotMatch(c.discussionRoulette({...view,index:1}),/<details[^>]+ open>/);
 assert.equal(c.discussionRoulette({...view,complete:true}),'');
});
