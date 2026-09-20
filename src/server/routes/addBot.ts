async function routeAddBot(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host || room.phase !== "lobby" || players.length >= 20) return out({ error: "INVALID_ACTION" }, 400);
      const kuwaitiNames = ['بدر','فهد','نواف','سالم','راشد','يوسف','عبدالله','مشاري','جاسم','حمد','خالد','فيصل','تركي','وليد','سعود','دانة','نورة','شيخة','مريم','حصة'];
      const requested = body.name ? cleanText(body.name,14) : '';
      const base = requested || kuwaitiNames.find(name => !players.some(p => p.name === name)) || 'لاعب';
      let count=1;
      let botName = base;
      while(players.some(p=>p.name.toLowerCase()===botName.toLowerCase())) botName = `${base} ${count++}`;
      const styles = ["skeptic", "quiet", "bold", "empathetic", "chaotic"];
      const style = styles[players.filter(p=>p.is_bot).length % styles.length];
      const bot = { room_code: code, id: crypto.randomUUID(), name: botName, is_bot: true, session_token: null, last_seen: new Date().toISOString(), role_state: { botStyle: style, botMemory: { suspicion: {}, claims: [], votes: [] } } };
      const { error } = await db.from("mafia_players").insert(bot);
      if (error) throw error;
      ({ room, players } = await load(code));
      return out(publicView(room, players, undefined, true));
    
  }
}
