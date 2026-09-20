// Independent native PostgreSQL connections against a fresh disposable database.
// Requires the local test cluster described in tests/README.md.
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=path.resolve('.test-postgres');
const psql=path.join(root,'pgsql/bin/psql.exe');
const database='mafia_concurrency_'+randomBytes(6).toString('hex');
const env={...process.env,PGPASSWORD:readFileSync(path.join(root,'password.txt'),'utf8')};
function session(db=database){
 const child=spawn(psql,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55439','-U','mafia_test','-d',db],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
 let output='',errors='',readyResolve;const ready=new Promise(r=>{readyResolve=r;});
 child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('LOCK_READY'))readyResolve();});child.stderr.on('data',chunk=>{errors+=chunk;});
 const timer=setTimeout(()=>child.kill(),20000);
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>{clearTimeout(timer);code===0?resolve(output.trim()):reject(Error(errors||'psql exited '+code));});});
 return {child,done,ready};
}
async function execute(sql,db=database){const s=session(db);s.child.stdin.end(sql);return s.done;}
const seed=`insert into mafia_rooms(code,host_token) values('8754','host');
insert into mafia_players(room_code,id,name,session_token) values('8754','a','A','a'),('8754','b','B','b'),('8754','c','C','c');`;
const start=`select mafia_start_match('8754',0,'host',null,null,'[{"id":"a","role":"mafia_boss","state":{}},{"id":"b","role":"citizen","state":{}},{"id":"c","role":"citizen","state":{}}]','{}',1,0,3);`;
async function holdRoom(){const s=session();s.child.stdin.write("begin;select code from mafia_rooms where code='8754' for update;select 'LOCK_READY';\n");await Promise.race([s.ready,s.done.then(()=>{throw Error('Lock holder exited early');})]);return s;}
async function waitBlocked(count){
 const deadline=Date.now()+10000;
 while(Date.now()<deadline){
  const blocked=Number(await execute("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock';"));
  if(blocked>=count)return;
  await new Promise(resolve=>setTimeout(resolve,30));
 }
 throw Error('Both contenders did not reach the PostgreSQL lock barrier');
}
await execute('create database '+database+';','postgres');
try{
 let schema=readFileSync(new URL('./fixtures/production-schema.sql',import.meta.url),'utf8');
 schema=schema.replace(/create role (anon|authenticated|service_role);/g,(_,role)=>`do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role};end if;end $$;`);
 await execute(schema);
 for(const file of ['202609120001_room_lifecycle.sql','202609120002_atomic_transitions.sql','20260913121414_atomic_join_seat.sql'])await execute(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await execute(seed);
 let holder=await holdRoom();
 const attempts=[execute(start),execute(start)];
 await waitBlocked(2);
 holder.child.stdin.end('commit;');await holder.done;
 const results=(await Promise.all(attempts)).map(JSON.parse);
 assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.error==='STALE_GAME').length,1);
 assert.equal(await execute("select phase||':'||lifecycle_version from mafia_rooms where code='8754';"),'reveal:1');
 console.log('PASS: two independent start requests commit one deal');
 await execute("update mafia_rooms set phase='finished';select mafia_return_to_lobby('8754',1,'host',null,null);update mafia_rooms set lifecycle_version=0;");
 holder=await holdRoom();
 const race=Promise.allSettled([execute(start),execute("insert into mafia_players(room_code,id,name) values('8754','d','D');")]);
 await waitBlocked(2);
 holder.child.stdin.end('commit;');await holder.done;
 const joined=await race;
 const actual=await execute("select phase||':'||(select count(*) from mafia_players where room_code='8754') from mafia_rooms where code='8754';");
 assert.ok(['reveal:3','lobby:4'].includes(actual),actual);
 if(actual==='reveal:3'){assert.equal(JSON.parse(joined[0].value).ok,true);assert.equal(joined[1].status,'rejected');assert.match(joined[1].reason.message,/GAME_STARTED/);}
 else {assert.equal(joined[1].status,'fulfilled');assert.equal(JSON.parse(joined[0].value).error,'ROSTER_CHANGED');}
 console.log('PASS: concurrent admission and start cannot produce a partially dealt roster');
 await execute("update mafia_rooms set phase='vote',winner=null,stats_recorded=false;update mafia_players set role=case when id='b' then 'mafia_boss' else 'citizen' end;insert into mafia_profiles(profile_token,nickname) select id,name from mafia_players;update mafia_players set profile_token=id;");
 const preimage=JSON.parse(await execute("select json_build_object('room',(select to_jsonb(r) from mafia_rooms r where code='8754'),'players',(select jsonb_agg(p order by id) from mafia_players p where room_code='8754'));"));
 const quote=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'";
 const nextRoom={...preimage.room,phase:'finished',winner:'village'};
 const nextPlayers=preimage.players.map(p=>({...p,alive:p.id!=='b',vote_target:null,action_target:null}));
 const commit=`select mafia_commit_transition(${quote(preimage.room)},${quote(preimage.players)},${quote(nextRoom)},${quote(nextPlayers)},'[]','[]',true);`;
 holder=await holdRoom();
 const commits=[execute(commit),execute(commit)];await waitBlocked(2);
 holder.child.stdin.end('commit;');await holder.done;
 const committed=(await Promise.all(commits)).map(JSON.parse);
 assert.equal(committed.filter(r=>r.ok).length,1);assert.equal(committed.filter(r=>r.error==='STALE_GAME').length,1);
 assert.equal(await execute("select min(games)::text||':'||max(games)::text from mafia_profiles;"),'1:1');
 console.log('PASS: independent atomic result commits record victory/statistics exactly once');
 const generation=Number(await execute("select lifecycle_version from mafia_rooms where code='8754';"));
 holder=await holdRoom();
 const delayedVote=execute(`select set_config('request.headers','{"x-mafia-room":"8754","x-mafia-generation":"${generation}"}',false);update mafia_players set vote_target='b' where room_code='8754' and id='a';`);
 const lockOrder=Promise.allSettled([holder.done,delayedVote]);
 await waitBlocked(1);
 holder.child.stdin.end("select id from mafia_players where room_code='8754' and id='a' for update;update mafia_rooms set lifecycle_version=lifecycle_version+1 where code='8754';commit;");
 const ordered=await lockOrder;
 assert.equal(ordered[0].status,'fulfilled',ordered[0].reason?.message);
 assert.equal(ordered[1].status,'rejected');assert.match(ordered[1].reason.message,/STALE_GAME/);
 assert.equal(await execute("select coalesce(vote_target,'NULL') from mafia_players where id='a';"),'NULL');
 console.log('PASS: player writes lock the room first and cannot deadlock a result commit');
 await execute("update mafia_rooms set phase='lobby' where code='8754';");
 holder=await holdRoom();
 const admission="select mafia_join_seat('8754','retry','Retry','11111111-1111-4111-8111-111111111111','retry-profile');";
 const admissions=[execute(admission),execute(admission)];await waitBlocked(2);
 holder.child.stdin.end('commit;');await holder.done;
 const admitted=(await Promise.all(admissions)).map(JSON.parse);
 assert.equal(admitted[0].player.id,'retry');assert.equal(admitted[1].player.id,'retry');
 assert.equal(await execute("select count(*) from mafia_players where room_code='8754' and id='retry';"),'1');
 assert.equal(await execute("select count(*) from mafia_profiles where profile_token='retry-profile';"),'1');
 console.log('PASS: concurrent join retries return the same seat and commit one profile');
}finally{await execute('drop database '+database+' with (force);','postgres');}
