import {readFileSync,readdirSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {PGlite} from '@electric-sql/pglite';
import {sqlClientFactory} from './sql-client.mjs';

export async function edgeFixture({fresh=false,sourcePath,log=console,environment={}}={}){
 const db=new PGlite();
 try{
  if(fresh){
   await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
   await db.exec(readFileSync(new URL('../../supabase/bootstrap.sql',import.meta.url),'utf8'));
   const folder=new URL('../../supabase/migrations/',import.meta.url);
   for(const file of readdirSync(folder).filter(name=>name.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(file,folder),'utf8'));
   await db.exec(readFileSync(new URL('../../supabase/service-access.sql',import.meta.url),'utf8'));
  }else{
   await db.exec(readFileSync(new URL('../fixtures/production-schema.sql',import.meta.url),'utf8'));
   await db.exec(readFileSync(new URL('../../supabase/migrations/202609120001_room_lifecycle.sql',import.meta.url),'utf8'));
   await db.exec(readFileSync(new URL('../../supabase/migrations/202609120002_atomic_transitions.sql',import.meta.url),'utf8'));
   await db.exec(readFileSync(new URL('../../supabase/migrations/20260913121414_atomic_join_seat.sql',import.meta.url),'utf8'));
  }
  await db.query('insert into mafia_host_auth(pin_hash) values($1)',[createHash('sha256').update('12345678').digest('hex')]);
  function reload(nextSource){
  let handler;
  const metrics={queries:0};
  const context=vm.createContext({AsyncLocalStorage,crypto:webcrypto,Uint8Array,TextEncoder,Response,URL,console:log,
   createClient:sqlClientFactory(db,{onQuery:()=>metrics.queries++}),Deno:{env:{get:key=>environment[key]??'test-only'},serve:fn=>{handler=fn;}}});
  const source=stripTypeScriptTypes(readFileSync(nextSource||new URL('../../supabase/functions/mafia-room/index.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,''));
  vm.runInContext(source,context);
  return {handler,metrics};
  }
  return {db,...reload(sourcePath),reload};
 }catch(error){await db.close();throw error;}
}
