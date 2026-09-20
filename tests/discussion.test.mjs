import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';

const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/mafia-room/index.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, ''));
function fixture(mode = 'turns') {
  let now = 1800000000000;
  let handler;
  class Clock extends Date { static now() { return now; } }
  const rooms = [{ code:'8754',host_token:'test-host',phase:'day',round:1,phase_started_at:new Date(now).toISOString(),enabled_roles:{discussion_mode:mode,speaker_seconds:30,discussion_seconds:180,lawyer:false,jailer:false},last_event:'',linked_players:[] }];
  const players = ['a','b','c','bot'].map(id=>({id,room_code:'8754',name:id,alive:true,role:'citizen',session_token:'token-'+id,is_bot:id==='bot',last_seen:new Date(now).toISOString(),role_state:{}}));
  const messages=[];
  const tables = { mafia_rooms:rooms,mafia_players:players,mafia_messages:messages,mafia_profiles:[],mafia_season_stats:[],mafia_host_sessions:[] };
  const clone = value => JSON.parse(JSON.stringify(value));
  class Query {
    constructor(table) { this.rows=tables[table]||[];this.filters=[];this.patch=null;this.one=false; }
    select(){return this;} order(key,options={}){this.sortKey=key;this.ascending=options.ascending!==false;return this;} limit(n){this.max=n;return this;} insert(row){this.rows.push({...row,id:webcrypto.randomUUID(),created_at:new Date(now).toISOString()});return this;} single(){this.one=true;return this;} maybeSingle(){this.one=true;return this;}
    update(patch){this.patch=patch;return this;}
    is(key,value){this.filters.push(row=>row[key]===value);return this;}
    lt(key,value){this.filters.push(row=>Number(row[key])<Number(value));return this;}
    in(key,values){this.filters.push(row=>values.includes(row[key]));return this;}
    range(){this.filters.push(()=>false);return this;}
    delete(){this.deleting=true;return this;}
    upsert(row){const found=this.rows.find(r=>r.profile_token===row.profile_token);if(found)Object.assign(found,clone(row));else this.rows.push(clone(row));return this;}
    eq(key,value){this.filters.push(row=>{
      if(key.includes('->')){const parts=key.split(/->>?/);let entry=row;for(const part of parts)entry=entry?.[part];return String(entry)===String(value);}
      return typeof row[key]==='object'?JSON.stringify(row[key])===value:row[key]===value;
    });return this;}
    then(resolve,reject){return Promise.resolve().then(()=>{let selected=this.rows.filter(row=>this.filters.every(filter=>filter(row)));if(this.sortKey)selected.sort((a,b)=>(this.sortKey==='id'?Number(a.id)-Number(b.id):String(a[this.sortKey]||"").localeCompare(String(b[this.sortKey]||"")))*(this.ascending?1:-1));if(this.max)selected=selected.slice(0,this.max);if(this.patch)selected.forEach(row=>Object.assign(row,clone(this.patch)));if(this.deleting)for(const row of selected)this.rows.splice(this.rows.indexOf(row),1);return {data:clone(this.one?selected[0]||null:selected),error:null};}).then(resolve,reject);}
  }
  // Contract double only; lifecycle-postgres.test.mjs executes the actual SQL.
  const rpc=async(name,args)=>{
    if(name==='mafia_commit_transition'){
      const room=rooms.find(r=>r.code===args.p_before_room.code);
      const stable=value=>JSON.stringify(value,(key,value)=>['last_seen','host_seen_at'].includes(key)?undefined:value);
      if(stable(room)!==stable(args.p_before_room)||stable(players)!==stable(args.p_before_players))return {data:{error:'STALE_GAME'},error:null};
      Object.assign(room,clone(args.p_room),{lifecycle_version:(room.lifecycle_version||0)+1});
      for(const p of args.p_players)Object.assign(players.find(x=>x.id===p.id),clone(p));
      return {data:{ok:true,lifecycleVersion:room.lifecycle_version},error:null};
    }
    if(name==='mafia_join_seat'){
      const player={room_code:args.p_code,id:args.p_id,name:args.p_name,session_token:args.p_player_token,profile_token:args.p_profile_token,alive:true,role:null,role_state:{},last_seen:new Date(now).toISOString()};players.push(player);return {data:{player},error:null};
    }
    if(name==='mafia_presence'){
      const p=players.find(p=>p.id===args.p_player_id&&p.session_token===args.p_player_token);
      if(p)p.last_seen=new Date(now).toISOString();
      return {data:{ok:true},error:null};
    }
    if(name!=='mafia_start_match')throw Error('Unexpected RPC '+name);
    const room=rooms.find(r=>r.code===args.p_code);
    if(args.p_version!==(room.lifecycle_version||0))return {data:{error:'STALE_GAME'},error:null};
    if(!['lobby','finished'].includes(room.phase))return {data:{error:'INVALID_ACTION'},error:null};
    for(const a of args.p_assignments){const p=players.find(p=>p.id===a.id);Object.assign(p,{role:a.role,role_state:clone(a.state),alive:true,action_target:null,vote_target:null,investigation_result:null,will_text:'',replacement_code:null,replacement_expires_at:null});}
    messages.length=0;
    const settings=clone(args.p_settings);for(const key of ['discussion_state','pending_shot','vote_summary','paused_phase'])delete settings[key];if(room.phase==='finished')delete settings.admin_access;
    Object.assign(room,{phase:'reveal',round:1,lifecycle_version:(room.lifecycle_version||0)+1,phase_started_at:new Date(now).toISOString(),phase_paused_at:null,mafia_count:args.p_mafia,detective_count:args.p_detectives,detective_questions:args.p_questions,enabled_roles:settings,jailed_player:null,accused_player:null,jailer_executions:3,doctor_last_target:null,linked_players:[],last_event:'game_started',last_deaths:[],last_eliminated:null,last_saved:false,winner:null,winner_player:null,stats_recorded:false});
    return {data:{ok:true},error:null};
  };
  const context=vm.createContext({AsyncLocalStorage,Date:Clock,crypto:webcrypto,Uint8Array,TextEncoder,Response,URL,console,createClient:()=>({from:table=>new Query(table),rpc}),Deno:{env:{get:()=> 'test-only'},serve:value=>{handler=value;}}});
  vm.runInContext(source+'\nMath.random=()=>0;this.testView=discussionView;',context);
  const call=async(action,extra={})=>{
    const response=await handler(new Request('https://example.test/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,code:'8754',lifecycleVersion:rooms[0].lifecycle_version||0,...extra})}));
    return {status:response.status,body:await response.json()};
  };
  return {rooms,players,messages,tables,context,call,advance:ms=>{now+=ms;},view:()=>context.testView(rooms[0]),host:{hostToken:'test-host'}};
}

test('Reconnect restores the same authenticated seat in active and full rooms without changing identity or role',async()=>{
 for(const phase of ['lobby','night','vote','finished']){
  const f=fixture(); f.rooms[0].phase=phase; f.players[0].role='detective';f.players[0].action_target='b';
  while(f.players.length<20)f.players.push({room_code:'8754',id:'extra'+f.players.length,name:'Extra '+f.players.length,alive:true,role:'citizen'});
  const r=await f.call('join',{id:'a',playerToken:'token-a',name:'b'});
  assert.equal(r.status,200);assert.equal(f.players.length,20);assert.equal(f.players[0].name,'a');
  assert.equal(f.players[0].role,'detective');assert.equal(f.players[0].action_target,'b');
  assert.equal(r.body.playerToken,'token-a');
  assert.equal((await f.call('join',{id:'a',playerToken:'wrong',name:'a'})).status,403);
  assert.equal((await f.call('join',{id:'new-player',name:'New'})).status,409);
 }
});

test('Lobby UI suppresses duplicate requests and preserves history on failure',async()=>{
 const client=readFileSync(new URL('../dist/game.js',import.meta.url),'utf8');
 const logic=client.slice(client.indexOf('let lifecycleRequestPending'),client.indexOf('async function hostAction'));
 let finish;let calls=0;let cleared=0;
 const c=vm.createContext({game:{phase:'finished',code:'8754',lifecycleVersion:4},hostToken:'test',playerId:'',playerToken:'',
  localHistory:['old'],setupStep:3,localStorage:{removeItem(){cleared++;}},renderHost(){},alert(){},
  withBusy:(_label,fn)=>fn(),api:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
 vm.runInContext(logic,c);
 const first=c.returnToLobby();await c.returnToLobby();assert.equal(calls,1);assert.equal(cleared,0);
 finish({phase:'lobby',code:'8754',lifecycleVersion:5});await first;
 assert.equal(c.game.phase,'lobby');assert.equal(cleared,1);assert.equal(c.setupStep,1);
 c.game={phase:'finished',code:'8754',lifecycleVersion:5};c.localHistory=['keep'];
 c.api=async()=>{throw Error('network');};await c.returnToLobby();
 assert.equal(c.game.phase,'finished');assert.deepEqual(c.localHistory,['keep']);assert.equal(cleared,1);
});

test('Opening draw reserves six seconds, blocks early passing, and survives a game pause',async()=>{
 const f=fixture();f.players[0].role='detective';f.players[1].role='mafia_boss';f.players[1].role_state.discussionClaim=true;
 const started=(await f.call('startDiscussion',f.host)).body.discussion;
 assert.equal(started.roulette.duration,6000);
 assert.equal(started.turnStartedAt-started.roulette.at,6000);
 const pass=()=>f.call('passDiscussion',{...f.host,discussionId:started.id,speakerId:f.view().speakerId});
 assert.equal((await pass()).body.error,'DRAW_IN_PROGRESS');
 f.advance(2000);await f.call('togglePause',f.host);f.advance(20000);await f.call('togglePause',f.host);
 assert.equal(f.view().roulette.at-started.roulette.at,20000);
 assert.equal((await pass()).body.error,'DRAW_IN_PROGRESS');
 f.advance(4000);assert.equal(f.view().remainingMs,30000);
 assert.equal(f.view().speakerId,started.speakerId);
 assert.equal((await pass()).status,200);
});

test('An off-screen host clears old match history after missing a rematch but keeps history across phase revisions',()=>{
 const client=readFileSync(new URL('../dist/game.js',import.meta.url),'utf8');
 const code=client.slice(client.indexOf('function syncHistoryMatch()'),client.indexOf('function historyCards()'));
 const saved=new Map([['mafia-history-match-8754','old-match'],['mafia-history-8754','old-history']]);
 const c=vm.createContext({game:{code:'8754',matchId:'new-match',phase:'night',round:2,lastEvent:'new-event',lifecycleVersion:10},
  localHistory:[{event:'old-event'}],localStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)}});
 vm.runInContext(code,c);c.rememberEvent();
 assert.equal(c.localHistory.length,1);assert.equal(c.localHistory[0].event,'new-event');
 assert.equal(saved.get('mafia-history-match-8754'),'new-match');
 c.game.lifecycleVersion=11;c.game.lastEvent='next-event';c.rememberEvent();
 assert.equal(c.localHistory.length,2);
 c.game.matchId='third-match';c.rememberEvent();assert.equal(c.localHistory.length,1);
});

test('Start endpoint rejects old generations and only commits one duplicate start',async()=>{
 const f=fixture();f.rooms[0].phase='lobby';
 const args={...f.host,lifecycleVersion:0,mafiaCount:1,detectiveCount:0,enabledRoles:{doctor:false,detective:false,lawyer:false,jailer:false}};
 assert.equal((await f.call('start',{...args,lifecycleVersion:null})).status,409);
 for(const bad of [{mafiaCount:1.5},{detectiveCount:-1},{detectiveCount:0.5},{mafiaCount:100}]){
  assert.equal((await f.call('start',{...args,...bad})).status,400);assert.equal(f.rooms[0].phase,'lobby');
 }
 const attempts=await Promise.all([f.call('start',args),f.call('start',args)]);
 assert.equal(attempts.filter(r=>r.status===200).length,1);
 assert.equal(f.rooms[0].lifecycle_version,1);
 const roles=f.players.map(p=>p.role);f.rooms[0].phase='finished';
 assert.equal((await f.call('start',args)).status,409);assert.deepEqual(f.players.map(p=>p.role),roles);
});

test('Old-match actions are rejected and a spectator controller cannot vote or inspect secret admin data',async()=>{
 const f=fixture();f.rooms[0].lifecycle_version=2;
 for(const action of ['act','vote','resolveNight','startVote','endGame','transferHost','returnToLobby'])assert.equal((await f.call(action,{...f.host,lifecycleVersion:1})).status,409);
 f.players[0].alive=false;f.rooms[0].host_player_id='a';f.rooms[0].enabled_roles.controller_spectator=true;
 const auth={id:'a',playerToken:'token-a'};const view=await f.call('state',auth);
 assert.equal(view.body.me.isHost,true);assert.equal(view.body.me.alive,false);assert.equal(view.body.players[1].role,undefined);
 assert.equal((await f.call('adminState',auth)).status,403);
 f.rooms[0].phase='vote';assert.notEqual((await f.call('vote',{...auth,target:'b'})).status,200);
 assert.equal((await f.call('endGame',auth)).status,200);
});

test('A fenced database error aborts a handler even when it does not inspect the returned error field',async()=>{
 const f=fixture();f.context.pendingQuery=Promise.resolve({data:null,error:{code:'P0001',message:'STALE_GAME'}});
 await assert.rejects(vm.runInContext('fencedQuery(pendingQuery)',f.context),e=>e.code==='P0001'&&e.message==='STALE_GAME');
});

test('Private admin view exposes actions only to original host and never returns credentials',async()=>{
 const f=fixture();f.players[0].role='detective';f.players[0].action_target='b';f.players[0].vote_target='c';f.players[0].profile_token='private-profile';f.players[0].investigation_result=JSON.stringify([{round:1,name:'b',result:'مافيا'}]);
 f.rooms[0].host_player_id='a';
 for(const auth of [{},{hostToken:'wrong'},{id:'a',playerToken:'token-a'},{id:'b',playerToken:'token-b'}])assert.equal((await f.call('adminState',auth)).status,403);
 const r=await f.call('adminState',f.host);assert.equal(r.status,200);assert.equal(r.body.players[0].role,'detective');assert.equal(r.body.players[0].action,'b');assert.equal(r.body.players[0].vote,'c');assert.equal(r.body.players[0].investigations.length,1);
 assert.equal(JSON.stringify(r.body).includes('token-a'),false);assert.equal(JSON.stringify(r.body).includes('private-profile'),false);
 f.tables.mafia_snapshots=[{room_code:'8754',phase:'night',round:1,created_at:new Date().toISOString(),players_state:f.players},{room_code:'1234',players_state:[{name:'another-room-secret'}]}];
 const history=await f.call('adminState',{...f.host,history:true});assert.equal(history.body.history.length,1);assert.equal(history.body.history[0].players[0].action,'b');assert.equal(JSON.stringify(history.body).includes('token-a'),false);
 const publicState=await f.call('state',f.host);assert.equal(publicState.body.players[0].role,undefined);assert.equal(publicState.body.players[0].action,undefined);assert.equal(publicState.body.history,undefined);
 f.rooms[0].host_token='rotated';assert.equal((await f.call('adminState',f.host)).status,403);
});
test('Admin cards escape player names and display votes and role actions in Arabic',()=>{
 const c=vm.createContext({document:{addEventListener(){}},discussionText:(ar,en)=>ar,roleNames:{detective:'المحقق / Detective'},escapeHtml:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;')});
 vm.runInContext(readFileSync(new URL('../dist/admin.js',import.meta.url),'utf8'),c);
 c.players=[{id:'a',name:'<img src=x>',role:'detective',alive:true,action:'b',vote:'SKIP',investigations:[]},{id:'b',name:'الهدف',role:'detective'}];
 const html=vm.runInContext('adminCards(players)',c);assert.ok(html.includes('&lt;img'));assert.ok(html.includes('الهدف'));assert.ok(html.includes('تخطي'));assert.ok(!html.includes('Detective'));assert.ok(!html.includes('<img'));
});
test('Public vote totals persist after resolution without exposing voter identities',async()=>{
 for(const phase of ['vote','nomination','verdict']){
  const f=fixture();f.rooms[0].phase=phase;f.rooms[0].accused_player='b';f.players[2].role='mafia_boss';
  f.players[0].vote_target=phase==='verdict'?'GUILTY':'b';f.players[1].vote_target='b';f.players[2].vote_target=phase==='verdict'?'INNOCENT':'a';f.players[3].vote_target=null;
  assert.equal((await f.call('state',f.host)).body.voteSummary,null);
  f.advance(61000);const r=await f.call('resolveVote',f.host);assert.equal(r.status,200);
  const summary=r.body.voteSummary;assert.equal(summary.round,1);assert.equal(summary.abstained,1);
  assert.equal(summary.counts.reduce((n,p)=>n+p.count,0),phase==='verdict'?2:3);
  assert.deepEqual(Object.keys(summary.counts[0]).sort(),['count','name']);
  const playerView=await f.call('state',{id:'a',playerToken:'token-a'});assert.deepEqual(playerView.body.voteSummary,summary);
  assert.equal(playerView.body.players.some(p=>p.voteTarget||p.vote_target),false);
 }
});
test('Revealer learns only surviving Mafia count after night two and respects blocks',async()=>{
 for(const blocked of [false,true]){
  const f=fixture();f.rooms[0].phase='night';f.players[0].role='revealer';f.players[0].action_target=null;f.players[1].role='mafia_boss';f.players[1].action_target='SKIP';f.players[2].role='escort';f.players[2].action_target=blocked?'a':'bot';
  const auth={id:'a',playerToken:'token-a'};
  assert.equal((await f.call('act',{...auth,target:'COUNT'})).status,409);
  f.rooms[0].round=2;assert.equal((await f.call('act',{...auth,target:'b'})).status,400);
  assert.equal((await f.call('act',{...auth,target:'COUNT'})).status,200);
  assert.equal((await f.call('state',auth)).body.me.mafiaCountResult,null);
  assert.equal((await f.call('resolveNight',f.host)).status,200);
  const result=(await f.call('state',auth)).body.me.mafiaCountResult;
  assert.deepEqual(result,blocked?null:{round:2,count:1});
  assert.equal((await f.call('state',{id:'b',playerToken:'token-b'})).body.me.mafiaCountResult,undefined);
 }
});
test('Revealer can defer but only obtain one result, and spent power never blocks night',async()=>{
 const f=fixture();f.rooms[0].phase='night';f.rooms[0].round=2;f.players[0].role='revealer';f.players[0].action_target=null;f.players[2].role='mafia_boss';f.players[2].action_target='SKIP';
 const auth={id:'a',playerToken:'token-a'};
 assert.equal((await f.call('act',{...auth,target:'SKIP'})).status,200);
 assert.equal((await f.call('resolveNight',f.host)).status,200);
 assert.equal((await f.call('state',auth)).body.me.mafiaCountResult,null);
 f.rooms[0].phase='night';f.rooms[0].round=3;f.players[2].action_target='SKIP';
 assert.equal((await f.call('act',{...auth,target:'COUNT'})).status,200);
 assert.equal((await f.call('resolveNight',f.host)).status,200);
 const result=(await f.call('state',auth)).body.me.mafiaCountResult;
 assert.deepEqual(result,{round:3,count:1});
 f.rooms[0].phase='night';f.rooms[0].round=4;f.players[2].action_target='SKIP';
 assert.equal((await f.call('act',{...auth,target:'COUNT'})).status,400);
 assert.equal((await f.call('state',auth)).body.nightReady,undefined);
 assert.equal((await f.call('state',f.host)).body.nightReady,true);
 f.players[0].action_target='COUNT';
 assert.equal((await f.call('resolveNight',f.host)).status,200);
 assert.deepEqual((await f.call('state',auth)).body.me.mafiaCountResult,result);
});
test('Revealer is dealt as an optional village role',async()=>{
 const f=fixture();f.rooms[0].phase='lobby';
 const r=await f.call('start',{...f.host,mafiaCount:1,detectiveCount:0,enabledRoles:{revealer:true,doctor:false,detective:false,lawyer:false,jailer:false}});
 assert.equal(r.status,200);assert.equal(f.players.filter(p=>p.role==='revealer').length,1);assert.equal(r.body.enabledRoles.revealer,true);
});
test('Admin QR redeems once, grants read-only secrets, survives start and can be revoked',async()=>{
 const f=fixture();f.rooms[0].phase='lobby';
 assert.equal((await f.call('createAdminInvite',{id:'a',playerToken:'token-a'})).status,403);
 const invite=(await f.call('createAdminInvite',f.host)).body.inviteToken;
 const attempts=await Promise.all([f.call('redeemAdminInvite',{inviteToken:invite}),f.call('redeemAdminInvite',{inviteToken:invite})]);
 assert.equal(attempts.filter(r=>r.status===200).length,1);const adminToken=attempts.find(r=>r.status===200).body.adminToken;
 assert.equal((await f.call('adminState',{adminToken})).status,200);
 assert.equal((await f.call('createAdminInvite',{adminToken})).status,403);
 assert.equal((await f.call('start',{adminToken})).status,403);
 const start=await f.call('start',{...f.host,mafiaCount:1,detectiveCount:1,enabledRoles:{doctor:false,lawyer:false,jailer:false}});assert.equal(start.status,200);
 assert.equal((await f.call('adminState',{adminToken})).status,200);
 assert.equal((await f.call('togglePause',f.host)).status,200);
 assert.equal((await f.call('adminState',{adminToken})).status,200);
 assert.equal((await f.call('togglePause',f.host)).status,200);
 assert.equal(JSON.stringify(start.body).includes('sessionHash'),false);
 f.messages.push({id:1,room_code:'8754',channel:'mafia',author_name:'a',content:'secret'},{id:2,room_code:'1234',content:'other room'});
 const chat=await f.call('adminState',{adminToken,chat:true});assert.equal(chat.body.messages.length,1);assert.equal(chat.body.messages[0].text,'secret');
 assert.equal((await f.call('revokeAdminAccess',f.host)).status,200);
 assert.equal((await f.call('adminState',{adminToken})).status,403);
 const expired=(await f.call('createAdminInvite',f.host)).body.inviteToken;f.advance(120001);
 assert.equal((await f.call('redeemAdminInvite',{inviteToken:expired})).status,403);
});
test('Initial deal assigns a boss directly without an opening election',async()=>{
 const f=fixture();f.rooms[0].phase='lobby';
 const r=await f.call('start',{...f.host,mafiaCount:2,detectiveCount:0,enabledRoles:{doctor:false,detective:false,lawyer:false,jailer:false}});
 assert.equal(r.status,200);assert.equal(f.players.filter(p=>p.role==='mafia_boss').length,1);
 assert.equal(f.rooms[0].enabled_roles.leader_election,null);
});

test('Leader ties and absent votes resolve to exactly one Mafia, while single Mafia needs no ballot',async()=>{
 for(const missing of [false,true]){
  const f=fixture();f.rooms[0].phase='reveal';f.rooms[0].enabled_roles.leader_election={pending:true};
  for(const p of f.players)p.role_state={ack:true};f.players[0].role='mafia';f.players[1].role='mafia';
  if(!missing){f.players[0].role_state.leaderVote='a';f.players[1].role_state.leaderVote='b';}else f.advance(61000);
  assert.equal((await f.call('beginNight',f.host)).status,200);assert.equal(f.players.filter(p=>p.role==='mafia_boss').length,1);
  assert.ok(['a','b'].includes(f.players.find(p=>p.role==='mafia_boss').id));
 }
});
test('Only the host starts discussion; bots are omitted and votes wait',async()=>{
  const f=fixture();
  assert.equal((await f.call('startDiscussion')).status,403);
  assert.equal((await f.call('startVote',f.host)).body.error,'WAITING_DISCUSSION');
  const result=await f.call('startDiscussion',f.host);
  assert.equal(result.status,200);assert.deepEqual(result.body.discussion.order,['a','b','c']);
  assert.equal(result.body.discussion.speakerId,'a');
  const again=await f.call('startDiscussion',f.host);
  assert.equal(again.body.discussion.id,result.body.discussion.id);
  assert.equal(result.body.players.some(p=>p.session_token||p.role),false);
});
test('Turns expire from server time; current speaker can PASS once',async()=>{
  const f=fixture();await f.call('startDiscussion',f.host);
  const args={discussionId:f.view().id,speakerId:'a',id:'a',playerToken:'token-a'};
  assert.equal((await f.call('passDiscussion',{...args,id:'b',playerToken:'token-b'})).status,403);
  assert.equal((await f.call('passDiscussion',args)).status,200);
  assert.equal(f.view().speakerId,'b');
  assert.notEqual((await f.call('passDiscussion',args)).status,200);
  f.advance(30000);assert.equal(f.view().speakerId,'c');
  f.advance(30000);assert.equal(f.view().complete,true);
  assert.equal((await f.call('startVote',f.host)).status,200);
});
test('Concurrent PASS requests do not skip two players',async()=>{
  const f=fixture();await f.call('startDiscussion',f.host);
  const args={...f.host,discussionId:f.view().id,speakerId:'a'};
  const results=await Promise.all([f.call('passDiscussion',args),f.call('passDiscussion',args)]);
  assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(f.view().speakerId,'b');
});
test('Pause freezes the timer; resume preserves remaining seconds',async()=>{
  const f=fixture();await f.call('startDiscussion',f.host);f.advance(10000);
  assert.equal((await f.call('togglePause',f.host)).status,200);
  f.advance(120000);assert.equal(f.view().remainingMs,20000);assert.equal(f.view().speakerId,'a');
  assert.equal((await f.call('passDiscussion',{...f.host,discussionId:f.view().id,speakerId:'a'})).status,409);
  await f.call('togglePause',f.host);assert.equal(f.view().remainingMs,20000);
  f.advance(20000);assert.equal(f.view().speakerId,'b');
});
test('Group timer expires; only host can finish early',async()=>{
  const f=fixture('group');await f.call('startDiscussion',f.host);
  assert.equal(f.view().remainingMs,180000);
  assert.equal((await f.call('finishDiscussion',{id:'a',playerToken:'token-a',discussionId:f.view().id})).status,403);
  f.advance(180000);assert.equal(f.view().complete,true);
  const g=fixture('group');await g.call('startDiscussion',g.host);
  assert.equal((await g.call('finishDiscussion',{...g.host,discussionId:g.view().id})).status,200);
  assert.equal(g.view().complete,true);
});
test('Legacy rooms remain playable and a new round gets a fresh discussion',async()=>{
  const legacy=fixture(undefined);delete legacy.rooms[0].enabled_roles.discussion_mode;
  assert.equal(legacy.view().status,'off');assert.equal((await legacy.call('startVote',legacy.host)).status,200);
  const f=fixture();await f.call('startDiscussion',f.host);const previous=f.view().id;
  f.rooms[0].round=2;assert.equal(f.view().status,'waiting');await f.call('startDiscussion',f.host);
  assert.notEqual(f.view().id,previous);
});
test('Client and server agree across time, modes and pause',async()=>{
  for(const mode of ['turns','group']){
    const f=fixture(mode);await f.call('startDiscussion',f.host);
    const client=vm.createContext({localStorage:{getItem:()=> 'ar'},Date,console});
    vm.runInContext('let game=null;'+readFileSync(new URL('../dist/discussion.js',import.meta.url),'utf8')+'\nthis.testClient=clientDiscussion;this.setGame=value=>{game=value;};',client);
    for(const delta of [0,10000,20000,30000,120000]){
      f.advance(delta);client.setGame({discussion:JSON.parse(JSON.stringify(f.view()))});
      const server=f.view();const result=client.testClient(vm.runInContext('Date.now()',f.context));
      assert.equal(result.status,server.status);assert.equal(result.speakerId,server.speakerId);assert.equal(result.remainingMs,server.remainingMs);
    }
  }
});
test('Boss choice locks once, persists across rounds and resets on rematch',async()=>{
 for(const claim of [true,false]){
  const f=fixture();f.rooms[0].detective_questions=3;f.players[1].role='detective';f.players[2].role='mafia_boss';
  const auth={id:'c',playerToken:'token-c'};
  assert.equal((await f.call('setDiscussionClaim',{id:'a',playerToken:'token-a',claim})).status,403);
  assert.equal((await f.call('setDiscussionClaim',{...auth,claim})).status,200);
  assert.equal((await f.call('setDiscussionClaim',{...auth,claim:!claim})).status,409);
  vm.runInContext('Math.random=()=>0.99',f.context);
  for(const round of [1,2,3]){f.rooms[0].round=round;const r=await f.call('startDiscussion',f.host);assert.equal(r.body.discussion.speakerId,claim?'c':'b');}
  f.rooms[0].phase='finished';await f.call('start',{...f.host,mafiaCount:1,detectiveCount:0,enabledRoles:{doctor:false,detective:false,lawyer:false,jailer:false}});
  assert.equal(f.players.some(p=>typeof p.role_state.discussionClaim==='boolean'),false);
 }
});
test('Concurrent choices lock once; no choice defaults to undercover for the game',async()=>{
 const f=fixture();f.players[2].role='mafia_boss';const auth={id:'c',playerToken:'token-c'};
 const r=await Promise.all([true,false].map(claim=>f.call('setDiscussionClaim',{...auth,claim})));assert.equal(r.filter(x=>x.status===200).length,1);
 const g=fixture();g.players[2].role='mafia_boss';await g.call('startDiscussion',g.host);
 assert.equal((await g.call('setDiscussionClaim',{...auth,claim:true})).status,409);
 g.rooms[0].round=2;assert.equal((await g.call('setDiscussionClaim',{...auth,claim:true})).status,409);
});
test('Opted-in boss and detective each can start; selection is saved and not alternating',async()=>{
 for(const [draw,expected] of [[0,'b'],[0.49,'b'],[0.5,'c'],[0.99,'c']]){
  const f=fixture();f.rooms[0].detective_questions=2;f.players[1].role='detective';f.players[2].role='mafia_boss';
  vm.runInContext(`Math.random=()=>${draw}`,f.context);
  for(const round of [1,2]){
   f.rooms[0].round=round;
   await f.call('setDiscussionClaim',{id:'c',playerToken:'token-c',claim:true});
   const start=await f.call('startDiscussion',f.host);
   assert.equal(start.body.discussion.speakerId,expected);
   assert.deepEqual(new Set(start.body.discussion.order.slice(0,2)),new Set(['b','c']));
   assert.equal(start.body.discussion.roulette.winner,expected);
   assert.equal(new Set(start.body.discussion.order).size,3);
   const again=await f.call('startDiscussion',f.host);
   assert.deepEqual(again.body.discussion.order,start.body.discussion.order);
   assert.equal(start.body.players.some(p=>p.role||p.discussionClaim),false);
  }
 }
});
test('Priority lottery lasts the chosen number of rounds, then all living humans qualify',async()=>{
 for(const count of [1,2,5]){
  const f=fixture();f.rooms[0].detective_questions=count;f.players[1].role='detective';f.players[2].role='mafia_boss';
  await f.call('setDiscussionClaim',{id:'c',playerToken:'token-c',claim:true});
  for(let round=1;round<=count;round++){
   f.rooms[0].round=round;
   vm.runInContext(`Math.random=()=>${round%2?0.99:0}`,f.context);
   assert.equal((await f.call('startDiscussion',f.host)).body.discussion.speakerId,round%2?'c':'b');
  }
  f.rooms[0].round=count+1;vm.runInContext('Math.random=()=>0',f.context);
  const after=await f.call('startDiscussion',f.host);assert.equal(after.body.discussion.speakerId,'a');assert.equal(after.body.discussion.roulette,null);
  for(const [draw,id] of [[0.5,'b'],[0.99,'c']]){
   f.rooms[0].round++;vm.runInContext(`Math.random=()=>${draw}`,f.context);
   assert.equal((await f.call('startDiscussion',f.host)).body.discussion.speakerId,id);
  }
 }
});
test('Remaining speakers shuffle after priority pair and roulette never labels real versus fake',async()=>{
 const orders=[];
 for(const draw of [0,0.9]){
  const f=fixture();f.players[0].role='detective';f.players[1].role='mafia_boss';f.players[1].role_state.discussionClaim=true;f.players[3].is_bot=false;
  vm.runInContext(`Math.random=()=>${draw}`,f.context);
  const d=(await f.call('startDiscussion',f.host)).body.discussion;
  assert.deepEqual(new Set(d.order.slice(0,2)),new Set(['a','b']));
  assert.deepEqual(new Set(d.roulette.candidates),new Set(d.order.slice(0,2)));orders.push(d.order.slice(2));
 }
 assert.notDeepEqual(orders[0],orders[1]);
});
test('Eliminated priority speakers fall back to living humans without exposing roles',async()=>{
 const f=fixture();f.rooms[0].detective_questions=2;f.players[1].role='detective';f.players[1].alive=false;f.players[2].role='mafia_boss';
 vm.runInContext('Math.random=()=>0.99',f.context);
 const r=await f.call('startDiscussion',f.host);
 assert.equal(r.body.discussion.speakerId,'c');assert.deepEqual(r.body.discussion.order,['c','a']);
 assert.equal(r.body.players.some(p=>p.role||p.discussionClaim),false);
});
test('Language labels use one language and preserve numeric counters',()=>{
 const source=readFileSync(new URL('../dist/controls.js',import.meta.url),'utf8');
 const c=vm.createContext({document:{addEventListener:()=>{}},navigator:{},window:{}});
 vm.runInContext(source.replace('const originals=new WeakMap();','globalThis.langTest=singleLanguage; const originals=new WeakMap();'),c);
 assert.equal(c.langTest('🎬 إنشاء غرفة / Create room','ar'),'🎬 إنشاء غرفة');
 assert.equal(c.langTest('Ready / جاهز','ar'),'جاهز');
 assert.equal(c.langTest('دخول / Join','en'),'Join');
 assert.equal(c.langTest('2 / 8','ar'),'2 / 8');
});

test('Chat receiver reads without sending; latest 80 messages and channel isolation',async()=>{
 const f=fixture();f.rooms[0].phase='night';f.players[0].role='mafia_boss';f.players[1].role='mafia';f.players[2].role='jailer';
 const a={id:'a',playerToken:'token-a'},b={id:'b',playerToken:'token-b'};
 assert.equal((await f.call('sendMessage',{...a,text:'hello'})).status,200);
 let received=await f.call('messages',b);assert.equal(received.body.messages[0].content,'hello');
 assert.equal((await f.call('messages',{id:'c',playerToken:'token-c'})).status,403);
 assert.notEqual((await f.call('messages',{id:'a',playerToken:'bad'})).status,200);
 f.players[0].role_state.muted=true;assert.equal((await f.call('sendMessage',{...a,text:'blocked'})).status,403);
 f.messages.length=0;
 for(let i=0;i<85;i++)f.messages.push({id:String(i),room_code:'8754',round:1,channel:'mafia',content:String(i),created_at:new Date(1800000000000+i*1000).toISOString()});
 received=await f.call('messages',b);assert.equal(received.body.messages.length,80);assert.equal(received.body.messages[0].content,'5');assert.equal(received.body.messages.at(-1).content,'84');
 f.rooms[0].jailed_player='b';assert.equal((await f.call('messages',b)).body.channel,'jail');assert.equal((await f.call('messages',b)).body.messages.length,0);
 const jail=await f.call('sendMessage',{id:'c',playerToken:'token-c',text:'private'});assert.equal(jail.body.messages[0].author_name,'السجّان');assert.equal(jail.body.messages[0].author_id,undefined);
 f.rooms[0].phase='paused';f.rooms[0].enabled_roles.paused_phase='day';assert.notEqual((await f.call('messages',a)).status,200);
 f.rooms[0].enabled_roles.paused_phase='night';assert.equal((await f.call('messages',a)).status,200);
});
test('Security: rejects script-like player IDs and safely encodes legacy IDs in buttons',async()=>{
 const f=fixture();f.rooms[0].phase='lobby';
 const payload="');auditMarker=1;//";
 assert.equal((await f.call('join',{id:payload,name:'test'})).body.error,'INVALID_PLAYER_ID');
 const src=readFileSync(new URL('../dist/game.js',import.meta.url),'utf8');
 const start=src.indexOf('function choiceButtons('),end=src.indexOf('function normalizeEnabledRoles(',start);
 const c=vm.createContext({playerId:'other',auditMarker:0,nightAction:id=>assert.equal(id,payload)});
 vm.runInContext(src.slice(start,end),c);c.players=[{id:payload,name:'safe'}];
 const html=vm.runInContext("choiceButtons(players,'nightAction')",c);
 const entities={'&quot;':'"','&#39;':"'",'&lt;':'<','&gt;':'>','&amp;':'&'};
 const handler=html.match(/onclick="([^"]+)"/)[1].replace(/&quot;|&#39;|&lt;|&gt;|&amp;/g,x=>entities[x]);
 vm.runInContext(handler,c);assert.equal(c.auditMarker,0);
});
test('Security: detective selection is atomic and results wait for night resolution',async()=>{
 const f=fixture();f.rooms[0].phase='night';f.rooms[0].detective_questions=1;f.players[0].role='detective';f.players[0].action_target=null;
 const r=await Promise.all(['b','c'].map(target=>f.call('act',{id:'a',playerToken:'token-a',target})));
 assert.equal(r.filter(x=>x.status===200).length,1);assert.equal(r.filter(x=>x.status===409).length,1);
 assert.equal(r.find(x=>x.status===200).body.me.investigationResults.length,0);
 f.rooms[0].phase='paused';assert.equal((await f.call('resolveNight',f.host)).status,409);
});
test('Security: blocked detective never receives a result; normal detective does',async()=>{
 for(const blocked of [true,false]){
  const f=fixture();f.rooms[0].phase='night';f.rooms[0].round=2;f.players[0].role='detective';f.players[0].action_target=null;
  f.players[1].role='escort';f.players[1].action_target=blocked?'a':'c';
  f.players[2].role='mafia_boss';f.players[2].action_target='SKIP';
  await f.call('act',{id:'a',playerToken:'token-a',target:'c'});
  assert.equal((await f.call('resolveNight',f.host)).status,200);
  const state=await f.call('state',{id:'a',playerToken:'token-a'});
  assert.equal(state.body.me.investigationResults.length,blocked?0:1);
 }
});
test('Security: state requires authentication and a shared IP supports many players',async()=>{
 const f=fixture();assert.equal((await f.call('state')).status,403);
 for(let i=0;i<300;i++){
  const id=['a','b','c'][i%3];assert.equal((await f.call('state',{id,playerToken:'token-'+id})).status,200);
 }
});
test('Security: logout revokes legacy room host authority',async()=>{
 const f=fixture();const result=await f.call('hostLogout',{rooms:[{code:'8754',hostToken:'test-host'}]});
 assert.equal(result.status,200);assert.notEqual(f.rooms[0].host_token,'test-host');
 assert.equal((await f.call('startDiscussion',f.host)).status,403);
});
test('Security: logout revokes all rooms tied to the host login session',async()=>{
 const f=fixture();f.context.token='login-token';const hash=await vm.runInContext('sha256(token)',f.context);
 f.rooms[0].host_session_hash=hash;f.tables.mafia_host_sessions.push({token_hash:hash});
 assert.equal((await f.call('hostLogout',{hostAccessToken:'login-token'})).status,200);
 assert.notEqual(f.rooms[0].host_token,'test-host');assert.equal(f.tables.mafia_host_sessions.length,0);
});
test('Phase clocks use server time and keep the same remaining time while paused',()=>{
 const src=readFileSync(new URL('../dist/game.js',import.meta.url),'utf8');
 const logic=src.slice(src.indexOf('function clientPhaseRemaining()'),src.indexOf('function updatePhaseTimer()'));
 const clock={startedAt:1000,seconds:60,pausedAt:null};
 for(const [local,offset] of [[5000,2000],[9000,-2000]]){
  const c=vm.createContext({game:{phase:'night',phaseClock:{...clock}},Date:{now:()=>local},discussionClockOffset:offset});
  vm.runInContext(logic,c);assert.equal(vm.runInContext('clientPhaseRemaining()',c),54000);
  c.game.phase='paused';c.game.phaseClock.pausedAt=4000;
  assert.equal(vm.runInContext('clientPhaseRemaining()',c),57000);
  assert.equal(vm.runInContext('phaseTimeExpired()',c),false);
 }
});
test('Timeout: missing votes abstain only after server deadline',async()=>{
 const f=fixture();f.rooms[0].phase='vote';f.players[0].role='mafia_boss';
 assert.equal((await f.call('resolveVote',f.host)).status,409);
 f.advance(60001);const result=await f.call('resolveVote',f.host);
 assert.equal(result.status,200);assert.equal(result.body.phase,'night');assert.equal(result.body.lastEliminated,null);
});
test('Timeout: missing night choices cannot hold the game indefinitely',async()=>{
 const f=fixture();f.rooms[0].phase='night';f.rooms[0].round=2;f.players[0].role='mafia_boss';
 assert.equal((await f.call('resolveNight',f.host)).status,409);
 f.advance(60001);const result=await f.call('resolveNight',f.host);
 assert.equal(result.status,200);assert.equal(result.body.phase,'day');assert.equal(result.body.lastDeaths.length,0);
});
test('Statistics: serial killer victory increments independent wins',async()=>{
 const f=fixture();f.rooms[0].winner='serial_killer';f.players[0].role='serial_killer';f.players[0].profile_token='profile-a';
 f.context.room=f.rooms[0];f.context.statPlayers=f.players;await vm.runInContext('requestDatabase.run({headers:{}},()=>recordStats(room,statPlayers))',f.context);
 assert.equal(f.tables.mafia_profiles[0].wins,1);assert.equal(f.tables.mafia_profiles[0].independent_wins,1);
});
test('Open chat polls independently and stops when closed',async()=>{
 const source=readFileSync(new URL('../dist/game.js',import.meta.url),'utf8');
 let callback,requests=0,updates=0,open=true;
 const c=vm.createContext({game:{phase:'night',code:'8754',me:{alive:true,role:'mafia'}},playerId:'a',playerToken:'token-a',document:{querySelector:s=>open&&s==='.chat-list'?{}:null},setTimeout:fn=>{callback=fn;return 1;},clearTimeout:()=>{},api:async()=>{requests++;return{messages:[{content:'from another player'}]}},discussionText:a=>a});
 vm.runInContext(source.slice(source.indexOf('let chatTimer;'),source.indexOf('async function openChat()'))+';updateChatMessages=()=>{globalThis.updated()};',c);c.updated=()=>updates++;
 vm.runInContext('startChatPolling()',c);await callback();assert.equal(requests,1);assert.equal(updates,1);
 const pending=callback;vm.runInContext('stopChatPolling()',c);open=false;await pending();assert.equal(requests,1);
});
test('Eliminated player can follow public events but cannot act, chat or control the host',async()=>{
 const f=fixture();f.rooms[0].phase='night';f.rooms[0].host_player_id='a';f.players[0].alive=false;f.players[0].role='mafia_boss';f.players[1].role='mafia';
 const auth={id:'a',playerToken:'token-a'};const view=await f.call('state',auth);
 assert.equal(view.status,200);assert.equal(view.body.me.alive,false);assert.equal(view.body.me.isHost,false);
 assert.equal(view.body.me.mafiaTeam,undefined);assert.equal(view.body.me.investigationResults,undefined);
 assert.equal(view.body.players.filter(p=>p.alive).some(p=>p.role),false);
 for(const action of ['act','vote','messages','sendMessage','saveWill','togglePause','setDiscussionClaim'])assert.notEqual((await f.call(action,{...auth,target:'b',text:'test',claim:true})).status,200,action);
});
test('Chat pagination is stable when new messages arrive and isolates channels',async()=>{
 const f=fixture();f.rooms[0].phase='night';f.players[0].role='mafia';
 for(let i=1;i<=100;i++)f.messages.push({id:i,room_code:'8754',round:1,channel:'mafia',content:String(i)});
 const auth={id:'a',playerToken:'token-a'};const first=(await f.call('messages',auth)).body;
 assert.equal(first.messages.length,80);assert.equal(first.nextCursor,'21');assert.equal(first.hasMore,true);
 f.messages.push({id:101,room_code:'8754',round:1,channel:'mafia',content:'new'});
 f.messages.push({id:0,room_code:'8754',round:1,channel:'jail',content:'private'});
 const older=(await f.call('messages',{...auth,beforeId:first.nextCursor})).body;
 assert.equal(older.messages.length,20);assert.equal(older.messages[0].id,1);assert.equal(older.hasMore,false);
 assert.equal((await f.call('messages',{...auth,beforeId:'bad'})).status,400);
});
test('Resume keeps saved credentials on network failure and reads the matching room only',async()=>{
 const src=readFileSync(new URL('../dist/game.js',import.meta.url),'utf8');
 const session={code:'8754',host:false,playerId:'a',playerToken:'secret'};
 const saved=new Map([['mafia-session',JSON.stringify(session)]]);let offline=false;
 const c=vm.createContext({localStorage:{getItem:k=>saved.get(k)||null,removeItem:k=>saved.delete(k)},sessionKey:code=>'mafia-session-'+code,profileToken:'profile',api:async()=>{throw new Error('network')},renderResumeCard:(s,flag)=>{offline=flag},clearSession:()=>saved.delete('mafia-session')});
 vm.runInContext(src.slice(src.indexOf('function readSavedSession('),src.indexOf('function renderResumeCard(')),c);
 vm.runInContext(src.slice(src.indexOf('async function resumeGame('),src.indexOf('function startPolling(')),c);
 assert.equal(vm.runInContext("readSavedSession('9999')",c),null);
 await vm.runInContext("resumeGame('8754')",c);assert.equal(offline,true);assert.equal(saved.has('mafia-session'),true);
});
test('Simulated game moves through roles, night, discussion, voting and next round',async()=>{
 const f=fixture();f.rooms[0].phase='lobby';
 let r=await f.call('start',{...f.host,mafiaCount:1,detectiveCount:1,detectiveQuestions:1,enabledRoles:{doctor:true,detective:true,lawyer:false,jailer:false,discussion_mode:'turns',allow_no_vote:true,full_trial:false}});
 assert.equal(r.body.phase,'reveal');
 for(const p of f.players.filter(p=>!p.is_bot))assert.equal((await f.call('acknowledgeRole',{id:p.id,playerToken:'token-'+p.id})).status,200);
 assert.equal((await f.call('beginNight',f.host)).body.phase,'night');
 for(const p of f.players.filter(p=>!p.is_bot)){
  if(['mafia_boss','detective'].includes(p.role)){
   const target=p.role==='mafia_boss'?'SKIP':f.players.find(x=>x.id!==p.id).id;
   assert.equal((await f.call('act',{id:p.id,playerToken:'token-'+p.id,target})).status,200);
  }
 }
 r=await f.call('resolveNight',f.host);assert.equal(r.body.phase,'day');
 r=await f.call('startDiscussion',f.host);assert.equal(r.status,200);
 await f.call('finishDiscussion',{...f.host,discussionId:r.body.discussion.id});
 assert.equal((await f.call('startVote',f.host)).body.phase,'vote');
 for(const p of f.players.filter(p=>!p.is_bot&&p.alive))assert.equal((await f.call('vote',{id:p.id,playerToken:'token-'+p.id,target:'SKIP'})).status,200);
 r=await f.call('resolveVote',f.host);assert.equal(r.body.phase,'night');assert.equal(r.body.round,2);
});

 test('Detective gets one question in each of the first three rounds and cannot stall later nights',async()=>{
  const f=fixture();f.rooms[0].phase='night';f.players[0].role='detective';f.players[2].role='mafia_boss';f.players[2].action_target='SKIP';
  const auth={id:'a',playerToken:'token-a'};
  for(let round=1;round<=3;round++){
   f.rooms[0].round=round;f.rooms[0].phase='night';f.players[0].action_target=null;f.players[2].action_target='SKIP';
   assert.equal((await f.call('state',auth)).body.me.questionLimit,1);
   assert.equal((await f.call('act',{...auth,target:'b'})).status,200);
   assert.equal((await f.call('act',{...auth,target:'c'})).status,400);
   assert.equal((await f.call('resolveNight',f.host)).status,200);
   assert.equal((await f.call('state',auth)).body.me.investigationResults.length,round);
  }
  f.rooms[0].round=4;f.rooms[0].phase='night';f.players[0].action_target=null;f.players[2].action_target='SKIP';
  const r=await f.call('state',auth);assert.equal(r.body.me.questionLimit,0);assert.equal(r.body.me.acted,true);assert.equal(r.body.nightReady,undefined);
  assert.equal((await f.call('state',f.host)).body.nightReady,true);
  assert.equal((await f.call('act',{...auth,target:'b'})).status,400);
  assert.equal((await f.call('resolveNight',f.host)).status,200);
  assert.equal((await f.call('state',auth)).body.me.investigationResults.length,3);
 });
 test('Missed detective questions do not accumulate into later rounds',async()=>{
  const f=fixture();f.rooms[0].round=3;f.rooms[0].phase='night';f.players[0].role='detective';f.players[0].action_target=null;
  const auth={id:'a',playerToken:'token-a'};
  assert.equal((await f.call('act',{...auth,target:'b'})).status,200);
  assert.equal((await f.call('act',{...auth,target:'c'})).status,400);
  f.rooms[0].round=4;f.players[0].action_target=null;
  assert.equal((await f.call('act',{...auth,target:'b'})).status,400);
 });

test('Sniper waits until Mafia elimination, gets one final shot, and victory waits for it',async()=>{
 const f=fixture();f.rooms[0].phase='night';f.rooms[0].round=2;f.players[0].role='vigilante';f.players[0].role_state={bullets:1};f.players[2].role='mafia_boss';f.players[2].action_target='a';f.players[3].alive=false;
 const auth={id:'a',playerToken:'token-a'};
 assert.equal((await f.call('act',{...auth,target:'c'})).status,400);
 let r=await f.call('resolveNight',f.host);assert.equal(r.status,200);assert.equal(r.body.phase,'day');assert.equal(r.body.winner,undefined);assert.equal(r.body.pendingShot.playerId,'a');
 assert.equal(r.body.eliminations[0].reason,'mafia_kill');assert.equal(r.body.eliminations[0].name,'a');
 const shotId=r.body.pendingShot.id;
 assert.equal((await f.call('startVote',f.host)).status,409);
 assert.equal((await f.call('lastShot',{id:'b',playerToken:'token-b',shotId,target:'c'})).status,403);
 assert.equal((await f.call('state',auth)).body.pendingShot.id,shotId);
 const results=await Promise.all(['c','b'].map(target=>f.call('lastShot',{...auth,shotId,target})));
 assert.equal(results.filter(r=>r.status===200).length,1);
 r=await f.call('state',auth);assert.equal(r.body.phase,'finished');assert.equal(r.body.winner,'village');assert.equal(r.body.pendingShot,null);
 assert.equal(f.players[0].role_state.bullets,0);assert.equal(f.players[1].alive,true);
 assert.equal(r.body.eliminations.find(p=>p.id==='c').reason,'vigilante_kill');
 assert.equal((await f.call('lastShot',{...auth,shotId,target:'b'})).status,409);
});
test('Direct vote and guilty verdict activate the final shot; host can skip and continue',async()=>{
 for(const phase of ['vote','verdict']){
  const f=fixture();f.rooms[0].phase=phase;f.rooms[0].accused_player='a';f.players[0].role='vigilante';f.players[0].role_state={bullets:1};f.players[2].role='mafia_boss';
  for(const p of f.players)p.vote_target=phase==='vote'?'a':'GUILTY';
  let r=await f.call('resolveVote',f.host);assert.equal(r.status,200);assert.equal(r.body.pendingShot.playerId,'a');assert.equal(r.body.round,1);
  assert.equal(r.body.eliminations[0].reason,phase==='vote'?'vote_eliminated':'trial_guilty');
  assert.equal((await f.call('resolveVote',f.host)).status,409);
  r=await f.call('lastShot',{...f.host,shotId:r.body.pendingShot.id,target:'SKIP'});
  assert.equal(r.status,200);assert.equal(r.body.phase,'night');assert.equal(r.body.round,2);assert.equal(r.body.pendingShot,null);
  assert.equal(f.players[0].alive,false);assert.equal(f.players[0].role_state.bullets,0);
 }
});
test('Other death causes do not activate sniper; each simultaneous death has its own cause',async()=>{
 const f=fixture();f.rooms[0].phase='night';f.rooms[0].round=2;f.players[0].role='vigilante';f.players[0].role_state={bullets:1};f.players[1].role='serial_killer';f.players[1].action_target='a';f.players[2].role='mafia_boss';f.players[2].action_target='bot';
 const r=await f.call('resolveNight',f.host);assert.equal(r.status,200);assert.equal(r.body.pendingShot,null);
 assert.equal(r.body.eliminations.find(p=>p.id==='a').reason,'serial_kill');assert.equal(r.body.eliminations.find(p=>p.id==='bot').reason,'mafia_kill');
});
test('Boss succession follows the next living Mafia in room order and remains private',async()=>{
 const f=fixture();f.rooms[0].phase='night';f.rooms[0].round=2;f.players[0].role='mafia';f.players[0].action_target='SKIP';f.players[1].role='mafia_boss';f.players[1].action_target='SKIP';f.players[2].role='serial_killer';f.players[2].action_target='b';f.players[3].role='mafia';f.players[3].action_target='SKIP';
 const r=await f.call('resolveNight',f.host);assert.equal(r.status,200);assert.equal(f.players[3].role,'mafia_boss');assert.equal(f.players[0].role,'mafia');
 const privateView=await f.call('state',{id:'bot',playerToken:'token-bot'});assert.equal(privateView.body.me.promotedBoss,true);
 const ordinary=await f.call('state',{id:'c',playerToken:'token-c'});assert.equal(ordinary.body.players.some(p=>p.alive&&p.role),false);
 f.rooms[0].phase='vote';for(const p of f.players)p.vote_target='bot';
 await f.call('resolveVote',f.host);assert.equal(f.players[0].role,'mafia_boss');
});
test('Interrupted final shot resumes its committed target without permitting a new target',async()=>{
 const f=fixture();f.rooms[0].phase='night';f.rooms[0].round=2;f.players[0].role='vigilante';f.players[0].role_state={bullets:1};f.players[2].role='mafia_boss';f.players[2].action_target='a';
 let r=await f.call('resolveNight',f.host);const shotId=r.body.pendingShot.id;
 const pending=f.rooms[0].enabled_roles.pending_shot;
 Object.assign(pending,{resolving:true,target:'c',resolvingAt:vm.runInContext('Date.now()',f.context)});
 f.players[0].role_state.bullets=0;f.players[2].alive=false;
 assert.equal((await f.call('lastShot',{...f.host,shotId,target:'c'})).status,409);
 f.advance(16000);
 assert.notEqual((await f.call('lastShot',{...f.host,shotId,target:'b'})).status,200);
 r=await f.call('lastShot',{...f.host,shotId,target:'c'});assert.equal(r.status,200);assert.equal(r.body.pendingShot,null);assert.equal(f.players[1].alive,true);assert.equal(r.body.winner,'village');
});

test('Host-selected question count persists at game start and limits one question per round',async()=>{
 for(const count of [1,3,5]){
  const f=fixture();f.rooms[0].phase='lobby';
  let r=await f.call('start',{...f.host,mafiaCount:1,detectiveCount:1,detectiveQuestions:count,enabledRoles:{doctor:false,detective:true,lawyer:false,jailer:false}});
  assert.equal(r.status,200);assert.equal(r.body.detectiveQuestions,count);assert.equal(f.rooms[0].detective_questions,count);
  const detective=f.players.find(p=>p.role==='detective');const target=f.players.find(p=>p.id!==detective.id);
  const auth={id:detective.id,playerToken:detective.session_token};
  f.rooms[0].phase='night';f.rooms[0].round=count;
  assert.equal((await f.call('act',{...auth,target:target.id})).status,200);
  assert.equal((await f.call('act',{...auth,target:target.id})).status,400);
  f.rooms[0].round=count+1;detective.action_target=null;
  assert.equal((await f.call('state',auth)).body.me.questionLimit,0);
  assert.equal((await f.call('act',{...auth,target:target.id})).status,400);
 }
});

test('Waiting for the final shot freezes the phase clock and restores a full morning allowance',async()=>{
 const f=fixture('off');f.rooms[0].phase='night';f.rooms[0].round=2;f.players[0].role='vigilante';f.players[0].role_state={bullets:1};f.players[1].role='lawyer';f.players[2].role='mafia_boss';f.players[2].action_target='a';f.players[3].role='jailer';f.players[3].is_bot=false;
 let r=await f.call('resolveNight',f.host);assert.equal(r.status,200);const shotId=r.body.pendingShot.id;const frozen=r.body.phaseClock;
 f.advance(120000);r=await f.call('state',f.host);assert.deepEqual(r.body.phaseClock,frozen);
 assert.equal((await f.call('startVote',f.host)).status,409);
 r=await f.call('lastShot',{...f.host,shotId,target:'SKIP'});assert.equal(r.status,200);
 assert.equal(r.body.phaseClock.pausedAt,null);assert.equal(r.body.phaseClock.startedAt,vm.runInContext('Date.now()',f.context));
 assert.equal((await f.call('startVote',f.host)).body.error,'WAITING_LAWYER');
 f.advance(59000);assert.equal((await f.call('startVote',f.host)).body.error,'WAITING_LAWYER');
 f.advance(1000);assert.equal((await f.call('startVote',f.host)).status,200);
});
test('Polling preserves the page for clock-only updates but redraws real changes',async()=>{
 const src=readFileSync(new URL('../dist/game.js',import.meta.url),'utf8');
 const c=vm.createContext({});vm.runInContext(src.slice(src.indexOf('function renderStateKey('),src.indexOf('function startPolling(')),c);
 const initial={phase:'day',players:[{id:'a',alive:true,connected:true}],me:{voted:false},serverTime:1,discussion:{id:'talk',version:0,cursor:0,order:['a','b'],turnStartedAt:1000,seconds:30,remainingMs:30000,index:0,speakerId:'a',status:'active',complete:false,deadline:31000}};
 const next=JSON.parse(JSON.stringify(initial));next.serverTime=60000;Object.assign(next.discussion,{remainingMs:20000,index:1,speakerId:'b',deadline:61000});
 assert.equal(c.renderStateKey(initial),c.renderStateKey(next));
 for(const change of [s=>s.players[0].alive=false,s=>s.players[0].connected=false,s=>s.me.voted=true,s=>s.phase='vote',s=>s.discussion.cursor++,s=>s.discussion.pausedAt=2000,s=>s.discussion.finished=true]){
  const changed=JSON.parse(JSON.stringify(next));change(changed);assert.notEqual(c.renderStateKey(next),c.renderStateKey(changed));
 }
});

test('Only host can warn; warning reason is private and the player remains active',async()=>{
 const f=fixture();f.players[2].role='mafia_boss';
 const request={target:'a',reason:'مقاطعة الحديث'};
 assert.equal((await f.call('warnPlayer',{...request,id:'b',playerToken:'token-b'})).status,403);
 assert.equal((await f.call('warnPlayer',{...f.host,...request,reason:''})).status,400);
 assert.equal((await f.call('warnPlayer',{...f.host,...request})).status,200);
 const own=(await f.call('state',{id:'a',playerToken:'token-a'})).body;
 assert.equal(own.me.warnings[0].reason,request.reason);assert.equal(own.me.alive,true);
 const other=(await f.call('state',{id:'b',playerToken:'token-b'})).body;
 assert.equal(JSON.stringify(other).includes(request.reason),false);
 assert.equal((await f.call('state',f.host)).body.players.find(p=>p.id==='a').warningCount,1);
});
test('Host expulsion removes the current speaker, preserves session, and never activates sniper',async()=>{
 const f=fixture();f.players[0].role='vigilante';f.players[0].role_state={bullets:1};f.players[2].role='mafia_boss';
 await f.call('startDiscussion',f.host);
 const request={target:'a',reason:'عدم الالتزام'};
 assert.equal((await f.call('expelPlayer',{...request,id:'b',playerToken:'token-b'})).status,403);
 let r=await f.call('expelPlayer',{...f.host,...request});assert.equal(r.status,200);assert.equal(r.body.discussion.speakerId,'b');assert.equal(r.body.pendingShot,null);
 assert.equal(r.body.eliminations.find(p=>p.id==='a').detail,request.reason);
 r=await f.call('state',{id:'a',playerToken:'token-a'});assert.equal(r.status,200);assert.equal(r.body.me.alive,false);
 assert.equal((await f.call('saveWill',{id:'a',playerToken:'token-a',text:'x'})).status,403);
 assert.equal((await f.call('expelPlayer',{...f.host,...request})).status,404);
});
test('Expelling an accused player ends the trial safely, including while paused',async()=>{
 for(const phase of ['trial','verdict','paused']){
  const f=fixture();f.rooms[0].phase=phase;f.rooms[0].accused_player='a';f.rooms[0].enabled_roles.paused_phase='verdict';f.players[2].role='mafia_boss';
  for(const p of f.players)p.vote_target='GUILTY';
  const r=await f.call('expelPlayer',{...f.host,target:'a',reason:'مخالفة'});
  assert.equal(r.status,200);assert.equal(r.body.round,2);assert.equal(r.body.accusedPlayer,null);
  assert.equal(r.body.phase,phase==='paused'?'paused':'night');
  if(phase==='paused')assert.equal(r.body.enabledRoles.paused_phase,'night');
 }
});
test('Expelling the Mafia boss promotes a successor and clears votes and jail targeting them',async()=>{
 const f=fixture();f.rooms[0].phase='vote';f.rooms[0].jailed_player='a';f.players[0].role='mafia_boss';f.players[1].role='mafia';f.players[2].vote_target='a';f.players[3].action_target='a';
 const r=await f.call('expelPlayer',{...f.host,target:'a',reason:'مخالفة'});
 assert.equal(r.status,200);assert.equal(f.players[1].role,'mafia_boss');assert.equal(f.players[2].vote_target,null);assert.equal(f.players[3].action_target,null);assert.equal(f.rooms[0].jailed_player,null);
 assert.equal(f.players[0].session_token,'token-a');
});
test('Host chooses a fresh duration for each discussion round',async()=>{
 const f=fixture();
 assert.equal((await f.call('startDiscussion',{...f.host,seconds:17})).status,400);
 let r=await f.call('startDiscussion',{...f.host,seconds:45});assert.equal(r.body.discussion.seconds,45);
 const id=r.body.discussion.id;
 r=await f.call('startDiscussion',{...f.host,seconds:90});assert.equal(r.body.discussion.id,id);assert.equal(r.body.discussion.seconds,45);
 f.rooms[0].round=2;
 r=await f.call('startDiscussion',{...f.host,seconds:90});assert.equal(r.body.discussion.seconds,90);assert.notEqual(r.body.discussion.id,id);
});
test('Speaking timer pause, resume and restart are host-only and preserve the current speaker',async()=>{
 for(const mode of ['turns','group']){
  const f=fixture(mode);await f.call('startDiscussion',{...f.host,seconds:60});f.advance(20000);
  const command=(operation,auth=f.host)=>f.call('controlDiscussion',{...auth,operation,discussionId:f.view().id,version:f.view().version,speakerId:f.view().speakerId});
  assert.equal((await command('pause',{id:'a',playerToken:'token-a'})).status,403);
  assert.equal((await command('pause')).status,200);assert.equal(f.rooms[0].phase,'day');
  f.advance(100000);assert.equal(f.view().remainingMs,40000);
  assert.equal((await f.call('startVote',f.host)).status,409);
  assert.equal((await command('reset')).status,200);assert.equal(f.view().status,'paused');assert.equal(f.view().remainingMs,60000);
  await f.call('togglePause',f.host);f.advance(100000);await f.call('togglePause',f.host);
  assert.equal(f.view().status,'paused');assert.equal(f.view().remainingMs,60000);
  assert.equal((await command('resume')).status,200);f.advance(10000);assert.equal(f.view().remainingMs,50000);
  const speaker=f.view().speakerId;
  assert.equal((await command('reset')).status,200);assert.equal(f.view().remainingMs,60000);assert.equal(f.view().speakerId,speaker);
  const args={...f.host,operation:'reset',discussionId:f.view().id,version:f.view().version,speakerId:f.view().speakerId};
  const results=await Promise.all([f.call('controlDiscussion',args),f.call('controlDiscussion',args)]);
  assert.equal(results.filter(r=>r.status===200).length,1);
 }
});
test('Doctor protects from night two indefinitely regardless of detective question count',async()=>{
 for(const count of [1,3,5])for(const round of [1,2,4,10,50]){
  const f=fixture();f.rooms[0].phase='night';f.rooms[0].round=round;f.rooms[0].detective_questions=count;
  f.players[0].role='doctor';f.players[0].action_target=null;f.players[2].role='mafia_boss';f.players[2].action_target='SKIP';
  const auth={id:'a',playerToken:'token-a'},available=round>=2;
  const view=(await f.call('state',auth)).body;
  assert.equal(view.me.doctorAvailable,available);assert.equal(view.me.doctorProtectionRounds,null);assert.equal(view.nightReady,undefined);
  assert.equal((await f.call('state',f.host)).body.nightReady,!available);
  assert.equal((await f.call('act',{...auth,target:'b'})).status,available?200:409);
 }
});
test('First night accepts only detective actions, ignoring stale powers and blocks',async()=>{
 for(const role of ['mafia_boss','mafia','doctor','witch','serial_killer','jailer','cupid','escort','vigilante','lawyer','citizen']){
  const f=fixture();f.rooms[0].phase='night';f.rooms[0].jailed_player='a';
  f.players[0].role='detective';f.players[0].action_target=null;f.players[1].role=role;f.players[1].action_target=role==='witch'?'POISON:a':role==='jailer'?'EXECUTE':role==='cupid'?'a,c':'a';f.players[1].role_state={life:true,poison:true};
  f.players[2].role='mafia_boss';f.players[2].action_target='a';
  assert.equal((await f.call('act',{id:'b',playerToken:'token-b',target:'a'})).status,409);
  assert.equal((await f.call('resolveNight',f.host)).status,409);
  assert.equal((await f.call('act',{id:'a',playerToken:'token-a',target:'c'})).status,200);
  const r=await f.call('resolveNight',f.host);assert.equal(r.status,200);assert.equal(r.body.lastDeaths.length,0);
  assert.equal(f.players.every(p=>p.alive),true);assert.equal(f.players[1].role_state.poison,true);
  const state=await f.call('state',{id:'a',playerToken:'token-a'});assert.equal(state.body.me.investigationResults.length,1);
  assert.equal(r.body.lastEvent.includes('detective_only_night'),true);
 }
});
test('Doctor saves the target even after detective questions have ended',async()=>{
 for(const round of [1,2,4]){
  const f=fixture();f.rooms[0].phase='night';f.rooms[0].round=round;f.rooms[0].detective_questions=3;
  f.players[0].role='doctor';f.players[0].action_target='b';f.players[2].role='mafia_boss';f.players[2].action_target='b';
  assert.equal((await f.call('resolveNight',f.host)).status,200);
  assert.equal(f.players[1].alive,true);
 }
});
