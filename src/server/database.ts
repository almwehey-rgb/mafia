function currentDatabase() {
  const scope = requestDatabase.getStore();
  if (!scope) throw new Error("MISSING_REQUEST_SCOPE");
  return scope.client ||= createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {global:{headers:scope.headers}});
}
// Some legacy handlers do not inspect every query error. Never let a fenced
// write silently fail and then continue applying the rest of an old operation.
function fencedQuery(query: any): any {
  return new Proxy(query, {get(target,key) {
    if(key==='then')return (resolve:any,reject:any)=>target.then((result:any)=>{
      if(result?.error?.message==='STALE_GAME')throw result.error;
      return result;
    }).then(resolve,reject);
    const value=target[key];
    return typeof value==='function' ? (...args:any[])=>fencedQuery(value.apply(target,args)) : value;
  }});
}
const db = {from:(table:string)=>fencedQuery(requestDatabase.getStore()?.plan?.from(table) || currentDatabase().from(table)),rpc:(name:string,args:any)=>fencedQuery(currentDatabase().rpc(name,args))};
// A successful response must never acknowledge a rejected database write.
async function persist(query: any) { const result=await query; if(result.error)throw result.error; return result; }
