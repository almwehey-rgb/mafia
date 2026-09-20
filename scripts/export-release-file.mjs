import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const kind=process.argv[2],index=Number(process.argv[3]);
const manifest=JSON.parse(await readFile('.test-assurance/manifest.json','utf8')).filter(f=>f.kind===kind);
const output=[];
for(const entry of manifest.slice(index,index+1)){
 const b=await readFile('.test-assurance/'+kind+'/'+entry.file);
 if(createHash('sha256').update(b).digest('hex')!==entry.sha256)throw Error('Changed release');
 const encoded=b.toString('base64'),offset=Number(process.argv[4]||0);output.push({file:entry.file,data:encoded.slice(offset,offset+200000),total:encoded.length,encoding:'base64'});
}
console.log(JSON.stringify(output));
