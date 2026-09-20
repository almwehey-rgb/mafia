// NODE_PATH is not used by ESM; optionally supply the installed sharp entry point.
import {readdir,readFile,stat} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
const {default:sharp}=await import(process.env.SHARP_MODULE ? pathToFileURL(process.env.SHARP_MODULE).href : 'sharp');
const directory=new URL('../dist/assets/role-cards-v3/',import.meta.url);
let before=0,after=0,thumbnails=0;
for(const name of (await readdir(directory)).filter(name=>name.endsWith('.png'))){
 const input=new URL(name,directory),full=new URL(name.replace('.png','.webp'),directory),thumb=new URL(name.replace('.png','-thumb.webp'),directory);
 const original=sharp(await readFile(name==='citizen.png'?new URL('../dist/assets/citizen-current-original.png',import.meta.url):input));
 // Preserve the original detail; compressed 192px previews were visibly soft
 // on high-density phone screens and must not be used as large role artwork.
 await original.clone().webp({lossless:true,effort:6}).toFile(fileURLToPath(full));
 await original.clone().resize({width:512,withoutEnlargement:true}).webp({quality:94,effort:6}).toFile(fileURLToPath(thumb));
 before+=(await stat(input)).size;after+=(await stat(full)).size;thumbnails+=(await stat(thumb)).size;
}
console.log(JSON.stringify({originalBytes:before,webpBytes:after,thumbnailBytes:thumbnails,reductionPercent:Math.round(100*(1-after/before))}));
