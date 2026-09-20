async function routeLawyerProtect(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const target = players.find((x) => x.id === body.target);
      if (room.phase !== "day" || !me?.alive || me.role !== "lawyer" || !target?.alive) return out({ error: "INVALID_ACTION" }, 400);
      await persist(db.from("mafia_players").update({ action_target: target.id }).eq("room_code", code).eq("id", me.id));
      ({ room, players } = await load(code));
      return out(publicView(room, players, me.id));
    
  }
}
