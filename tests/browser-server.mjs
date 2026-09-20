// Local, disposable browser verification. Never contacts the production API.
// Start: node tests/browser-server.mjs ; disposable login PIN: 12345678
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {edgeFixture} from './helpers/edge-fixture.mjs';
const {db,handler}=await edgeFixture({fresh:true,sourcePath:process.env.TEST_EDGE_SOURCE});
const root=path.resolve(process.env.TEST_DIST||fileURLToPath(new URL('../dist/',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const listener=async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/test-api'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const response=await handler(new Request(url,{method:req.method,headers:req.headers,body:req.method==='POST'?Buffer.concat(chunks):undefined}));
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  let pathname=decodeURIComponent(url.pathname);if(pathname==='/')pathname='/index.html';else if(!path.extname(pathname))pathname+='.html';
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);res.end();return;}
  let data=await readFile(file);
  if(path.extname(file)==='.js')data=Buffer.from(data.toString().replaceAll(/https:\/\/unsxzbrpqvppecjnirqx\.supabase\.co\/functions\/v1\/mafia-room(?:\?forceFunctionRegion=ap-southeast-1)?/g,'/test-api'));
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(data);
 }catch(error){res.writeHead(error.code==='ENOENT'?404:500);res.end(error.message);}
};
// Separate origins give each test participant independent localStorage while
// all participants use the same isolated backend/database.
const servers=Array.from({length:5},()=>createServer(listener));
const basePort=Number(process.env.PORT||4173);
servers.forEach((server,index)=>server.listen(basePort ? basePort+index : 0,'127.0.0.1',()=>console.log(`Participant ${index}: http://127.0.0.1:${server.address().port}/game ; test PIN 12345678`)));
process.on('SIGINT',async()=>{await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));await db.close();process.exit(0);});
