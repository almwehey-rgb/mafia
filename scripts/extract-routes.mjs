import {readFile,writeFile,mkdir} from 'node:fs/promises';
const file='src/server/router.ts';let source=await readFile(file,'utf8');
const manifest=JSON.parse(await readFile('src/build-manifest.json','utf8'));
const roomBoundary=source.indexOf('    let { room, players }');
const matches=[...source.matchAll(/^    if \((?:action === ["']|\["createAdminInvite")[^\n]+\{\r?$/gm)];
const routes=[];
await mkdir('src/server/routes',{recursive:true});
for(const match of matches.reverse()){
 const begin=match.index,header=match[0].trimEnd();
 const close=source.indexOf('\n    }',begin)+5;
 if(close<begin)throw Error('Missing closing block');
 const end=close+1;
 if(source.slice(close,close+1)!=='}')throw Error('Invalid block boundary');
 const name=header.match(/["']([a-zA-Z]+)["']/)[1];
 const functionName='route'+name[0].toUpperCase()+name.slice(1);
 const keys=begin<roomBoundary?'body, action, ip, now, started':'body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator';
 const body=source.slice(begin+match[0].length,end-1);
 const path=`src/server/routes/${name}.ts`;
 await writeFile(path,`async function ${functionName}(context:any) {\n  let {${keys}}=context;${body}\n}\n`);
 routes.unshift(path);
 source=source.slice(0,begin)+header.slice(0,-1)+`return await ${functionName}({${keys}});`+source.slice(end);
}
manifest.server.splice(manifest.server.indexOf(file),0,...routes);
await writeFile(file,source);
await writeFile('src/build-manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Extracted '+routes.length+' explicit action handlers');
