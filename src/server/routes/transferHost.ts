async function routeTransferHost(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      const target = players.find((x) => x.id === body.target && !x.is_bot && !x.left_at);
      if (!target) return out({ error: "PLAYER_NOT_FOUND" }, 404);
      await persist(db.from("mafia_rooms").update({ host_player_id: target.id, enabled_roles:{...room.enabled_roles,controller_spectator:!target.alive} }).eq("code", code));
      ({ room, players } = await load(code));
      await audit(code, action, "ok", started);
      return out(publicView(room, players, me?.id, true));
    
  }
}
