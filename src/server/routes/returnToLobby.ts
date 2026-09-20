async function routeReturnToLobby(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      // The RPC rechecks authority and the generation under the database lock.
      const { data, error } = await db.rpc("mafia_return_to_lobby", {
        p_code: code, p_version: body.lifecycleVersion,
        p_host_token: body.hostToken || null, p_player_id: body.id || null,
        p_player_token: body.playerToken || null,
      });
      if (error) throw error;
      if (data?.error) return out({ error: data.error }, data.error === "UNAUTHORIZED" ? 403 : 409);
      ({ room, players } = await load(code));
      return out(publicView(room, players, me?.id, true));
    
  }
}
