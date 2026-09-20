// Test transport adapter: each Supabase query executes real SQL in its own
// transaction. This does not emulate network behavior or concurrent connections.
const ident=s=>{if(!/^[a-z_][a-z_0-9]*$/i.test(s))throw Error('Invalid identifier '+s);return '"'+s+'"';};
const column=s=>{const parts=s.split(/(->>?)/);return ident(parts[0])+parts.slice(1).map((v,i)=>i%2===0?v:"'"+v.replaceAll("'","''")+"'").join('');};
export function sqlClientFactory(db,{onQuery=()=>{}}={}){
 let queue=Promise.resolve();
 const execute=(headers,fn)=>{
  onQuery();
  const result=queue.then(()=>db.transaction(async tx=>{
   await tx.query("select set_config('request.headers',$1,true)",[JSON.stringify(headers)]);
   return fn(tx);
  })).then(data=>({data,error:null}),error=>({data:null,error:{message:error.message,code:error.code}}));
  queue=result.then(()=>{});return result;
 };
 return (_url,_key,options={})=>{
  const headers=options.global?.headers||{};
  class Query{
   constructor(table){this.table=table;this.filters=[];this.orders=[];this.fields='*';this.kind='select';}
   select(fields='*'){this.fields=fields;return this;}
   insert(value){this.kind='insert';this.value=value;return this;}
   upsert(value,opts={}){this.kind='upsert';this.value=value;this.conflict=opts.onConflict;return this;}
   update(value){this.kind='update';this.value=value;return this;}
   delete(){this.kind='delete';return this;}
   eq(k,v){this.filters.push([k,'=',v]);return this;}
   is(k,v){this.filters.push([k,'is',v]);return this;}
   in(k,v){this.filters.push([k,'in',v]);return this;}
   lt(k,v){this.filters.push([k,'<',v]);return this;}
   gt(k,v){this.filters.push([k,'>',v]);return this;}
   gte(k,v){this.filters.push([k,'>=',v]);return this;}
   order(k,o={}){this.orders.push(column(k)+(o.ascending===false?' desc':' asc'));return this;}
   limit(n){this.max=Number(n);return this;}
   range(a,b){this.offset=a;this.max=b-a+1;return this;}
   single(){this.one=true;return this;}
   maybeSingle(){this.one=true;return this;}
   then(resolve,reject){return execute(headers,async tx=>{
    const values=[];const param=v=>{values.push(v!==null&&typeof v==='object'?JSON.stringify(v):v);return '$'+values.length;};
    const fields=this.fields==='*'?'*':this.fields.split(',').map(column).join(',');
    let sql;const table=ident(this.table);
    if(['insert','upsert'].includes(this.kind)){
     const rows=Array.isArray(this.value)?this.value:[this.value],keys=Object.keys(rows[0]);
     sql=`insert into ${table} (${keys.map(ident)}) values `+rows.map(r=>'('+keys.map(k=>param(r[k])).join(',')+')').join(',');
     if(this.kind==='upsert'){
      const keysByTable={mafia_profiles:'profile_token',mafia_season_stats:'profile_token,season',mafia_spectators:'room_code,id',mafia_host_preferences:'id'};
      const conflict=(this.conflict||keysByTable[this.table]).split(',');
      sql+=' on conflict ('+conflict.map(ident)+') do update set '+keys.filter(k=>!conflict.includes(k)).map(k=>ident(k)+'=excluded.'+ident(k)).join(',');
     }
    }else{
     sql=this.kind==='select'?`select ${fields} from ${table}`:this.kind==='delete'?`delete from ${table}`:`update ${table} set `+Object.entries(this.value).map(([k,v])=>ident(k)+'='+param(v)).join(',');
     if(this.filters.length)sql+=' where '+this.filters.map(([k,op,v])=>op==='is'?column(k)+' is '+(v===null?'null':v?'true':'false'):op==='in'?(v.length?column(k)+' in ('+v.map(param).join(',')+')':'false'):column(k)+op+param(v)).join(' and ');
    }
    if(this.kind==='select'){
     if(this.orders.length)sql+=' order by '+this.orders.join(',');
     if(this.max!==undefined)sql+=' limit '+this.max;
     if(this.offset)sql+=' offset '+this.offset;
    }else sql+=' returning '+fields;
    const {rows}=await tx.query(sql,values);return this.one?rows[0]||null:rows;
   }).then(resolve,reject);}
  }
  return {from:table=>new Query(table),rpc:(name,args)=>execute(headers,async tx=>{
   const entries=Object.entries(args);const {rows}=await tx.query('select '+ident(name)+'('+entries.map(([k],i)=>ident(k)+'=> $'+(i+1)).join(',')+') result',entries.map(([,v])=>v!==null&&typeof v==='object'?JSON.stringify(v):v));return rows[0].result;
  })};
 };
}
