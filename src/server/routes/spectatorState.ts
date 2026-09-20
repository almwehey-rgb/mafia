async function routeSpectatorState(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const spectator = authenticatedSpectator;
      if (!spectator || spectator.session_token !== body.spectatorToken) return out({ error: "UNAUTHORIZED" }, 403);
      await persist(db.from("mafia_spectators").update({ last_seen: new Date().toISOString() }).eq("room_code", code).eq("id", spectator.id));
      return out({ ...publicView(room, players), spectator: { id: spectator.id, name: spectator.name } });
    
  }
}
