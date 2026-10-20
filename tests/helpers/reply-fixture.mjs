import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';

const source = stripTypeScriptTypes(readFileSync(new URL('../../supabase/functions/mafia-room/index.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, ''));
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

export async function startClaimants({claim=true,round=1,mode='turns'}={}) {
 const f=fixture(mode);f.rooms[0].round=round;f.rooms[0].detective_questions=3;
 f.players[0].role='detective';f.players[1].role='mafia_boss';f.players[1].role_state.discussionClaim=claim;
 const result=await f.call('startDiscussion',f.host);assert.equal(result.status,200,JSON.stringify(result.body));
 return f;
}
