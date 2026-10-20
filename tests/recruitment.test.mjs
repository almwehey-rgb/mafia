import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fixture} from './helpers/reply-fixture.mjs';
const auth=id=>({id,playerToken:'token-'+id});
function setup(){
 const f=fixture();const room=f.rooms[0];Object.assign(room,{phase:'night',round:2,detective_questions:3,jailer_executions:3,mafia_count:1});
 Object.assign(room.enabled_roles,{mafia_recruitment:true,mafia_kill_start_round:2,phase_seconds:60,doctor:false,detective:false});
 f.players[1].role='mafia_boss';f.players[3].is_bot=false;
 for(const p of f.players){p.role_state.ack=true;p.action_target=null;}
 for(const id of ['d','e','f','g'])f.players.push({...structuredClone(f.players[0]),id,name:id,session_token:'token-'+id});
 return f;
}
async function offer(f,target='a'){const r=await f.call('offerRecruitment',{...auth('b'),target});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
async function resolve(f){f.advance(30000);const r=await f.call('resolveNight',f.host);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
const publicState=(f,id)=>f.call('state',id?auth(id):f.host);

test('Recruitment is optional, boss-only, once, and unavailable before kill nights or after killing',async()=>{
 for(const change of [f=>f.rooms[0].enabled_roles.mafia_recruitment=false,f=>f.rooms[0].round=1,f=>f.rooms[0].enabled_roles.kids_mode=true,f=>f.rooms[0].enabled_roles.mafia_kill_start_round=3,f=>f.rooms[0].enabled_roles.mafia_kill_start_round=0,f=>f.players[1].role='mafia',f=>f.players[1].action_target='a',f=>f.rooms[0].jailed_player='b']){
  const f=setup();change(f);assert.equal((await f.call('offerRecruitment',{...auth('b'),target:'a'})).status,409);assert.equal(f.rooms[0].enabled_roles.recruitment_state,undefined);
 }
 const f=setup();assert.equal((await f.call('offerRecruitment',{id:'b',playerToken:'wrong',target:'a'})).status,409);
 await offer(f);assert.equal((await f.call('offerRecruitment',{...auth('b'),target:'c'})).status,409);
 assert.equal((await f.call('act',{...auth('b'),target:'c'})).status,409);
 f.advance(30000);await f.call('resolveNight',f.host);f.rooms[0].phase='night';f.rooms[0].round=3;
 assert.equal((await f.call('offerRecruitment',{...auth('b'),target:'c'})).status,409);
 assert.equal((await f.call('act',{...auth('b'),target:'c'})).status,200);
});

test('Acceptance converts at dawn, updates investigation/team, suppresses all Mafia kills and preserves privacy',async()=>{
 const f=setup();f.players[2].role='detective';f.players[2].action_target='a';f.players[3].role='mafia';f.players[3].action_target='d';
 await offer(f);
 const target=(await publicState(f,'a')).body;assert.equal(target.me.recruitmentOffer.response,'pending');
 assert.equal(target.me.recruitmentOffer.bossId,undefined);
 assert.equal((await f.call('answerRecruitment',{...auth('a'),target:'ACCEPT'})).status,200);
 assert.equal(f.players[0].role,'citizen');
 for(const id of ['b','c','d',null]){
  const state=(await publicState(f,id)).body;
  assert.equal(state.me?.recruitmentOffer,undefined);assert.equal(state.recruitmentReveal,undefined);assert.equal(state.enabledRoles.recruitment_state,undefined);
  assert.equal(state.me?.recruitment?.outcome??null,null);
  assert.equal(state.players.find(p=>p.id==='a').role,undefined);
 }
 assert.equal((await f.call('resolveNight',f.host)).status,409);
 const morning=await resolve(f);assert.equal(f.players[0].role,'mafia');assert.equal(f.players[0].role_state.recruited,true);assert.equal(morning.lastEvent,'recruitment_attempted');assert.deepEqual(morning.lastDeaths,[]);
 const detective=(await publicState(f,'c')).body;assert.equal(detective.me.investigationResults[0].result,'مافيا');
 const recruit=(await publicState(f,'a')).body;assert.equal(recruit.me.mafiaTeam.length,3);assert.equal(recruit.me.recruitment.outcome,'joined');
 assert.equal((await publicState(f,'d')).body.me.recruitment,undefined);
 f.rooms[0].phase='finished';assert.equal((await publicState(f,'d')).body.recruitmentReveal.outcome,'joined');
});

test('Refusal, timeout and a special role consume the attempt without killing or exposing why it failed',async()=>{
 const views=[];
 for(const kind of ['decline','timeout','special']){
  const f=setup();if(kind==='special')f.players[0].role='doctor';
  f.players[3].role='mafia';f.players[3].action_target='c';
  views.push(await offer(f));
  if(kind==='decline')assert.equal((await f.call('answerRecruitment',{...auth('a'),target:'DECLINE'})).status,200);
  if(kind==='special')assert.equal((await publicState(f,'a')).body.me.recruitmentOffer,undefined);
  f.advance(29999);assert.equal((await f.call('resolveNight',f.host)).status,409);
  f.advance(30001);const r=await f.call('resolveNight',f.host);assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(f.players[0].role,kind==='special'?'doctor':'citizen');assert.deepEqual(r.body.lastDeaths,[]);
  assert.equal((await publicState(f,'b')).body.me.recruitment.outcome,'failed');
  assert.equal(r.body.lastEvent,'recruitment_attempted');
 }
 assert.deepEqual(views[0].me.recruitment,views[2].me.recruitment);
});

test('Responses require the targeted citizen, are final, expire and cannot bypass a paused game',async()=>{
 const f=setup();await offer(f);
 for(const extra of [{...auth('c'),target:'ACCEPT'},{id:'a',playerToken:'wrong',target:'ACCEPT'},{...f.host,target:'ACCEPT'},{...auth('a'),target:'OTHER'}])assert.equal((await f.call('answerRecruitment',extra)).status,409);
 f.rooms[0].phase='paused';f.rooms[0].enabled_roles.paused_phase='night';f.rooms[0].phase_paused_at=new Date(1800000010000).toISOString();f.advance(50000);
 assert.equal((await f.call('answerRecruitment',{...auth('a'),target:'ACCEPT'})).status,409);
 assert.equal((await f.call('togglePause',f.host)).status,200);assert.equal(f.rooms[0].enabled_roles.recruitment_state.deadline,1800000070000);
 assert.equal((await f.call('answerRecruitment',{...auth('a'),target:'DECLINE'})).status,200);
 assert.equal((await f.call('answerRecruitment',{...auth('a'),target:'ACCEPT'})).status,409);
 const late=setup();await offer(late);late.advance(30000);assert.equal((await late.call('answerRecruitment',{...auth('a'),target:'ACCEPT'})).status,409);
});

test('Other night effects can kill the target or block recruitment without restoring assassination',async()=>{
 for(const effect of ['kill','block','expel']){
  const f=setup();await offer(f);await f.call('answerRecruitment',{...auth('a'),target:'ACCEPT'});
  if(effect==='kill'){f.players[2].role='serial_killer';f.players[2].action_target='a';}
  if(effect==='block'){f.players[2].role='escort';f.players[2].action_target='b';}
  if(effect==='expel')f.players[0].alive=false;
  await resolve(f);assert.equal(f.players[0].role,'citizen');assert.equal(f.rooms[0].enabled_roles.recruitment_state.joined,false);
  assert.ok(!f.rooms[0].last_event.includes('mafia_kill'));
 }
});

test('Automatic and solo games wait for the response window, then advance without requiring Mafia kills',async()=>{
 for(const mode of ['automatic_game','solo_mode']){
  const f=setup();f.rooms[0].enabled_roles[mode]=true;f.rooms[0].enabled_roles.action_deadline=false;
  await offer(f);await f.call('answerRecruitment',{...auth('a'),target:'ACCEPT'});
  await publicState(f,'c');assert.equal(f.rooms[0].phase,'night');
  f.advance(30000);await publicState(f,'c');assert.equal(f.rooms[0].phase,'day');assert.equal(f.players[0].role,'mafia');
 }
});

test('Concurrent recruitment, kill and responses are committed atomically',async()=>{
 const f=setup();const results=await Promise.all([f.call('offerRecruitment',{...auth('b'),target:'a'}),f.call('act',{...auth('b'),target:'c'})]);
 assert.equal(results.filter(r=>r.status===200).length,1);
 if(f.rooms[0].enabled_roles.recruitment_state)assert.equal(f.players[1].action_target,'RECRUIT');else assert.equal(f.players[1].action_target,'c');
 const g=setup();await offer(g);const replies=await Promise.all(['ACCEPT','DECLINE'].map(target=>g.call('answerRecruitment',{...auth('a'),target})));
 assert.equal(replies.filter(r=>r.status===200).length,1);assert.ok(['accept','decline'].includes(g.rooms[0].enabled_roles.recruitment_state.response));
});

test('New matches retain the option but reset the attempt and conversion state',async()=>{
 const f=setup();await offer(f);await f.call('answerRecruitment',{...auth('a'),target:'ACCEPT'});await resolve(f);f.rooms[0].phase='finished';
 const r=await f.call('start',{...f.host,mafiaCount:1,detectiveCount:0,detectiveQuestions:3,enabledRoles:{...f.rooms[0].enabled_roles,doctor:false,detective:false,lawyer:false,jailer:false}});
 assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(f.rooms[0].enabled_roles.mafia_recruitment,true);assert.equal(f.rooms[0].enabled_roles.recruitment_state,undefined);assert.ok(f.players.every(p=>!p.role_state.recruited));
});

test('Disabled mode keeps normal kills; recruitment counts toward Mafia victory at dawn',async()=>{
 const normal=setup();normal.rooms[0].enabled_roles.mafia_recruitment=false;
 assert.equal((await normal.call('act',{...auth('b'),target:'a'})).status,200);
 const killed=await normal.call('resolveNight',normal.host);assert.equal(killed.status,200);assert.equal(normal.players[0].alive,false);assert.equal(killed.body.lastEvent,'mafia_kill');
 const f=setup();f.players.splice(4);await offer(f);await f.call('answerRecruitment',{...auth('a'),target:'ACCEPT'});
 const result=await resolve(f);assert.equal(result.phase,'finished');assert.equal(result.winner,'mafia');assert.equal(result.recruitmentReveal.outcome,'joined');
});
