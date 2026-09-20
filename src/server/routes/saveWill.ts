async function routeSaveWill(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!me?.alive) return out({ error: "UNAUTHORIZED" }, 403);
      await persist(db.from("mafia_players").update({ will_text: cleanText(body.text, 500) }).eq("room_code", code).eq("id", me.id));
      ({ room, players } = await load(code));
      return out(publicView(room, players, me.id));
    
  }
}
