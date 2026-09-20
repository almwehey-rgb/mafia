async function eliminatePlayers(room: any, players: any[], causes: Record<string, string>) {
  for (const [id, reason] of Object.entries(causes)) {
    const player = players.find((p) => p.id === id);
    if (!player) continue;
    const { error } = await db.from("mafia_players").update({ alive: false, role_state: { ...roleState(player), elimination: { reason, round: room.round, at: Date.now() } } }).eq("room_code", room.code).eq("id", id);
    if (error) throw error;
  }
}
async function prepareLastShot(code: string, causes: Record<string, string>, nextPhase: string, nextRound: number) {
  const { room, players } = await load(code);
  const shooter = players.find((p) => !p.alive && p.role === "vigilante" && Number(roleState(p).bullets) > 0 && ["mafia_kill", "vote_eliminated", "trial_guilty"].includes(causes[p.id]));
  if (!shooter || !players.some((p) => p.alive)) return;
  const pending = { id: crypto.randomUUID(), playerId: shooter.id, nextPhase, nextRound, startedAt: Date.now() };
  const { error } = await db.from("mafia_rooms").update({ enabled_roles: { ...room.enabled_roles, pending_shot: pending } }).eq("code", code);
  if (error) throw error;
}
async function promoteMafia(code: string) {
  const { players } = await load(code);
  if (players.some((x) => x.alive && x.role === "mafia_boss")) return;
  const predecessor = players.filter((p) => p.role === "mafia_boss").sort((a,b) => (roleState(b).elimination?.at || 0) - (roleState(a).elimination?.at || 0))[0];
  const index = predecessor ? players.indexOf(predecessor) : -1;
  const ordered = [...players.slice(index + 1), ...players.slice(0, index + 1)];
  const successor = ordered.find((x) => x.alive && x.role === "mafia");
  if (successor) await db.from("mafia_players").update({ role: "mafia_boss", role_state: { ...roleState(successor), promotedBoss: true } }).eq("room_code", code).eq("id", successor.id).eq("role", "mafia").eq("alive", true);
}
async function checkWin(code: string) {
  const { room, players } = await load(code);
  if (room.enabled_roles?.pending_shot) return null;
  const alive = players.filter((x) => x.alive);
  const mafia = alive.filter((x) => mafiaRole(x.role)).length;
  const serialKillers = alive.filter((x) => x.role === "serial_killer").length;
  const others = alive.length - mafia - serialKillers;
  let winner: string | null = null;
  if (alive.length === 0) winner = "draw";
  else if (serialKillers > 0 && mafia === 0 && serialKillers >= others) winner = "serial_killer";
  else if (mafia === 0 && serialKillers === 0) winner = "village";
  else if (serialKillers === 0 && mafia >= others) winner = "mafia";
  if (winner) {
    await persist(db.from("mafia_rooms").update({ phase: "finished", winner, winner_player: null }).eq("code", code));
    const final = await load(code);
    await recordStats(final.room, final.players);
  }
  return winner;
}
function plurality(choices: string[]) {
  const counts: Record<string, number> = {};
  choices.forEach((choice) => counts[choice] = (counts[choice] || 0) + 1);
  const max = Math.max(0, ...Object.values(counts));
  const top = Object.keys(counts).filter((choice) => counts[choice] === max);
  return top.length === 1 ? top[0] : "SKIP";
}

