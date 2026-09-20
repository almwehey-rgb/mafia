async function routeWarnPlayer(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      if (["lobby", "finished"].includes(room.phase)) return out({ error: "INVALID_ACTION" }, 409);
      const target = players.find((p) => p.id === body.target && p.alive);
      if (!target) return out({ error: "PLAYER_NOT_FOUND" }, 404);
      if (room.enabled_roles?.pending_shot?.resolving) return out({ error: "WAITING_LAST_SHOT" }, 409);
      const reason = cleanText(body.reason, 160);
      if (!reason) return out({ error: "REASON_REQUIRED" }, 400);
      const state = roleState(target);
      const warning = { id: crypto.randomUUID(), reason, round: room.round, at: Date.now() };
      const patch = action === "warnPlayer"
        ? { role_state: { ...state, warnings: [...(state.warnings || []), warning].slice(-20) } }
        : { alive: false, action_target: null, vote_target: null, role_state: { ...state, ack: true, elimination: { reason: "host_expelled", detail: reason, round: room.round, at: Date.now() } } };
      let change = db.from("mafia_players").update(patch).eq("room_code", code).eq("id", target.id).eq("alive", true);
      change = target.role_state == null ? change.is("role_state", null) : change.eq("role_state", JSON.stringify(target.role_state));
      const { data: changed, error } = await change.select("id");
      if (error) throw error;
      if (!changed?.length) return out({ error: "STALE_ACTION" }, 409);
      if (action === "expelPlayer") {
        ({ room, players } = await load(code));
        // Clear votes and actions aimed at the removed player so nobody waits on them.
        for (const player of players.filter((p) => p.alive)) {
          const update: Record<string, any> = {};
          if (player.vote_target === target.id) update.vote_target = null;
          if (player.action_target && String(player.action_target).split(/[,:]/).includes(target.id)) update.action_target = player.role==='detective'
            ? String(player.action_target).split(',').map(id=>id===target.id?'SKIP':id).join(',') : null;
          if (Object.keys(update).length) await db.from("mafia_players").update(update).eq("room_code", code).eq("id", player.id);
        }
        const settings = { ...room.enabled_roles };
        const saved = settings.discussion_state;
        if (saved?.round === room.round && saved.order.includes(target.id)) {
          const view = discussionView(room);
          const removed = saved.order.indexOf(target.id);
          const order = saved.order.filter((id: string) => id !== target.id);
          const cursor = Math.max(0, view.index - (removed < view.index ? 1 : 0));
          const at = saved.pausedAt || Date.now();
          settings.discussion_state = { ...saved, order, cursor, version: saved.version + 1, turnStartedAt: removed === view.index ? at : saved.turnStartedAt + (view.index - saved.cursor) * saved.seconds * 1000, finished: saved.finished || (saved.mode === "turns" && cursor >= order.length) };
        }
        const activePhase = room.phase === "paused" ? settings.paused_phase : room.phase;
        const skipTrial = room.accused_player === target.id && ["trial", "verdict"].includes(activePhase);
        const roomPatch: Record<string, any> = { enabled_roles: settings, last_event: "host_expelled", last_deaths: [...new Set([...(room.last_deaths || []), target.id])], last_eliminated: target.id, jailed_player: room.jailed_player === target.id ? null : room.jailed_player, host_player_id: room.host_player_id === target.id ? null : room.host_player_id, linked_players: (room.linked_players || []).includes(target.id) ? [] : room.linked_players };
        if (skipTrial) {
          roomPatch.accused_player = null;
          roomPatch.round = room.round + 1;
          if (room.phase === "paused") { settings.paused_phase = "night"; roomPatch.phase_started_at = new Date(Date.now()).toISOString(); roomPatch.phase_paused_at = new Date(Date.now()).toISOString(); }
          else roomPatch.phase = "night";
          await persist(db.from("mafia_players").update({ vote_target: null, action_target: null }).eq("room_code", code));
        }
        const updated = await db.from("mafia_rooms").update(roomPatch).eq("code", code);
        if (updated.error) throw updated.error;
        await promoteMafia(code);
        const winner = await checkWin(code);
        ({ room, players } = await load(code));
        if (!winner && skipTrial && !room.enabled_roles?.pending_shot) await botNightActions(room, players);
      }
      await audit(code, action, "ok", started);
      ({ room, players } = await load(code));
      return out(publicView(room, players, me?.id, host));
    
  }
}
