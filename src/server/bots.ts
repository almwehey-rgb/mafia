async function botNightActions(room: any, players: any[]) {
  const alive = players.filter((x) => x.alive);
  const settings = enabledRoles(room.enabled_roles);
  for (const bot of alive.filter((x) => x.is_bot && !x.action_target && (room.round === 1 || x.id !== room.jailed_player))) {
    if (room.round === 1 && bot.role !== "detective") continue;
    let target: string | null = null;
    const others = alive.filter((x) => x.id !== bot.id);
    if (mafiaRole(bot.role) && mafiaKillEnabledForRound(room) && !isMafiaLocked(room, players)) target = randomItem(others.filter((x) => !mafiaRole(x.role)))?.id || "SKIP";
    else if (bot.role === "revealer" && !roleState(bot).mafiaCountResult) target = "COUNT";
    else if (bot.role === "doctor" && doctorAvailable(room)) target = randomItem(alive.filter((x) => x.id !== room.doctor_last_target))?.id || null;
    else if (bot.role === "detective") target = shuffle([...others]).slice(0, detectiveLimit(room, players)).map((x) => x.id).join(",") || null;
    else if (["serial_killer", "escort"].includes(bot.role)) target = randomItem(others)?.id || null;
    else if (bot.role === "witch") {
      if (roleState(bot).poison !== false && others.length) target = `POISON:${randomItem(others).id}`;
      else if (roleState(bot).life !== false) target = `SAVE:${bot.id}`;
    }
    else if (bot.role === "cupid" && room.round === 2) target = shuffle([...others]).slice(0, 2).map((x) => x.id).join(",");
    else if (bot.role === "jailer" && room.jailed_player) target = "SPARE";
    if (target) await db.from("mafia_players").update({ action_target: target }).eq("room_code", room.code).eq("id", bot.id);
  }
}

async function botDayActions(room: any, players: any[]) {
  const alive = players.filter((x) => x.alive);
  const jailer = alive.find((x) => x.is_bot && x.role === "jailer");
  const lawyer = alive.find((x) => x.is_bot && x.role === "lawyer");
  if (jailer && !room.jailed_player) await db.from("mafia_rooms").update({ jailed_player: randomItem(alive.filter((x) => x.id !== jailer.id))?.id || null }).eq("code", room.code);
  if (lawyer && !lawyer.action_target) await db.from("mafia_players").update({ action_target: randomItem(alive)?.id || null }).eq("room_code", room.code).eq("id", lawyer.id);
}

async function botVotes(room: any, players: any[], verdict = false) {
  const alive = players.filter((x) => x.alive);
  for (const bot of alive.filter((x) => x.is_bot && !x.vote_target && (!verdict || x.id !== room.accused_player))) {
    const value = verdict ? (Math.random() < .55 ? "GUILTY" : "INNOCENT") : (randomItem(alive.filter((x) => x.id !== bot.id))?.id || "SKIP");
    await persist(db.from("mafia_players").update({ vote_target: value }).eq("room_code", room.code).eq("id", bot.id));
  }
}

