async function routeJail(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const target = players.find((x) => x.id === body.target);
      if (room.phase !== "day" || !me?.alive || me.role !== "jailer" || !target?.alive || target.id === me.id) return out({ error: "INVALID_ACTION" }, 400);
      await persist(db.from("mafia_rooms").update({ jailed_player: target.id }).eq("code", code));
      ({ room, players } = await load(code));
      return out(publicView(room, players, me.id));
    
  }
}
