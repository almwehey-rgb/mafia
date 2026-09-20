async function routeJoinSpectator(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const name = cleanText(body.name, 20);
      if (!name) return out({ error: "NAME_REQUIRED" }, 400);
      const id = cleanText(body.id, 80) || crypto.randomUUID();
      const spectatorToken = crypto.randomUUID();
      await persist(db.from("mafia_spectators").upsert({ room_code: code, id, name, session_token: spectatorToken, last_seen: new Date().toISOString() }));
      await audit(code, action, "ok", started);
      return out({ ...publicView(room, players), spectator: { id, name }, spectatorToken });
    
  }
}
