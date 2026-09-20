import {readFile,writeFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile('src/build-manifest.json','utf8'));
for(const [key,target] of [['client','dist/game.js'],['server','supabase/functions/mafia-room/index.ts']]){
 const content=(await Promise.all(manifest[key].map(p=>readFile(p,'utf8')))).join('');
 if(process.argv.includes('--check')){
  if(await readFile(target,'utf8')!==content)throw Error(target+' is stale; run npm run build');
 }else await writeFile(target,content);
}
