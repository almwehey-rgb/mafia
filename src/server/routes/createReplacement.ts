async function routeCreateReplacement(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      const target = players.find((x) => x.id === body.target && !x.is_bot);
      if (!target) return out({ error: "PLAYER_NOT_FOUND" }, 404);
      const replacementCode = shortCode(6);
      await persist(db.from("mafia_players").update({ replacement_code: replacementCode, replacement_expires_at: new Date(Date.now() + 15 * 60_000).toISOString() }).eq("room_code", code).eq("id", target.id));
      await audit(code, action, "ok", started);
      return out({ replacementCode, target: { id: target.id, name: target.name }, expiresMinutes: 15 });
    
  }
}
