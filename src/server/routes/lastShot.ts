async function routeLastShot(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const pending = room.enabled_roles?.pending_shot;
      const shooter = pending && players.find((p) => p.id === pending.playerId);
      const skip = body.target === "SKIP";
      const recovering = pending?.resolving && pending.target === body.target && Date.now() - pending.resolvingAt >= 15000;
      if (!pending || room.phase === "finished" || body.shotId !== pending.id || !shooter || shooter.alive || shooter.role !== "vigilante" || (Number(roleState(shooter).bullets) <= 0 && !recovering)) return out({ error: "INVALID_ACTION" }, 409);
      if (me?.id !== shooter.id && !(host && (skip || shooter.is_bot || recovering))) return out({ error: "UNAUTHORIZED" }, 403);
      const target = players.find((p) => p.id === body.target && (p.alive || recovering));
      if (!skip && !target) return out({ error: "INVALID_ACTION" }, 400);
      if (pending.resolving && !recovering) return out({ error: "STALE_ACTION" }, 409);
      const lockedSettings = { ...room.enabled_roles, pending_shot: { ...pending, resolving: true, target: body.target, resolvingAt: Date.now() } };
      const { data: locked, error } = await db.from("mafia_rooms").update({ enabled_roles: lockedSettings }).eq("code", code).eq("enabled_roles", JSON.stringify(room.enabled_roles)).select("code");
      if (error) throw error;
      if (!locked?.length) return out({ error: "STALE_ACTION" }, 409);
      const causes: Record<string, string> = {};
      if (target) {
        causes[target.id] = "vigilante_kill";
        if ((room.linked_players || []).includes(target.id)) for (const id of room.linked_players) if (id !== target.id && players.some((p) => p.id === id && p.alive)) causes[id] = "lovers_died";
        await eliminatePlayers(room, players, causes);
      }
      const spent = await db.from("mafia_players").update({ role_state: { ...roleState(shooter), bullets: 0 } }).eq("room_code", code).eq("id", shooter.id);
      if (spent.error) throw spent.error;
      const completed = await db.from("mafia_rooms").update({ enabled_roles: { ...lockedSettings, pending_shot: null }, phase: pending.nextPhase, round: pending.nextRound, phase_started_at: new Date(Date.now()).toISOString(), phase_paused_at: null, last_deaths: [...new Set([...(room.last_deaths || []), ...Object.keys(causes)])], last_event: [room.last_event, skip ? "vigilante_skipped" : "vigilante_kill"].filter(Boolean).join(",") }).eq("code", code);
      if (completed.error) throw completed.error;
      await promoteMafia(code);
      const winner = await checkWin(code);
      ({ room, players } = await load(code));
      if (!winner) { if (room.phase === "night") await botNightActions(room, players); else if (room.phase === "day") await botDayActions(room, players); ({ room, players } = await load(code)); }
      return out(publicView(room, players, me?.id, host));
    
  }
}
