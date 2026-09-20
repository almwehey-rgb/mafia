async function routeResolveNight(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      if (room.phase !== "night") return out({ error: "INVALID_ACTION" }, 409);
      if (!publicView(room, players, undefined, true).nightReady && !phaseExpired(room)) return out({ error: "WAITING_ACTIONS" }, 409);
      await snapshot(room, players, "before_night_result");
      const events: string[] = [], deaths: string[] = [];
      const causes: Record<string, string> = {};
      const locked = isMafiaLocked(room, players);
      const mafiaKillEnabled = mafiaKillEnabledForRound(room);
      const mafiaKillStartRound = enabledRoles(room.enabled_roles).mafia_kill_start_round;
      const escort = players.find((x) => x.alive && x.role === "escort" && x.id !== room.jailed_player);
      const blockedId = room.round === 1 ? null : escort?.action_target || null;
      const canAct = (player: any) => player?.alive && (room.round === 1 ? player.role === "detective" : player.id !== room.jailed_player && player.id !== blockedId);
      // Resolve investigations only after all role blocks have been finalized.
      for (const detective of players.filter((p) => p.alive && p.role === "detective")) {
        const history = results(detective).filter((r: any) => r.round !== room.round);
        if (canAct(detective)) for (const id of selected(detective).slice(0, detectiveLimit(room, players))) {
          const target = players.find((p) => p.id === id);
          if (target) history.push({ round: room.round, name: target.name, result: target.role === "mafia" || (target.role === "mafia_boss" && !enabledRoles(room.enabled_roles).godfather_innocent) ? "مافيا" : "بريء" });
        }
        const {error} = await db.from("mafia_players").update({ investigation_result: JSON.stringify(history) }).eq("room_code",code).eq("id",detective.id);
        if (error) throw error;
      }
      if (blockedId) events.push("escort_blocked");
      const activeMafia = players.filter((x) => mafiaRole(x.role) && canAct(x));
      const bossChoice = activeMafia.find((x) => x.role === "mafia_boss")?.action_target;
      const factionChoice = !mafiaKillEnabled ? "DISABLED" : locked ? "LOCKED" : (bossChoice || plurality(activeMafia.map((x) => x.action_target)));
      const doctor = players.find((x) => x.role === "doctor" && canAct(x));
      const doctorTarget = doctorAvailable(room) ? doctor?.action_target : null;
      const witch = players.find((x) => x.role === "witch" && canAct(x));
      const [requestedPotion, requestedTarget] = String(witch?.action_target || "").split(":");
      const potionAvailable = witch && ((requestedPotion === "SAVE" && roleState(witch).life !== false)
        || (requestedPotion === "POISON" && roleState(witch).poison !== false && requestedTarget !== witch.id));
      const validPotion = potionAvailable && players.some(p => p.id === requestedTarget && p.alive);
      const witchKind = validPotion ? requestedPotion : "";
      const witchTarget = validPotion ? requestedTarget : "";
      const protectedIds = new Set([doctorTarget, room.jailed_player, witchKind === "SAVE" ? witchTarget : null].filter(Boolean));
      const victim = players.find((x) => x.id === factionChoice && x.alive);
      if (room.round === 1) events.push("detective_only_night");
      else if (!mafiaKillEnabled) events.push(mafiaKillStartRound > Number(room.round) ? "mafia_delayed" : "mafia_disabled");
      else if (locked) events.push("mafia_locked");
      else if (!factionChoice || factionChoice === "SKIP") events.push("mafia_skipped");
      const attacks = [
        victim ? { id: victim.id, event: "mafia_kill" } : null,
        ...players.filter((x) => x.role === "serial_killer" && canAct(x) && x.action_target).map((x) => ({ id: x.action_target, event: "serial_kill" })),
        witchKind === "POISON" && witchTarget ? { id: witchTarget, event: "witch_poison" } : null,
      ].filter(Boolean) as { id: string; event: string }[];
      for (const attack of attacks) {
        if (protectedIds.has(attack.id)) {
          if (attack.id === room.jailed_player) events.push("jail_saved");
          else if (witchKind === "SAVE" && attack.id === witchTarget) events.push("witch_saved");
          else events.push("doctor_saved");
        } else if (!deaths.includes(attack.id) && players.some((x) => x.id === attack.id && x.alive)) {
          deaths.push(attack.id); causes[attack.id] = attack.event; events.push(attack.event);
        }
      }
      const jailer = players.find((x) => x.alive && x.role === "jailer");
      const prisoner = players.find((x) => x.alive && x.id === room.jailed_player);
      let executions = room.jailer_executions;
      if (canAct(jailer) && jailer?.action_target === "EXECUTE" && prisoner && executions > 0 && !deaths.includes(prisoner.id)) { deaths.push(prisoner.id); causes[prisoner.id] = "jailer_executed"; executions -= 1; events.push("jailer_executed"); }
      let linkedPlayers: string[] = Array.isArray(room.linked_players) ? room.linked_players : [];
      const cupid = players.find((x) => x.role === "cupid" && canAct(x));
      if (room.round === 2 && cupid && selected(cupid).length === 2) linkedPlayers = selected(cupid);
      if (linkedPlayers.length === 2 && linkedPlayers.some((id) => deaths.includes(id))) {
        for (const id of linkedPlayers) if (!deaths.includes(id) && players.some((x) => x.id === id && x.alive)) { deaths.push(id); causes[id] = "lovers_died"; }
        events.push("lovers_died");
      }
      if (witch?.action_target && ["SAVE", "POISON"].includes(witchKind)) {
        witch.role_state = { ...roleState(witch), [witchKind === "SAVE" ? "life" : "poison"]: false };
        await persist(db.from("mafia_players").update({ role_state: witch.role_state }).eq("room_code", code).eq("id", witch.id));
      }
      for (const revealer of players.filter(p => p.role === "revealer" && !roleState(p).mafiaCountResult && canAct(p) && p.action_target === "COUNT" && !deaths.includes(p.id))) {
        const mafiaCountResult = { round: room.round, count: players.filter(p => p.alive && mafiaRole(p.role) && !deaths.includes(p.id)).length };
        const { error } = await db.from("mafia_players").update({ role_state: { ...roleState(revealer), mafiaCountResult } }).eq("room_code",code).eq("id",revealer.id);
        if (error) throw error;
      }
      await eliminatePlayers(room, players, causes);
      await persist(db.from("mafia_players").update({ action_target: null, vote_target: null }).eq("room_code", code));
      await persist(db.from("mafia_rooms").update({ phase: "day", jailed_player: null, jailer_executions: executions, doctor_last_target: doctorTarget || null, linked_players: linkedPlayers, last_event: events.join(","), last_deaths: deaths, last_eliminated: deaths[0] || null, last_saved: events.some((x) => x.endsWith("saved")) }).eq("code", code));
      await prepareLastShot(code, causes, "day", room.round);
      await promoteMafia(code);
      const nightWinner = await checkWin(code);
      ({ room, players } = await load(code));
      if (!nightWinner && !room.enabled_roles?.pending_shot) {
        await botDayActions(room, players);
        ({ room, players } = await load(code));
      }
      return out(publicView(room, players, undefined, true));
    
  }
}
