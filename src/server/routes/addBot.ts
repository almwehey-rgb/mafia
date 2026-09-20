async function routeAddBot(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host || room.phase !== "lobby" || players.length >= 20) return out({ error: "INVALID_ACTION" }, 400);
      const base=body.name ? cleanText(body.name,14) : 'BOT';
      let count=1;while(players.some(p=>p.name.toLowerCase()===`${base} ${count}`.toLowerCase()))count++;
      const styles = ["skeptic", "quiet", "bold", "empathetic", "chaotic"];
      const style = styles[(count - 1) % styles.length];
      const bot = { room_code: code, id: crypto.randomUUID(), name: `${base} ${count}`, is_bot: true, session_token: null, last_seen: new Date().toISOString(), role_state: { botStyle: style, botMemory: { suspicion: {}, claims: [], votes: [] } } };
      const { error } = await db.from("mafia_players").insert(bot);
      if (error) throw error;
      ({ room, players } = await load(code));
      return out(publicView(room, players, undefined, true));
    
  }
}
