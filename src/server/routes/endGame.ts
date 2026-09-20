async function routeEndGame(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host || ["lobby", "finished"].includes(room.phase)) return out({ error: "INVALID_ACTION" }, 400);
      await snapshot(room, players, "before_host_end");
      await persist(db.from("mafia_rooms").update({ phase: "finished", winner: "cancelled", winner_player: null, last_event: "host_ended" }).eq("code", code));
      ({ room, players } = await load(code));
      return out(publicView(room, players, undefined, true));
    
  }
}
