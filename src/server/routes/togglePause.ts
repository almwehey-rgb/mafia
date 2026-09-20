async function routeTogglePause(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host || ["lobby", "finished"].includes(room.phase)) return out({ error: "INVALID_ACTION" }, 400);
      const settings = enabledRoles(room.enabled_roles);
      const nextPhase = room.phase === "paused" ? settings.paused_phase || "night" : "paused";
      const discussion = room.enabled_roles?.discussion_state;
      let nextDiscussion = discussion;
      if (discussion && discussion.round === room.round && !discussion.finished) {
        if (room.phase === "paused" && discussion.pausedAt && !discussion.manualPaused) {
          const pauseMs = Date.now() - discussion.pausedAt;
          nextDiscussion = { ...discussion, roulette:discussion.roulette?{...discussion.roulette,at:discussion.roulette.at+pauseMs}:null, pausedAt: null, turnStartedAt: discussion.turnStartedAt + pauseMs, endsAt: discussion.endsAt + pauseMs, version: discussion.version + 1 };
        } else if (room.phase === "day" && !discussion.pausedAt) nextDiscussion = { ...discussion, pausedAt: Date.now(), version: discussion.version + 1 };
      }
      const nextSettings = { ...room.enabled_roles, ...settings, paused_phase: room.phase === "paused" ? null : room.phase, discussion_state: nextDiscussion };
      await persist(db.from("mafia_rooms").update({ phase: nextPhase, enabled_roles: nextSettings }).eq("code", code));
      ({ room, players } = await load(code));
      return out(publicView(room, players, undefined, true));
    
  }
}
