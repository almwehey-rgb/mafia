import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {createHash,randomBytes,randomInt} from 'node:crypto';
import path from 'node:path';
const hash=b=>createHash('sha256').update(b).digest('hex');
const destination=path.resolve('.test-assurance');await mkdir(destination,{recursive:true});
const server=await readFile('supabase/functions/mafia-room/index.ts','utf8');
await writeFile(path.join(destination,'production-edge.ts'),server);
const credentials=await readFile(path.join(destination,'credentials.json'),'utf8').then(JSON.parse).catch(()=>({code:'9681',pin:String(randomInt(10000000,100000000)),access:randomBytes(32).toString('hex'),expires:Date.now()+24*60*60*1000}));
await writeFile(path.join(destination,'credentials.json'),JSON.stringify(credentials));
// Test endpoint never accepts another room or exposes global production profiles.
// Login/create are test-only adapters; all game actions use the release handler.
const gate=`
    if(Date.now()>${credentials.expires})return out({error:'ACCEPTANCE_EXPIRED'},403);
    if(action==='hostLogin'){
      const loginBucket=loginBuckets.get(ip);
      if(!loginBucket||loginBucket.reset<now)loginBuckets.set(ip,{count:1,reset:now+900000});
      else if(++loginBucket.count>5)return out({error:'LOGIN_RATE_LIMITED'},429);
      if(await sha256(String(body.pin))!==${JSON.stringify(hash(credentials.pin))})return out({error:'INVALID_PIN'},403);
      loginBuckets.delete(ip);return out({hostAccessToken:${JSON.stringify(credentials.access)},preferences:{mafiaCount:1,detectiveCount:1,doctor:false,jailer:false,lawyer:false,full_trial:false,discussion_mode:'turns',speaker_seconds:15}});
    }
    if(action==='create'){
      if(body.hostAccessToken!==${JSON.stringify(credentials.access)})return out({error:'UNAUTHORIZED'},403);
      const {room,players}=await load('${credentials.code}');
      if(!room||room.enabled_roles?.acceptance_test!==true)return out({error:'ROOM_NOT_FOUND'},404);
      return out({...publicView(room,players,undefined,true),hostToken:room.host_token});
    }
    if(action==='hostPreferences')return body.hostAccessToken===${JSON.stringify(credentials.access)}?out({preferences:cleanPreferences(body.settings||{}),saved:true}):out({error:'UNAUTHORIZED'},403);
    if(action==='hostLogout')return out({ok:true});
    if(action==='profile')return out({profile:null});
    if(action==='leaderboard')return out({leaderboard:[],seasonLeaderboard:[]});
    if(action!=='health'&&String(body.code)!=='${credentials.code}')return out({error:'ROOM_NOT_FOUND'},404);
    if(['recoverProfile'].includes(action))return out({error:'UNAUTHORIZED'},403);
`;
const needle='    const action = body.action || "state";';
if(!server.includes(needle))throw Error('Router entry changed');
await writeFile(path.join(destination,'acceptance-edge.ts'),server.replace(needle,needle+gate));
async function walk(folder,prefix=''){
 const paths=[];
 for(const entry of await readdir(folder,{withFileTypes:true})){
  if(entry.name.startsWith('.'))continue;
  const relative=prefix+entry.name;
  if(entry.isDirectory()){if(relative==='assets'||relative.startsWith('assets/'))paths.push(...await walk(path.join(folder,entry.name),relative+'/'));}
  else if(/\.(html|js|css|webmanifest|webp|svg|jpeg|ico)$/.test(relative)||relative==='assets/mafia-gold-icon.png')paths.push(relative);
 }
 return paths;
}
const files=await walk('dist'),manifest=[];
for(const file of files){
 const content=await readFile('dist/'+file);
 for(const kind of ['production','preview']){
  const target=path.join(destination,kind,file);await mkdir(path.dirname(target),{recursive:true});
  const data=kind==='preview'&&file.endsWith('.js')?Buffer.from(content.toString().replaceAll('/functions/v1/mafia-room','/functions/v1/mafia-room-acceptance')):content;
  await writeFile(target,data);
  manifest.push({kind,file,bytes:data.length,sha256:hash(data)});
 }
}
await writeFile(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2));
await writeFile(path.join(destination,'source-hash.json'),JSON.stringify({server:hash(server),client:hash(await readFile('dist/game.js'))}));
console.log(JSON.stringify({files:files.length,bytes:manifest.filter(f=>f.kind==='production').reduce((sum,f)=>sum+f.bytes,0),server:hash(server),code:credentials.code,pin:credentials.pin}));
