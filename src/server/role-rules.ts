const shuffle = <T>(items: T[]) => { for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; } return items; };
const mafiaRole = (role: string | null) => role === "mafia" || role === "mafia_boss";
const selected = (player: any) => String(player.action_target || "").split(",").filter(Boolean);
const results = (player: any) => { try { return JSON.parse(player.investigation_result || "[]"); } catch { return []; } };
const defaultEnabledRoles = { doctor: true, detective: true, lawyer: true, jailer: true, vigilante: false, witch: false, serial_killer: false, jester: false, cupid: false, escort: false, godfather_innocent: true, mafia_kill_start_round: 2, mafia_kill_mode: "always", mafia_kill_enabled: true, mafia_no_repeat: false, doctor_no_repeat: true, reveal_dead_roles: false, allow_no_vote: true, full_trial: true, kids_mode: false, paused_phase: null };
const enabledRoles = (value: any) => {
  const legacyRound = value?.mafia_kill_mode === "disabled" || value?.mafia_kill_enabled === false ? 0 : value?.mafia_kill_mode === "after_first" ? 2 : 1;
  let mafiaKillStartRound = Number.isFinite(+value?.mafia_kill_start_round) ? Math.max(0, Math.min(10, Math.round(+value.mafia_kill_start_round))) : legacyRound;
  if (mafiaKillStartRound === 1) mafiaKillStartRound = 2;
  return ({
  doctor: value?.doctor !== false,
  detective: value?.detective !== false,
  lawyer: value?.lawyer !== false,
  jailer: value?.jailer !== false,
  vigilante: value?.vigilante === true,
  witch: value?.witch === true,
  serial_killer: value?.serial_killer === true,
  jester: value?.jester === true,
  cupid: value?.cupid === true,
  revealer: value?.revealer === true,
  escort: value?.escort === true,
  godfather_innocent: value?.godfather_innocent !== false,
  mafia_kill_start_round: mafiaKillStartRound,
  mafia_kill_mode: mafiaKillStartRound === 0 ? "disabled" : mafiaKillStartRound === 1 ? "always" : mafiaKillStartRound === 2 ? "after_first" : "scheduled",
  mafia_kill_enabled: mafiaKillStartRound > 0,
  mafia_no_repeat: value?.mafia_no_repeat === true,
  doctor_no_repeat: value?.doctor_no_repeat !== false,
  reveal_dead_roles: value?.reveal_dead_roles === true,
  allow_no_vote: value?.allow_no_vote !== false,
  full_trial: value?.full_trial !== false,
  kids_mode: value?.kids_mode === true,
  phase_seconds: [30,60,90].includes(+value?.phase_seconds) ? +value.phase_seconds : 60,
  // Older rooms without this option must remain playable during rollout.
  discussion_mode: ["off", "group", "turns"].includes(value?.discussion_mode) ? value.discussion_mode : "off",
  discussion_seconds: [30, 60, 120, 180, 300, 600, 900, 1800, 3600].includes(+value?.discussion_seconds) ? +value.discussion_seconds : 180,
  speaker_seconds: [15, 30, 45, 60, 90, 120].includes(+value?.speaker_seconds) ? +value.speaker_seconds : 30,
  paused_phase: ["reveal", "night", "day", "nomination", "trial", "verdict", "vote"].includes(value?.paused_phase) ? value.paused_phase : null,
  solo_mode: value?.solo_mode === true,
  solo_difficulty: ["easy", "balanced", "hard"].includes(value?.solo_difficulty) ? value.solo_difficulty : "balanced",
  });
};
const mafiaKillEnabledForRound = (room: any) => {
  const startRound = enabledRoles(room.enabled_roles).mafia_kill_start_round;
  return startRound > 0 && Number(room.round) >= Math.max(2, startRound);
};
const roleState = (player: any) => player?.role_state && typeof player.role_state === "object" ? player.role_state : {};
const mafiaLastTarget = (players: any[]) => players.find((player) => mafiaRole(player.role) && roleState(player).lastMafiaTarget)?.role_state.lastMafiaTarget || null;
// Merge a small state change without erasing a concurrent vote, charge or claim.
async function patchRoleState(code: string, player: any, patch: Record<string, any>) {
  let state = roleState(player);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db.from("mafia_players").update({ role_state: { ...state, ...patch } })
      .eq("room_code", code).eq("id", player.id).eq("role_state", JSON.stringify(state)).select("id");
    if (error) throw error;
    if (data?.length) return;
    const current = await db.from("mafia_players").select("role_state").eq("room_code", code).eq("id", player.id).single();
    if (current.error) throw current.error;
    if (!current.data) throw new Error("STALE_GAME");
    state = roleState(current.data);
  }
  throw new Error("STALE_ACTION");
}
const validPlayerId = (id: unknown) => typeof id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(id);
const phaseSeconds = (room: any) => [30,60,90].includes(+room.enabled_roles?.phase_seconds) ? +room.enabled_roles.phase_seconds : 60;
const phaseDeadline = (room: any) => new Date(room.phase_started_at).getTime() + phaseSeconds(room) * 1000;
const phaseExpired = (room: any) => room.phase !== "paused" && !room.enabled_roles?.pending_shot && Number.isFinite(phaseDeadline(room)) && Date.now() >= phaseDeadline(room);

function discussionView(room: any, now = Date.now()) {
  const settings = enabledRoles(room.enabled_roles);
  const saved = room.enabled_roles?.discussion_state;
  if (settings.discussion_mode === "off") return { status: "off", complete: true };
  if (!saved || saved.round !== room.round) return { status: "waiting", complete: false, mode: settings.discussion_mode };
  const at = saved.pausedAt || now;
  const index = saved.cursor + (saved.mode === "turns" ? Math.max(0, Math.floor((at - saved.turnStartedAt) / (saved.seconds * 1000))) : 0);
  const complete = saved.finished || (saved.mode === "group" ? at >= saved.endsAt : index >= saved.order.length);
  const deadline = saved.mode === "group" ? saved.endsAt : saved.turnStartedAt + (index - saved.cursor + 1) * saved.seconds * 1000;
  return { ...saved, status: complete ? "done" : saved.pausedAt ? "paused" : "active", complete: Boolean(complete), index, speakerId: !complete && saved.mode === "turns" ? saved.order[index] : null, deadline, remainingMs: complete ? 0 : Math.max(0, deadline - at) };
}
