async function routeAdvanceVerdict(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host || room.phase !== "trial" || !room.accused_player) return out({ error: "INVALID_ACTION" }, 400);
      await persist(db.from("mafia_players").update({ vote_target: null }).eq("room_code", code));
      await persist(db.from("mafia_rooms").update({ phase: "verdict" }).eq("code", code));
      ({ room, players } = await load(code));
      await botVotes(room, players, true);
      ({ room, players } = await load(code));
      return out(publicView(room, players, undefined, true));
    
  }
}
