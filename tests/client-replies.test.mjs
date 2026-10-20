import {startClaimants} from './helpers/reply-fixture.mjs';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=readFileSync(new URL('../dist/discussion.js',import.meta.url),'utf8');
async function client(f){
 const r=await f.call('state',{id:'c',playerToken:'token-c'});assert.equal(r.status,200);
 const c=vm.createContext({game:r.body,playerId:'c',localStorage:{getItem:()=> 'ar'},Date,escapeHtml:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;'),nameOf:id=>id});
 vm.runInContext(source+'\ndiscussionClockOffset = game.serverTime-Date.now();',c);return c;
}
test('Player sees allowance, queued confirmation, reply heading, and PASS',async()=>{
 const f=await startClaimants();f.advance(6000);let c=await client(f);let html=c.discussionPanel(false);
 assert.match(html,/طلب تعقيب/);assert.match(html,/2 \/ 2/);
 const request=await f.call('requestDiscussionReply',{id:'c',playerToken:'token-c',discussionId:f.view().id});assert.equal(request.status,200);
 c=await client(f);html=c.discussionPanel(false);assert.match(html,/طلبك بالطابور/);assert.match(html,/1 \/ 2/);assert.doesNotMatch(html,/onclick="discussionAction\('requestDiscussionReply'\)/);
 f.advance(30000);c=await client(f);html=c.discussionPanel(false);assert.match(html,/تعقيب — 15 ثانية/);assert.match(html,/0:15/);assert.match(html,/passDiscussion/);
 assert.doesNotMatch(html,/حقيقي|مزيف|mafia_boss|detective/);
});
test('Client and server clocks agree at regular, reply, closing and complete boundaries',async()=>{
 const f=await startClaimants();f.advance(6000);await f.call('requestDiscussionReply',{id:'c',playerToken:'token-c',discussionId:f.view().id});
 for(const advance of [0,29999,1,14999,1,30000,30000,30000,30000]){
  f.advance(advance);const c=await client(f);const server=f.view(),browser=c.clientDiscussion(c.game.serverTime);
  for(const k of ['index','speakerId','remainingMs','complete','turnKind'])assert.equal(browser[k],server[k],k);
 }
});
