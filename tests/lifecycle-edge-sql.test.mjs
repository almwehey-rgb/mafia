import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {PGlite} from '@electric-sql/pglite';
import {sqlClientFactory} from './helpers/sql-client.mjs';

test('Real Edge handler and SQL complete two matches with a changed roster and private reconnect',async()=>{
 const db=new PGlite();try{
  await db.exec(readFileSync(new URL('./fixtures/production-schema.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/202609120001_room_lifecycle.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/202609120002_atomic_transitions.sql',import.meta.url),'utf8'));
   await db.exec(readFileSync(new URL('../supabase/migrations/20260913121414_atomic_join_seat.sql',import.meta.url),'utf8'));
  await db.query('insert into mafia_host_auth(pin_hash) values($1)',[createHash('sha256').update('test-pin').digest('hex')]);
  let handler;const context=vm.createContext({AsyncLocalStorage,crypto:webcrypto,Uint8Array,TextEncoder,Response,URL,console,
   createClient:sqlClientFactory(db),Deno:{env:{get:()=> 'test-only'},serve:fn=>{handler=fn;}}});
  const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/mafia-room/index.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,''));
  vm.runInContext(source,context);
  let code,version=0;
  const call=async(action,args={},status=200)=>{
   const response=await handler(new Request('https://isolated.test/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,code,lifecycleVersion:version,...args})}));
   const body=await response.json();assert.equal(response.status,status,action+': '+JSON.stringify(body));
   if(body.lifecycleVersion!==undefined)version=body.lifecycleVersion;
   return body;
  };
  const login=await call('hostLogin',{pin:'test-pin'});
  const created=await call('create',{hostAccessToken:login.hostAccessToken});code=created.code;
  const host={hostToken:created.hostToken};const seats=new Map();
  const join=async id=>{const r=await call('join',{id,name:id});seats.set(id,{id,playerToken:r.playerToken});return r;};
  for(const id of ['a','b','c','d'])await join(id);
  const settings={doctor:false,detective:true,lawyer:false,jailer:false,full_trial:false,discussion_mode:'turns'};
  const play=async(departDuringVote=false)=>{
   const start=await call('start',{...host,mafiaCount:1,detectiveCount:1,enabledRoles:settings});
   assert.equal(start.phase,'reveal');assert.equal(start.round,1);
   await call('join',{id:'late',name:'Late'},409);
   const roleViews=new Map();
   for(const [id,auth] of seats){
    const view=await call('state',auth);roleViews.set(id,view.me.role);
    assert.equal(view.players.some(p=>p.role!==undefined),false);
    assert.equal(view.voteSummary,null);
    assert.equal(JSON.stringify(view).includes('session_token'),false);
    await call('acknowledgeRole',auth);
   }
   const first=seats.values().next().value;
   const reconnect=await call('join',{...first,name:'Changed'});
   assert.equal(reconnect.playerToken,first.playerToken);
   assert.equal((await call('state',first)).me.role,roleViews.get(first.id));
   assert.equal((await db.query('select count(*) n from mafia_players where room_code=$1',[code])).rows[0].n,seats.size);
   assert.equal((await call('beginNight',host)).phase,'night');
   const detective=[...roleViews].find(([,role])=>role==='detective')[0];
   const boss=[...roleViews].find(([,role])=>role==='mafia_boss')[0];
   await call('act',{...seats.get(detective),target:boss});
   assert.equal((await call('resolveNight',host)).phase,'day');
   const discussion=await call('startDiscussion',host);
   assert.ok(discussion.discussion.id);
   await call('finishDiscussion',{...host,discussionId:discussion.discussion.id});
   assert.equal((await call('startVote',host)).phase,'vote');
   if(departDuringVote){
    const departing=[...roleViews].find(([,role])=>role==='citizen')[0];
    const voter=[...seats.keys()].find(id=>id!==departing);
    await call('vote',{...seats.get(voter),target:departing});
    const credentials=seats.get(departing);
    await call('leave',credentials);seats.delete(departing);
    await call('state',host);
    assert.equal((await db.query('select vote_target from mafia_players where room_code=$1 and id=$2',[code,voter])).rows[0].vote_target,null);
    await call('vote',{...credentials,target:boss},400);
   }
   for(const [id,auth] of seats)await call('vote',{...auth,target:id===boss?'SKIP':boss});
   const finished=await call('resolveVote',host);
   assert.equal(finished.phase,'finished');assert.equal(finished.winner,'village');
   return {boss,detective};
  };
  await play();
  const lobby=await call('returnToLobby',host);assert.equal(lobby.phase,'lobby');
  const clean=(await db.query('select * from mafia_players where room_code=$1',[code])).rows;
  for(const p of clean){assert.equal(p.role,null);assert.equal(p.investigation_result,null);assert.equal(p.vote_target,null);assert.deepEqual(p.role_state,{});}
  const leaving=seats.get('d');await call('leave',leaving);seats.delete('d');
  // Refresh after the structural version changes, as browser polling does.
  await call('state',host);await join('e');await join('f');
  assert.equal(seats.size,5);await play(true);
  const stats=(await db.query('select games from mafia_profiles order by nickname')).rows.map(p=>p.games);
  assert.deepEqual(stats,[2,2,2,1,1,1]);
  await call('returnToLobby',host);
  // A real polling request after the grace period takes over; a subsequent
  // reconnect keeps its seat, but the old host token has lost authority.
  await db.query("update mafia_rooms set host_seen_at=now()-interval '1 minute' where code=$1",[code]);
  const successor=seats.values().next().value;
  const takeover=await call('state',successor);assert.equal(takeover.canControl,true);
  await call('state',host,403);
  const reconnect=await call('join',{...successor,name:successor.id});assert.equal(reconnect.playerToken,successor.playerToken);
  await call('leave',successor);seats.delete(successor.id);
  const next=seats.values().next().value;
  const afterLeave=await call('state',next);assert.equal(afterLeave.hostPlayerId,next.id);
  for(let i=seats.size;i<20;i++)await join('extra'+i);
  const fullStart=await call('start',{...next,mafiaCount:1,detectiveCount:20,enabledRoles:settings});
  assert.equal(fullStart.phase,'reveal');
  assert.equal((await db.query('select detective_count from mafia_rooms where code=$1',[code])).rows[0].detective_count,8);
 }finally{await db.close();}
});
