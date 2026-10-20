function openingDrawIndex(count: number) {
  // Reject the incomplete tail so every candidate owns exactly the same
  // number of possible values, including rooms with more than two claimants.
  const range = 0x100000000;
  const limit = Math.floor(range / count) * count;
  const sample = new Uint32Array(1);
  do { crypto.getRandomValues(sample); } while (sample[0] >= limit);
  return sample[0] % count;
}

async function routeStartDiscussion(context:RoomRouteContext) {
  let {body, action, ip, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      if (room.phase !== "day") return out({ error: "INVALID_ACTION" }, 409);
      const settings = enabledRoles(room.enabled_roles);
      if (settings.discussion_mode === "off") return out({ error: "DISCUSSION_DISABLED" }, 409);
      if (room.enabled_roles?.discussion_state?.round === room.round) return out(publicView(room, players, me?.id, host));
      // A bot leader opts in at the same first-discussion deadline as a human.
      // Persist the choice once, including games already waiting on their first day.
      if (settings.discussion_mode === "turns" && room.round === 1 && !room.enabled_roles?.discussion_state) {
        const botBoss = players.find((p) => p.alive && p.is_bot && p.role === "mafia_boss" && typeof roleState(p).discussionClaim !== "boolean");
        if (botBoss) {
          await patchRoleState(code, botBoss, { discussionClaim: true });
          ({ room, players } = await load(code));
          if (room.phase !== "day") return out({ error: "INVALID_ACTION" }, 409);
          if (room.enabled_roles?.discussion_state?.round === room.round) return out(publicView(room, players, me?.id, host));
        }
      }
      const now = Date.now();
      const alive = players.filter((p) => p.alive);
      const boss = alive.find((p) => p.role === "mafia_boss" && roleState(p).discussionClaim === true);
      const openingRounds = detectiveQuestionCount(room.detective_questions);
      const investigators = alive.filter((p) => p.role === "detective");
      const prioritySpeakers = [...investigators, ...(boss ? [boss] : [])];
      const priority = room.round <= openingRounds ? prioritySpeakers : [];
      // Give bot claimants their opening turns without adding idle turns for other bots.
      const speakers = alive.filter((p) => !p.is_bot || priority.includes(p));
      const candidates = priority.length ? priority : speakers;
      const starter = candidates.length ? (priority.length > 1 ? candidates[openingDrawIndex(candidates.length)] : randomItem(candidates)) : undefined;
      const opening = starter ? [starter, ...shuffle(priority.filter(p=>p.id!==starter.id))] : [];
      const openingIds = new Set(opening.map(p=>p.id));
      const remaining = speakers.filter(p=>!openingIds.has(p.id));
      for(let i=0;i<remaining.length-1;i++){const j=i+Math.floor(Math.random()*(remaining.length-i));[remaining[i],remaining[j]]=[remaining[j],remaining[i]];}
      const discussionOrder = [...opening, ...remaining].map(p=>p.id);
      // Public claimants get one closing reply each, after every regular turn.
      // Preserve their speaking order; never publish which claim is genuine.
      const claimantIds = new Set(prioritySpeakers.map(p=>p.id));
      const closingOrder = settings.discussion_mode === "turns"
        ? discussionOrder.filter(id=>claimantIds.has(id)) : [];
      const order = [...discussionOrder, ...closingOrder];
      const roulette = settings.discussion_mode === "turns" && priority.length > 1 ? { candidates: shuffle(opening).map(p=>p.id), winner:starter.id, at:now, duration:6000 } : null;
      const choices = settings.discussion_mode === "turns" ? [15,30,45,60,90,120] : [30,60,120,180,300,600,900,1800,3600];
      const seconds = body.seconds === undefined ? (settings.discussion_mode === "turns" ? settings.speaker_seconds : settings.discussion_seconds) : Number(body.seconds);
      if (!choices.includes(seconds)) return out({ error: "INVALID_DURATION" }, 400);
      const speakingAt = now + (roulette?.duration || 0);
      const state = { id: crypto.randomUUID(), version: 0, round: room.round, mode: settings.discussion_mode, seconds, order, turnSeconds: order.map(()=>seconds), turnKinds: order.map((_,i)=>i < discussionOrder.length ? 'normal' : 'closing'), roulette, firstSpeakerId: starter?.id || order[0] || null, cursor: 0, turnStartedAt: speakingAt, endsAt: speakingAt + seconds * 1000, pausedAt: null, finished: false, botLines: botDiscussionLines(room, players) };
      // Only the first request that still sees this round's original settings
      // can save a result. All callers reload that same authoritative draw.
      const { error } = await db.from("mafia_rooms").update({ enabled_roles: { ...room.enabled_roles, discussion_state: state } }).eq("code", code).eq("phase", "day").eq("round", room.round).eq("enabled_roles", JSON.stringify(room.enabled_roles));
      if (error) throw error;
      const botMessages = state.botLines.map((line:any) => ({ room_code: code, round: room.round, channel: "public", author_id: line.playerId, author_name: line.name, content: line.text }));
      if (botMessages.length) { const { error: botMessageError } = await db.from("mafia_messages").insert(botMessages); if (botMessageError) throw botMessageError; }
      ({ room, players } = await load(code));
      return out(publicView(room, players, me?.id, host));
    
  }
}
async function routeRequestDiscussionReply(context:RoomRouteContext) {
  const {body, code, room, players, me, host} = context;
  if (!me?.alive || me.is_bot) return out({error:'UNAUTHORIZED'},403);
  const view = discussionView(room);
  if (room.phase !== 'day' || view.mode !== 'turns' || view.status !== 'active') return out({error:'INVALID_ACTION'},409);
  const saved = room.enabled_roles.discussion_state;
  if (body.discussionId !== saved.id) return out({error:'STALE_TURN'},409);
  if (Date.now() < saved.turnStartedAt) return out({error:'DRAW_IN_PROGRESS'},409);
  // Closing statements stay last, and cannot be interrupted by new requests.
  const closingStarted = saved.turnKinds?.slice(0,view.index+1).includes('closing');
  if (closingStarted) return out({error:'REPLIES_CLOSED'},409);
  if (view.speakerId === me.id) return out({error:'ALREADY_SPEAKING'},409);
  if (saved.order.some((id:string,i:number)=>i>view.index && id===me.id && saved.turnKinds?.[i]==='reply')) return out({error:'REPLY_ALREADY_QUEUED'},409);
  const usage = {...room.enabled_roles.discussion_reply_usage};
  if ((usage[me.id] || 0) >= 2) return out({error:'NO_REPLIES_LEFT'},409);
  const order = [...saved.order];
  const turnSeconds = order.map((_,i)=>saved.turnSeconds?.[i] || saved.seconds);
  const turnKinds = order.map((_,i)=>saved.turnKinds?.[i] || 'normal');
  let insertAt = view.index + 1;
  while (turnKinds[insertAt] === 'reply') insertAt++;
  order.splice(insertAt,0,me.id);turnSeconds.splice(insertAt,0,15);turnKinds.splice(insertAt,0,'reply');
  usage[me.id] = (usage[me.id] || 0) + 1;
  const next = {...saved,order,turnSeconds,turnKinds,cursor:view.index,turnStartedAt:view.currentTurnStartedAt,version:saved.version+1};
  const {data:changed,error} = await db.from('mafia_rooms').update({enabled_roles:{...room.enabled_roles,discussion_state:next,discussion_reply_usage:usage}}).eq('code',code).eq('phase','day').eq('enabled_roles',JSON.stringify(room.enabled_roles)).select('code');
  if(error)throw error;
  if(!changed?.length)return out({error:'STALE_TURN'},409);
  const loaded = await load(code);
  return out(publicView(loaded.room,loaded.players,me.id,host));
}
