import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
const out = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const DISTRICTS = [
  { id: "d0", name: "العاصمة", regions: [
    { id: "d0r0", name: "القصر" }, { id: "d0r1", name: "السوق" }, { id: "d0r2", name: "البرلمان" },
    { id: "d0r3", name: "الإعلام" }, { id: "d0r4", name: "الجامعة" },
  ]},
  { id: "d1", name: "الساحل", regions: [
    { id: "d1r0", name: "الميناء" }, { id: "d1r1", name: "الكورنيش" }, { id: "d1r2", name: "الجزر" },
    { id: "d1r3", name: "الصيادين" }, { id: "d1r4", name: "المنتجعات" },
  ]},
  { id: "d2", name: "الجبال", regions: [
    { id: "d2r0", name: "القمة" }, { id: "d2r1", name: "الممر" }, { id: "d2r2", name: "القرى" },
    { id: "d2r3", name: "المناجم" }, { id: "d2r4", name: "السد" },
  ]},
  { id: "d3", name: "الريف", regions: [
    { id: "d3r0", name: "الحقول" }, { id: "d3r1", name: "الواحة" }, { id: "d3r2", name: "البادية" },
    { id: "d3r3", name: "النهر" }, { id: "d3r4", name: "السوق الأسبوعي" },
  ]},
  { id: "d4", name: "الصناعة", regions: [
    { id: "d4r0", name: "المصانع" }, { id: "d4r1", name: "العمال" }, { id: "d4r2", name: "السكة" },
    { id: "d4r3", name: "المستودعات" }, { id: "d4r4", name: "الطاقة" },
  ]},
];
const REGION_IDS = DISTRICTS.flatMap((d) => d.regions.map((r) => r.id));
const COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22", "#1abc9c", "#fd79a8"];
type BotLevel = "pro" | "chaos";
const BOT_NAMES: Record<BotLevel, string[]> = {
  pro: ["أبو خالد", "سعاد", "المهندس", "أم سلطان", "الوجيه", "الدكتورة", "الحاج منصور"],
  chaos: ["طرطور", "أبو الهيبة", "مزيون", "خبصة", "الفنجري", "بوحماد الطايح", "زوبعة"],
};
const BOT_LABEL: Record<BotLevel, string> = { pro: "محترف", chaos: "خرابيط" };
const CARD_TYPES = ["scandal", "convoy", "fortify", "intercept", "speech", "blackout", "coup", "leak"] as const;
type CardType = typeof CARD_TYPES[number];
const MAX_PLAYERS = 8;
const BANK_CAP = 18;
const TOTAL_ROUNDS = 5;
const PHASE_SECONDS: Record<string, number> = { plan: 60, cards: 25, reveal: 18, debate: 45 };

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const cleanName = (value: unknown) => String(value || "").trim().replace(/[<>]/g, "").slice(0, 20);
const validId = (id: unknown) => typeof id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(id);
const secretOf = (p: any) => (p?.secret && typeof p.secret === "object" ? p.secret : {});
// Bots are ordinary rows; the unguessable token prefix is what marks them and
// carries the difficulty, because `secret` is rewritten on every phase change.
const isBot = (p: any) => String(p?.session_token || "").startsWith("bot:");
const botLevel = (p: any): BotLevel => (String(p?.session_token || "").split(":")[1] === "chaos" ? "chaos" : "pro");
const randomInt = (max: number) => {
  if (max <= 1) return 0;
  const cap = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  let n = 0;
  do { crypto.getRandomValues(buf); n = buf[0]; } while (n >= cap);
  return n % max;
};
const pick = <T>(list: T[]): T => list[randomInt(list.length)];
const handOf = (p: any): CardType[] => Array.isArray(p?.hand) ? p.hand.filter((c: string) => CARD_TYPES.includes(c as CardType)) : [];
const nowIso = () => new Date().toISOString();
const int = (n: unknown, fallback = 0) => (Number.isFinite(+n!) ? Math.max(0, Math.round(+n!)) : fallback);

function emptyInfluence() {
  const influence: Record<string, Record<string, number>> = {};
  const control: Record<string, string | null> = {};
  for (const id of REGION_IDS) { influence[id] = {}; control[id] = null; }
  return { influence, control };
}

function incomeFor(player: any, players: any[]) {
  const ranked = [...players].sort((a, b) => b.seats - a.seats || b.regions_count - a.regions_count);
  const last = ranked[ranked.length - 1];
  const secondLast = ranked.length > 2 ? ranked[ranked.length - 2] : null;
  const uniqueLast = ranked.filter((p) => p.seats === last.seats && p.regions_count === last.regions_count).length === 1;
  const uniqueSecond = secondLast && ranked.filter((p) => p.seats === secondLast.seats && p.regions_count === secondLast.regions_count).length === 1;
  let extra = 0;
  if (uniqueLast && player.id === last.id) extra = 4;
  else if (uniqueSecond && player.id === secondLast.id) extra = 2;
  return 10 + extra + Math.min(BANK_CAP, int(player.votes_bank));
}

function drawCards(hand: CardType[], count: number) {
  const next = [...hand];
  const pool = CARD_TYPES.filter((c) => !next.includes(c));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  for (const card of pool) {
    if (count <= 0 || next.length >= 4) break;
    next.push(card); count--;
  }
  return next;
}

function defaultPlan(player: any, room: any, budget: number) {
  const control = room.state?.control || {};
  const attack: Record<string, number> = {};
  const defend: Record<string, number> = {};
  let left = budget;
  const owned = REGION_IDS.filter((id) => control[id] === player.id);
  for (const id of owned) {
    const v = Math.min(2, left);
    if (v) { defend[id] = v; left -= v; }
  }
  const district = player.spotlight && DISTRICTS.some((d) => d.id === player.spotlight) ? player.spotlight : "d0";
  const regs = DISTRICTS.find((d) => d.id === district)!.regions.map((r) => r.id);
  let i = 0;
  while (left > 0) { const id = regs[i % regs.length]; attack[id] = (attack[id] || 0) + 1; left--; i++; }
  return { attack, defend, support: [] as { targetId: string; regionId: string; amount: number }[] };
}

function sanitizePlan(body: any, players: any[], budget: number, control: Record<string, string | null>, playerId: string) {
  const attack: Record<string, number> = {};
  const defend: Record<string, number> = {};
  const support: { targetId: string; regionId: string; amount: number }[] = [];
  let spent = 0;
  const add = (id: string, n: number, bucket: Record<string, number>) => {
    if (!REGION_IDS.includes(id) || n < 1) return;
    bucket[id] = (bucket[id] || 0) + n; spent += n;
  };
  for (const [id, n] of Object.entries(body?.attack || {})) add(id, int(n), attack);
  for (const [id, n] of Object.entries(body?.defend || {})) {
    if (control[id] !== playerId) continue;
    add(id, int(n), defend);
  }
  for (const row of Array.isArray(body?.support) ? body.support : []) {
    const targetId = String(row?.targetId || "");
    const regionId = String(row?.regionId || "");
    const amount = int(row?.amount);
    if (!players.some((p) => p.id === targetId && p.id !== playerId) || !REGION_IDS.includes(regionId) || amount < 1) continue;
    support.push({ targetId, regionId, amount }); spent += amount;
  }
  if (spent > budget) throw Object.assign(new Error("OVER_BUDGET"), { status: 400 });
  return { attack, defend, support, spent };
}

function publicPlayers(players: any[], host = false) {
  return players.map((p) => ({
    id: p.id, name: p.name, color: p.color, seats: p.seats, regionsCount: p.regions_count,
    spotlight: p.spotlight, ready: p.ready, afk: p.afk, cards: handOf(p).length,
    bot: isBot(p), botLevel: isBot(p) ? botLevel(p) : null, botLabel: isBot(p) ? BOT_LABEL[botLevel(p)] : null,
    online: isBot(p) || Date.now() - new Date(p.last_seen).getTime() < 20000,
    ...(host && p.replacement_code ? { replacementCode: p.replacement_code } : {}),
  }));
}

function publicState(room: any, players: any[], me: any, host: boolean) {
  const state = room.state || {};
  return {
    code: room.code,
    phase: room.phase,
    pausedPhase: room.paused_phase,
    round: room.round,
    lifecycleVersion: Number(room.lifecycle_version || 0),
    phaseClock: {
      startedAt: new Date(room.phase_started_at).getTime(),
      seconds: room.phase_seconds,
      pausedAt: room.phase === "paused" ? Date.now() : null,
    },
    map: DISTRICTS,
    control: state.control || {},
    influenceLead: Object.fromEntries(REGION_IDS.map((id) => {
      const inf = state.influence?.[id] || {};
      const top = Object.entries(inf).sort((a: any, b: any) => b[1] - a[1])[0];
      return [id, top ? { playerId: top[0], value: top[1] } : null];
    })),
    commentary: state.commentary || [],
    lastReveal: state.lastReveal || null,
    debateTied: state.debateTied || null,
    winner: state.winner || null,
    players: publicPlayers(players, host),
    host,
    me: me ? {
      id: me.id, name: me.name, color: me.color, seats: me.seats, regionsCount: me.regions_count,
      votesBank: me.votes_bank, spotlight: me.spotlight, ready: me.ready, afk: me.afk,
      hand: handOf(me), secret: secretOf(me),
    } : null,
  };
}

async function load(code: string) {
  const [roomResult, playersResult] = await Promise.all([
    db.from("candidate_rooms").select("*").eq("code", code).single(),
    db.from("candidate_players").select("*").eq("room_code", code).order("joined_at"),
  ]);
  if (roomResult.error && roomResult.error.code !== "PGRST116") throw roomResult.error;
  if (playersResult.error) throw playersResult.error;
  return { room: roomResult.data, players: playersResult.data || [] };
}

async function saveRoom(room: any, patch: Record<string, unknown>) {
  const ver = Number(room.lifecycle_version || 0);
  const { data, error } = await db.from("candidate_rooms").update({
    ...patch, lifecycle_version: ver + 1,
  }).eq("code", room.code).eq("lifecycle_version", ver).select("code");
  if (error) throw error;
  if (!data?.length) throw Object.assign(new Error("STALE_GAME"), { status: 409 });
}

async function savePlayer(code: string, id: string, patch: Record<string, unknown>) {
  const { error } = await db.from("candidate_players").update(patch).eq("room_code", code).eq("id", id);
  if (error) throw error;
}

function phaseExpired(room: any) {
  if (room.phase === "paused" || room.phase === "lobby" || room.phase === "finished") return false;
  return Date.now() >= new Date(room.phase_started_at).getTime() + room.phase_seconds * 1000;
}

function allReady(players: any[]) {
  const active = players.filter((p) => !p.afk);
  return active.length > 0 && active.every((p) => p.ready);
}

function rankDistrict(scores: Record<string, number>, players: any[], control: Record<string, string | null>, districtId: string) {
  const regs = DISTRICTS.find((d) => d.id === districtId)!.regions.map((r) => r.id);
  const list = players.map((p) => ({
    player: p,
    votes: scores[p.id] || 0,
    regions: regs.filter((id) => control[id] === p.id).length,
  })).sort((a, b) => b.votes - a.votes || b.regions - a.regions || a.player.seats - b.player.seats || a.player.regions_count - b.player.regions_count);
  return list;
}

function resolveRound(room: any, players: any[]) {
  const state = copy(room.state || emptyInfluence());
  if (!state.influence) Object.assign(state, emptyInfluence());
  const control: Record<string, string | null> = { ...emptyInfluence().control, ...(state.control || {}) };
  const influence: Record<string, Record<string, number>> = {};
  for (const id of REGION_IDS) influence[id] = { ...(state.influence[id] || {}) };

  const plays = players.map((p) => {
    const secret = secretOf(p);
    const budget = int(secret.income, incomeFor(p, players));
    const plan = secret.plan && Object.keys(secret.plan.attack || {}).length + Object.keys(secret.plan.defend || {}).length + (secret.plan.support || []).length
      ? secret.plan
      : defaultPlan(p, { state: { control } }, budget);
    const spent = Object.values(plan.attack || {}).reduce((s: number, n: any) => s + int(n), 0)
      + Object.values(plan.defend || {}).reduce((s: number, n: any) => s + int(n), 0)
      + (plan.support || []).reduce((s: number, row: any) => s + int(row.amount), 0);
    return { player: p, plan, budget, spent, card: secret.cardPlay || null, cancelled: false };
  });

  for (const row of plays) {
    if (row.card?.cardId === "intercept" && !row.cancelled) {
      const target = plays.find((x) => x.player.id === row.card.targetPlayerId);
      if (target) target.cancelled = true;
    }
  }

  const attack: Record<string, Record<string, number>> = {};
  const defense: Record<string, number> = {};
  const blackout = new Set<string>();
  const commentary: string[] = [];
  const leaks: Record<string, any> = {};
  for (const id of REGION_IDS) attack[id] = {};

  const applyAttack = (pid: string, regionId: string, n: number) => {
    if (!REGION_IDS.includes(regionId) || n < 1) return;
    attack[regionId][pid] = (attack[regionId][pid] || 0) + n;
  };

  for (const row of plays) {
    for (const [id, n] of Object.entries(row.plan.attack || {})) applyAttack(row.player.id, id, int(n));
    for (const [id, n] of Object.entries(row.plan.defend || {})) {
      if (control[id] === row.player.id) defense[id] = (defense[id] || 0) + int(n);
    }
    for (const s of row.plan.support || []) applyAttack(s.targetId, s.regionId, int(s.amount));
    const card = row.cancelled ? null : row.card;
    if (!card) {
      if (row.cancelled && row.card) commentary.push(`اعتُرض كرت ${row.player.name}.`);
      continue;
    }
    if (card.cardId === "blackout") blackout.add(row.player.id);
    if (card.cardId === "convoy" && REGION_IDS.includes(card.regionId)) {
      attack[card.regionId][row.player.id] = (attack[card.regionId][row.player.id] || 0) * 2;
      commentary.push(`${row.player.name} أطلق قافلة انتخابية.`);
    }
    if (card.cardId === "speech" && REGION_IDS.includes(card.regionId)) {
      applyAttack(row.player.id, card.regionId, 5);
      commentary.push(`${row.player.name} ألقى خطابًا ناريًا.`);
    }
    if (card.cardId === "fortify" && control[card.regionId] === row.player.id) {
      defense[card.regionId] = (defense[card.regionId] || 0) + 4;
      commentary.push(`${row.player.name} حصّن منطقة تحت سيطرته.`);
    }
    if (card.cardId === "scandal" && REGION_IDS.includes(card.regionId)) {
      const cur = attack[card.regionId][card.targetPlayerId] || 0;
      const cut = Math.ceil(cur / 2);
      if (cut) {
        attack[card.regionId][card.targetPlayerId] = cur - cut;
        const name = players.find((p) => p.id === card.targetPlayerId)?.name || "مرشح";
        commentary.push(`فضيحة إعلامية أضعفت ${name}.`);
      }
    }
    if (card.cardId === "leak") {
      const target = plays.find((x) => x.player.id === card.targetPlayerId);
      if (target) {
        leaks[row.player.id] = { name: target.player.name, attack: target.plan.attack || {}, spotlight: target.player.spotlight };
        commentary.push(`تسريب سياسي وصل إلى أحد المرشحين.`);
      }
    }
  }

  for (const id of REGION_IDS) {
    const controller = control[id];
    let incoming = 0;
    for (const [pid, n] of Object.entries(attack[id])) if (pid !== controller) incoming += n;
    let reduce = Math.min(defense[id] || 0, incoming);
    if (reduce > 0 && incoming > 0) {
      for (const pid of Object.keys(attack[id])) {
        if (pid === controller) continue;
        const share = Math.floor((attack[id][pid] / incoming) * reduce);
        attack[id][pid] = Math.max(0, attack[id][pid] - share);
      }
    }
    for (const [pid, n] of Object.entries(attack[id])) {
      if (n > 0) influence[id][pid] = (influence[id][pid] || 0) + n;
    }
  }

  for (const row of plays) {
    const card = row.cancelled ? null : row.card;
    if (card?.cardId === "coup" && REGION_IDS.includes(card.regionId)) {
      const inf = influence[card.regionId] || {};
      const mine = inf[row.player.id] || 0;
      const bestOther = Math.max(0, ...Object.entries(inf).filter(([id]) => id !== row.player.id).map(([, n]) => n as number));
      if (mine + 3 >= bestOther) {
        control[card.regionId] = row.player.id;
        commentary.push(`${row.player.name} نفذ انقلابًا محليًا.`);
      }
    }
  }

  for (const id of REGION_IDS) {
    const inf = influence[id];
    const ranked = Object.entries(inf).sort((a, b) => b[1] - a[1]);
    if (!ranked.length) continue;
    if (ranked.length === 1 || ranked[0][1] > ranked[1][1]) control[id] = ranked[0][0];
  }

  const districtSeats: any[] = [];
  const seatGain: Record<string, number> = Object.fromEntries(players.map((p) => [p.id, 0]));
  const roundVotes: Record<string, Record<string, number>> = {};
  for (const d of DISTRICTS) {
    const scores: Record<string, number> = {};
    for (const r of d.regions) {
      for (const [pid, n] of Object.entries(attack[r.id])) scores[pid] = (scores[pid] || 0) + n;
    }
    roundVotes[d.id] = scores;
    const ranked = rankDistrict(scores, players, control, d.id).filter((x) => x.votes > 0);
    const first = ranked[0];
    const second = ranked[1];
    if (first) { seatGain[first.player.id]++; districtSeats.push({ districtId: d.id, name: d.name, place: 1, playerId: first.player.id, votes: first.votes }); }
    if (second) { seatGain[second.player.id]++; districtSeats.push({ districtId: d.id, name: d.name, place: 2, playerId: second.player.id, votes: second.votes }); }
    if (first) commentary.push(`${d.name}: المقعد الأول لـ ${first.player.name}${second ? ` والثاني لـ ${second.player.name}` : ""}.`);
  }

  const regions: any[] = REGION_IDS.map((id) => {
    const scores = Object.entries(attack[id]).filter(([, n]) => n > 0).map(([pid, votes]) => {
      const p = players.find((x) => x.id === pid);
      return { playerId: pid, name: blackout.has(pid) ? "مرشح مجهول" : p?.name, votes, hidden: blackout.has(pid) };
    }).sort((a, b) => b.votes - a.votes);
    return { id, controller: control[id], scores };
  });

  const nextPlayers = players.map((p) => {
    const row = plays.find((x) => x.player.id === p.id)!;
    const leftover = Math.max(0, row.budget - row.spent);
    const regionsCount = REGION_IDS.filter((id) => control[id] === p.id).length;
    const usedCard = row.cancelled ? null : row.card?.cardId;
    const hand = usedCard ? handOf(p).filter((c) => c !== usedCard) : handOf(p);
    return {
      ...p,
      seats: p.seats + (seatGain[p.id] || 0),
      votes_bank: Math.min(BANK_CAP, leftover),
      regions_count: regionsCount,
      ready: false,
      hand,
      secret: {
        income: 0,
        plan: null,
        cardPlay: null,
        lastPrivate: {
          spent: row.spent,
          leftover,
          gainedSeats: seatGain[p.id] || 0,
          leaked: leaks[p.id] || null,
          cancelled: row.cancelled,
        },
      },
    };
  });

  if (!commentary.length) commentary.push("انتهت الجولة بهدوء انتخابي… لكن المقاعد تتحرك.");
  state.influence = influence;
  state.control = control;
  state.commentary = commentary.slice(0, 12);
  state.lastReveal = { regions, seats: districtSeats, round: room.round, roundVotes };
  state.history = [...(state.history || []), { round: room.round, seatGain, commentary: commentary.slice(0, 6) }];
  return { state, players: nextPlayers };
}

function winnerOf(players: any[]) {
  const ranked = [...players].sort((a, b) => b.seats - a.seats || b.regions_count - a.regions_count);
  if (ranked.length < 2) return { player: ranked[0], debate: false };
  const a = ranked[0], b = ranked[1];
  if (a.seats !== b.seats) return { player: a, debate: false };
  if (a.regions_count !== b.regions_count) return { player: a, debate: false };
  const tied = ranked.filter((p) => p.seats === a.seats && p.regions_count === a.regions_count);
  return { player: null, debate: true, tied: tied.map((p) => p.id) };
}

type BotPlan = { plan: { attack: Record<string, number>; defend: Record<string, number>; support: any[] }; spotlight: string };

// Concentrates on the districts it can still place in, shields the owned
// regions rivals are pushing on, and keeps a reserve when it is far ahead.
function proPlan(bot: any, room: any, budget: number): BotPlan {
  const control = room.state?.control || {};
  const influence = room.state?.influence || {};
  const attack: Record<string, number> = {};
  const defend: Record<string, number> = {};
  let left = budget;
  const pressure = (id: string) =>
    Math.max(0, ...Object.entries(influence[id] || {}).filter(([pid]) => pid !== bot.id).map(([, n]) => n as number));

  const owned = REGION_IDS.filter((id) => control[id] === bot.id).sort((a, b) => pressure(b) - pressure(a));
  for (const id of owned.slice(0, 3)) {
    if (pressure(id) <= 0) break;
    const spend = Math.min(pressure(id) > 4 ? 4 : 2, left);
    if (spend > 0) { defend[id] = spend; left -= spend; }
  }

  const lead = (d: typeof DISTRICTS[number]) => d.regions.reduce((total, r) => {
    const inf = influence[r.id] || {};
    const mine = (inf[bot.id] as number) || 0;
    const best = Math.max(0, ...Object.entries(inf).filter(([pid]) => pid !== bot.id).map(([, n]) => n as number));
    return total + mine - best;
  }, 0);
  const ranked = [...DISTRICTS].sort((a, b) => lead(b) - lead(a));
  const focus = Math.random() < 0.75 ? ranked[0] : ranked[1] || ranked[0];

  const hold = Math.random() < 0.35 ? Math.min(3, Math.floor(left * 0.25)) : 0;
  let spendable = Math.max(0, left - hold);
  // Weakest regions first: cheapest places to overtake a rival for a seat.
  const targets = [...focus.regions]
    .sort((a, b) => pressure(a.id) - pressure(b.id))
    .slice(0, 3)
    .map((r) => r.id);
  for (let i = 0; spendable > 0; i++, spendable--) {
    attack[targets[i % targets.length]] = (attack[targets[i % targets.length]] || 0) + 1;
  }
  return { plan: { attack, defend, support: [] }, spotlight: focus.id };
}

// Deliberately erratic: scatters, bluffs its spotlight, and now and then dumps
// the whole bank on a single region.
function chaosPlan(bot: any, room: any, budget: number): BotPlan {
  const control = room.state?.control || {};
  const attack: Record<string, number> = {};
  const defend: Record<string, number> = {};
  let left = budget;

  const owned = REGION_IDS.filter((id) => control[id] === bot.id);
  if (owned.length && Math.random() < 0.3) {
    const spend = Math.min(1 + Math.floor(Math.random() * 3), left);
    if (spend > 0) { defend[pick(owned)] = spend; left -= spend; }
  }

  if (Math.random() < 0.25) {
    attack[pick(REGION_IDS)] = left;
    left = 0;
  } else {
    const spread = 2 + Math.floor(Math.random() * 5);
    const targets = [...REGION_IDS].sort(() => Math.random() - 0.5).slice(0, spread);
    while (left > 0) {
      const id = pick(targets);
      const chunk = Math.min(1 + Math.floor(Math.random() * 3), left);
      attack[id] = (attack[id] || 0) + chunk;
      left -= chunk;
    }
  }
  return { plan: { attack, defend, support: [] }, spotlight: pick(DISTRICTS).id };
}

function botPlan(bot: any, room: any, budget: number): BotPlan {
  return botLevel(bot) === "chaos" ? chaosPlan(bot, room, budget) : proPlan(bot, room, budget);
}

function botCard(bot: any, room: any, players: any[]) {
  const hand = handOf(bot);
  const chaos = botLevel(bot) === "chaos";
  if (!hand.length) return null;
  if (Math.random() < (chaos ? 0.12 : 0.35)) return null;

  const control = room.state?.control || {};
  const influence = room.state?.influence || {};
  const rivals = players.filter((p) => p.id !== bot.id);
  if (!rivals.length) return null;
  const owned = REGION_IDS.filter((id) => control[id] === bot.id);
  const cardId = pick(hand);
  const play: { cardId: CardType; targetPlayerId: string | null; regionId: string | null } =
    { cardId, targetPlayerId: null, regionId: null };

  if (chaos) {
    if (["scandal", "intercept", "leak"].includes(cardId)) play.targetPlayerId = pick(rivals).id;
    if (["scandal", "convoy", "speech", "coup"].includes(cardId)) play.regionId = pick(REGION_IDS);
    if (cardId === "fortify") {
      if (!owned.length) return null;
      play.regionId = pick(owned);
    }
    return play;
  }

  const leader = [...rivals].sort((a, b) => b.seats - a.seats || b.regions_count - a.regions_count)[0];
  const district = DISTRICTS.find((d) => d.id === bot.spotlight) || pick(DISTRICTS);
  const mine = (id: string) => ((influence[id] || {})[bot.id] as number) || 0;
  const best = (id: string) =>
    Math.max(0, ...Object.entries(influence[id] || {}).filter(([pid]) => pid !== bot.id).map(([, n]) => n as number));

  if (["scandal", "intercept", "leak"].includes(cardId)) play.targetPlayerId = leader.id;
  if (["scandal", "convoy", "speech"].includes(cardId)) {
    play.regionId = [...district.regions].sort((a, b) => best(b.id) - best(a.id))[0].id;
  }
  if (cardId === "coup") {
    // Only worth it where the 3-vote swing actually flips the region.
    const flippable = REGION_IDS.filter((id) => control[id] !== bot.id && mine(id) + 3 >= best(id) && best(id) > 0);
    if (!flippable.length) return null;
    play.regionId = flippable.sort((a, b) => best(b) - best(a))[0];
  }
  if (cardId === "fortify") {
    const threatened = owned.filter((id) => best(id) > 0).sort((a, b) => best(b) - best(a));
    if (!threatened.length) return null;
    play.regionId = threatened[0];
  }
  return play;
}

// Bots decide lazily on whichever request observes the open phase, so a room
// with no human left still reaches an ending.
async function runBots(room: any, players: any[]) {
  if (!room || !["plan", "cards", "debate"].includes(room.phase)) return false;
  const waiting = players.filter((p) => isBot(p) && !p.ready && !p.afk);
  if (!waiting.length) return false;

  if (room.phase === "plan") {
    for (const bot of waiting) {
      const budget = int(secretOf(bot).income, incomeFor(bot, players));
      const { plan, spotlight } = botPlan(bot, room, budget);
      await savePlayer(room.code, bot.id, {
        ready: true, spotlight, last_seen: nowIso(),
        secret: { ...secretOf(bot), plan, income: budget },
      });
    }
  } else if (room.phase === "cards") {
    for (const bot of waiting) {
      await savePlayer(room.code, bot.id, {
        ready: true, last_seen: nowIso(),
        secret: { ...secretOf(bot), cardPlay: botCard(bot, room, players) },
      });
    }
  } else {
    const tied: string[] = room.state?.debateTied || [];
    const votes = { ...(room.state?.debateVotes || {}) };
    let voted = false;
    for (const bot of waiting) {
      const options = tied.filter((id) => id !== bot.id);
      if (options.length) { votes[bot.id] = pick(options); voted = true; }
      await savePlayer(room.code, bot.id, { ready: true, last_seen: nowIso() });
    }
    if (voted) await saveRoom(room, { state: { ...(room.state || {}), debateVotes: votes } });
  }
  return true;
}

async function enterPhase(room: any, players: any[], phase: string, extraState?: any) {
  const seconds = PHASE_SECONDS[phase] || 30;
  const patch: Record<string, unknown> = { phase, paused_phase: null, phase_started_at: nowIso(), phase_seconds: seconds };
  if (extraState) patch.state = extraState;
  if (phase === "plan") {
    const round = Math.min(TOTAL_ROUNDS, (room.round || 0) + 1);
    patch.round = round;
    for (const p of players) {
      const income = incomeFor(p, players);
      const hand = drawCards(handOf(p), round === 1 ? 2 : 1);
      await savePlayer(room.code, p.id, {
        ready: false, hand,
        secret: { income, plan: null, cardPlay: null, lastPrivate: secretOf(p).lastPrivate || null },
        votes_bank: 0,
      });
    }
  } else if (phase === "cards" || phase === "debate") {
    for (const p of players) await savePlayer(room.code, p.id, { ready: false });
  }
  await saveRoom(room, patch);
}

async function maybeAdvance(room: any, players: any[]) {
  if (!room || room.phase === "lobby" || room.phase === "finished" || room.phase === "paused") return { room, players };
  const expired = phaseExpired(room);
  const ready = allReady(players);
  if (room.phase === "plan" && (expired || ready)) {
    await enterPhase(room, players, "cards");
    return load(room.code);
  }
  if (room.phase === "cards" && (expired || ready)) {
    const resolved = resolveRound(room, players);
    for (const p of resolved.players) {
      await savePlayer(room.code, p.id, {
        seats: p.seats, votes_bank: p.votes_bank, regions_count: p.regions_count,
        ready: false, hand: p.hand, secret: p.secret,
      });
    }
    await saveRoom(room, { phase: "reveal", paused_phase: null, phase_started_at: nowIso(), phase_seconds: PHASE_SECONDS.reveal, state: resolved.state });
    return load(room.code);
  }
  if (room.phase === "reveal" && expired) {
    if (room.round >= TOTAL_ROUNDS) {
      const latest = await load(room.code);
      const result = winnerOf(latest.players);
      if (result.debate) {
        const state = { ...(latest.room.state || {}), debateTied: result.tied, debateVotes: {} };
        await enterPhase(latest.room, latest.players, "debate", state);
      } else {
        const state = { ...(latest.room.state || {}), winner: { id: result.player.id, name: result.player.name, reason: "seats" } };
        await saveRoom(latest.room, { phase: "finished", state, phase_started_at: nowIso() });
      }
    } else {
      await enterPhase(room, players, "plan");
    }
    return load(room.code);
  }
  if (room.phase === "debate" && (expired || ready)) {
    const votes = room.state?.debateVotes || {};
    const tied: string[] = room.state?.debateTied || [];
    const tally: Record<string, number> = {};
    for (const t of tied) tally[t] = 0;
    for (const [voter, target] of Object.entries(votes)) {
      if (voter === target) continue;
      if (tied.includes(String(target))) tally[String(target)] = (tally[String(target)] || 0) + 1;
    }
    const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    let winnerId = ranked[0]?.[0];
    if (!winnerId || (ranked[1] && ranked[0][1] === ranked[1][1])) winnerId = tied[0];
    const winner = players.find((p) => p.id === winnerId) || players[0];
    const state = { ...(room.state || {}), winner: { id: winner.id, name: winner.name, reason: "debate" } };
    await saveRoom(room, { phase: "finished", state, phase_started_at: nowIso() });
    return load(room.code);
  }
  return { room, players };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.method === "GET") {
      const action = new URL(req.url).searchParams.get("action") || "health";
      if (action === "health") return out({ status: "ok", time: new Date().toISOString() });
      return out({ error: "METHOD" }, 405);
    }
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    if (action === "health") return out({ status: "ok", time: new Date().toISOString() });
    const code = String(body.code || "").replace(/\D/g, "").slice(0, 4);

    if (action === "create") {
      const hostToken = crypto.randomUUID();
      for (let i = 0; i < 24; i++) {
        const next = String(1000 + randomInt(9000));
        const { error } = await db.from("candidate_rooms").insert({
          code: next, host_token: hostToken, phase: "lobby", round: 0, state: emptyInfluence(), settings: {},
        });
        if (!error) {
          const loaded = await load(next);
          return out({ ...publicState(loaded.room, loaded.players, null, true), hostToken });
        }
      }
      return out({ error: "CREATE_FAILED" }, 500);
    }

    if (!/^\d{4}$/.test(code)) return out({ error: "BAD_CODE" }, 400);
    let { room, players } = await load(code);
    if (!room) return out({ error: "NOT_FOUND" }, 404);
    const host = body.hostToken && body.hostToken === room.host_token;
    let me = players.find((p) => p.id === body.id && p.session_token && p.session_token === body.playerToken) || null;
    if (me) await savePlayer(code, me.id, { last_seen: nowIso(), afk: false });

    try {
      if (await runBots(room, players)) {
        const withBots = await load(code);
        room = withBots.room; players = withBots.players;
      }
      const advanced = await maybeAdvance(room, players);
      room = advanced.room; players = advanced.players;
      // The new phase resets everyone, so let bots commit before the caller reads.
      if (await runBots(room, players)) {
        const refreshed = await load(code);
        room = refreshed.room; players = refreshed.players;
      }
    } catch (error: any) {
      if (error?.message !== "STALE_GAME") throw error;
      const again = await load(code);
      room = again.room; players = again.players;
    }
    me = players.find((p) => p.id === body.id && p.session_token && p.session_token === body.playerToken) || me;

    if (action === "join") {
      if (!validId(body.id) || !body.playerToken) return out({ error: "BAD_SESSION", code: "SESSION_INVALID" }, 400);
      const name = cleanName(body.name);
      if (!name) return out({ error: "NAME" }, 400);
      const existing = players.find((p) => p.id === body.id);
      if (existing) {
        if (existing.session_token !== body.playerToken) return out({ error: "SESSION_INVALID", code: "SESSION_INVALID" }, 403);
        await savePlayer(code, existing.id, { name, last_seen: nowIso(), afk: false });
        const loaded = await load(code);
        const self = loaded.players.find((p) => p.id === existing.id);
        return out({ ...publicState(loaded.room, loaded.players, self, false), playerId: existing.id, playerToken: existing.session_token });
      }
      if (room.phase !== "lobby") return out({ error: "GAME_STARTED", code: "GAME_STARTED" }, 409);
      if (players.length >= MAX_PLAYERS) return out({ error: "ROOM_FULL", code: "ROOM_FULL" }, 409);
      if (players.some((p) => p.name === name)) return out({ error: "NAME_TAKEN", code: "NAME_TAKEN" }, 409);
      const color = COLORS.find((c) => !players.some((p) => p.color === c)) || COLORS[players.length % COLORS.length];
      const { error } = await db.from("candidate_players").insert({
        id: body.id, room_code: code, name, color, session_token: body.playerToken,
      });
      if (error) throw error;
      const loaded = await load(code);
      const self = loaded.players.find((p) => p.id === body.id);
      return out({ ...publicState(loaded.room, loaded.players, self, false), playerId: body.id, playerToken: body.playerToken });
    }

    if (action === "state") return out(publicState(room, players, me, host));

    if (action === "start") {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      if (room.phase !== "lobby") return out({ error: "ALREADY" }, 409);
      if (players.length < 2) return out({ error: "NEED_PLAYERS" }, 400);
      await enterPhase(room, players, "plan");
      const loaded = await load(code);
      return out(publicState(loaded.room, loaded.players, null, true));
    }

    if (action === "plan") {
      if (!me || room.phase !== "plan") return out({ error: "PHASE" }, 409);
      const budget = int(secretOf(me).income, incomeFor(me, players));
      const plan = sanitizePlan(body, players, budget, room.state?.control || {}, me.id);
      if (body.spotlight && DISTRICTS.some((d) => d.id === body.spotlight)) {
        await savePlayer(code, me.id, { spotlight: body.spotlight });
      }
      await savePlayer(code, me.id, { ready: true, secret: { ...secretOf(me), plan, income: budget } });
      const loaded = await load(code);
      const self = loaded.players.find((p) => p.id === me.id);
      const next = await maybeAdvance(loaded.room, loaded.players);
      return out(publicState(next.room, next.players, next.players.find((p) => p.id === self.id), false));
    }

    if (action === "spotlight") {
      if (!me || !["plan", "cards", "lobby"].includes(room.phase)) return out({ error: "PHASE" }, 409);
      if (!DISTRICTS.some((d) => d.id === body.spotlight) && body.spotlight !== null) return out({ error: "BAD_TARGET" }, 400);
      await savePlayer(code, me.id, { spotlight: body.spotlight || null });
      const loaded = await load(code);
      return out(publicState(loaded.room, loaded.players, loaded.players.find((p) => p.id === me.id), false));
    }

    if (action === "playCard") {
      if (!me || room.phase !== "cards") return out({ error: "PHASE" }, 409);
      const hand = handOf(me);
      if (body.skip) {
        await savePlayer(code, me.id, { ready: true, secret: { ...secretOf(me), cardPlay: null } });
      } else {
        const cardId = String(body.cardId || "") as CardType;
        if (!hand.includes(cardId)) return out({ error: "NO_CARD" }, 400);
        await savePlayer(code, me.id, {
          ready: true,
          secret: { ...secretOf(me), cardPlay: { cardId, targetPlayerId: body.targetPlayerId || null, regionId: body.regionId || null } },
        });
      }
      const loaded = await load(code);
      const next = await maybeAdvance(loaded.room, loaded.players);
      return out(publicState(next.room, next.players, next.players.find((p) => p.id === me.id), false));
    }

    if (action === "voteDebate") {
      if (!me || room.phase !== "debate") return out({ error: "PHASE" }, 409);
      const tied: string[] = room.state?.debateTied || [];
      if (!tied.includes(body.target) || body.target === me.id) return out({ error: "BAD_TARGET" }, 400);
      const state = { ...(room.state || {}), debateVotes: { ...(room.state?.debateVotes || {}), [me.id]: body.target } };
      await saveRoom(room, { state });
      await savePlayer(code, me.id, { ready: true });
      const loaded = await load(code);
      const next = await maybeAdvance(loaded.room, loaded.players);
      return out(publicState(next.room, next.players, next.players.find((p) => p.id === me.id), false));
    }

    if (action === "togglePause") {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      if (room.phase === "paused") {
        await saveRoom(room, { phase: room.paused_phase || "plan", paused_phase: null, phase_started_at: nowIso() });
      } else if (!["lobby", "finished"].includes(room.phase)) {
        await saveRoom(room, { phase: "paused", paused_phase: room.phase });
      }
      const loaded = await load(code);
      return out(publicState(loaded.room, loaded.players, null, true));
    }

    if (action === "advance") {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      if (room.phase === "plan") await enterPhase(room, players, "cards");
      else if (room.phase === "cards") {
        const fake = { ...room, phase_started_at: new Date(0).toISOString() };
        await maybeAdvance(fake, players);
      } else if (room.phase === "reveal") {
        const fake = { ...room, phase_started_at: new Date(0).toISOString() };
        await maybeAdvance(fake, players);
      } else if (room.phase === "debate") {
        const fake = { ...room, phase_started_at: new Date(0).toISOString() };
        await maybeAdvance(fake, players);
      }
      const loaded = await load(code);
      return out(publicState(loaded.room, loaded.players, null, true));
    }

    if (action === "addBot") {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      if (room.phase !== "lobby") return out({ error: "PHASE" }, 409);
      if (players.length >= MAX_PLAYERS) return out({ error: "ROOM_FULL", code: "ROOM_FULL" }, 409);
      const level: BotLevel = body.level === "chaos" ? "chaos" : "pro";
      const taken = new Set(players.map((p) => p.name));
      const name = BOT_NAMES[level].find((n) => !taken.has(n)) || `مرشح ${players.length + 1}`;
      const color = COLORS.find((c) => !players.some((p) => p.color === c)) || COLORS[players.length % COLORS.length];
      const { error } = await db.from("candidate_players").insert({
        id: crypto.randomUUID(), room_code: code, name, color,
        session_token: `bot:${level}:${crypto.randomUUID()}`, last_seen: nowIso(),
      });
      if (error) throw error;
      const loaded = await load(code);
      return out(publicState(loaded.room, loaded.players, null, true));
    }

    if (action === "removeBot") {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      if (room.phase !== "lobby") return out({ error: "PHASE" }, 409);
      const bots = players.filter(isBot);
      const target = bots.find((p) => p.id === body.target) || bots[bots.length - 1];
      if (!target) return out({ error: "NOT_FOUND" }, 404);
      const { error } = await db.from("candidate_players").delete().eq("room_code", code).eq("id", target.id);
      if (error) throw error;
      const loaded = await load(code);
      return out(publicState(loaded.room, loaded.players, null, true));
    }

    if (action === "kick") {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      const target = players.find((p) => p.id === body.target);
      if (!target) return out({ error: "NOT_FOUND" }, 404);
      await savePlayer(code, target.id, { afk: true, ready: true });
      const loaded = await load(code);
      return out(publicState(loaded.room, loaded.players, null, true));
    }

    if (action === "leave") {
      if (!me) return out({ error: "UNAUTHORIZED" }, 403);
      await savePlayer(code, me.id, { afk: true, ready: true });
      return out({ ok: true });
    }

    if (action === "createReplacement") {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      const target = players.find((p) => p.id === body.target);
      if (!target) return out({ error: "NOT_FOUND" }, 404);
      const replacementCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      await savePlayer(code, target.id, {
        replacement_code: replacementCode,
        replacement_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      return out({ replacementCode, target: target.id });
    }

    if (action === "claimSeat") {
      const name = cleanName(body.name);
      const token = String(body.replacementCode || "").toUpperCase();
      const target = players.find((p) => p.replacement_code === token && p.replacement_expires_at && new Date(p.replacement_expires_at).getTime() > Date.now());
      if (!target || !name) return out({ error: "BAD_CODE" }, 400);
      const playerToken = String(body.playerToken || crypto.randomUUID());
      await savePlayer(code, target.id, {
        name, session_token: playerToken, afk: false, replacement_code: null, replacement_expires_at: null, last_seen: nowIso(),
      });
      const loaded = await load(code);
      const self = loaded.players.find((p) => p.id === target.id);
      return out({ ...publicState(loaded.room, loaded.players, self, false), playerId: target.id, playerToken });
    }

    if (action === "returnToLobby") {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      for (const p of players) {
        await savePlayer(code, p.id, { seats: 0, votes_bank: 0, regions_count: 0, ready: false, afk: false, hand: [], secret: {}, spotlight: null });
      }
      await saveRoom(room, { phase: "lobby", round: 0, paused_phase: null, state: emptyInfluence(), phase_started_at: nowIso() });
      const loaded = await load(code);
      return out(publicState(loaded.room, loaded.players, null, true));
    }

    return out({ error: "UNKNOWN_ACTION" }, 400);
  } catch (error: any) {
    const status = error?.status || 500;
    return out({ error: error?.message || "SERVER" }, status);
  }
});
