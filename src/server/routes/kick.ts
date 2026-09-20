async function routeKick(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host || room.phase !== "lobby") return out({ error: "UNAUTHORIZED" }, 403);
      const target = players.find((x) => x.id === body.target);
      if (!target) return out({ error: "PLAYER_NOT_FOUND" }, 404);
      const {data,error}=await db.rpc('mafia_kick_player',{p_code:code,p_version:body.lifecycleVersion,p_host_token:body.hostToken||null,p_player_id:body.id||null,p_player_token:body.playerToken||null,p_target:target.id});
      if(error)throw error;
      if(data?.error)return out({error:data.error},data.error==='UNAUTHORIZED'?403:409);
      if(!data?.ok)throw Error('KICK_FAILED');
      ({ room, players } = await load(code));
      return out(publicView(room, players, undefined, true));
    
  }
}
