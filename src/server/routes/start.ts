async function routeStart(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      players = players.filter((p) => !p.left_at);
      if (action === "restart" ? ["lobby", "finished"].includes(room.phase) : !["lobby", "finished"].includes(room.phase)) return out({ error: "INVALID_ACTION" }, 400);
      if (players.length < 2) return out({ error: "NEED_2_PLAYERS" }, 400);
      if (players.length > 20) return out({ error: "ROOM_FULL" }, 409);
      if (!Number.isSafeInteger(body.lifecycleVersion) || body.lifecycleVersion !== (room.lifecycle_version || 0)) return out({ error: "STALE_GAME" }, 409);
      for (const key of ["mafiaCount", "detectiveCount"]) {
        if (body[key] != null && (!Number.isInteger(body[key]) || body[key] < (key === "mafiaCount" ? 1 : 0) || body[key] > 20)) return out({ error: "INVALID_SETTINGS" }, 400);
      }
      let selectedRoles = { ...enabledRoles(body.enabledRoles || room.enabled_roles || defaultEnabledRoles), admin_access:room.enabled_roles?.admin_access || null };
      if (selectedRoles.kids_mode) selectedRoles = { ...selectedRoles, doctor: players.length >= 5, detective: players.length >= 4, lawyer: false, jailer: false, vigilante: false, witch: false, serial_killer: false, jester: false, cupid: false, revealer: false, escort: false, reveal_dead_roles: true, allow_no_vote: true, full_trial: false, godfather_innocent: false };
      const requestedMafia = selectedRoles.kids_mode ? Math.min(2, Math.max(1, Math.round(players.length / 4))) : Math.max(1, Number(body.mafiaCount) || room.mafia_count);
      const mafiaCount = players.length < 4 ? 1 : Math.min(Math.floor((players.length - 1) / 2), requestedMafia);
      const doctor = selectedRoles.doctor && players.length >= 4 ? 1 : 0;
      const lawyer = selectedRoles.lawyer && players.length >= 5 ? 1 : 0;
      const jailer = selectedRoles.jailer && players.length >= 6 ? 1 : 0;
      const vigilante = selectedRoles.vigilante ? 1 : 0;
      const witch = selectedRoles.witch ? 1 : 0;
      const serialKiller = selectedRoles.serial_killer ? 1 : 0;
      const jester = selectedRoles.jester ? 1 : 0;
      const cupid = selectedRoles.cupid ? 1 : 0;
      const escort = selectedRoles.escort ? 1 : 0;
      const revealer = selectedRoles.revealer ? 1 : 0;
      const fixed = doctor + lawyer + jailer + vigilante + witch + serialKiller + jester + cupid + escort + revealer;
      const maxDetectives = players.length < 3 ? 0 : Math.min(8, Math.max(0, players.length - mafiaCount - fixed));
      const detectiveCount = selectedRoles.detective ? Math.min(maxDetectives, Math.max(0, Number.isFinite(+body.detectiveCount) ? +body.detectiveCount : room.detective_count)) : 0;
      const detectiveQuestions = detectiveQuestionCount(body.detectiveQuestions ?? room.detective_questions);
      const totalRoles = mafiaCount + fixed + detectiveCount;
      if (totalRoles > players.length) return out({ error: "TOO_MANY_ROLES" }, 400);
      const roles = shuffle(["mafia_boss", ...Array(Math.max(0, mafiaCount - 1)).fill("mafia"), ...Array(doctor).fill("doctor"), ...Array(lawyer).fill("lawyer"), ...Array(jailer).fill("jailer"), ...Array(vigilante).fill("vigilante"), ...Array(witch).fill("witch"), ...Array(serialKiller).fill("serial_killer"), ...Array(jester).fill("jester"), ...Array(cupid).fill("cupid"), ...Array(escort).fill("escort"), ...Array(revealer).fill("revealer"), ...Array(detectiveCount).fill("detective"), ...Array(players.length - totalRoles).fill("citizen")]);
      (selectedRoles as any).leader_election = null;
      const assignments = players.map((player, i) => {
        const ack = player.is_bot === true;
        const state = roles[i] === "vigilante" ? { bullets: 1, ack } : roles[i] === "witch" ? { life: true, poison: true, ack } : { ack };
        return { id: player.id, role: roles[i], state };
      });
      const { data: transition, error } = await db.rpc(action === "restart" ? "mafia_restart_match" : "mafia_start_match", {
        p_code: code, p_version: body.lifecycleVersion, p_host_token: body.hostToken || null,
        p_player_id: body.id || null, p_player_token: body.playerToken || null,
        p_assignments: assignments, p_settings: selectedRoles,
        p_mafia: mafiaCount, p_detectives: detectiveCount, p_questions: detectiveQuestions,
      });
      if (error) throw error;
      if (transition?.error) return out({ error: transition.error }, transition.error === "UNAUTHORIZED" ? 403 : 409);
      if (transition?.ok !== true) throw new Error("START_FAILED");
      ({ room, players } = await load(code));
      return out(publicView(room, players, undefined, true));
    
  }
}
