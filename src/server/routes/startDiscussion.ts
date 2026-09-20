async function routeStartDiscussion(context:RoomRouteContext) {
  let {body, action, ip, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      if (room.phase !== "day") return out({ error: "INVALID_ACTION" }, 409);
      const settings = enabledRoles(room.enabled_roles);
      if (settings.discussion_mode === "off") return out({ error: "DISCUSSION_DISABLED" }, 409);
      if (room.enabled_roles?.discussion_state?.round === room.round) return out(publicView(room, players, me?.id, host));
      const now = Date.now();
      const speakers = players.filter((p) => p.alive && !p.is_bot);
      const boss = speakers.find((p) => p.role === "mafia_boss" && roleState(p).discussionClaim === true);
      const openingRounds = detectiveQuestionCount(room.detective_questions);
      const investigators = speakers.filter((p) => p.role === "detective");
      const prioritySpeakers = [...investigators, ...(boss ? [boss] : [])];
      const candidates = room.round <= openingRounds && prioritySpeakers.length ? prioritySpeakers : speakers;
      const starter = candidates.length ? randomItem(candidates) : undefined;
      const priority = room.round <= openingRounds ? prioritySpeakers : [];
      const opening = starter ? [starter, ...shuffle(priority.filter(p=>p.id!==starter.id))] : [];
      const openingIds = new Set(opening.map(p=>p.id));
      const remaining = speakers.filter(p=>!openingIds.has(p.id));
      for(let i=0;i<remaining.length-1;i++){const j=i+Math.floor(Math.random()*(remaining.length-i));[remaining[i],remaining[j]]=[remaining[j],remaining[i]];}
      const order = [...opening, ...remaining].map(p=>p.id);
      const roulette = settings.discussion_mode === "turns" && priority.length > 1 ? { candidates: shuffle(opening).map(p=>p.id), winner:starter.id, at:now, duration:6000 } : null;
      const choices = settings.discussion_mode === "turns" ? [15,30,45,60,90,120] : [30,60,120,180,300,600,900,1800,3600];
      const seconds = body.seconds === undefined ? (settings.discussion_mode === "turns" ? settings.speaker_seconds : settings.discussion_seconds) : Number(body.seconds);
      if (!choices.includes(seconds)) return out({ error: "INVALID_DURATION" }, 400);
      const speakingAt = now + (roulette?.duration || 0);
      const state = { id: crypto.randomUUID(), version: 0, round: room.round, mode: settings.discussion_mode, seconds, order, roulette, firstSpeakerId: starter?.id || order[0] || null, cursor: 0, turnStartedAt: speakingAt, endsAt: speakingAt + seconds * 1000, pausedAt: null, finished: false };
      const { error } = await db.from("mafia_rooms").update({ enabled_roles: { ...room.enabled_roles, discussion_state: state } }).eq("code", code).eq("phase", "day").eq("enabled_roles", JSON.stringify(room.enabled_roles));
      if (error) throw error;
      ({ room, players } = await load(code));
      return out(publicView(room, players, me?.id, host));
    
  }
}
