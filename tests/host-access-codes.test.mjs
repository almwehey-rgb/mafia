import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {edgeFixture} from './helpers/edge-fixture.mjs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('real API grants owner management, isolates guest preferences and prevents guest management',async()=>{
 const {db,handler}=await edgeFixture({fresh:true,log:{log(){},error(){}}});
 const call=async body=>{const response=await handler(new Request('https://test/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};};
 try {
  const owner=(await call({action:'hostLogin',pin:'12345678'})).body;
  assert.equal(owner.hostAccess.isOwner,true);
  const created=await call({action:'hostCodes',operation:'create',hostAccessToken:owner.hostAccessToken,label:'أحمد',games:2});
  assert.equal(created.status,200);
  const code=created.body.code;
  const guest=(await call({action:'hostLogin',accessCode:code.code,profileToken:'guest-profile-token-12345'})).body;
  assert.equal(guest.hostAccess.isOwner,false);
  assert.equal(guest.hostAccess.remaining,2);
  assert.equal((await call({action:'hostCodes',hostAccessToken:guest.hostAccessToken})).status,403);
  assert.equal((await call({action:'hostPreferences',hostAccessToken:guest.hostAccessToken,settings:{mafiaCount:5}})).status,200);
  const guestPrefs=(await call({action:'hostPreferences',hostAccessToken:guest.hostAccessToken})).body;
  assert.equal(guestPrefs.preferences.mafiaCount,5);
  const ownerPrefs=(await call({action:'hostPreferences',hostAccessToken:owner.hostAccessToken})).body;
  assert.notEqual(ownerPrefs.preferences.mafiaCount,5);
  const room=await call({action:'create',hostAccessToken:guest.hostAccessToken});
  assert.equal(room.status,200);
  assert.equal((await db.query('select access_code_id from mafia_rooms where code=$1',[room.body.code])).rows[0].access_code_id,code.id);
  const profile=(await call({action:'profile',profileToken:'guest-profile-token-12345'})).body.profile;
  assert.ok(profile.recovery_code);
  await call({action:'hostCodes',operation:'update',hostAccessToken:owner.hostAccessToken,codeId:code.id,addGames:3,active:false});
  assert.equal((await call({action:'create',hostAccessToken:guest.hostAccessToken})).status,403);
  const list=(await call({action:'hostCodes',hostAccessToken:owner.hostAccessToken})).body.codes;
  assert.equal(list[0].remaining,5);assert.equal(list[0].active,false);
  assert.equal(list[0].bound_profile,undefined);
 }finally{await db.close();}
});
test('host passes bind once, charge only committed matches, share a balance across rooms and enforce revocation',async()=>{
 const db=new PGlite();
 try {
  for(const path of ['./fixtures/production-schema.sql','../supabase/migrations/202609120001_room_lifecycle.sql','../supabase/migrations/202609240001_midgame_restart.sql','../supabase/host-access-codes.sql'])await db.exec(read(path));
  const id=(await db.query("insert into mafia_host_codes(code,label,remaining) values('ABCDEFGHJKLMNPQR','Guest',2) returning id")).rows[0].id;
  const redeem=async(profile,hash)=>(await db.query('select mafia_redeem_host_code($1,$2,$3) result',['ABCDEFGHJKLMNPQR',profile,hash.repeat(64)])).rows[0].result;
  assert.equal((await redeem('account-one-1234567890','a')).ok,true);
  assert.equal((await redeem('account-two-1234567890','b')).error,'ACCESS_CODE_BOUND');
  assert.equal((await redeem('account-one-1234567890','c')).remaining,2);
  const balance=async()=>(await db.query('select remaining,used,active from mafia_host_codes where id=$1',[id])).rows[0];
  for(const room of ['8754','8755']){
   await db.query('insert into mafia_rooms(code,host_token,access_code_id) values($1,$2,$3)',[room,'host',id]);
   await db.query("insert into mafia_players(room_code,id,name,session_token) values($1,'a','A','a'),($1,'b','B','b')",[room]);
  }
  const assignments=JSON.stringify([{id:'a',role:'mafia',state:{}},{id:'b',role:'citizen',state:{}}]);
  const start=async(room,version=0,roles=assignments)=>(await db.query('select mafia_start_match($1,$2,$3,null,null,$4,$5,1,0,3) result',[room,version,'host',roles,'{}'])).rows[0].result;
  assert.equal((await start('8754',0,'[]')).error,'ROSTER_CHANGED');
  assert.equal((await balance()).remaining,2);
  assert.equal((await start('8754')).ok,true);
  assert.equal((await balance()).remaining,1);
  assert.equal((await start('8754')).error,'STALE_GAME');
  await db.exec("update mafia_rooms set phase='night' where code='8754'");
  assert.equal((await balance()).remaining,1);
  assert.equal((await start('8755')).ok,true);
  assert.deepEqual(await balance(),{remaining:0,used:2,active:true});
  await assert.rejects(db.query('select mafia_restart_match($1,1,$2,null,null,$3,$4,1,0,3)',['8754','host',assignments,'{}']),/ACCESS_CODE_EXHAUSTED/);
  assert.equal((await db.query("select phase from mafia_rooms where code='8754'")).rows[0].phase,'night');
  await db.query('select mafia_update_host_code($1,2,null)',[id]);
  assert.equal((await db.query('select mafia_restart_match($1,1,$2,null,null,$3,$4,1,0,3) result',['8754','host',assignments,'{}'])).rows[0].result.ok,true);
  assert.deepEqual(await balance(),{remaining:1,used:3,active:true});
  await db.query('select mafia_update_host_code($1,0,false)',[id]);
  assert.equal((await redeem('account-one-1234567890','d')).error,'INVALID_ACCESS_CODE');
  await assert.rejects(db.query('select mafia_restart_match($1,2,$2,null,null,$3,$4,1,0,3)',['8754','host',assignments,'{}']),/ACCESS_CODE_DISABLED/);
  assert.equal((await balance()).remaining,1);
  assert.equal((await db.query("select has_table_privilege('anon','mafia_host_codes','select') allowed")).rows[0].allowed,false);
  assert.equal((await db.query("select has_function_privilege('authenticated','mafia_update_host_code(uuid,integer,boolean)','execute') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});

test('room hosts and guest sessions cannot administer host passes',async()=>{
 let calls=0;
 const context=vm.createContext({getHostAccess:async()=>false,out:(body,status=200)=>({body,status}),db:{from(){calls++;throw Error('unexpected database access')}},cleanText:v=>String(v||'')});
 vm.runInContext(stripTypeScriptTypes(read('../src/server/routes/hostLogin.ts')),context);
 assert.equal((await context.routeHostCodes({body:{operation:'create',hostToken:'room-owner',games:5}})).status,403);
 context.getHostAccess=async()=>({isOwner:false,remaining:10});
 for(const operation of ['list','create','update'])assert.equal((await context.routeHostCodes({body:{operation,hostAccessToken:'guest'}})).status,403);
 assert.equal(calls,0);
 context.getHostAccess=async()=>({isOwner:true});
 assert.equal((await context.routeHostCodes({body:{operation:'create',games:-1}})).status,400);
 assert.equal(calls,0);
});
