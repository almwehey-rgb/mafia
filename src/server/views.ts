function adminPlayerView(player: any) {
  const state = roleState(player);
  return { id: player.id, name: player.name, role: player.role, alive: player.alive,
    action: player.action_target || null, vote: player.vote_target || null,
    mafiaCountResult: state.mafiaCountResult || null,
    investigations: results(player), will: player.will_text || "",
    bullets: state.bullets, life: state.life, poison: state.poison,
    claim: state.discussionClaim, promoted: state.promotedBoss === true, leaderVote:state.leaderVote || null,
    warnings: state.warnings || [], elimination: state.elimination || null };
}
function publicView(room: any, players: any[], meId?: string, host = false) {
  observeRoom(room);
  const me = players.find((x) => x.id === (meId || (host ? room.host_player_id : undefined)));
  const lawyer = players.find((x) => x.alive && x.role === "lawyer");
  const jailer = players.find((x) => x.alive && x.role === "jailer");
  const limit = detectiveLimit(room, players);
  const locked = isMafiaLocked(room, players);
  const settings = enabledRoles(room.enabled_roles);
  const now = Date.now();
  const escortTarget = room.round === 1 ? null : players.find((x) => x.alive && x.role === "escort" && x.id !== room.jailed_player)?.action_target;
  const nightRoles = players.filter((x) => {
    if (room.round === 1) return x.alive && x.role === "detective";
    if (!x.alive || x.id === room.jailed_player || x.id === escortTarget) return false;
    if (mafiaRole(x.role)) return mafiaKillEnabledForRound(room) && !locked;
    if (x.role === "jailer") return players.some((p) => p.alive && p.id === room.jailed_player) && room.jailer_executions > 0;
    if (x.role === "vigilante") return false;
    if (x.role === "revealer") return !roleState(x).mafiaCountResult;
    if (x.role === "doctor") return doctorAvailable(room);
    if (x.role === "witch") return roleState(x).life !== false || roleState(x).poison !== false;
    if (x.role === "cupid") return room.round === 2 && selected(x).length < 2;
    return ["doctor", "detective", "serial_killer", "escort", "revealer"].includes(x.role);
  });
  const nightReady = nightRoles.every((x) => x.role === "detective" ? selected(x).length >= limit : x.role === "cupid" ? selected(x).length >= 2 : Boolean(x.action_target));
  return {
    code: room.code, phase: room.phase, round: room.round, lifecycleVersion: room.lifecycle_version || 0, matchId: room.match_id || null,
    canControl: host, hostPlayerId: room.host_player_id || null,
    phaseClock: { startedAt: new Date(room.phase_started_at).getTime(), pausedAt: room.enabled_roles?.pending_shot && room.phase !== "finished" ? (room.enabled_roles.pending_shot.startedAt || new Date(room.phase_started_at).getTime()) : room.phase_paused_at ? new Date(room.phase_paused_at).getTime() : null, seconds: phaseSeconds(room) },
    serverTime: now,
    discussion: discussionView(room, now),
    mafiaCount: room.mafia_count, detectiveCount: room.detective_count,
    detectiveQuestions: detectiveQuestionCount(room.detective_questions), jailerExecutions: room.jailer_executions,
    enabledRoles: { ...settings, mafia_kill_enabled: mafiaKillEnabledForRound(room) },
    lastEvent: room.last_event, lastDeaths: room.last_deaths || [],
    voteSummary: room.enabled_roles?.vote_summary || null,
    eliminations: (room.last_deaths || []).map((id: string) => { const p = players.find((x) => x.id === id); return { id, name: p?.name || "", reason: roleState(p || {}).elimination?.reason || "eliminated", detail: roleState(p || {}).elimination?.reason === "host_expelled" ? roleState(p || {}).elimination?.detail : undefined }; }),
    pendingShot: room.phase !== "finished" && room.enabled_roles?.pending_shot ? { id: room.enabled_roles.pending_shot.id, playerId: room.enabled_roles.pending_shot.playerId, resolving: room.enabled_roles.pending_shot.resolving === true, target: (host || me?.id === room.enabled_roles.pending_shot.playerId) ? room.enabled_roles.pending_shot.target : undefined } : null,
    lastEliminated: room.last_eliminated, lastSaved: room.last_saved, winner: room.winner,
    winnerPlayer: room.winner_player,
    accusedPlayer: room.accused_player,
    players: players.map((x) => ({
      id: x.id, name: x.name, alive: x.alive,
      isBot: x.is_bot === true,
      muted: host ? roleState(x).muted === true : undefined,
      warningCount: host ? (roleState(x).warnings || []).length : undefined,
      connected: now - new Date(x.last_seen).getTime() < 9000,
      role: (host && room.phase === "finished") || (!x.alive && settings.reveal_dead_roles) ? x.role : undefined,
      will: (room.phase === "finished" || !x.alive) && x.will_text ? x.will_text : undefined,
    })),
    me: me ? !me.alive ? { id: me.id, name: me.name, alive: false, role: me.role, isHost: host && room.host_player_id === me.id && room.enabled_roles?.controller_spectator === true } : {
      id: me.id, name: me.name, alive: me.alive, role: me.role,
      isHost: room.host_player_id === me.id,
      warnings: roleState(me).warnings || [],
      promotedBoss: me.role === "mafia_boss" && roleState(me).promotedBoss === true,
      discussionClaim: me.role === "mafia_boss" && roleState(me).discussionClaim === true,
      discussionChoiceMade: me.role === "mafia_boss" && typeof roleState(me).discussionClaim === "boolean",
      discussionChoiceLocked: typeof roleState(me).discussionClaim === "boolean" || room.round > 1 || Boolean(room.enabled_roles?.discussion_state),
      jailed: room.round !== 1 && room.jailed_player === me.id,
      jailerSelected: me.role === "jailer" ? room.jailed_player : undefined,
      jailedPlayer: me.role === "jailer" && room.jailed_player ? players.find((x) => x.id === room.jailed_player)?.name : undefined,
      executionsLeft: me.role === "jailer" ? room.jailer_executions : undefined,
      doctorLastTarget: me.role === "doctor" ? room.doctor_last_target : undefined,
      doctorAvailable: me.role === "doctor" ? doctorAvailable(room) : undefined,
      doctorProtectionRounds: me.role === "doctor" ? null : undefined,
      mafiaLocked: mafiaRole(me.role) ? locked : undefined,
      mafiaCountResult: me.role === "revealer" ? roleState(me).mafiaCountResult || null : undefined,
      investigationResults: me.role === "detective" ? results(me).filter((r: any) => r.round < room.round || !(room.phase === "night" || (room.phase === "paused" && settings.paused_phase === "night"))) : undefined,
      selectedIds: me.role === "detective" || me.role === "cupid" ? selected(me) : undefined,
      charges: ["vigilante", "witch"].includes(me.role) ? roleState(me) : undefined,
      questionsUsed: me.role === "detective" ? selected(me).length : undefined,
      questionLimit: me.role === "detective" ? limit : undefined,
      mafiaTeam: mafiaRole(me.role) ? players.filter((x) => mafiaRole(x.role)).map((x) => ({ id: x.id, name: x.name, role: x.role })) : undefined,
      leaderElection: mafiaRole(me.role) && room.enabled_roles?.leader_election?.pending === true,
      leaderVote: mafiaRole(me.role) ? (room.enabled_roles?.leader_election?.former ? room.enabled_roles.leader_election.votes?.[me.id] : roleState(me).leaderVote) || null : undefined,
      leaderFormer: mafiaRole(me.role) ? room.enabled_roles?.leader_election?.former : undefined,
      leaderDeadline: mafiaRole(me.role) ? room.enabled_roles?.leader_election?.deadline : undefined,
      acted: me.role === "detective" ? selected(me).length >= limit : me.role === "cupid" ? selected(me).length >= 2 : Boolean(me.action_target),
      voted: Boolean(me.vote_target),
      voteTarget: me.vote_target || null,
      acknowledged: roleState(me).ack === true,
      willText: me.will_text || "",
      muted: roleState(me).muted === true,
    } : undefined,
    nightReady: host ? nightReady : undefined,
    lawyerReady: host ? !lawyer || Boolean(lawyer.action_target) : undefined,
    jailerReady: host ? !jailer || Boolean(room.jailed_player) : undefined,
    voteCount: players.filter((x) => x.alive && x.vote_target).length,
    roleReadyCount: players.filter((x) => roleState(x).ack === true).length,
  };
}
