// Real pg_dump/pg_restore, restricted to the existing loopback test cluster.
import {spawn} from 'node:child_process';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('.test-postgres'),suffix=randomBytes(6).toString('hex');
const source='mafia_restore_source_'+suffix,target='mafia_restore_target_'+suffix;
const env={...process.env,PGPASSWORD:readFileSync(path.join(root,'password.txt'),'utf8')};
const connection=['-h','127.0.0.1','-p','55439','-U','mafia_test'];
function run(binary,args,input){return new Promise((resolve,reject)=>{
 const child=spawn(path.join(root,'pgsql/bin',binary+'.exe'),args,{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
 let out='',error='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>error+=v);
 child.on('error',reject);child.on('close',code=>code===0?resolve(out.trim().replaceAll('\r\n','\n')):reject(Error(error)));
 child.stdin.end(input);
});}
const sql=(database,query)=>run('psql',[...connection,'-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d',database],query);
const tables=async database=>JSON.parse(await sql(database,"select json_agg(tablename order by tablename) from pg_tables where schemaname='public' and tablename like 'mafia\\_%' escape '\\';"));
async function contents(database){const result={};for(const table of await tables(database))result[table]=JSON.parse(await sql(database,`select coalesce(jsonb_agg(x order by to_jsonb(x)::text),'[]'::jsonb) from public.${table} x;`));return result;}
mkdirSync('artifacts/backup-restore',{recursive:true});
const archive=path.resolve('artifacts/backup-restore/test-only-'+suffix+'.dump');
const created=[];
try{
 for(const name of [source,target]){await sql('postgres','create database '+name+';');created.push(name);}
 await sql(source,"do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls;end if;end $$;");
 await sql(source,readFileSync('supabase/bootstrap.sql','utf8'));
 for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await sql(source,readFileSync('supabase/migrations/'+file,'utf8'));
 await sql(source,readFileSync('supabase/service-access.sql','utf8'));
 await sql(source,`insert into mafia_rooms(code,host_token) values('1001','synthetic-host'),('1002','synthetic-host'),('1003','synthetic-host'),('1004','synthetic-host');
 insert into mafia_profiles(profile_token,nickname,games,wins) values('synthetic-profile','Test',9,4);
 insert into mafia_season_stats(profile_token,season,games,wins) values('synthetic-profile','2026-09',9,4);
 insert into mafia_players(room_code,id,name,session_token,profile_token,role) select code,'test-player','Test','synthetic-session','synthetic-profile','citizen' from mafia_rooms;
 insert into mafia_spectators(room_code,id,name,session_token) values('1002','viewer','Viewer','synthetic-viewer');
 insert into mafia_messages(room_code,channel,author_id,author_name,content) values('1002','mafia','test-player','Test','Synthetic message');
 insert into mafia_reports(room_code,reporter_id,reason) values('1002','test-player','Synthetic report');
 insert into mafia_snapshots(room_code,phase,round,reason,room_state,players_state) select '1002','night',2,'backup-fixture',to_jsonb(r),(select jsonb_agg(p) from mafia_players p where room_code='1002') from mafia_rooms r where code='1002';
 insert into mafia_audit_events(room_code,action,status) values('1002','test','ok');
 insert into mafia_leave_receipts(room_code,lifecycle_version,credential_hash) values('1002',0,'synthetic-hash');
 update mafia_rooms set phase='night',round=2 where code='1001';
 update mafia_rooms set phase='finished',winner='village',stats_recorded=true where code in('1002','1003','1004');
 update mafia_rooms set phase_started_at=now()-interval '40 days',host_seen_at=now()-interval '40 days';
 update mafia_players set last_seen=now()-interval '40 days';update mafia_spectators set last_seen=now()-interval '40 days';
 update mafia_players set last_seen=now() where room_code='1003';
 update mafia_rooms set stats_recorded=false where code='1004';`);
 const before=await contents(source);
 await run('pg_dump',[...connection,'-Fc','--no-owner','-f',archive,'-d',source]);
 await run('pg_restore',[...connection,'--no-owner','--exit-on-error','--single-transaction','-d',target,archive]);
 assert.deepEqual(await contents(target),before);
 const invalid=await sql(target,"select count(*) from mafia_players p left join mafia_rooms r on r.code=p.room_code where r.code is null;select count(*) from mafia_season_stats s left join mafia_profiles p using(profile_token) where p.profile_token is null;");assert.equal(invalid,'0\n0');
 const privileges=await sql(target,"select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'mafia_%' and (not c.relrowsecurity or has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE'));");assert.equal(privileges,'0');
 const cleanup=readFileSync('scripts/cleanup-test-rooms.sql','utf8');
 await sql(target,cleanup);assert.deepEqual(await contents(target),before);
 await sql(target,cleanup.replace('rollback;','commit;'));
 const after=await contents(target);assert.deepEqual(after.mafia_rooms.map(r=>r.code).sort(),['1001','1003','1004']);
 for(const table of ['mafia_players','mafia_spectators','mafia_messages','mafia_reports','mafia_snapshots','mafia_leave_receipts','mafia_audit_events'])assert.ok(after[table].every(r=>r.room_code!=='1002'),table);
 assert.deepEqual(after.mafia_profiles,before.mafia_profiles);assert.deepEqual(after.mafia_season_stats,before.mafia_season_stats);
 // Identity sequences also survive restoration (no reused message IDs).
 await sql(target,"insert into mafia_messages(room_code,channel,author_id,author_name,content) values('1001','mafia','test-player','Test','After restore');");
 const id=Number(await sql(target,'select max(id) from mafia_messages;'));assert.ok(id>before.mafia_messages[0].id);
 const report={passed:true,engine:'native PostgreSQL',archive:path.basename(archive),sha256:createHash('sha256').update(readFileSync(archive)).digest('hex'),tables:Object.keys(before).length,checks:['all rows identical','foreign keys','RLS and grants','sequences','dry-run rollback','only inactive completed room cleaned','active/recent/unrecorded rooms retained','profiles and seasons retained'],productionData:false};
 writeFileSync('artifacts/backup-restore/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{
 for(const name of created.reverse()){
  if(!/^mafia_restore_(source|target)_[a-f0-9]{12}$/.test(name))throw Error('Unsafe database cleanup');
  await sql('postgres','drop database '+name+';');
 }
}
