function actorRateLimited(key:string,now:number) {
  const bucket=rateBuckets.get(key);
  if (!bucket || bucket.reset < now) rateBuckets.set(key,{count:1,reset:now+60_000});
  else if (++bucket.count > 240) return true;
  if (rateBuckets.size > 10000) for (const [key,value] of rateBuckets) if (value.reset < now) rateBuckets.delete(key);
  return false;
}
async function readCurrentState(code:string,body:any,now:number) {
  const {data,error}=await db.rpc('mafia_presence',{p_code:code,p_host_token:body.hostToken||null,p_player_id:body.id||null,p_player_token:body.playerToken||null});
  if(error)throw error;
  if(data?.error)return out({error:data.error},data.error==='UNAUTHORIZED'?403:404);
  if(data?.ok!==true)throw Error('PRESENCE_FAILED');
  let {room,players}=await load(code);
  if(!room)return out({error:'ROOM_NOT_FOUND'},404);
  let me=authenticatedPlayer(players,body);
  let host=body.hostToken===room.host_token || Boolean(me && room.host_player_id===me.id && (me.alive||room.enabled_roles?.controller_spectator===true));
  if(!host && (!me||me.left_at))return out({error:'UNAUTHORIZED'},403);
  if(actorRateLimited(me?`player:${code}:${me.id}`:`host:${code}`,now))return out({error:'RATE_LIMITED'},429);
  if(await reconcileDeparture(room,players))({room,players}=await load(code));
  me=authenticatedPlayer(players,body);
  host=body.hostToken===room.host_token || Boolean(me && room.host_player_id===me.id && (me.alive||room.enabled_roles?.controller_spectator===true));
  return out(publicView(room,players,me?.id,host));
}
