// Freeze only project code/assets, never credentials, dependencies, or production data.
import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.cwd();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function walk(relative){
 const files=[];
 for(const item of await readdir(path.join(root,relative),{withFileTypes:true})){
  if(item.name.startsWith('.'))continue;
  const name=relative+'/'+item.name;
  if(item.isDirectory())files.push(...await walk(name));
  else if(item.isFile())files.push(name);
 }
 return files;
}
const files=['package.json','package-lock.json','supabase/bootstrap.sql','supabase/service-access.sql'];
for(const dir of ['dist','src','tests','scripts','supabase/functions','supabase/migrations'])files.push(...await walk(dir));
files.sort();
const baseline=[];
for(const file of files)baseline.push({file,sha256:sha(await readFile(path.join(root,file)))});
const fingerprint=sha(JSON.stringify(baseline));
const relative='artifacts/acceptance-'+new Date().toISOString().replace(/[:.]/g,'-');
const destination=path.join(root,relative);await mkdir(destination,{recursive:false});
for(const {file,sha256} of baseline){
 const bytes=await readFile(path.join(root,file));
 if(sha(bytes)!==sha256)throw Error('Source changed during capture: '+file+'; do not use incomplete snapshot');
 await mkdir(path.dirname(path.join(destination,file)),{recursive:true});
 await copyFile(path.join(root,file),path.join(destination,file));
 if(sha(await readFile(path.join(destination,file)))!==sha256)throw Error('Copy changed: '+file);
}
await mkdir(path.join(destination,'artifacts'));
const metadata={createdAt:new Date().toISOString(),fingerprint,path:destination,files:baseline};
await writeFile(path.join(destination,'snapshot.json'),JSON.stringify(metadata,null,2));
await writeFile(path.join(root,'artifacts/acceptance-latest.json'),JSON.stringify(metadata,null,2));
console.log(JSON.stringify({path:destination,fingerprint,files:files.length}));
