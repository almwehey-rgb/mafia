import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const project='prj_KvX2NYBFhWBfLPw60tarkuCnJGoa',team='team_6ZX5qOWZet2Qx44MTAIWMXRO';
const root=path.resolve('dist'),release=path.resolve('artifacts/roles-review-release');
if(process.argv[2]==='prepare'){
 execFileSync(process.execPath,['scripts/build-fast-start.mjs'],{stdio:'inherit'});
 await mkdir(release,{recursive:true});
 const files=(await readdir(root)).filter(n=>/\.(html|js|css|webmanifest|jpeg)$/.test(n));
 files.push('release.json','assets/mafia-gold-icon.png');
 for(const n of await readdir(path.join(root,'assets')))if(n.endsWith('.webp'))files.push('assets/'+n);
 for(const n of await readdir(path.join(root,'assets/role-cards-v3')))if(n.endsWith('.webp'))files.push('assets/role-cards-v3/'+n);
 const manifest=[];
 for(const file of files){await mkdir(path.dirname(path.join(release,file)),{recursive:true});await copyFile(path.join(root,file),path.join(release,file));const b=await readFile(path.join(release,file));manifest.push({file,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
 await writeFile('artifacts/roles-review-release-manifest.json',JSON.stringify(manifest,null,2));
 console.log(JSON.stringify({project,team,domain:'mafia-night-iota.vercel.app',files:manifest.length,bytes:manifest.reduce((n,f)=>n+f.bytes,0)}));
}else{
 const auth=JSON.parse(await readFile('C:/Users/Talmuehii/AppData/Roaming/com.vercel.cli/Data/auth.json','utf8'));
 const headers={Authorization:'Bearer '+auth.token,'Content-Type':'application/json'};
 const current=await fetch(`https://api.vercel.com/v9/projects/${project}?teamId=${team}`,{headers});const p=await current.json();
 if(!current.ok||p.id!==project)throw Error('Unable to verify deployment project: '+current.status);
 if(process.argv[2]==='inspect'){console.log(JSON.stringify({id:p.id,name:p.name,rootDirectory:p.rootDirectory,framework:p.framework,outputDirectory:p.outputDirectory,buildCommand:p.buildCommand,installCommand:p.installCommand}));}
 else if(process.argv[2]==='status'){
  const saved=JSON.parse(await readFile('artifacts/roles-review-deployment.json','utf8'));
  const response=await fetch(`https://api.vercel.com/v13/deployments/${saved.id}?teamId=${team}`,{headers});
  const d=await response.json();if(!response.ok)throw Error('Deployment status failed: '+response.status);
  console.log(JSON.stringify({id:d.id,url:d.url,readyState:d.readyState,alias:d.alias,errorCode:d.errorCode}));
 }
 else if(process.argv[2]==='deploy'){
  const manifest=JSON.parse(await readFile('artifacts/roles-review-release-manifest.json','utf8'));const files=[];
  for(const entry of manifest){const b=await readFile(path.join(release,entry.file));if(createHash('sha256').update(b).digest('hex')!==entry.sha256)throw Error('Release changed');files.push({file:entry.file,data:b.toString('base64'),encoding:'base64'});}
  const previousDeployment=p.targets?.production?.id||p.latestDeployments?.find(d=>d.target==='production')?.id||null;
  await writeFile('artifacts/roles-review-previous-deployment.json',JSON.stringify({project,team,previousDeployment},null,2));
  const response=await fetch(`https://api.vercel.com/v13/deployments?teamId=${team}`,{method:'POST',headers,body:JSON.stringify({name:'mafia-night',project,target:'production',files,projectSettings:{framework:null,rootDirectory:null,outputDirectory:null,buildCommand:null,installCommand:null},meta:{purpose:'User requested publishing selected role cards sorted by player count and visible review options to the main production site',...(previousDeployment?{previousDeployment}:{})}})});
  const d=await response.json();if(!response.ok)throw Error(JSON.stringify({status:response.status,error:d.error}));
  const result={id:d.id,url:d.url,readyState:d.readyState,alias:d.alias};await writeFile('artifacts/roles-review-deployment.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }
}

