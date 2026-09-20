import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const files=JSON.parse(await readFile('artifacts/performance-release-manifest.json','utf8'));
let checked=0;const failures=[];
for(let i=0;i<files.length;i+=6){await Promise.all(files.slice(i,i+6).map(async file=>{
 const r=await fetch('https://mafia-night-iota.vercel.app/'+file.file);const bytes=Buffer.from(await r.arrayBuffer());
 if(r.status!==200||createHash('sha256').update(bytes).digest('hex')!==file.sha256)failures.push(file.file);else checked++;
}));}
console.log(JSON.stringify({checked,failures}));if(failures.length)process.exitCode=1;
