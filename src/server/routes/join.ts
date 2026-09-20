async function routeJoin(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const name = String(body.name || "").trim().slice(0, 20);
      const requestedId = String(body.id || crypto.randomUUID());
      if (!validPlayerId(requestedId)) return out({ error: "INVALID_PLAYER_ID" }, 400);
      const existing = players.find((x) => x.id === requestedId);
      if (existing) {
        if (!body.playerToken || existing.session_token !== body.playerToken) return out({ error: "SESSION_INVALID" }, 403);
        // Reconnect is an authenticated seat recovery, not a new admission or rename.
        const { error } = await db.from("mafia_players").update({ last_seen: new Date().toISOString() }).eq("room_code", code).eq("id", requestedId);
        if (error) throw error;
        existing.last_seen = new Date().toISOString();
        return out({ ...publicView(room, players, requestedId), playerToken: body.playerToken });
      }
      if (room.phase !== "lobby") return out({ error: "GAME_STARTED" }, 409);
      if (players.length >= 20) return out({ error: "ROOM_FULL" }, 409);
      if (!name) return out({ error: "NAME_REQUIRED" }, 400);
      if (players.some((x) => x.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) return out({ error: "NAME_TAKEN" }, 409);
      const playerToken = typeof body.playerToken==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.playerToken) ? body.playerToken : crypto.randomUUID();
      const profileToken = cleanText(body.profileToken, 80) || crypto.randomUUID();
      const {data:result,error}=await db.rpc('mafia_join_seat',{p_code:code,p_id:requestedId,p_name:name,p_player_token:playerToken,p_profile_token:profileToken});
      if(error)throw error;
      if(result?.error)return out({error:result.error},result.error==='SESSION_INVALID'?403:result.error==='ROOM_NOT_FOUND'?404:409);
      if(!result?.player)throw new Error('JOIN_FAILED');
      ({room,players}=await load(code));
      return out({...publicView(room,players,requestedId),playerToken:result.player.session_token,profileToken:result.player.profile_token});
    
  }
}
