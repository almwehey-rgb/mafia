async function routeVote(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const target = players.find((x) => x.id === body.target);
      const nomination = ["nomination", "vote"].includes(room.phase);
      const verdict = room.phase === "verdict";
      const skip = body.target === "SKIP" && enabledRoles(room.enabled_roles).allow_no_vote;
      const verdictChoice = ["GUILTY", "INNOCENT"].includes(body.target);
      if (!me?.alive || (!nomination && !verdict) || (nomination && !skip && (!target?.alive || target.id === me.id)) || (verdict && (!verdictChoice || me.id === room.accused_player))) return out({ error: "INVALID_VOTE" }, 400);
      await persist(db.from("mafia_players").update({ vote_target: verdict ? body.target : skip ? "SKIP" : target!.id }).eq("room_code", code).eq("id", me.id));
      ({ room, players } = await load(code));
      return out(publicView(room, players, me.id));
    
  }
}
