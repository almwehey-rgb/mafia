import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const kind=process.argv[2];if(!['preview','production'].includes(kind))throw Error('Specify preview or production');
const project='prj_KvX2NYBFhWBfLPw60tarkuCnJGoa',team='team_6ZX5qOWZet2Qx44MTAIWMXRO';
const auth=JSON.parse(await readFile(path.join(process.env.APPDATA,'com.vercel.cli/Data/auth.json'),'utf8'));
const headers={Authorization:'Bearer '+auth.token,'Content-Type':'application/json'};
const inspected=await fetch(`https://api.vercel.com/v9/projects/${project}?teamId=${team}`,{headers});const current=await inspected.json();
if(!inspected.ok||current.id!==project)throw Error('Wrong deployment project');
const manifest=JSON.parse(await readFile('.test-assurance/manifest.json','utf8')).filter(f=>f.kind===kind),files=[];
for(const entry of manifest){const b=await readFile('.test-assurance/'+kind+'/'+entry.file);if(createHash('sha256').update(b).digest('hex')!==entry.sha256)throw Error('Release modified: '+entry.file);files.push({file:entry.file,data:b.toString('base64'),encoding:'base64'});}
const response=await fetch(`https://api.vercel.com/v13/deployments?teamId=${team}`,{method:'POST',headers,body:JSON.stringify({name:'mafia-night',project,...(kind==='production'?{target:'production'}:{}),files,projectSettings:{framework:null,rootDirectory:null,outputDirectory:null,buildCommand:null,installCommand:null},meta:{purpose:'User-authorized security, rules, reliability and recovery release',acceptance:kind==='preview'?'isolated-room':'verified-release'}})});
const result=await response.json();if(!response.ok)throw Error(JSON.stringify({status:response.status,error:result.error}));
const saved={id:result.id,url:result.url,readyState:result.readyState,target:kind};await writeFile('.test-assurance/'+kind+'-deployment.json',JSON.stringify(saved));console.log(JSON.stringify(saved));
