async function routeClaimSeat(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const replacementCode = cleanText(body.replacementCode, 12).toUpperCase();
      const target = players.find((x) => x.replacement_code === replacementCode && (!x.replacement_expires_at || new Date(x.replacement_expires_at).getTime() > Date.now()));
      const name = cleanText(body.name, 20);
      if (!target || target.left_at || !name) return out({ error: "REPLACEMENT_NOT_FOUND" }, 404);
      if(players.some(p=>p.id!==target.id&&p.name.trim().toLowerCase()===name.toLowerCase()))return out({error:'NAME_TAKEN'},409);
      requestDatabase.getStore()!.plan=new TransitionPlan(room,players);
      const playerToken = crypto.randomUUID();
      const profileToken = cleanText(body.profileToken, 80) || crypto.randomUUID();
      await persist(db.from("mafia_players").update({ name, session_token: playerToken, profile_token: profileToken, replacement_code: null, replacement_expires_at: null, last_seen: new Date().toISOString() }).eq("room_code", code).eq("id", target.id));
      ({ room, players } = await load(code));
      await audit(code, action, "ok", started);
      return out({ ...publicView(room, players, target.id), playerToken, profileToken, playerId: target.id });
    
  }
}
