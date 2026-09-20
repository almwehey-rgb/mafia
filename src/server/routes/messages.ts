async function routeMessages(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const publicDay = Boolean(me?.alive && room.phase === "day");
      if (publicDay) {
        if (action === "sendMessage") {
          if (roleState(me).muted === true) return out({ error: "MUTED" }, 403);
          const content = cleanText(body.text, 240);
          if (!content) return out({ error: "MESSAGE_REQUIRED" }, 400);
          const { data: latest } = await db.from("mafia_messages").select("created_at").eq("room_code", code).eq("author_id", me.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (latest && Date.now() - new Date(latest.created_at).getTime() < 700) return out({ error: "RATE_LIMITED" }, 429);
          const { error: insertError } = await db.from("mafia_messages").insert({ room_code: code, round: room.round, channel: "public", author_id: me.id, author_name: me.name, content });
          if (insertError) throw insertError;
          await rememberPublicMessage(room, players, me, content);
        }
        const beforeId = typeof body.beforeId === "string" ? body.beforeId : null;
        let query = db.from("mafia_messages").select("id,author_id,author_name,content,created_at").eq("room_code", code).eq("round", room.round).eq("channel", "public");
        if (beforeId) { if (!/^[1-9][0-9]{0,18}$/.test(beforeId)) return out({error:"INVALID_CURSOR"},400); query=query.lt("id",beforeId); }
        const { data, error: messagesError } = await query.order("id",{ascending:false}).limit(81);
        if (messagesError) throw messagesError;
        const page=(data||[]).slice(0,80);
        return out({ channel: "public", hasMore:(data||[]).length>80, nextCursor:page.length?String(page.at(-1).id):null, messages: page.reverse() });
      }
      if (!me?.alive || !(room.phase === "night" || (room.phase === "paused" && room.enabled_roles?.paused_phase === "night"))) return out({ error: "INVALID_ACTION" }, 400);
      const jailAccess = (me.role === "jailer" || me.id === room.jailed_player) && Boolean(room.jailed_player);
      const channel = jailAccess ? "jail" : mafiaRole(me.role) ? "mafia" : null;
      if (!channel) return out({ error: "UNAUTHORIZED" }, 403);
      if (action === "sendMessage") {
        if (roleState(me).muted === true) return out({ error: "MUTED" }, 403);
        const content = cleanText(body.text, 240);
        if (!content) return out({ error: "MESSAGE_REQUIRED" }, 400);
        const { data: latest } = await db.from("mafia_messages").select("created_at").eq("room_code", code).eq("author_id", me.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (latest && Date.now() - new Date(latest.created_at).getTime() < 700) return out({ error: "RATE_LIMITED" }, 429);
        const { error: insertError } = await db.from("mafia_messages").insert({ room_code: code, round: room.round, channel, author_id: me.id, author_name: channel === "jail" && me.role !== "jailer" ? "السجين" : me.name, content });
        if (insertError) throw insertError;
      }
      const beforeId = typeof body.beforeId === "string" ? body.beforeId : null;
      let query = db.from("mafia_messages").select("id,author_id,author_name,content,created_at").eq("room_code", code).eq("round", room.round).eq("channel", channel);
      if (beforeId) {
        if (!/^[1-9][0-9]{0,18}$/.test(beforeId)) return out({error:"INVALID_CURSOR"},400);
        query=query.lt("id",beforeId);
      }
      const { data, error: messagesError } = await query.order("id",{ascending:false}).limit(81);
      if (messagesError) throw messagesError;
      const page=(data||[]).slice(0,80);
      return out({ channel, hasMore:(data||[]).length>80, nextCursor:page.length?String(page.at(-1).id):null, messages: page.reverse().map((message) => channel === "jail" ? { ...message, author_id: undefined, author_name: message.author_id === room.jailed_player ? "السجين" : "السجّان" } : message) });
    
  }
}
