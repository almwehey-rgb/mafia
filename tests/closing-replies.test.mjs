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
  let openingDrawValues = [0], openingDrawReads = 0;
  const fixtureCrypto = {
    randomUUID: () => webcrypto.randomUUID(),
    subtle: webcrypto.subtle,
    getRandomValues(array) {
      if (array.BYTES_PER_ELEMENT !== 4) return webcrypto.getRandomValues(array);
      for (let i = 0; i < array.length; i++) array[i] = openingDrawValues[Math.min(openingDrawReads++, openingDrawValues.length - 1)];
      return array;
    }
  };
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
  const context=vm.createContext({AsyncLocalStorage,Date:Clock,crypto:fixtureCrypto,Uint8Array,TextEncoder,Response,URL,console,createClient:()=>({from:table=>new Query(table),rpc}),Deno:{env:{get:()=> 'test-only'},serve:value=>{handler=value;}}});
  vm.runInContext(source+'\nMath.random=()=>0;this.testView=discussionView;',context);
  const call=async(action,extra={})=>{
    const response=await handler(new Request('https://example.test/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,code:'8754',lifecycleVersion:rooms[0].lifecycle_version||0,...extra})}));
    return {status:response.status,body:await response.json()};
  };
  return {rooms,players,messages,tables,context,call,advance:ms=>{now+=ms;},view:()=>context.testView(rooms[0]),host:{hostToken:'test-host'},
    setOpeningDraw(...values){openingDrawValues=values;openingDrawReads=0;},get openingDrawReads(){return openingDrawReads;}};
}

async function startClaimants({claim=true,round=1,mode='turns'}={}) {
 const f=fixture(mode);f.rooms[0].round=round;f.rooms[0].detective_questions=3;
 f.players[0].role='detective';f.players[1].role='mafia_boss';f.players[1].role_state.discussionClaim=claim;
 const result=await f.call('startDiscussion',f.host);assert.equal(result.status,200,JSON.stringify(result.body));
 return f;
}
test('Real and fake claimants each get a timed closing reply after all normal turns',async()=>{
 const f=await startClaimants();const d=f.rooms[0].enabled_roles.discussion_state;
 assert.deepEqual(d.order.slice(0,3).sort(),['a','b','c']);
 assert.deepEqual(d.order.slice(3),d.order.slice(0,3).filter(id=>id==='a'||id==='b'));
 f.advance(6000+3*30000);assert.equal(f.view().speakerId,d.order[3]);assert.equal(f.view().remainingMs,30000);assert.equal(f.view().complete,false);
 assert.equal((await f.call('startVote',f.host)).body.error,'WAITING_DISCUSSION');
 f.advance(30000);assert.equal(f.view().speakerId,d.order[4]);assert.equal(f.view().complete,false);
 f.advance(30000);assert.equal(f.view().complete,true);
});
test('Closing speakers can pass and reconnect preserves the closing turn',async()=>{
 const f=await startClaimants();f.advance(96000);const before=f.view();
 const current=before.speakerId;
 const state=await f.call('state',{id:current,playerToken:'token-'+current});assert.equal(state.status,200);
 assert.equal(f.view().speakerId,current);
 const pass=await f.call('passDiscussion',{id:current,playerToken:'token-'+current,discussionId:before.id,speakerId:current});assert.equal(pass.status,200);
 assert.notEqual(f.view().speakerId,current);assert.equal(f.view().remainingMs,30000);
});
test('Silent, dead, or absent claimants do not receive a closing reply',async()=>{
 const f=await startClaimants({claim:false});const order=f.rooms[0].enabled_roles.discussion_state.order;
 assert.equal(order.filter(id=>id==='a').length,2);assert.equal(order.filter(id=>id==='b').length,1);
 const g=fixture();g.players[0].role='detective';g.players[0].alive=false;g.players[1].role='mafia_boss';g.players[1].role_state.discussionClaim=false;
 assert.equal((await g.call('startDiscussion',g.host)).status,200);assert.equal(new Set(g.view().order).size,g.view().order.length);
});
test('Replies continue after investigation questions finish, without a new draw',async()=>{
 const f=await startClaimants({round:4});const d=f.rooms[0].enabled_roles.discussion_state;
 assert.equal(d.roulette,null);assert.equal(d.order.length,5);assert.deepEqual(d.order.slice(-2).sort(),['a','b']);
});
test('Removing a claimant during a reply removes both occurrences and keeps the next speaker',async()=>{
 const f=await startClaimants();f.advance(96000);const removed=f.view().speakerId;const next=f.view().order[f.view().index+1];
 const result=await f.call('expelPlayer',{...f.host,target:removed,reason:'test'});assert.equal(result.status,200,JSON.stringify(result.body));
 assert.equal(f.view().order.includes(removed),false);assert.equal(f.view().speakerId,next);assert.equal(f.view().remainingMs,30000);
});
test('Group discussion keeps its existing group timer',async()=>{
 const f=await startClaimants({mode:'group'});assert.equal(f.view().order.length,3);f.advance(180000);assert.equal(f.view().complete,true);
});
const requestReply = (f,id) => f.call('requestDiscussionReply',{id,playerToken:'token-'+id,discussionId:f.view().id});
test('A requested reply waits for the speaker and lasts exactly 15 seconds',async()=>{
 const f=await startClaimants();f.advance(16000);const current=f.view().speakerId;const before=f.view();
 const id=current==='c'?'b':'c';const r=await requestReply(f,id);assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(f.view().speakerId,current);assert.equal(f.view().remainingMs,before.remainingMs);assert.equal(r.body.me.discussionRepliesLeft,1);
 assert.equal(f.view().order[f.view().index+1],id);
 f.advance(before.remainingMs);assert.equal(f.view().speakerId,id);assert.equal(f.view().turnKind,'reply');assert.equal(f.view().remainingMs,15000);
 f.advance(14999);assert.equal(f.view().turnKind,'reply');f.advance(1);assert.notEqual(f.view().turnKind,'reply');assert.equal(f.view().remainingMs,30000);
});
test('Requests queue FIFO, reject duplicates, and never interrupt the current reply',async()=>{
 const f=await startClaimants();f.advance(6000);const current=f.view().speakerId;const ids=['a','b','c'].filter(id=>id!==current);
 assert.equal((await requestReply(f,ids[0])).status,200);assert.equal((await requestReply(f,ids[0])).body.error,'REPLY_ALREADY_QUEUED');
 assert.equal((await requestReply(f,ids[1])).status,200);
 const d=f.view();assert.deepEqual(Array.from(d.order.slice(1,3)),ids);
 f.advance(30000);assert.equal(f.view().speakerId,ids[0]);assert.equal((await requestReply(f,ids[0])).body.error,'ALREADY_SPEAKING');
 assert.equal((await requestReply(f,current)).status,200);assert.equal(f.view().speakerId,ids[0]);
 f.advance(15000);assert.equal(f.view().speakerId,ids[1]);f.advance(15000);assert.equal(f.view().speakerId,current);
});
test('Two accepted requests exhaust the match allowance and the count survives rounds',async()=>{
 const f=await startClaimants();f.advance(6000);const id='c';assert.equal((await requestReply(f,id)).status,200);
 f.advance(45000);assert.equal((await requestReply(f,id)).status,200);
 f.advance(45000);assert.equal(f.rooms[0].enabled_roles.discussion_reply_usage[id],2);
 f.rooms[0].round++;delete f.rooms[0].enabled_roles.discussion_state;
 assert.equal((await f.call('startDiscussion',f.host)).status,200);f.advance(6000);
 assert.equal((await requestReply(f,id)).body.error,'NO_REPLIES_LEFT');
});
test('Paused clocks, reconnect, removal, and closing statements respect queued reply timing',async()=>{
 const f=await startClaimants();f.advance(6000);assert.equal((await requestReply(f,'c')).status,200);f.advance(30000);
 assert.equal(f.view().turnKind,'reply');f.advance(5000);
 let d=f.view();assert.equal((await f.call('controlDiscussion',{...f.host,discussionId:d.id,version:d.version,speakerId:d.speakerId,operation:'pause'})).status,200);
 f.advance(60000);assert.equal(f.view().remainingMs,10000);
 d=f.view();assert.equal((await f.call('controlDiscussion',{...f.host,discussionId:d.id,version:d.version,speakerId:d.speakerId,operation:'resume'})).status,200);
 assert.equal(f.view().remainingMs,10000);f.advance(10000);assert.notEqual(f.view().turnKind,'reply');
 assert.equal(f.rooms[0].enabled_roles.discussion_reply_usage.c,1);
 while(!f.view().complete && f.view().turnKind!=='closing')f.advance(f.view().remainingMs);
 assert.equal(f.view().turnKind,'closing');assert.equal((await requestReply(f,'c')).body.error,'REPLIES_CLOSED');
 assert.equal(f.rooms[0].enabled_roles.discussion_reply_usage.c,1);
});
test('Dead players, spectators, group discussion, and stale rooms cannot request replies',async()=>{
 const f=await startClaimants();f.advance(6000);f.players[2].alive=false;assert.equal((await requestReply(f,'c')).status,403);
 assert.equal((await f.call('requestDiscussionReply',{...f.host,discussionId:f.view().id})).status,403);
 const g=await startClaimants({mode:'group'});assert.equal((await requestReply(g,'c')).status,409);
 const h=await startClaimants();h.advance(6000);assert.equal((await h.call('requestDiscussionReply',{id:'c',playerToken:'token-c',discussionId:'old'})).body.error,'STALE_TURN');
});
test('Concurrent requests cannot double charge or overwrite the reply queue',async()=>{
 const f=await startClaimants();f.advance(6000);
 const results=await Promise.all([requestReply(f,'c'),requestReply(f,'c')]);
 assert.equal(results.filter(r=>r.status===200).length,1);
 assert.equal(f.rooms[0].enabled_roles.discussion_reply_usage.c,1);
 assert.equal(f.view().order.filter((id,i)=>id==='c'&&f.view().turnKinds[i]==='reply').length,1);
});
test('Restarting a match resets both reply opportunities',async()=>{
 const f=await startClaimants();f.advance(6000);assert.equal((await requestReply(f,'c')).status,200);
 f.rooms[0].phase='finished';
 const r=await f.call('start',{...f.host,mafiaCount:1,detectiveCount:0,enabledRoles:{discussion_mode:'turns',speaker_seconds:30,doctor:false,detective:false}});
 assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(f.rooms[0].enabled_roles.discussion_reply_usage,undefined);
});
