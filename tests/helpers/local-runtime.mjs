import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {edgeFixture} from './edge-fixture.mjs';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
export async function startLocalRuntime({dist='dist',sourcePath,port=0}={}){
 const fixture=await edgeFixture({fresh:true,sourcePath,log:{log(){},warn(){},error(){}}});
 let release={root:path.resolve(dist),handler:fixture.handler};
 const server=createServer(async(req,res)=>{
  const current=release;
  try{
   const url=new URL(req.url,'http://127.0.0.1');
   if(url.pathname==='/test-api'){
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const result=await current.handler(new Request(url,{method:req.method,headers:req.headers,body:req.method==='POST'?Buffer.concat(chunks):undefined}));
    res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return;
   }
   let name=decodeURIComponent(url.pathname);if(name==='/')name='/index.html';else if(!path.extname(name))name+='.html';
   const file=path.resolve(current.root,'.'+name);
   if(!file.startsWith(current.root+path.sep)){res.writeHead(403);res.end();return;}
   let data=await readFile(file);
   if(path.extname(file)==='.js')data=Buffer.from(data.toString().replaceAll(/https:\/\/unsxzbrpqvppecjnirqx\.supabase\.co\/functions\/v1\/mafia-room(?:\?forceFunctionRegion=ap-southeast-1)?/g,'/test-api'));
   res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(data);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:500);res.end('Local test request failed');}
 });
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}
 catch(error){await fixture.db.close();throw error;}
 return {url:`http://127.0.0.1:${server.address().port}`,db:fixture.db,
  async deploy({dist,sourcePath}){
   const root=path.resolve(dist);await stat(path.join(root,'game.html'));
   const next=fixture.reload(sourcePath);
   release={root,handler:next.handler};
  },
  async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fixture.db.close();}
 };
}
