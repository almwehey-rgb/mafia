function actorRateLimited(key:string,now:number) {
  const bucket=rateBuckets.get(key);
  if (!bucket || bucket.reset < now) rateBuckets.set(key,{count:1,reset:now+60_000});
  else if (++bucket.count > 240) return true;
  if (rateBuckets.size > 10000) for (const [key,value] of rateBuckets) if (value.reset < now) rateBuckets.delete(key);
  return false;
}
async function autoAdvanceSolo(code:string, room:any, players:any[]) {
  if (!room.enabled_roles?.solo_mode || ['lobby','reveal','finished','paused'].includes(room.phase)) return {room,players};
  const base:any={body:{hostToken:room.host_token,code},action:'auto',ip:'solo-manager',now:Date.now(),started:Date.now(),code,room,players,me:null,host:true,authenticatedSpectator:null};
  if (room.phase === 'day') {
    const discussion=discussionView(room);
    if (!room.enabled_roles?.discussion_state || discussion.round !== room.round) await routeStartDiscussion({...base,action:'startDiscussion'});
    else if (discussion.status === 'active' && Date.now() >= (discussion.mode === 'turns' ? discussion.turnStartedAt + discussion.seconds*1000 : discussion.endsAt)) {
      const saved=room.enabled_roles.discussion_state;
      const next = discussion.mode === 'turns' && discussion.index + 1 < saved.order.length ? {...saved,cursor:discussion.index+1,turnStartedAt:Date.now(),version:saved.version+1} : {...saved,finished:true,version:saved.version+1};
      await db.from('mafia_rooms').update({enabled_roles:{...room.enabled_roles,discussion_state:next}}).eq('code',code).eq('phase','day').eq('enabled_roles->discussion_state->>id',saved.id).eq('enabled_roles->discussion_state->>version',String(saved.version));
    }
    ({room,players}=await load(code));
    if (discussionView(room).complete) { await botDayActions(room,players); ({room,players}=await load(code)); await routeStartVote({...base,action:'startVote',room,players}); }
  }
  return {room,players};
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
  ({room,players}=await autoAdvanceSolo(code,room,players));
  me=authenticatedPlayer(players,body);
  host=body.hostToken===room.host_token || Boolean(me && room.host_player_id===me.id && (me.alive||room.enabled_roles?.controller_spectator===true));
  return out(publicView(room,players,me?.id,host));
}
