async function routeStartVote(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      if (room.phase !== "day") return out({ error: "INVALID_ACTION" }, 409);
      if (!discussionView(room).complete) return out({ error: "WAITING_DISCUSSION" }, 409);
      const lawyer = players.find((x) => x.alive && x.role === "lawyer"), jailer = players.find((x) => x.alive && x.role === "jailer");
      if (lawyer && !lawyer.action_target && !phaseExpired(room)) return out({ error: "WAITING_LAWYER" }, 409);
      if (jailer && !room.jailed_player && !phaseExpired(room)) return out({ error: "WAITING_JAILER" }, 409);
      await persist(db.from("mafia_players").update({ vote_target: null }).eq("room_code", code));
      const phase = enabledRoles(room.enabled_roles).full_trial ? "nomination" : "vote";
      await persist(db.from("mafia_rooms").update({ phase, accused_player: null }).eq("code", code));
      ({ room, players } = await load(code));
      await botVotes(room, players);
      ({ room, players } = await load(code));
      return out(publicView(room, players, undefined, true));
    
  }
}
