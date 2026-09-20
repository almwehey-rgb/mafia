const detectiveQuestionCount = (value: any) => Number.isFinite(Number(value)) && value != null ? Math.max(1, Math.min(5, Math.round(Number(value)))) : 3;
const doctorAvailable = (room: any) => room.round >= 2;
const detectiveLimit = (room: any, players: any[]) => room.round >= 1 && room.round <= detectiveQuestionCount(room.detective_questions) && players.filter((x) => x.alive).length > 1 ? 1 : 0;
const isMafiaLocked = (room: any, players: any[]) => players.some((x) => x.alive && mafiaRole(x.role) && x.id === room.jailed_player);
const authenticatedPlayer = (players: any[], body: any) => players.find((x) => x.id === body.id && x.session_token && x.session_token === body.playerToken);
const cleanText = (value: any, max: number) => String(value || "").trim().replace(/[<>]/g, "").slice(0, max);
const randomItem = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const currentSeason = () => { const d = new Date(); return `${d.getUTCFullYear()}-S${Math.floor(d.getUTCMonth() / 3) + 1}`; };
const shortCode = (length = 8) => Array.from(crypto.getRandomValues(new Uint8Array(length))).map((x) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x % 32]).join("");
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((x) => x.toString(16).padStart(2, "0")).join("");
const validHostAccess = async (token: any) => {
  const clean = cleanText(token, 200);
  if (!clean) return false;
  const tokenHash = await sha256(clean);
  const { data } = await db.from("mafia_host_sessions").select("token_hash,expires_at").eq("token_hash", tokenHash).maybeSingle();
  if (!data || new Date(data.expires_at).getTime() <= Date.now()) return false;
  await persist(db.from("mafia_host_sessions").update({ last_seen: new Date().toISOString() }).eq("token_hash", tokenHash));
  return true;
};
const cleanPreferences = (value: any) => ({
  mafiaCount: Math.max(1, Math.min(8, Math.round(Number(value?.mafiaCount) || 2))),
  detectiveCount: Math.max(0, Math.min(8, Math.round(Number.isFinite(+value?.detectiveCount) ? +value.detectiveCount : 1))),
  detectiveQuestions: detectiveQuestionCount(value?.detectiveQuestions),
  enabledRoles: enabledRoles(value?.enabledRoles || defaultEnabledRoles),
  phaseDuration: [30, 60, 90].includes(+value?.phaseDuration) ? +value.phaseDuration : 60,
  soundEnabled: value?.soundEnabled !== false,
});
const audit = async (roomCode: string | null, action: string, status = "ok", started = Date.now()) => {
  await persist(db.from("mafia_audit_events").insert({ room_code: roomCode, action, status, duration_ms: Date.now() - started }));
};
async function snapshot(room: any, players: any[], reason: string) {
  await persist(db.from("mafia_snapshots").insert({ room_code: room.code, phase: room.phase, round: room.round, reason, room_state: room, players_state: players }));
  const { data } = await db.from("mafia_snapshots").select("id").eq("room_code", room.code).order("created_at", { ascending: false }).range(20, 100);
  if (data?.length) await db.from("mafia_snapshots").delete().in("id", data.map((x) => x.id));
}

