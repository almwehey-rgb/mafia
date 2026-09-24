import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { AsyncLocalStorage } from "node:async_hooks";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Expose-Headers": "X-Request-Id,Server-Timing",
};
const requestDatabase = new AsyncLocalStorage<{headers: Record<string,string>; client?: any; plan?: TransitionPlan; requestId?:string; started?:number; action?:string; observation?:any}>();
const copyJson = (value:any) => JSON.parse(JSON.stringify(value));
// Compute multi-step transitions on a private copy. No partial result is visible
// until the database validates the preimage and commits all changes together.
class TransitionPlan {
  beforeRoom:any; beforePlayers:any[]; room:any; players:any[];
  snapshots:any[]=[]; audits:any[]=[]; stats=false;
  constructor(room:any,players:any[]) {
    this.beforeRoom=copyJson(room);this.beforePlayers=copyJson(players);
    this.room=copyJson(room);this.players=copyJson(players);
  }
  from(table:string) {
    if(!['mafia_rooms','mafia_players','mafia_snapshots','mafia_audit_events'].includes(table))throw Error('UNPLANNED_TABLE '+table);
    const rows=table==='mafia_rooms'?[this.room]:table==='mafia_players'?this.players:table==='mafia_snapshots'?this.snapshots:this.audits;
    let filters:((row:any)=>boolean)[]=[], patch:any, inserted:any, one=false, deleting=false;
    const valueAt=(row:any,key:string)=>key.split(/->>?/).reduce((value:any,k:string)=>value?.[k],row);
    const query:any={
      select(){return query;},order(){return query;},limit(){return query;},
      range(){filters.push(()=>false);return query;},single(){one=true;return query;},maybeSingle(){one=true;return query;},
      update(value:any){patch=copyJson(value);return query;},insert(value:any){inserted=copyJson(value);return query;},
      delete(){deleting=true;return query;},
      eq(key:string,value:any){filters.push(row=>{const actual=valueAt(row,key);return actual!==null&&typeof actual==='object'?JSON.stringify(actual)===value:String(actual)===String(value);});return query;},
      is(key:string,value:any){filters.push(row=>valueAt(row,key)===value);return query;},
      in(key:string,values:any[]){filters.push(row=>values.includes(valueAt(row,key)));return query;},
      then(resolve:any,reject:any){return Promise.resolve().then(()=>{
        if(inserted){if(table!=='mafia_snapshots'&&table!=='mafia_audit_events')throw Error('UNPLANNED_INSERT');rows.push(inserted);}
        const selected=rows.filter(row=>filters.every(filter=>filter(row)));
        if(patch)for(const row of selected)Object.assign(row,patch);
        if(deleting){if(table!=='mafia_snapshots')throw Error('UNPLANNED_DELETE');for(const row of selected)rows.splice(rows.indexOf(row),1);}
        return {data:copyJson(one?selected[0]||null:selected),error:null};
      }).then(resolve,reject);}
    };
    return query;
  }
}
function currentDatabase() {
  const scope = requestDatabase.getStore();
  if (!scope) throw new Error("MISSING_REQUEST_SCOPE");
  return scope.client ||= createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {global:{headers:scope.headers}});
}
// Some legacy handlers do not inspect every query error. Never let a fenced
// write silently fail and then continue applying the rest of an old operation.
function fencedQuery(query: any): any {
  return new Proxy(query, {get(target,key) {
    if(key==='then')return (resolve:any,reject:any)=>target.then((result:any)=>{
      if(result?.error?.message==='STALE_GAME')throw result.error;
      return result;
    }).then(resolve,reject);
    const value=target[key];
    return typeof value==='function' ? (...args:any[])=>fencedQuery(value.apply(target,args)) : value;
  }});
}
const db = {from:(table:string)=>fencedQuery(requestDatabase.getStore()?.plan?.from(table) || currentDatabase().from(table)),rpc:(name:string,args:any)=>fencedQuery(currentDatabase().rpc(name,args))};
// A successful response must never acknowledge a rejected database write.
async function persist(query: any) { const result=await query; if(result.error)throw result.error; return result; }
type RoomRequest = {
  action?:string; code?:string; lifecycleVersion?:number;
  hostToken?:string; hostAccessToken?:string; id?:string; playerToken?:string;
  spectatorToken?:string; target?:string;
  [field:string]:any;
};
type ErrorResponse = {error:string};
type PublicRoomResponse = {
  code:string; phase:string; round:number; lifecycleVersion:number;
  matchId:string|null; players:any[]; me?:any;
  [field:string]:any;
};
type RouteContext = {
  body:RoomRequest; action:string; ip:string; now:number; started:number;
};
type RoomRouteContext = RouteContext & {code:string;room:any;players:any[];me:any;host:boolean;authenticatedSpectator:any};
// Shared protocol vocabulary; request/response shape documented in docs/protocol.md.
const REQUEST_ACTIONS=["acknowledgeRole","act","addBot","adminState","advanceVerdict","beginNight","claimSeat","controlDiscussion","create","createAdminInvite","createReplacement","electMafiaLeader","endGame","expelPlayer","finishDiscussion","health","hostLogin","hostLogout","hostPreferences","id","jail","join","joinSpectator","kick","lastShot","lawyerProtect","leaderboard","leave","listSnapshots","messages","moderationLog","mute","ok","operationsStatus","passDiscussion","profile","recoverProfile","redeemAdminInvite","report","resolveNight","resolveVote","restart","restoreSnapshot","returnToLobby","revokeAdminAccess","saveWill","sendMessage","setDiscussionClaim","spectatorState","start","startDiscussion","startVote","state","systemStatus","togglePause","transferHost","vote","warnPlayer","operationsStatus"];
// Allowlisted operational fields only. Never record headers, request bodies,
// credentials, player names, role assignments or action targets.
const requestTotals={requests:0,failed:0,slow:0};
function observeRoom(room:any) {
  const scope=requestDatabase.getStore();
  if(scope)scope.observation={room:room.code,phase:room.phase,version:room.lifecycle_version||0,phaseStartedAt:room.phase_started_at};
}
function recordResponse(response:Response) {
  const scope=requestDatabase.getStore()!;
  const durationMs=Math.max(0,Date.now()-(scope.started||Date.now()));
  requestTotals.requests++;if(response.status>=500)requestTotals.failed++;if(durationMs>=1000)requestTotals.slow++;
  response.headers.set('X-Request-Id',scope.requestId||'');
  response.headers.set('Server-Timing',`app;dur=${durationMs}`);
  response.headers.set('Cache-Control','no-store');
  const shouldLog=Deno.env.get('MAFIA_LOG_ALL')==='true'||response.status>=400||durationMs>=1000||requestTotals.requests%20===0;
  if(shouldLog)console.log(JSON.stringify({event:'mafia.request',requestId:scope.requestId,action:scope.action||'unknown',status:response.status,durationMs,...scope.observation}));
  return response;
}
async function operationsStatus(body:any) {
  if(!await validHostAccess(body.hostAccessToken))return out({error:'UNAUTHORIZED'},403);
  const {data,error}=await db.from('mafia_rooms').select('code,phase,round,phase_started_at,lifecycle_version').in('phase',['reveal','night','day','vote','nomination','trial','verdict']).limit(1000);
  if(error)throw error;
  return out({status:'ok',time:Date.now(),instanceMetrics:{...requestTotals},rooms:data||[],truncated:(data||[]).length===1000});
}
const rateBuckets = new Map<string, { count: number; reset: number }>();
const loginBuckets = new Map<string, { count: number; reset: number }>();
const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const shuffle = <T>(items: T[]) => { for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; } return items; };
const mafiaRole = (role: string | null) => role === "mafia" || role === "mafia_boss";
const selected = (player: any) => String(player.action_target || "").split(",").filter(Boolean);
const results = (player: any) => { try { return JSON.parse(player.investigation_result || "[]"); } catch { return []; } };
const defaultEnabledRoles = { doctor: true, detective: true, lawyer: true, jailer: true, vigilante: false, witch: false, serial_killer: false, jester: false, cupid: false, escort: false, godfather_innocent: true, mafia_kill_start_round: 2, mafia_kill_mode: "always", mafia_kill_enabled: true, reveal_dead_roles: false, allow_no_vote: true, full_trial: true, kids_mode: false, paused_phase: null };
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

async function load(code: string) {
  const [roomResult, playersResult] = await Promise.all([
    db.from("mafia_rooms").select("*").eq("code", code).single(),
    db.from("mafia_players").select("*").eq("room_code", code).order("joined_at"),
  ]);
  if (roomResult.error && roomResult.error.code !== 'PGRST116') throw roomResult.error;
  if (playersResult.error) throw playersResult.error;
  return { room:roomResult.data, players: playersResult.data || [] };
}
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

function botDiscussionLines(room: any, players: any[]) {
  const alive = players.filter((x) => x.alive && x.is_bot);
  const lines: Record<string,string[]> = {
    skeptic: ["أحتاج دليلًا من التصويت، لا مجرد إحساس.", "من غيّر رأيه؟ هذا أهم شيء عندي."],
    quiet: ["سأسمع الجميع قبل أن أتهم أحدًا.", "تصويتي مبني على ما حدث، لا على الاسم."],
    bold: ["عندي شك قوي، وأريد من المتهم يرد الآن.", "التردد هنا يخدم المافيا."],
    empathetic: ["خلونا نعطي المتهم فرصة يشرح نفسه.", "أفهم خوفكم، لكن نحتاج دليلًا عادلًا."],
    chaotic: ["في شيء لا يركب في قصة الليلة.", "أغيّر رأيي إذا ظهر دليل أقوى."]
  };
  return alive.map((bot, index) => {
    const state=roleState(bot), style=state.botStyle||"quiet", pool=lines[style]||lines.quiet;
    const suspicion=state.botMemory?.suspicion||{};
    const topId=Object.entries(suspicion).sort((a:any,b:any)=>Number(b[1])-Number(a[1]))[0]?.[0];
    const top=players.find((p:any)=>p.id===topId&&p.alive);
    const text=top && Number(suspicion[top.id])>0
      ? (style==='empathetic' ? `خلونا نسمع تفسير ${top.name} قبل الحكم.` : style==='bold' ? `الشك عندي على ${top.name}، نحتاج رد واضح.` : `أبي أفهم تناقض ${top.name} قبل التصويت.`)
      : pool[(room.round+index)%pool.length];
    return { id: `${room.round}-${bot.id}`, playerId: bot.id, name: bot.name, text };
  });
}
async function rememberPublicMessage(room:any, players:any[], author:any, content:string) {
  const mentioned=players.filter((p:any)=>p.alive&&p.id!==author.id&&content.includes(p.name));
  if (!mentioned.length) return;
  for (const bot of players.filter((p:any)=>p.is_bot&&p.alive)) {
    const state=roleState(bot), memory=state.botMemory||{suspicion:{},claims:[],votes:[]};
    const suspicion={...(memory.suspicion||{})};
    for (const target of mentioned) suspicion[target.id]=Number(suspicion[target.id]||0)+1;
    const claims=[...(memory.claims||[]),{round:room.round,authorId:author.id,mentioned:mentioned.map((p:any)=>p.id),text:content}].slice(-30);
    await persist(db.from('mafia_players').update({role_state:{...state,botMemory:{...memory,suspicion,claims}}}).eq('room_code',room.code).eq('id',bot.id));
  }
}

function botRepliesForPublicMessage(room:any, players:any[], author:any, content:string) {
  const mentioned=players.filter((p:any)=>p.alive&&p.id!==author.id&&content.includes(p.name));
  if (!mentioned.length) return [];
  const target=mentioned[0];
  return players.filter((p:any)=>p.is_bot&&p.alive).slice(0,2).map((bot:any)=>{
    const style=roleState(bot).botStyle||'quiet';
    const text=style==='bold' ? `أتفق أن ${target.name} يحتاج يوضح موقفه.` : style==='empathetic' ? `خلونا نعطي ${target.name} فرصة يشرح.` : style==='skeptic' ? `شنو الدليل على ${target.name}؟ نحتاج واقعة محددة.` : `سمعت الاتهام ضد ${target.name}، نراقب رده.`;
    return {room_code:room.code,round:room.round,channel:'public',author_id:bot.id,author_name:bot.name,content:text};
  });
}

async function botVotes(room: any, players: any[], verdict = false) {
  const alive = players.filter((x) => x.alive);
  for (const bot of alive.filter((x) => x.is_bot && !x.vote_target && (!verdict || x.id !== room.accused_player))) {
    const candidates = alive.filter((x) => x.id !== bot.id);
    const nonMafia = candidates.filter((x) => !mafiaRole(x.role));
    const state=roleState(bot), suspicion=state.botMemory?.suspicion||{};
    const ranked=[...(mafiaRole(bot.role)?nonMafia:candidates)].sort((a,b)=>(Number(suspicion[b.id]||0)-Number(suspicion[a.id]||0)));
    const difficulty=state.botDifficulty || room.enabled_roles?.solo_difficulty || 'balanced';
    const randomChance=difficulty==='easy' ? .55 : difficulty==='hard' ? .05 : .2;
    const likely=(Math.random()<randomChance ? randomItem(ranked) : ranked[0]) || randomItem(candidates);
    const value = verdict ? (Math.random() < (mafiaRole(bot.role) ? .35 : .68) ? "GUILTY" : "INNOCENT") : (likely?.id || "SKIP");
    state.botMemory={...state.botMemory,suspicion:{...suspicion,...(likely?{[likely.id]:Number(suspicion[likely.id]||0)+1}:{})},votes:[...(state.botMemory?.votes||[]),{round:room.round,target:likely?.id||null}]};
    await persist(db.from("mafia_players").update({role_state:state}).eq("room_code",room.code).eq("id",bot.id));
    await persist(db.from("mafia_players").update({ vote_target: value }).eq("room_code", room.code).eq("id", bot.id));
  }
}

async function recordStats(room: any, players: any[]) {
  if (!room.winner || room.stats_recorded) return;
  const plan=requestDatabase.getStore()?.plan;
  if(plan){plan.stats=true;return;}
  for (const player of players.filter((x) => x.profile_token && !x.is_bot)) {
    const team = mafiaRole(player.role) ? "mafia" : player.role === "serial_killer" || player.role === "jester" ? "independent" : "village";
    const won = room.winner === team || (room.winner === "serial_killer" && player.role === "serial_killer") || (room.winner === "jester" && player.id === room.winner_player);
    const { data: profile } = await db.from("mafia_profiles").select("*").eq("profile_token", player.profile_token).maybeSingle();
    const base = profile || { games: 0, wins: 0, village_wins: 0, mafia_wins: 0, independent_wins: 0 };
    await persist(db.from("mafia_profiles").upsert({ profile_token: player.profile_token, nickname: player.name, games: base.games + 1, wins: base.wins + (won ? 1 : 0), village_wins: base.village_wins + (won && team === "village" ? 1 : 0), mafia_wins: base.mafia_wins + (won && team === "mafia" ? 1 : 0), independent_wins: base.independent_wins + (won && team === "independent" ? 1 : 0), updated_at: new Date().toISOString() }));
    const season = currentSeason();
    const { data: seasonProfile } = await db.from("mafia_season_stats").select("games,wins").eq("profile_token", player.profile_token).eq("season", season).maybeSingle();
    await persist(db.from("mafia_season_stats").upsert({ profile_token: player.profile_token, season, games: Number(seasonProfile?.games || 0) + 1, wins: Number(seasonProfile?.wins || 0) + (won ? 1 : 0), updated_at: new Date().toISOString() }));
  }
  await persist(db.from("mafia_rooms").update({ stats_recorded: true }).eq("code", room.code));
}

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

function actorRateLimited(key:string,now:number) {
  const bucket=rateBuckets.get(key);
  if (!bucket || bucket.reset < now) rateBuckets.set(key,{count:1,reset:now+60_000});
  else if (++bucket.count > 240) return true;
  if (rateBuckets.size > 10000) for (const [key,value] of rateBuckets) if (value.reset < now) rateBuckets.delete(key);
  return false;
}
async function autoAdvanceSolo(code:string, room:any, players:any[]) {
  if (!room.enabled_roles?.solo_mode || ['lobby','finished','paused'].includes(room.phase)) return {room,players};
  const base:any={body:{hostToken:room.host_token,code},action:'auto',ip:'solo-manager',now:Date.now(),started:Date.now(),code,room,players,me:null,host:true,authenticatedSpectator:null};
  if (room.phase === 'reveal') {
    for (const bot of players.filter((p:any)=>p.is_bot && roleState(p).ack !== true)) await db.from('mafia_players').update({role_state:{...roleState(bot),ack:true}}).eq('room_code',code).eq('id',bot.id);
    ({room,players}=await load(code));
    if (players.length && players.every((p:any)=>roleState(p).ack===true)) await routeBeginNight({...base,action:'beginNight',room,players});
    return await load(code);
  }
  if (room.phase === 'day') {
    const discussion=discussionView(room);
    if (!room.enabled_roles?.discussion_state || discussion.round !== room.round) await routeStartDiscussion({...base,action:'startDiscussion'});
    else if (discussion.status === 'active' && Date.now() >= (discussion.mode === 'turns' ? discussion.turnStartedAt + discussion.seconds*1000 : discussion.endsAt)) {
      const saved=room.enabled_roles.discussion_state;
      const next = discussion.mode === 'turns' && discussion.index + 1 < saved.order.length ? {...saved,cursor:discussion.index+1,turnStartedAt:Date.now(),version:saved.version+1} : {...saved,finished:true,version:saved.version+1};
      await db.from('mafia_rooms').update({enabled_roles:{...room.enabled_roles,discussion_state:next}}).eq('code',code).eq('phase','day').eq('enabled_roles->discussion_state->>id',saved.id).eq('enabled_roles->discussion_state->>version',String(saved.version));
    }
    ({room,players}=await load(code));
    if (discussionView(room).complete) { await botDayActions(room,players); ({room,players}=await load(code)); await routeStartVote({...base,action:'startVote',room,players}); }
  }
  if (room.phase === 'nomination' || room.phase === 'vote' || room.phase === 'verdict') {
    const required=room.phase==='verdict'?players.filter((p:any)=>p.alive&&p.id!==room.accused_player):players.filter((p:any)=>p.alive);
    if (required.every((p:any)=>p.vote_target)) await routeResolveVote({...base,action:'resolveVote',room,players});
    else if (room.phase==='trial') await routeAdvanceVerdict({...base,action:'advanceVerdict',room,players});
  }
  if (room.phase === 'trial' && room.accused_player) { await routeAdvanceVerdict({...base,action:'advanceVerdict',room,players}); }
  if (room.phase === 'night') {
    const needs=(p:any)=>p.alive&&!p.is_bot&&!p.jailed&&((p.role==='detective'&&room.round<=detectiveQuestionCount(room.detective_questions))||['mafia','mafia_boss','doctor','lawyer','jailer','witch','serial_killer','cupid','escort','revealer'].includes(p.role));
    if (players.filter(needs).every((p:any)=>p.action_target) || !players.some(needs)) await routeResolveNight({...base,action:'resolveNight',room,players});
  }
  return {room,players};
}
async function readCurrentState(code:string,body:any,now:number) {
  const {data,error}=await db.rpc('mafia_presence',{p_code:code,p_host_token:body.hostToken||null,p_player_id:body.id||null,p_player_token:body.playerToken||null});
  if(error)throw error;
  if(data?.error)return out({error:data.error},data.error==='UNAUTHORIZED'?403:404);
  if(data?.ok!==true)throw Error('PRESENCE_FAILED');
  let {room,players}=await load(code);
  if(!room)return out({error:'ROOM_NOT_FOUND'},404);
  let me=authenticatedPlayer(players,body);
  let host=body.hostToken===room.host_token || Boolean(me && room.host_player_id===me.id && (me.alive||room.enabled_roles?.controller_spectator===true));
  if(!host && (!me||me.left_at))return out({error:'UNAUTHORIZED'},403);
  if(actorRateLimited(me?`player:${code}:${me.id}`:`host:${code}`,now))return out({error:'RATE_LIMITED'},429);
  if(await reconcileDeparture(room,players))({room,players}=await load(code));
  ({room,players}=await autoAdvanceSolo(code,room,players));
  me=authenticatedPlayer(players,body);
  host=body.hostToken===room.host_token || Boolean(me && room.host_player_id===me.id && (me.alive||room.enabled_roles?.controller_spectator===true));
  return out(publicView(room,players,me?.id,host));
}
async function routeHostLogin(context:RouteContext) {
  let {body, action, ip, now, started}=context;
  {
      const loginBucket = loginBuckets.get(ip);
      if (!loginBucket || loginBucket.reset < now) loginBuckets.set(ip, { count: 1, reset: now + 15 * 60_000 });
      else if (++loginBucket.count > 5) return out({ error: "LOGIN_RATE_LIMITED" }, 429);
      const pinHash = await sha256(cleanText(body.pin, 32));
      const { data: auth } = await db.from("mafia_host_auth").select("pin_hash").eq("id", "default").maybeSingle();
      if (!auth || auth.pin_hash !== pinHash) {
        await audit(null, action, "denied", started);
        return out({ error: "INVALID_PIN" }, 403);
      }
      loginBuckets.delete(ip);
      const hostAccessToken = `${crypto.randomUUID()}.${crypto.randomUUID()}`;
      await persist(db.from("mafia_host_sessions").delete().lt("expires_at", new Date().toISOString()));
      await persist(db.from("mafia_host_sessions").insert({ token_hash: await sha256(hostAccessToken), expires_at: new Date(Date.now() + 90 * 24 * 60 * 60_000).toISOString() }));
      const { data: prefs } = await db.from("mafia_host_preferences").select("settings").eq("id", "default").maybeSingle();
      await audit(null, action, "ok", started);
      return out({ hostAccessToken, preferences: cleanPreferences(prefs?.settings || {}) });
    
  }
}
async function routeHostPreferences(context:RouteContext) {
  let {body, action, ip, now, started}=context;
  {
      if (!await validHostAccess(body.hostAccessToken)) return out({ error: "UNAUTHORIZED" }, 403);
      if (body.settings) {
        const settings = cleanPreferences(body.settings);
        await persist(db.from("mafia_host_preferences").upsert({ id: "default", settings, updated_at: new Date().toISOString() }));
        return out({ preferences: settings, saved: true });
      }
      const { data: prefs } = await db.from("mafia_host_preferences").select("settings").eq("id", "default").maybeSingle();
      return out({ preferences: cleanPreferences(prefs?.settings || {}) });
    
  }
}
async function routeHostLogout(context:RouteContext) {
  let {body, action, ip, now, started}=context;
  {
      const token = cleanText(body.hostAccessToken, 200);
      if (token) {
        const hash = await sha256(token);
        const { error } = await db.from("mafia_rooms").update({ host_token: crypto.randomUUID() }).eq("host_session_hash", hash);
        if (error) throw error;
        const { error: sessionError } = await db.from("mafia_host_sessions").delete().eq("token_hash", hash);
        if (sessionError) throw sessionError;
      }
      // Revoke legacy room keys too, but only with proof of possession.
      for (const session of (Array.isArray(body.rooms) ? body.rooms : []).slice(0,100)) {
        if (!/^\d{4}$/.test(session.code) || typeof session.hostToken !== "string" || !session.hostToken) continue;
        const { error } = await db.from("mafia_rooms").update({ host_token: crypto.randomUUID() }).eq("code", session.code).eq("host_token", session.hostToken);
        if (error) throw error;
      }
      return out({ ok: true });
    
  }
}
async function routeRecoverProfile(context:RouteContext) {
  let {body, action, ip, now, started}=context;
  {
      const recoveryCode = cleanText(body.recoveryCode, 16).toUpperCase();
      const { data } = await db.from("mafia_profiles").select("profile_token,nickname").eq("recovery_code", recoveryCode).maybeSingle();
      if (!data) return out({ error: "RECOVERY_NOT_FOUND" }, 404);
      await audit(null, action, "ok", started);
      return out({ profileToken: data.profile_token, nickname: data.nickname });
    
  }
}
async function routeCreate(context:RouteContext) {
  let {body, action, ip, now, started}=context;
  {
      if (!await validHostAccess(body.hostAccessToken)) return out({ error: "UNAUTHORIZED" }, 403);
      let code: string;
      do { code = String(Math.floor(1000 + Math.random() * 9000)); }
      while ((await db.from("mafia_rooms").select("code").eq("code", code)).data?.length);
      const hostToken = crypto.randomUUID();
      const { data: room, error } = await db.from("mafia_rooms").insert({
        code, host_token: hostToken, host_session_hash: await sha256(body.hostAccessToken),
        mafia_count: Math.max(1, Math.min(8, Number(body.mafiaCount) || 2)),
        detective_count: Math.max(0, Math.min(8, Number.isFinite(+body.detectiveCount) ? +body.detectiveCount : 1)),
        detective_questions: detectiveQuestionCount(body.detectiveQuestions),
        enabled_roles: enabledRoles(body.enabledRoles || defaultEnabledRoles),
      }).select("*").single();
      if (error || !room) throw error || new Error("CREATE_FAILED");
      return out({ ...publicView(room, [], undefined, true), hostToken });
    
  }
}
async function routeProfile(context:RouteContext) {
  let {body, action, ip, now, started}=context;
  {
      const profileToken = cleanText(body.profileToken, 80);
      if (!profileToken) return out({ profile: null });
      const [{ data }, { data: seasonData }] = await Promise.all([
        db.from("mafia_profiles").select("nickname,games,wins,village_wins,mafia_wins,independent_wins,correct_votes,recovery_code").eq("profile_token", profileToken).maybeSingle(),
        db.from("mafia_season_stats").select("games,wins").eq("profile_token", profileToken).eq("season", currentSeason()).maybeSingle(),
      ]);
      let profile = data;
      if (profile && !profile.recovery_code) {
        const recoveryCode = shortCode();
        const { data: updated } = await db.from("mafia_profiles").update({ recovery_code: recoveryCode }).eq("profile_token", profileToken).select("nickname,games,wins,village_wins,mafia_wins,independent_wins,correct_votes,recovery_code").single();
        profile = updated || { ...profile, recovery_code: recoveryCode };
      }
      return out({ profile: profile ? { ...profile, season: currentSeason(), season_games: seasonData?.games || 0, season_wins: seasonData?.wins || 0 } : null });
    
  }
}
async function routeLeaderboard(context:RouteContext) {
  let {body, action, ip, now, started}=context;
  {
      const [{ data }, { data: seasonRows }] = await Promise.all([
        db.from("mafia_profiles").select("nickname,games,wins").gt("games", 0).order("wins", { ascending: false }).order("games", { ascending: true }).limit(20),
        db.from("mafia_season_stats").select("profile_token,games,wins").eq("season", currentSeason()).gt("games", 0).order("wins", { ascending: false }).order("games", { ascending: true }).limit(20),
      ]);
      const tokens = (seasonRows || []).map((x) => x.profile_token);
      const { data: seasonNames } = tokens.length ? await db.from("mafia_profiles").select("profile_token,nickname").in("profile_token", tokens) : { data: [] };
      const names = new Map((seasonNames || []).map((x) => [x.profile_token, x.nickname]));
      return out({ leaderboard: data || [], season: currentSeason(), seasonLeaderboard: (seasonRows || []).map((x) => ({ nickname: names.get(x.profile_token) || "Player", games: x.games, wins: x.wins })) });
    
  }
}
async function routeCreateAdminInvite(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!body.hostToken || body.hostToken !== room.host_token) return out({ error:"UNAUTHORIZED" },403);
      const inviteToken=crypto.randomUUID()+crypto.randomUUID();
      const access=action === "revokeAdminAccess" ? null : { inviteHash:await sha256(inviteToken), inviteExpires:Date.now()+120000, hostHash:await sha256(room.host_token) };
      const {error}=await db.from("mafia_rooms").update({enabled_roles:{...room.enabled_roles,admin_access:access}}).eq("code",code);
      if(error)throw error;
      return out(action === "revokeAdminAccess" ? {revoked:true} : {inviteToken,expiresAt:access.inviteExpires});
    
  }
}
async function routeRedeemAdminInvite(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const access=room.enabled_roles?.admin_access;
      if(typeof body.inviteToken!=="string" || !access?.inviteHash || access.inviteExpires<Date.now() || access.hostHash!==await sha256(room.host_token) || await sha256(body.inviteToken)!==access.inviteHash) return out({error:"INVITE_EXPIRED"},403);
      const adminToken=crypto.randomUUID()+crypto.randomUUID();
      const expiresAt=Date.now()+12*60*60*1000;
      const {data,error}=await db.from("mafia_rooms").update({enabled_roles:{...room.enabled_roles,admin_access:{hostHash:access.hostHash,sessionHash:await sha256(adminToken),expiresAt}}}).eq("code",code).eq("enabled_roles",JSON.stringify(room.enabled_roles)).select("code");
      if(error)throw error;
      if(!data?.length)return out({error:"INVITE_USED"},409);
      return out({adminToken,expiresAt});
    
  }
}
async function routeAdminState(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      // Secret oversight belongs only to the original host, never delegated players.
      const access=room.enabled_roles?.admin_access;
      const admin=typeof body.adminToken==="string" && access?.sessionHash && access.expiresAt>Date.now() && access.hostHash===await sha256(room.host_token) && await sha256(body.adminToken)===access.sessionHash;
      if (!(typeof body.hostToken === "string" && body.hostToken && body.hostToken === room.host_token) && !admin) return out({ error: "UNAUTHORIZED" }, 403);
      const overview = { phase: room.phase, round: room.round, players: players.map(adminPlayerView),
        jailed: room.jailed_player, linked: room.linked_players || [], doctorLastTarget: room.doctor_last_target,
        executions: room.jailer_executions, pendingShot: room.enabled_roles?.pending_shot ? {playerId: room.enabled_roles.pending_shot.playerId, target: room.enabled_roles.pending_shot.target || null} : null };
      if (body.chat === true) {
        let query=db.from("mafia_messages").select("id,channel,author_id,author_name,content,created_at,round").eq("room_code",code);
        if(body.beforeId){if(!/^[1-9][0-9]{0,18}$/.test(String(body.beforeId)))return out({error:"INVALID_CURSOR"},400);query=query.lt("id",String(body.beforeId));}
        const {data,error}=await query.order("id",{ascending:false}).limit(81);
        if(error)throw error;
        const page=(data||[]).slice(0,80);
        return out({...overview,hasMore:(data||[]).length>80,nextCursor:page.length?String(page.at(-1).id):null,messages:page.reverse().map(m=>({id:String(m.id),channel:m.channel,name:players.find(p=>p.id===m.author_id)?.name||m.author_name,text:m.content,at:m.created_at,round:m.round}))});
      }
      if (body.history === true) {
        const { data, error } = await db.from("mafia_snapshots").select("phase,round,reason,created_at,players_state").eq("room_code", code).order("created_at", { ascending: false }).limit(20);
        if (error) throw error;
        return out({ ...overview, history: (data || []).map((s) => ({ phase:s.phase, round:s.round, reason:s.reason, at:s.created_at, players:(s.players_state || []).map(adminPlayerView) })) });
      }
      return out(overview);
    
  }
}
async function routeLastShot(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const pending = room.enabled_roles?.pending_shot;
      const shooter = pending && players.find((p) => p.id === pending.playerId);
      const skip = body.target === "SKIP";
      const recovering = pending?.resolving && pending.target === body.target && Date.now() - pending.resolvingAt >= 15000;
      if (!pending || room.phase === "finished" || body.shotId !== pending.id || !shooter || shooter.alive || shooter.role !== "vigilante" || (Number(roleState(shooter).bullets) <= 0 && !recovering)) return out({ error: "INVALID_ACTION" }, 409);
      if (me?.id !== shooter.id && !(host && (skip || shooter.is_bot || recovering))) return out({ error: "UNAUTHORIZED" }, 403);
      const target = players.find((p) => p.id === body.target && (p.alive || recovering));
      if (!skip && !target) return out({ error: "INVALID_ACTION" }, 400);
      if (pending.resolving && !recovering) return out({ error: "STALE_ACTION" }, 409);
      const lockedSettings = { ...room.enabled_roles, pending_shot: { ...pending, resolving: true, target: body.target, resolvingAt: Date.now() } };
      const { data: locked, error } = await db.from("mafia_rooms").update({ enabled_roles: lockedSettings }).eq("code", code).eq("enabled_roles", JSON.stringify(room.enabled_roles)).select("code");
      if (error) throw error;
      if (!locked?.length) return out({ error: "STALE_ACTION" }, 409);
      const causes: Record<string, string> = {};
      if (target) {
        causes[target.id] = "vigilante_kill";
        if ((room.linked_players || []).includes(target.id)) for (const id of room.linked_players) if (id !== target.id && players.some((p) => p.id === id && p.alive)) causes[id] = "lovers_died";
        await eliminatePlayers(room, players, causes);
      }
      const spent = await db.from("mafia_players").update({ role_state: { ...roleState(shooter), bullets: 0 } }).eq("room_code", code).eq("id", shooter.id);
      if (spent.error) throw spent.error;
      const completed = await db.from("mafia_rooms").update({ enabled_roles: { ...lockedSettings, pending_shot: null }, phase: pending.nextPhase, round: pending.nextRound, phase_started_at: new Date(Date.now()).toISOString(), phase_paused_at: null, last_deaths: [...new Set([...(room.last_deaths || []), ...Object.keys(causes)])], last_event: [room.last_event, skip ? "vigilante_skipped" : "vigilante_kill"].filter(Boolean).join(",") }).eq("code", code);
      if (completed.error) throw completed.error;
      await promoteMafia(code);
      const winner = await checkWin(code);
      ({ room, players } = await load(code));
      if (!winner) { if (room.phase === "night") await botNightActions(room, players); else if (room.phase === "day") await botDayActions(room, players); ({ room, players } = await load(code)); }
      return out(publicView(room, players, me?.id, host));
    
  }
}
async function routeJoinSpectator(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const name = cleanText(body.name, 20);
      if (!name) return out({ error: "NAME_REQUIRED" }, 400);
      const id = cleanText(body.id, 80) || crypto.randomUUID();
      const spectatorToken = crypto.randomUUID();
      await persist(db.from("mafia_spectators").upsert({ room_code: code, id, name, session_token: spectatorToken, last_seen: new Date().toISOString() }));
      await audit(code, action, "ok", started);
      return out({ ...publicView(room, players), spectator: { id, name }, spectatorToken });
    
  }
}
async function routeSpectatorState(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const spectator = authenticatedSpectator;
      if (!spectator || spectator.session_token !== body.spectatorToken) return out({ error: "UNAUTHORIZED" }, 403);
      await persist(db.from("mafia_spectators").update({ last_seen: new Date().toISOString() }).eq("room_code", code).eq("id", spectator.id));
      return out({ ...publicView(room, players), spectator: { id: spectator.id, name: spectator.name } });
    
  }
}
async function routeClaimSeat(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const replacementCode = cleanText(body.replacementCode, 12).toUpperCase();
      const target = players.find((x) => x.replacement_code === replacementCode && (!x.replacement_expires_at || new Date(x.replacement_expires_at).getTime() > Date.now()));
      const name = cleanText(body.name, 20);
      if (!target || target.left_at || !name) return out({ error: "REPLACEMENT_NOT_FOUND" }, 404);
      if(players.some(p=>p.id!==target.id&&p.name.trim().toLowerCase()===name.toLowerCase()))return out({error:'NAME_TAKEN'},409);
      requestDatabase.getStore()!.plan=new TransitionPlan(room,players);
      const playerToken = crypto.randomUUID();
      const profileToken = cleanText(body.profileToken, 80) || crypto.randomUUID();
      await persist(db.from("mafia_players").update({ name, session_token: playerToken, profile_token: profileToken, replacement_code: null, replacement_expires_at: null, last_seen: new Date().toISOString() }).eq("room_code", code).eq("id", target.id));
      ({ room, players } = await load(code));
      await audit(code, action, "ok", started);
      return out({ ...publicView(room, players, target.id), playerToken, profileToken, playerId: target.id });
    
  }
}
async function routeJoin(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const name = String(body.name || "").trim().slice(0, 20);
      const requestedId = String(body.id || crypto.randomUUID());
      if (!validPlayerId(requestedId)) return out({ error: "INVALID_PLAYER_ID" }, 400);
      const existing = players.find((x) => x.id === requestedId);
      if (existing) {
        if (!body.playerToken || existing.session_token !== body.playerToken) return out({ error: "SESSION_INVALID" }, 403);
        // Reconnect is an authenticated seat recovery, not a new admission or rename.
        const { error } = await db.from("mafia_players").update({ last_seen: new Date().toISOString() }).eq("room_code", code).eq("id", requestedId);
        if (error) throw error;
        existing.last_seen = new Date().toISOString();
        return out({ ...publicView(room, players, requestedId), playerToken: body.playerToken });
      }
      if (room.phase !== "lobby") return out({ error: "GAME_STARTED" }, 409);
      if (players.length >= 20) return out({ error: "ROOM_FULL" }, 409);
      if (!name) return out({ error: "NAME_REQUIRED" }, 400);
      if (players.some((x) => x.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) return out({ error: "NAME_TAKEN" }, 409);
      const playerToken = typeof body.playerToken==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.playerToken) ? body.playerToken : crypto.randomUUID();
      const profileToken = cleanText(body.profileToken, 80) || crypto.randomUUID();
      const {data:result,error}=await db.rpc('mafia_join_seat',{p_code:code,p_id:requestedId,p_name:name,p_player_token:playerToken,p_profile_token:profileToken});
      if(error)throw error;
      if(result?.error)return out({error:result.error},result.error==='SESSION_INVALID'?403:result.error==='ROOM_NOT_FOUND'?404:409);
      if(!result?.player)throw new Error('JOIN_FAILED');
      ({room,players}=await load(code));
      return out({...publicView(room,players,requestedId),playerToken:result.player.session_token,profileToken:result.player.profile_token});
    
  }
}
async function routeLeave(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const { data, error } = await db.rpc("mafia_leave_room", {
        p_code: code, p_version: body.lifecycleVersion,
        p_host_token: body.hostToken || null, p_player_id: body.id || null,
        p_player_token: body.playerToken || null,
      });
      if (error) throw error;
      if (data?.error) return out({ error: data.error }, data.error === "UNAUTHORIZED" ? 403 : 409);
      if (data?.ok !== true) throw new Error("LEAVE_FAILED");
      // This request may finish only its own committed departure. An old leave
      // receipt must never trigger reconciliation against a later game.
      if (data.lifecycleVersion !== body.lifecycleVersion + 1) return out({left:true});
      const scope=requestDatabase.getStore()!;
      scope.headers={'x-mafia-room':code,'x-mafia-generation':String(data.lifecycleVersion)};
      scope.client=undefined;
      ({ room, players } = await load(code));
      await reconcileDeparture(room,players);
      return out({ left: true });
    
  }
}
async function routeReturnToLobby(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      // The RPC rechecks authority and the generation under the database lock.
      const { data, error } = await db.rpc("mafia_return_to_lobby", {
        p_code: code, p_version: body.lifecycleVersion,
        p_host_token: body.hostToken || null, p_player_id: body.id || null,
        p_player_token: body.playerToken || null,
      });
      if (error) throw error;
      if (data?.error) return out({ error: data.error }, data.error === "UNAUTHORIZED" ? 403 : 409);
      ({ room, players } = await load(code));
      return out(publicView(room, players, me?.id, true));
    
  }
}
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
async function routeKick(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host || room.phase !== "lobby") return out({ error: "UNAUTHORIZED" }, 403);
      const target = players.find((x) => x.id === body.target);
      if (!target) return out({ error: "PLAYER_NOT_FOUND" }, 404);
      const {data,error}=await db.rpc('mafia_kick_player',{p_code:code,p_version:body.lifecycleVersion,p_host_token:body.hostToken||null,p_player_id:body.id||null,p_player_token:body.playerToken||null,p_target:target.id});
      if(error)throw error;
      if(data?.error)return out({error:data.error},data.error==='UNAUTHORIZED'?403:409);
      if(!data?.ok)throw Error('KICK_FAILED');
      ({ room, players } = await load(code));
      return out(publicView(room, players, undefined, true));
    
  }
}
async function routeWarnPlayer(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      if (["lobby", "finished"].includes(room.phase)) return out({ error: "INVALID_ACTION" }, 409);
      const target = players.find((p) => p.id === body.target && p.alive);
      if (!target) return out({ error: "PLAYER_NOT_FOUND" }, 404);
      if (room.enabled_roles?.pending_shot?.resolving) return out({ error: "WAITING_LAST_SHOT" }, 409);
      const reason = cleanText(body.reason, 160);
      if (!reason) return out({ error: "REASON_REQUIRED" }, 400);
      const state = roleState(target);
      const warning = { id: crypto.randomUUID(), reason, round: room.round, at: Date.now() };
      const patch = action === "warnPlayer"
        ? { role_state: { ...state, warnings: [...(state.warnings || []), warning].slice(-20) } }
        : { alive: false, action_target: null, vote_target: null, role_state: { ...state, ack: true, elimination: { reason: "host_expelled", detail: reason, round: room.round, at: Date.now() } } };
      let change = db.from("mafia_players").update(patch).eq("room_code", code).eq("id", target.id).eq("alive", true);
      change = target.role_state == null ? change.is("role_state", null) : change.eq("role_state", JSON.stringify(target.role_state));
      const { data: changed, error } = await change.select("id");
      if (error) throw error;
      if (!changed?.length) return out({ error: "STALE_ACTION" }, 409);
      if (action === "expelPlayer") {
        ({ room, players } = await load(code));
        // Clear votes and actions aimed at the removed player so nobody waits on them.
        for (const player of players.filter((p) => p.alive)) {
          const update: Record<string, any> = {};
          if (player.vote_target === target.id) update.vote_target = null;
          if (player.action_target && String(player.action_target).split(/[,:]/).includes(target.id)) update.action_target = player.role==='detective'
            ? String(player.action_target).split(',').map(id=>id===target.id?'SKIP':id).join(',') : null;
          if (Object.keys(update).length) await db.from("mafia_players").update(update).eq("room_code", code).eq("id", player.id);
        }
        const settings = { ...room.enabled_roles };
        const saved = settings.discussion_state;
        if (saved?.round === room.round && saved.order.includes(target.id)) {
          const view = discussionView(room);
          const removed = saved.order.indexOf(target.id);
          const order = saved.order.filter((id: string) => id !== target.id);
          const cursor = Math.max(0, view.index - (removed < view.index ? 1 : 0));
          const at = saved.pausedAt || Date.now();
          settings.discussion_state = { ...saved, order, cursor, version: saved.version + 1, turnStartedAt: removed === view.index ? at : saved.turnStartedAt + (view.index - saved.cursor) * saved.seconds * 1000, finished: saved.finished || (saved.mode === "turns" && cursor >= order.length) };
        }
        const activePhase = room.phase === "paused" ? settings.paused_phase : room.phase;
        const skipTrial = room.accused_player === target.id && ["trial", "verdict"].includes(activePhase);
        const roomPatch: Record<string, any> = { enabled_roles: settings, last_event: "host_expelled", last_deaths: [...new Set([...(room.last_deaths || []), target.id])], last_eliminated: target.id, jailed_player: room.jailed_player === target.id ? null : room.jailed_player, host_player_id: room.host_player_id === target.id ? null : room.host_player_id, linked_players: (room.linked_players || []).includes(target.id) ? [] : room.linked_players };
        if (skipTrial) {
          roomPatch.accused_player = null;
          roomPatch.round = room.round + 1;
          if (room.phase === "paused") { settings.paused_phase = "night"; roomPatch.phase_started_at = new Date(Date.now()).toISOString(); roomPatch.phase_paused_at = new Date(Date.now()).toISOString(); }
          else roomPatch.phase = "night";
          await persist(db.from("mafia_players").update({ vote_target: null, action_target: null }).eq("room_code", code));
        }
        const updated = await db.from("mafia_rooms").update(roomPatch).eq("code", code);
        if (updated.error) throw updated.error;
        await promoteMafia(code);
        const winner = await checkWin(code);
        ({ room, players } = await load(code));
        if (!winner && skipTrial && !room.enabled_roles?.pending_shot) await botNightActions(room, players);
      }
      await audit(code, action, "ok", started);
      ({ room, players } = await load(code));
      return out(publicView(room, players, me?.id, host));
    
  }
}
async function routeAddBot(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host || room.phase !== "lobby" || players.length >= 20) return out({ error: "INVALID_ACTION" }, 400);
      const kuwaitiNames = ['بدر','فهد','نواف','سالم','راشد','يوسف','عبدالله','مشاري','جاسم','حمد','خالد','فيصل','تركي','وليد','سعود','دانة','نورة','شيخة','مريم','حصة'];
      const requested = body.name ? cleanText(body.name,14) : '';
      const base = requested || kuwaitiNames.find(name => !players.some(p => p.name === name)) || 'لاعب';
      let count=1;
      let botName = base;
      while(players.some(p=>p.name.toLowerCase()===botName.toLowerCase())) botName = `${base} ${count++}`;
      const styles = ["skeptic", "quiet", "bold", "empathetic", "chaotic"];
      const style = styles[players.filter(p=>p.is_bot).length % styles.length];
      const difficulty = ['easy','balanced','hard'].includes(room.enabled_roles?.solo_difficulty) ? room.enabled_roles.solo_difficulty : 'balanced';
      const bot = { room_code: code, id: crypto.randomUUID(), name: botName, is_bot: true, session_token: null, last_seen: new Date().toISOString(), role_state: { botStyle: style, botDifficulty: difficulty, botMemory: { suspicion: {}, claims: [], votes: [] } } };
      const { error } = await db.from("mafia_players").insert(bot);
      if (error) throw error;
      ({ room, players } = await load(code));
      return out(publicView(room, players, undefined, true));
    
  }
}
async function routeMute(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      const target = players.find((x) => x.id === body.target);
      if (!target) return out({ error: "PLAYER_NOT_FOUND" }, 404);
      await patchRoleState(code, target, { muted: body.muted !== false });
      ({ room, players } = await load(code));
      return out(publicView(room, players, undefined, true));
    
  }
}
async function routeEndGame(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host || ["lobby", "finished"].includes(room.phase)) return out({ error: "INVALID_ACTION" }, 400);
      await snapshot(room, players, "before_host_end");
      await persist(db.from("mafia_rooms").update({ phase: "finished", winner: "cancelled", winner_player: null, last_event: "host_ended" }).eq("code", code));
      ({ room, players } = await load(code));
      return out(publicView(room, players, undefined, true));
    
  }
}
async function routeSaveWill(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!me?.alive) return out({ error: "UNAUTHORIZED" }, 403);
      await persist(db.from("mafia_players").update({ will_text: cleanText(body.text, 500) }).eq("room_code", code).eq("id", me.id));
      ({ room, players } = await load(code));
      return out(publicView(room, players, me.id));
    
  }
}
async function routeReport(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!me) return out({ error: "UNAUTHORIZED" }, 403);
      const reason = cleanText(body.reason, 160);
      if (reason.length < 2) return out({ error: "REASON_REQUIRED" }, 400);
      await persist(db.from("mafia_reports").insert({ room_code: code, reporter_id: me.id, target_id: cleanText(body.target, 80) || null, reason }));
      return out({ ok: true });
    
  }
}
async function routeModerationLog(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      const { data } = await db.from("mafia_reports").select("id,reporter_id,target_id,reason,created_at").eq("room_code", code).order("created_at", { ascending: false }).limit(50);
      return out({ reports: data || [] });
    
  }
}
async function routeTransferHost(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      const target = players.find((x) => x.id === body.target && !x.is_bot && !x.left_at);
      if (!target) return out({ error: "PLAYER_NOT_FOUND" }, 404);
      await persist(db.from("mafia_rooms").update({ host_player_id: target.id, enabled_roles:{...room.enabled_roles,controller_spectator:!target.alive} }).eq("code", code));
      ({ room, players } = await load(code));
      await audit(code, action, "ok", started);
      return out(publicView(room, players, me?.id, true));
    
  }
}
async function routeCreateReplacement(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      const target = players.find((x) => x.id === body.target && !x.is_bot);
      if (!target) return out({ error: "PLAYER_NOT_FOUND" }, 404);
      const replacementCode = shortCode(6);
      await persist(db.from("mafia_players").update({ replacement_code: replacementCode, replacement_expires_at: new Date(Date.now() + 15 * 60_000).toISOString() }).eq("room_code", code).eq("id", target.id));
      await audit(code, action, "ok", started);
      return out({ replacementCode, target: { id: target.id, name: target.name }, expiresMinutes: 15 });
    
  }
}
async function routeListSnapshots(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      const { data } = await db.from("mafia_snapshots").select("id,phase,round,reason,created_at").eq("room_code", code).order("created_at", { ascending: false }).limit(20);
      return out({ snapshots: data || [] });
    
  }
}
async function routeRestoreSnapshot(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      const { data: saved } = await db.from("mafia_snapshots").select("*").eq("room_code", code).eq("id", Number(body.snapshotId)).maybeSingle();
      if (!saved) return out({ error: "SNAPSHOT_NOT_FOUND" }, 404);
      const savedRoom: any = saved.room_state;
      const savedPlayers: any[] = Array.isArray(saved.players_state) ? saved.players_state : [];
      if(room.stats_recorded || room.phase==='finished' || room.phase==='lobby' || room.enabled_roles?.departure_pending)
        return out({error:'SNAPSHOT_RESTORE_UNAVAILABLE'},409);
      // Snapshots contain old sessions and roles. Restore gameplay only if every
      // seat still belongs to the same player; never resurrect departed seats.
      const seatKeys=['id','session_token','profile_token','left_at'];
      const roster=(list:any[])=>JSON.stringify([...list].sort((a,b)=>a.id.localeCompare(b.id)).map(p=>seatKeys.map(k=>p[k]??null)));
      if(savedRoom?.code!==code || savedRoom.match_id!==room.match_id || roster(savedPlayers)!==roster(players))return out({error:'SNAPSHOT_ROSTER_CHANGED'},409);
      requestDatabase.getStore()!.plan=new TransitionPlan(room,players);
      await snapshot(room, players, "before_restore");
      const roomKeys = ["phase","round","jailed_player","accused_player","jailer_executions","doctor_last_target","linked_players","last_event","last_deaths","last_eliminated","last_saved","winner","winner_player"];
      const roomUpdate = Object.fromEntries(roomKeys.map((key) => [key, savedRoom[key]]));
      const settings={...savedRoom.enabled_roles};
      for(const key of ['admin_access','controller_spectator','departure_pending']){delete settings[key];if(room.enabled_roles?.[key]!==undefined)settings[key]=room.enabled_roles[key];}
      roomUpdate.enabled_roles=settings;
      await persist(db.from("mafia_rooms").update(roomUpdate).eq("code", code));
      for (const player of savedPlayers) {
        const playerKeys = ["role","role_state","alive","action_target","vote_target","investigation_result","will_text"];
        await persist(db.from("mafia_players").update(Object.fromEntries(playerKeys.map((key) => [key, player[key]]))).eq("room_code", code).eq("id", player.id));
      }
      ({ room, players } = await load(code));
      await audit(code, action, "ok", started);
      return out(publicView(room, players, me?.id, true));
    
  }
}
async function routeSystemStatus(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const [{ count: reports }, { count: snapshots }, { count: spectators }, { data: recentAudit }] = await Promise.all([
        db.from("mafia_reports").select("id", { count: "exact", head: true }).eq("room_code", code),
        db.from("mafia_snapshots").select("id", { count: "exact", head: true }).eq("room_code", code),
        db.from("mafia_spectators").select("id", { count: "exact", head: true }).eq("room_code", code),
        db.from("mafia_audit_events").select("status,duration_ms,created_at").eq("room_code", code).gte("created_at", since).order("created_at", { ascending: false }).limit(50),
      ]);
      const durations = (recentAudit || []).map((x) => Number(x.duration_ms) || 0);
      return out({ status: "ok", version: 18, reports: reports || 0, snapshots: snapshots || 0, spectators: spectators || 0, averageMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0 });
    
  }
}
async function routeMessages(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const publicDay = Boolean(me?.alive && room.phase === "day");
      if (publicDay) {
        if (action === "sendMessage") {
          if (roleState(me).muted === true) return out({ error: "MUTED" }, 403);
          const content = cleanText(body.text, 240);
          if (!content) return out({ error: "MESSAGE_REQUIRED" }, 400);
          const { data: latest } = await db.from("mafia_messages").select("created_at").eq("room_code", code).eq("author_id", me.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (latest && Date.now() - new Date(latest.created_at).getTime() < 700) return out({ error: "RATE_LIMITED" }, 429);
          const { error: insertError } = await db.from("mafia_messages").insert({ room_code: code, round: room.round, channel: "public", author_id: me.id, author_name: me.name, content });
          if (insertError) throw insertError;
          await rememberPublicMessage(room, players, me, content);
          const replies = botRepliesForPublicMessage(room, players, me, content);
          if (replies.length) {
            const { error: replyError } = await db.from("mafia_messages").insert(replies[0]);
            if (replyError) throw replyError;
          }
        }
        const beforeId = typeof body.beforeId === "string" ? body.beforeId : null;
        let query = db.from("mafia_messages").select("id,author_id,author_name,content,created_at").eq("room_code", code).eq("round", room.round).eq("channel", "public");
        if (beforeId) { if (!/^[1-9][0-9]{0,18}$/.test(beforeId)) return out({error:"INVALID_CURSOR"},400); query=query.lt("id",beforeId); }
        const { data, error: messagesError } = await query.order("id",{ascending:false}).limit(81);
        if (messagesError) throw messagesError;
        const page=(data||[]).slice(0,80);
        return out({ channel: "public", hasMore:(data||[]).length>80, nextCursor:page.length?String(page.at(-1).id):null, messages: page.reverse() });
      }
      if (!me?.alive || !(room.phase === "night" || (room.phase === "paused" && room.enabled_roles?.paused_phase === "night"))) return out({ error: "INVALID_ACTION" }, 400);
      const jailAccess = (me.role === "jailer" || me.id === room.jailed_player) && Boolean(room.jailed_player);
      const channel = jailAccess ? "jail" : mafiaRole(me.role) ? "mafia" : null;
      if (!channel) return out({ error: "UNAUTHORIZED" }, 403);
      if (action === "sendMessage") {
        if (roleState(me).muted === true) return out({ error: "MUTED" }, 403);
        const content = cleanText(body.text, 240);
        if (!content) return out({ error: "MESSAGE_REQUIRED" }, 400);
        const { data: latest } = await db.from("mafia_messages").select("created_at").eq("room_code", code).eq("author_id", me.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (latest && Date.now() - new Date(latest.created_at).getTime() < 700) return out({ error: "RATE_LIMITED" }, 429);
        const { error: insertError } = await db.from("mafia_messages").insert({ room_code: code, round: room.round, channel, author_id: me.id, author_name: channel === "jail" && me.role !== "jailer" ? "السجين" : me.name, content });
        if (insertError) throw insertError;
      }
      const beforeId = typeof body.beforeId === "string" ? body.beforeId : null;
      let query = db.from("mafia_messages").select("id,author_id,author_name,content,created_at").eq("room_code", code).eq("round", room.round).eq("channel", channel);
      if (beforeId) {
        if (!/^[1-9][0-9]{0,18}$/.test(beforeId)) return out({error:"INVALID_CURSOR"},400);
        query=query.lt("id",beforeId);
      }
      const { data, error: messagesError } = await query.order("id",{ascending:false}).limit(81);
      if (messagesError) throw messagesError;
      const page=(data||[]).slice(0,80);
      return out({ channel, hasMore:(data||[]).length>80, nextCursor:page.length?String(page.at(-1).id):null, messages: page.reverse().map((message) => channel === "jail" ? { ...message, author_id: undefined, author_name: message.author_id === room.jailed_player ? "السجين" : "السجّان" } : message) });
    
  }
}
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
async function routeElectMafiaLeader(context:RoomRouteContext) {
 if(context.room.enabled_roles?.leader_election?.pending&&!context.room.enabled_roles.leader_election.former)return routeInitialMafiaLeader(context);
 const {body,code,now}=context;
 let {room,players,me}=context;
 if(!me?.alive||!mafiaRole(me.role)||['lobby','finished','paused'].includes(room.phase))return out({error:'UNAUTHORIZED'},403);
 let election=room.enabled_roles?.leader_election;
 if(!election?.pending&&body.target!=='RESIGN'&&body.target!=='FINALIZE'){
  if(me.role!=='mafia_boss')return out({error:'UNAUTHORIZED'},403);
  const nominee=players.find(p=>p.id===body.target&&p.alive&&p.role==='mafia');
  if(!nominee)return out({error:'INVALID_ACTION'},400);
  const {data:resigned,error:resignError}=await db.from('mafia_players').update({role:'mafia'}).eq('room_code',code).eq('id',me.id).eq('role','mafia_boss').eq('session_token',body.playerToken).select('id');
  if(resignError)throw resignError;
  if(!resigned?.length)return out({error:'STALE_ACTION'},409);
  const {data:promoted,error:promoteError}=await db.from('mafia_players').update({role:'mafia_boss',role_state:{...roleState(nominee),promotedBoss:true}}).eq('room_code',code).eq('id',nominee.id).eq('role','mafia').eq('alive',true).select('id');
  if(promoteError||!promoted?.length){
   await db.from('mafia_players').update({role:'mafia_boss'}).eq('room_code',code).eq('id',me.id).eq('role','mafia');
   if(promoteError)throw promoteError;
   return out({error:'STALE_ACTION'},409);
  }
  ({room,players}=await load(code));return out(publicView(room,players,me.id));
 }
 if(body.target==='RESIGN'){
  if(me.role!=='mafia_boss'||election?.pending)return out({error:'INVALID_ACTION'},409);
  if(!players.some(p=>p.alive&&p.role==='mafia'&&p.id!==me.id))return out({error:'NO_CANDIDATES'},409);
  election={pending:true,former:me.id,deadline:now+30000,votes:{}};
 }else{
  if(!election?.pending||!election.former)return out({error:'INVALID_ACTION'},409);
  election={...election,votes:{...election.votes}};
  if(body.target!=='FINALIZE'){
   if(now>=election.deadline||election.votes[me.id])return out({error:'INVALID_ACTION'},409);
   const target=players.find(p=>p.id===body.target&&p.alive&&mafiaRole(p.role)&&p.id!==election.former);
   if(!target)return out({error:'INVALID_ACTION'},400);
   election.votes[me.id]=target.id;
  }else if(now<election.deadline)return out({error:'WAITING_LEADER_VOTES'},409);
 }
 const team=players.filter(p=>p.alive&&mafiaRole(p.role));
 const candidates=team.filter(p=>p.id!==election.former);
 for(const bot of team.filter(p=>p.is_bot&&!election.votes[p.id]))if(candidates.length)election.votes[bot.id]=randomItem(candidates).id;
 const finished=now>=election.deadline||team.every(p=>election.votes[p.id])||!candidates.length;
 if(finished){
  if(candidates.length){
   const counts=new Map(candidates.map(p=>[p.id,0]));
   for(const voter of team){const target=election.votes[voter.id];if(counts.has(target))counts.set(target,counts.get(target)!+1);}
   const max=Math.max(...counts.values());const winner=randomItem(candidates.filter(p=>counts.get(p.id)===max))!.id;
   for(const player of players.filter(p=>mafiaRole(p.role))){await persist(db.from('mafia_players').update({role:player.id===winner?'mafia_boss':'mafia'}).eq('room_code',code).eq('id',player.id));}
   election={pending:false,winner};
  }else election={pending:false};
 }
 await persist(db.from('mafia_rooms').update({enabled_roles:{...room.enabled_roles,leader_election:election}}).eq('code',code));
 ({room,players}=await load(code));return out(publicView(room,players,me.id));
}
async function routeInitialMafiaLeader(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if(room.phase!=="reveal" || !room.enabled_roles?.leader_election?.pending || room.enabled_roles.leader_election.winner || !me?.alive || !mafiaRole(me.role))return out({error:"UNAUTHORIZED"},403);
      const target=players.find(p=>p.id===body.target&&p.alive&&mafiaRole(p.role));
      if(!target||roleState(me).leaderVote)return out({error:"INVALID_ACTION"},400);
      let query=db.from("mafia_players").update({role_state:{...roleState(me),leaderVote:target.id}}).eq("room_code",code).eq("id",me.id);
      query=me.role_state==null?query.is("role_state",null):query.eq("role_state",JSON.stringify(me.role_state));
      const {data,error}=await query.select("id");if(error)throw error;
      if(!data?.length)return out({error:"STALE_ACTION"},409);
      ({room,players}=await load(code));return out(publicView(room,players,me.id));
    
  }
}
async function routeAcknowledgeRole(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (room.phase !== "reveal" || !me) return out({ error: "INVALID_ACTION" }, 400);
      await patchRoleState(code, me, { ack: true });
      ({ room, players } = await load(code));
      return out(publicView(room, players, me.id));
    
  }
}
async function routeBeginNight(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host || room.phase !== "reveal") return out({ error: "INVALID_ACTION" }, 400);
      if (!players.length || !players.every((x) => roleState(x).ack === true)) return out({ error: "WAITING_ROLES" }, 409);
      const election=room.enabled_roles?.leader_election;
      if(election?.pending&&!election.former){
        const team=players.filter(p=>p.alive&&mafiaRole(p.role));
        for(const bot of team.filter(p=>p.is_bot&&!roleState(p).leaderVote)){
          bot.role_state={...roleState(bot),leaderVote:randomItem(team)?.id};
          const {error}=await db.from("mafia_players").update({role_state:bot.role_state}).eq("room_code",code).eq("id",bot.id);if(error)throw error;
        }
        if(!election.winner && team.some(p=>!roleState(p).leaderVote) && !phaseExpired(room))return out({error:"WAITING_LEADER_VOTES"},409);
        let winner=election.winner;
        if(!winner){
          const counts=new Map(team.map(p=>[p.id,0]));
          for(const voter of team){const id=roleState(voter).leaderVote;if(counts.has(id))counts.set(id,counts.get(id)!+1);}
          const max=Math.max(...counts.values());winner=randomItem(team.filter(p=>counts.get(p.id)===max))?.id;
          if(!winner)return out({error:"NO_MAFIA"},409);
          const {data,error}=await db.from("mafia_rooms").update({enabled_roles:{...room.enabled_roles,leader_election:{pending:true,winner}}}).eq("code",code).eq("enabled_roles",JSON.stringify(room.enabled_roles)).select("code");if(error)throw error;
          if(!data?.length)return out({error:"STALE_ACTION"},409);
        }
        const {error}=await db.from("mafia_players").update({role:"mafia_boss"}).eq("room_code",code).eq("id",winner);if(error)throw error;
        ({room,players}=await load(code));
        const finished=await db.from("mafia_rooms").update({enabled_roles:{...room.enabled_roles,leader_election:{pending:false,winner}}}).eq("code",code);if(finished.error)throw finished.error;
      }
      await persist(db.from("mafia_rooms").update({ phase: "night" }).eq("code", code));
      ({ room, players } = await load(code));
      await botNightActions(room, players);
      ({ room, players } = await load(code));
      return out(publicView(room, players, undefined, true));
    
  }
}
async function routeJail(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const target = players.find((x) => x.id === body.target);
      if (room.phase !== "day" || !me?.alive || me.role !== "jailer" || !target?.alive || target.id === me.id) return out({ error: "INVALID_ACTION" }, 400);
      await persist(db.from("mafia_rooms").update({ jailed_player: target.id }).eq("code", code));
      ({ room, players } = await load(code));
      return out(publicView(room, players, me.id));
    
  }
}
async function routeLawyerProtect(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const target = players.find((x) => x.id === body.target);
      if (room.phase !== "day" || !me?.alive || me.role !== "lawyer" || !target?.alive) return out({ error: "INVALID_ACTION" }, 400);
      await persist(db.from("mafia_players").update({ action_target: target.id }).eq("room_code", code).eq("id", me.id));
      ({ room, players } = await load(code));
      return out(publicView(room, players, me.id));
    
  }
}
async function routeAct(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (room.round === 1 && me?.role !== "detective") return out({ error: "FIRST_NIGHT_DETECTIVE_ONLY" }, 409);
      if (room.phase !== "night" || !me?.alive || (room.round !== 1 && me.id === room.jailed_player)) return out({ error: "INVALID_ACTION" }, 400);
      const target = players.find((x) => x.id === body.target);
      if (mafiaRole(me.role)) {
        if (isMafiaLocked(room, players)) return out({ error: "MAFIA_LOCKED" }, 409);
        if (body.target !== "SKIP" && (!target?.alive || mafiaRole(target.role))) return out({ error: "INVALID_ACTION" }, 400);
        await persist(db.from("mafia_players").update({ action_target: body.target }).eq("room_code", code).eq("id", me.id));
      } else if (me.role === "revealer") {
        if (!["COUNT","SKIP"].includes(body.target) || me.action_target || roleState(me).mafiaCountResult) return out({ error: "INVALID_ACTION" }, 400);
        let query=db.from("mafia_players").update({action_target:body.target}).eq("room_code",code).eq("id",me.id);
        query=me.action_target==null?query.is("action_target",null):query.eq("action_target",me.action_target);
        const {data,error}=await query.select("id");if(error)throw error;
        if(!data?.length)return out({error:"STALE_ACTION"},409);
      } else if (me.role === "doctor") {
        if (!doctorAvailable(room)) return out({ error: "DOCTOR_UNAVAILABLE" }, 409);
        if (!target?.alive || target.id === room.doctor_last_target) return out({ error: "INVALID_ACTION" }, 400);
        await persist(db.from("mafia_players").update({ action_target: target.id }).eq("room_code", code).eq("id", me.id));
      } else if (me.role === "detective") {
        const picked = selected(me), limit = detectiveLimit(room, players);
        if (!target?.alive || target.id === me.id || picked.includes(target.id) || picked.length >= limit) return out({ error: "INVALID_ACTION" }, 400);
        let query = db.from("mafia_players").update({ action_target: [...picked, target.id].join(",") }).eq("room_code", code).eq("id", me.id);
        query = me.action_target == null ? query.is("action_target", null) : query.eq("action_target", me.action_target);
        const { data: changed, error } = await query.select("id");
        if (error) throw error;
        if (!changed?.length) return out({ error: "STALE_ACTION" }, 409);
      } else if (me.role === "vigilante") {
        return out({ error: "INVALID_ACTION" }, 400);
      } else if (me.role === "witch") {
        const [kind, targetId] = String(body.target || "").split(":");
        const potionTarget = players.find((x) => x.id === targetId && x.alive);
        const state = roleState(me);
        if (!potionTarget || !["SAVE", "POISON"].includes(kind) || (kind === "SAVE" && state.life === false) || (kind === "POISON" && (state.poison === false || potionTarget.id === me.id))) return out({ error: "INVALID_ACTION" }, 400);
        await persist(db.from("mafia_players").update({ action_target: `${kind}:${potionTarget.id}` }).eq("room_code", code).eq("id", me.id));
      } else if (me.role === "serial_killer" || me.role === "escort") {
        if (!target?.alive || target.id === me.id) return out({ error: "INVALID_ACTION" }, 400);
        await persist(db.from("mafia_players").update({ action_target: target.id }).eq("room_code", code).eq("id", me.id));
      } else if (me.role === "cupid") {
        const picked = selected(me);
        if (room.round !== 2 || !target?.alive || target.id === me.id || picked.includes(target.id) || picked.length >= 2) return out({ error: "INVALID_ACTION" }, 400);
        let query = db.from("mafia_players").update({action_target:[...picked,target.id].join(",")}).eq("room_code",code).eq("id",me.id);
        query=me.action_target==null?query.is("action_target",null):query.eq("action_target",me.action_target);
        const {data,error}=await query.select("id");if(error)throw error;
        if(!data?.length)return out({error:"STALE_ACTION"},409);
      } else if (me.role === "jailer") {
        const prisoner = players.find((x) => x.id === room.jailed_player && x.alive);
        const choice = String(body.target || "");
        if (!prisoner || !["SPARE", "EXECUTE"].includes(choice)) return out({ error: "INVALID_ACTION" }, 400);
        if (choice === "EXECUTE" && room.jailer_executions <= 0) return out({ error: "NO_EXECUTIONS" }, 409);
        await persist(db.from("mafia_players").update({ action_target: choice }).eq("room_code", code).eq("id", me.id));
      } else return out({ error: "INVALID_ACTION" }, 400);
      ({ room, players } = await load(code));
      return out(publicView(room, players, me.id));
    
  }
}
async function routeResolveNight(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      if (room.phase !== "night") return out({ error: "INVALID_ACTION" }, 409);
      if (!publicView(room, players, undefined, true).nightReady && !phaseExpired(room)) return out({ error: "WAITING_ACTIONS" }, 409);
      await snapshot(room, players, "before_night_result");
      const events: string[] = [], deaths: string[] = [];
      const causes: Record<string, string> = {};
      const locked = isMafiaLocked(room, players);
      const mafiaKillEnabled = mafiaKillEnabledForRound(room);
      const mafiaKillStartRound = enabledRoles(room.enabled_roles).mafia_kill_start_round;
      const escort = players.find((x) => x.alive && x.role === "escort" && x.id !== room.jailed_player);
      const blockedId = room.round === 1 ? null : escort?.action_target || null;
      const canAct = (player: any) => player?.alive && (room.round === 1 ? player.role === "detective" : player.id !== room.jailed_player && player.id !== blockedId);
      // Resolve investigations only after all role blocks have been finalized.
      for (const detective of players.filter((p) => p.alive && p.role === "detective")) {
        const history = results(detective).filter((r: any) => r.round !== room.round);
        if (canAct(detective)) for (const id of selected(detective).slice(0, detectiveLimit(room, players))) {
          const target = players.find((p) => p.id === id);
          if (target) history.push({ round: room.round, name: target.name, result: target.role === "mafia" || (target.role === "mafia_boss" && !enabledRoles(room.enabled_roles).godfather_innocent) ? "مافيا" : "بريء" });
        }
        const {error} = await db.from("mafia_players").update({ investigation_result: JSON.stringify(history) }).eq("room_code",code).eq("id",detective.id);
        if (error) throw error;
      }
      if (blockedId) events.push("escort_blocked");
      const activeMafia = players.filter((x) => mafiaRole(x.role) && canAct(x));
      const bossChoice = activeMafia.find((x) => x.role === "mafia_boss")?.action_target;
      const factionChoice = !mafiaKillEnabled ? "DISABLED" : locked ? "LOCKED" : (bossChoice || plurality(activeMafia.map((x) => x.action_target)));
      const doctor = players.find((x) => x.role === "doctor" && canAct(x));
      const doctorTarget = doctorAvailable(room) ? doctor?.action_target : null;
      const witch = players.find((x) => x.role === "witch" && canAct(x));
      const [requestedPotion, requestedTarget] = String(witch?.action_target || "").split(":");
      const potionAvailable = witch && ((requestedPotion === "SAVE" && roleState(witch).life !== false)
        || (requestedPotion === "POISON" && roleState(witch).poison !== false && requestedTarget !== witch.id));
      const validPotion = potionAvailable && players.some(p => p.id === requestedTarget && p.alive);
      const witchKind = validPotion ? requestedPotion : "";
      const witchTarget = validPotion ? requestedTarget : "";
      const protectedIds = new Set([doctorTarget, room.jailed_player, witchKind === "SAVE" ? witchTarget : null].filter(Boolean));
      const victim = players.find((x) => x.id === factionChoice && x.alive);
      if (room.round === 1) events.push("detective_only_night");
      else if (!mafiaKillEnabled) events.push(mafiaKillStartRound > Number(room.round) ? "mafia_delayed" : "mafia_disabled");
      else if (locked) events.push("mafia_locked");
      else if (!factionChoice || factionChoice === "SKIP") events.push("mafia_skipped");
      const attacks = [
        victim ? { id: victim.id, event: "mafia_kill" } : null,
        ...players.filter((x) => x.role === "serial_killer" && canAct(x) && x.action_target).map((x) => ({ id: x.action_target, event: "serial_kill" })),
        witchKind === "POISON" && witchTarget ? { id: witchTarget, event: "witch_poison" } : null,
      ].filter(Boolean) as { id: string; event: string }[];
      for (const attack of attacks) {
        if (protectedIds.has(attack.id)) {
          if (attack.id === room.jailed_player) events.push("jail_saved");
          else if (witchKind === "SAVE" && attack.id === witchTarget) events.push("witch_saved");
          else events.push("doctor_saved");
        } else if (!deaths.includes(attack.id) && players.some((x) => x.id === attack.id && x.alive)) {
          deaths.push(attack.id); causes[attack.id] = attack.event; events.push(attack.event);
        }
      }
      const jailer = players.find((x) => x.alive && x.role === "jailer");
      const prisoner = players.find((x) => x.alive && x.id === room.jailed_player);
      let executions = room.jailer_executions;
      if (canAct(jailer) && jailer?.action_target === "EXECUTE" && prisoner && executions > 0 && !deaths.includes(prisoner.id)) { deaths.push(prisoner.id); causes[prisoner.id] = "jailer_executed"; executions -= 1; events.push("jailer_executed"); }
      let linkedPlayers: string[] = Array.isArray(room.linked_players) ? room.linked_players : [];
      const cupid = players.find((x) => x.role === "cupid" && canAct(x));
      if (room.round === 2 && cupid && selected(cupid).length === 2) linkedPlayers = selected(cupid);
      if (linkedPlayers.length === 2 && linkedPlayers.some((id) => deaths.includes(id))) {
        for (const id of linkedPlayers) if (!deaths.includes(id) && players.some((x) => x.id === id && x.alive)) { deaths.push(id); causes[id] = "lovers_died"; }
        events.push("lovers_died");
      }
      if (witch?.action_target && ["SAVE", "POISON"].includes(witchKind)) {
        witch.role_state = { ...roleState(witch), [witchKind === "SAVE" ? "life" : "poison"]: false };
        await persist(db.from("mafia_players").update({ role_state: witch.role_state }).eq("room_code", code).eq("id", witch.id));
      }
      for (const revealer of players.filter(p => p.role === "revealer" && !roleState(p).mafiaCountResult && canAct(p) && p.action_target === "COUNT" && !deaths.includes(p.id))) {
        const mafiaCountResult = { round: room.round, count: players.filter(p => p.alive && mafiaRole(p.role) && !deaths.includes(p.id)).length };
        const { error } = await db.from("mafia_players").update({ role_state: { ...roleState(revealer), mafiaCountResult } }).eq("room_code",code).eq("id",revealer.id);
        if (error) throw error;
      }
      await eliminatePlayers(room, players, causes);
      await persist(db.from("mafia_players").update({ action_target: null, vote_target: null }).eq("room_code", code));
      await persist(db.from("mafia_rooms").update({ phase: "day", jailed_player: null, jailer_executions: executions, doctor_last_target: doctorTarget || null, linked_players: linkedPlayers, last_event: events.join(","), last_deaths: deaths, last_eliminated: deaths[0] || null, last_saved: events.some((x) => x.endsWith("saved")) }).eq("code", code));
      await prepareLastShot(code, causes, "day", room.round);
      await promoteMafia(code);
      const nightWinner = await checkWin(code);
      ({ room, players } = await load(code));
      if (!nightWinner && !room.enabled_roles?.pending_shot) {
        await botDayActions(room, players);
        ({ room, players } = await load(code));
      }
      return out(publicView(room, players, undefined, true));
    
  }
}
async function routeSetDiscussionClaim(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!me || !me.alive || me.role !== "mafia_boss") return out({ error: "UNAUTHORIZED" }, 403);
      if (!["night", "day"].includes(room.phase) || room.round !== 1 || room.enabled_roles?.discussion_state || typeof roleState(me).discussionClaim === "boolean" || typeof body.claim !== "boolean") return out({ error: "CHOICE_LOCKED" }, 409);
      const { data: changed, error } = await db.from("mafia_players").update({ role_state: { ...roleState(me), discussionClaim: body.claim } }).eq("room_code",code).eq("id", me.id).eq("session_token", body.playerToken).eq("role_state",JSON.stringify(roleState(me))).select("id");
      if (error) throw error;
      if (!changed?.length) return out({error:"CHOICE_LOCKED"},409);
      ({ room, players } = await load(code));
      return out(publicView(room, players, me.id));
    
  }
}
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
      const order = [...opening, ...remaining].map(p=>p.id);
      const roulette = settings.discussion_mode === "turns" && priority.length > 1 ? { candidates: shuffle(opening).map(p=>p.id), winner:starter.id, at:now, duration:6000 } : null;
      const choices = settings.discussion_mode === "turns" ? [15,30,45,60,90,120] : [30,60,120,180,300,600,900,1800,3600];
      const seconds = body.seconds === undefined ? (settings.discussion_mode === "turns" ? settings.speaker_seconds : settings.discussion_seconds) : Number(body.seconds);
      if (!choices.includes(seconds)) return out({ error: "INVALID_DURATION" }, 400);
      const speakingAt = now + (roulette?.duration || 0);
      const state = { id: crypto.randomUUID(), version: 0, round: room.round, mode: settings.discussion_mode, seconds, order, roulette, firstSpeakerId: starter?.id || order[0] || null, cursor: 0, turnStartedAt: speakingAt, endsAt: speakingAt + seconds * 1000, pausedAt: null, finished: false, botLines: botDiscussionLines(room, players) };
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
async function routeControlDiscussion(context:RoomRouteContext) {
  let {body, action, ip, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      if (room.phase !== "day" || room.enabled_roles?.pending_shot) return out({ error: "INVALID_ACTION" }, 409);
      const view = discussionView(room);
      const saved = room.enabled_roles?.discussion_state;
      if (!saved || !["active", "paused"].includes(view.status)) return out({ error: "INVALID_ACTION" }, 409);
      if (body.discussionId !== saved.id || body.version !== saved.version || (saved.mode === "turns" && body.speakerId !== view.speakerId)) return out({ error: "STALE_TURN" }, 409);
      const now = Date.now();
      let next: any;
      if (body.operation === "pause" && view.status === "active") next = { ...saved, pausedAt: now, manualPaused: true };
      else if (body.operation === "resume" && view.status === "paused") {
        const elapsed = now - saved.pausedAt;
        next = { ...saved, roulette:saved.roulette?{...saved.roulette,at:saved.roulette.at+elapsed}:null, pausedAt: null, manualPaused: false, turnStartedAt: saved.turnStartedAt + elapsed, endsAt: saved.endsAt + elapsed };
      } else if (body.operation === "reset") {
        const at = saved.pausedAt || now;
        if (at < saved.turnStartedAt) return out({ error: "DRAW_IN_PROGRESS" }, 409);
        next = { ...saved, cursor: view.index, turnStartedAt: at, endsAt: at + saved.seconds * 1000 };
      } else return out({ error: "INVALID_ACTION" }, 409);
      next.version = saved.version + 1;
      const { data: changed, error } = await db.from("mafia_rooms").update({ enabled_roles: { ...room.enabled_roles, discussion_state: next } }).eq("code", code).eq("phase", "day").eq("enabled_roles", JSON.stringify(room.enabled_roles)).select("code");
      if (error) throw error;
      if (!changed?.length) return out({ error: "STALE_TURN" }, 409);
      ({ room, players } = await load(code));
      return out(publicView(room, players, me?.id, host));
    
  }
}
async function routePassDiscussion(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const discussion = discussionView(room);
      if (room.phase !== "day" || discussion.status !== "active") return out({ error: "INVALID_ACTION" }, 409);
      if (action === "finishDiscussion" && !host) return out({ error: "UNAUTHORIZED" }, 403);
      if (action === "passDiscussion" && (!host && (!me?.alive || me.id !== discussion.speakerId))) return out({ error: "UNAUTHORIZED" }, 403);
      if (body.discussionId !== discussion.id || (action === "passDiscussion" && (discussion.mode !== "turns" || body.speakerId !== discussion.speakerId))) return out({ error: "STALE_TURN" }, 409);
      const saved = room.enabled_roles.discussion_state;
      if (action === "passDiscussion" && Date.now() < saved.turnStartedAt) return out({ error: "DRAW_IN_PROGRESS" }, 409);
      const next = action === "finishDiscussion" ? { ...saved, finished: true, version: saved.version + 1 } : { ...saved, cursor: discussion.index + 1, turnStartedAt: Date.now(), version: saved.version + 1 };
      const { data: changed, error } = await db.from("mafia_rooms").update({ enabled_roles: { ...room.enabled_roles, discussion_state: next } }).eq("code", code).eq("phase", "day").eq("enabled_roles->discussion_state->>id", saved.id).eq("enabled_roles->discussion_state->>version", String(saved.version)).select("code");
      if (error) throw error;
      if (!changed?.length) return out({ error: "STALE_TURN" }, 409);
      ({ room, players } = await load(code));
      return out(publicView(room, players, me?.id, host));
    
  }
}
async function routeStartVote(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      if (room.phase !== "day") return out({ error: "INVALID_ACTION" }, 409);
      if (!discussionView(room).complete) return out({ error: "WAITING_DISCUSSION" }, 409);
      const lawyer = players.find((x) => x.alive && x.role === "lawyer"), jailer = players.find((x) => x.alive && x.role === "jailer");
      if (lawyer && !lawyer.action_target && !phaseExpired(room)) return out({ error: "WAITING_LAWYER" }, 409);
      if (jailer && !room.jailed_player && !phaseExpired(room)) return out({ error: "WAITING_JAILER" }, 409);
      await persist(db.from("mafia_players").update({ vote_target: null }).eq("room_code", code));
      const phase = enabledRoles(room.enabled_roles).full_trial ? "nomination" : "vote";
      await persist(db.from("mafia_rooms").update({ phase, accused_player: null }).eq("code", code));
      ({ room, players } = await load(code));
      await botVotes(room, players);
      ({ room, players } = await load(code));
      return out(publicView(room, players, undefined, true));
    
  }
}
async function routeAdvanceVerdict(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host || room.phase !== "trial" || !room.accused_player) return out({ error: "INVALID_ACTION" }, 400);
      await persist(db.from("mafia_players").update({ vote_target: null }).eq("room_code", code));
      await persist(db.from("mafia_rooms").update({ phase: "verdict" }).eq("code", code));
      ({ room, players } = await load(code));
      await botVotes(room, players, true);
      ({ room, players } = await load(code));
      return out(publicView(room, players, undefined, true));
    
  }
}
async function routeVote(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const target = players.find((x) => x.id === body.target);
      const nomination = ["nomination", "vote"].includes(room.phase);
      const verdict = room.phase === "verdict";
      const skip = body.target === "SKIP" && enabledRoles(room.enabled_roles).allow_no_vote;
      const verdictChoice = ["GUILTY", "INNOCENT"].includes(body.target);
      if (!me?.alive || (!nomination && !verdict) || (nomination && !skip && (!target?.alive || target.id === me.id)) || (verdict && (!verdictChoice || me.id === room.accused_player))) return out({ error: "INVALID_VOTE" }, 400);
      await persist(db.from("mafia_players").update({ vote_target: verdict ? body.target : skip ? "SKIP" : target!.id }).eq("room_code", code).eq("id", me.id));
      ({ room, players } = await load(code));
      return out(publicView(room, players, me.id));
    
  }
}
async function routeResolveVote(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      if (!["nomination", "vote", "verdict"].includes(room.phase)) return out({ error: "INVALID_ACTION" }, 409);
      const alive = players.filter((x) => x.alive);
      const requiredVoters = room.phase === "verdict" ? alive.filter((x) => x.id !== room.accused_player) : alive;
      if (!requiredVoters.every((x) => x.vote_target) && !phaseExpired(room)) return out({ error: "WAITING_VOTES" }, 409);
      // Missing votes abstain. Never invent a guilty vote on behalf of a player.
      for (const voter of requiredVoters) if (!voter.vote_target) voter.vote_target = "SKIP";
      await snapshot(room, players, "before_vote_result");
      const totals: Record<string, number> = {};
      let abstained = 0;
      for (const voter of requiredVoters) {
        if (voter.vote_target === "SKIP") abstained++;
        else totals[voter.vote_target] = (totals[voter.vote_target] || 0) + 1;
      }
      const voteSummary = { round: room.round, phase: room.phase, abstained,
        counts: Object.entries(totals).map(([id, count]) => ({ name: room.phase === "verdict" ? id : players.find(p => p.id === id)?.name || "", count })).sort((a,b) => b.count-a.count) };
      room.enabled_roles = { ...room.enabled_roles, vote_summary: voteSummary };
      const { error: summaryError } = await db.from("mafia_rooms").update({ enabled_roles: room.enabled_roles }).eq("code",code);
      if (summaryError) throw summaryError;
      if (room.phase === "nomination") {
        const nominationCounts: Record<string, number> = {};
        alive.forEach((x) => nominationCounts[x.vote_target] = (nominationCounts[x.vote_target] || 0) + 1);
        const max = Math.max(...Object.values(nominationCounts));
        const top = Object.keys(nominationCounts).filter((id) => nominationCounts[id] === max);
        if (top.length !== 1 || top[0] === "SKIP") {
          await persist(db.from("mafia_players").update({ vote_target: null, action_target: null }).eq("room_code", code));
          await persist(db.from("mafia_rooms").update({ phase: "night", round: room.round + 1, accused_player: null, last_event: "nomination_tie" }).eq("code", code));
          ({ room, players } = await load(code));
          await botNightActions(room, players);
          ({ room, players } = await load(code));
          return out({ ...publicView(room, players, undefined, true), tie: true });
        }
        await persist(db.from("mafia_players").update({ vote_target: null }).eq("room_code", code));
        await persist(db.from("mafia_rooms").update({ phase: "trial", accused_player: top[0], last_event: "player_accused" }).eq("code", code));
        ({ room, players } = await load(code));
        return out(publicView(room, players, undefined, true));
      }
      if (room.phase === "verdict") {
        const jurors = alive.filter((x) => x.id !== room.accused_player);
        if (!jurors.every((x) => x.vote_target)) return out({ error: "WAITING_VOTES" }, 409);
        const guilty = jurors.filter((x) => x.vote_target === "GUILTY").length;
        const innocent = jurors.filter((x) => x.vote_target === "INNOCENT").length;
        const accused = players.find((x) => x.id === room.accused_player && x.alive);
        const lawyerTarget = players.find((x) => x.alive && x.role === "lawyer")?.action_target;
        let eliminated: string | null = guilty > innocent && accused ? accused.id : null;
        let event = eliminated ? "trial_guilty" : "trial_innocent";
        if (eliminated === lawyerTarget) { eliminated = null; event = "lawyer_saved"; }
        const voteDeaths: string[] = eliminated ? [eliminated] : [];
        const linkedPlayers: string[] = Array.isArray(room.linked_players) ? room.linked_players : [];
        if (eliminated && linkedPlayers.includes(eliminated)) {
          const partner = linkedPlayers.find((id) => id !== eliminated && players.some((x) => x.id === id && x.alive));
          if (partner) { voteDeaths.push(partner); event += ",lovers_died"; }
        }
        const voteCauses = Object.fromEntries(voteDeaths.map((id) => [id, id === eliminated ? (room.phase === "verdict" ? "trial_guilty" : "vote_eliminated") : "lovers_died"]));
      await eliminatePlayers(room, players, voteCauses);
      await prepareLastShot(code, voteCauses, "night", room.round + 1);
        await persist(db.from("mafia_players").update({ vote_target: null, action_target: null }).eq("room_code", code));
        const jesterWinner = eliminated ? players.find((x) => x.id === eliminated)?.role === "jester" : false;
        await persist(db.from("mafia_rooms").update({ phase: jesterWinner ? "finished" : "verdict", winner: jesterWinner ? "jester" : room.winner, winner_player: jesterWinner ? eliminated : room.winner_player, accused_player: null, last_event: jesterWinner ? "jester_won" : event, last_deaths: voteDeaths, last_eliminated: eliminated, last_saved: event === "lawyer_saved", jailed_player: eliminated === room.jailed_player ? null : room.jailed_player }).eq("code", code));
        let winner: string | null = jesterWinner ? "jester" : null;
        if (jesterWinner) { ({ room, players } = await load(code)); await recordStats(room, players); }
        if (!winner) { await promoteMafia(code); winner = await checkWin(code); }
        if (!winner && !(await load(code)).room.enabled_roles?.pending_shot) await db.from("mafia_rooms").update({ phase: "night", round: room.round + 1 }).eq("code", code);
        ({ room, players } = await load(code));
        if (!winner && !room.enabled_roles?.pending_shot) { await botNightActions(room, players); ({ room, players } = await load(code)); }
        return out(publicView(room, players, undefined, true));
      }
      if (room.phase !== "vote") return out({ error: "INVALID_ACTION" }, 400);
      const counts: Record<string, number> = {};
      alive.forEach((x) => counts[x.vote_target] = (counts[x.vote_target] || 0) + 1);
      const max = Math.max(...Object.values(counts)), top = Object.keys(counts).filter((id) => counts[id] === max);
      const lawyerTarget = players.find((x) => x.alive && x.role === "lawyer")?.action_target;
      let eliminated: string | null = null, event = "vote_tie";
      if (top.length === 1 && top[0] !== "SKIP") {
        if (top[0] === lawyerTarget) event = "lawyer_saved";
        else { eliminated = top[0]; event = "vote_eliminated"; }
      }
      const voteDeaths: string[] = eliminated ? [eliminated] : [];
      const linkedPlayers: string[] = Array.isArray(room.linked_players) ? room.linked_players : [];
      if (eliminated && linkedPlayers.includes(eliminated)) {
        const partner = linkedPlayers.find((id) => id !== eliminated && players.some((x) => x.id === id && x.alive));
        if (partner) { voteDeaths.push(partner); event += ",lovers_died"; }
      }
      const voteCauses = Object.fromEntries(voteDeaths.map((id) => [id, id === eliminated ? (room.phase === "verdict" ? "trial_guilty" : "vote_eliminated") : "lovers_died"]));
      await eliminatePlayers(room, players, voteCauses);
      await prepareLastShot(code, voteCauses, "night", room.round + 1);
      await persist(db.from("mafia_players").update({ vote_target: null, action_target: null }).eq("room_code", code));
      const jesterWinner = eliminated ? players.find((x) => x.id === eliminated)?.role === "jester" : false;
      await persist(db.from("mafia_rooms").update({ phase: jesterWinner ? "finished" : room.phase, winner: jesterWinner ? "jester" : room.winner, winner_player: jesterWinner ? eliminated : room.winner_player, last_event: jesterWinner ? "jester_won" : event, last_deaths: voteDeaths, last_eliminated: eliminated, last_saved: event === "lawyer_saved", jailed_player: eliminated === room.jailed_player ? null : room.jailed_player }).eq("code", code));
      let winner: string | null = jesterWinner ? "jester" : null;
      if (jesterWinner) { ({ room, players } = await load(code)); await recordStats(room, players); }
      if (!winner) { await promoteMafia(code); winner = await checkWin(code); }
      if (!winner && !(await load(code)).room.enabled_roles?.pending_shot) await db.from("mafia_rooms").update({ phase: "night", round: room.round + 1 }).eq("code", code);
      ({ room, players } = await load(code));
      if (!winner && !room.enabled_roles?.pending_shot) { await botNightActions(room, players); ({ room, players } = await load(code)); }
      return out({ ...publicView(room, players, undefined, true), tie: top.length > 1 });
    
  }
}
async function handleRequest(request:Request) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if(!['GET','POST'].includes(request.method))return out({error:'METHOD_NOT_ALLOWED'},405);
  try {
    const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    const now = Date.now(), bucket = rateBuckets.get(ip);
    if (!bucket || bucket.reset < now) rateBuckets.set(ip, { count: 1, reset: now + 60_000 });
    else if (++bucket.count > 6000) return out({ error: "RATE_LIMITED" }, 429);
    const url = new URL(request.url);
    let body;
    try{body=request.method === "POST" ? await request.json() : Object.fromEntries(url.searchParams);}
    catch{return out({error:'BAD_REQUEST'},400);}
    if(!body||typeof body!=='object'||Array.isArray(body))return out({error:'BAD_REQUEST'},400);
    const action = body.action || "state";
    requestDatabase.getStore()!.action=REQUEST_ACTIONS.includes(action)?action:'unknown';
    if(action==='operationsStatus')return await operationsStatus(body);
    if (!["state","spectatorState"].includes(action) && /^\d{4}$/.test(String(body.code||'')) && Number.isSafeInteger(body.lifecycleVersion)) {
      requestDatabase.getStore()!.headers = {'x-mafia-room':String(body.code),'x-mafia-generation':String(body.lifecycleVersion)};
    }
    const started = Date.now();
    if (action === "health") return out({ status: "ok", version: 20, time: new Date().toISOString() });
    if (action === "hostLogin") return await routeHostLogin({body, action, ip, now, started});
    if (action === "hostPreferences") return await routeHostPreferences({body, action, ip, now, started});
    if (action === "hostLogout") return await routeHostLogout({body, action, ip, now, started});
    if (action === "recoverProfile") return await routeRecoverProfile({body, action, ip, now, started});
    if (action === "create") return await routeCreate({body, action, ip, now, started});
    if (action === "profile") return await routeProfile({body, action, ip, now, started});
    if (action === "leaderboard") return await routeLeaderboard({body, action, ip, now, started});
    const code = String(body.code || "").trim();
    if (!/^\d{4}$/.test(code)) return out({ error: "ROOM_NOT_FOUND" }, 404);
    // Presence validates the credentials under the room lock. Read its committed
    // result once, instead of loading the same room both before and after it.
    if (action === 'state') return await readCurrentState(code, body, now);
    let { room, players } = await load(code);
    if (!room) return out({ error: "ROOM_NOT_FOUND" }, 404);
    let me = authenticatedPlayer(players, body);
    let host = body.hostToken === room.host_token || Boolean(me && room.host_player_id === me.id && (me.alive || room.enabled_roles?.controller_spectator === true));
    // Fence requests sent from a previous match. Transactional transition RPCs
    // additionally check this value again under the database room lock.
    const generationFree = ["state","adminState","messages","spectatorState","join","joinSpectator","claimSeat","redeemAdminInvite","moderationLog","listSnapshots","systemStatus","leave"];
    if (!generationFree.includes(action) && (!Number.isSafeInteger(body.lifecycleVersion) || body.lifecycleVersion !== (room.lifecycle_version || 0))) return out({error:"STALE_GAME"},409);
    if(['resolveNight','resolveVote','beginNight','startVote','advanceVerdict','lastShot','expelPlayer','endGame','transferHost','electMafiaLeader'].includes(action)) {
      requestDatabase.getStore()!.plan=new TransitionPlan(room,players);
    }
    let authenticatedSpectator:any=null;
    if(action === "spectatorState") {
      const result=await db.from("mafia_spectators").select("id,name,session_token").eq("room_code",code).eq("id",cleanText(body.id,80)).maybeSingle();
      if(result.error)throw result.error;
      if(!result.data || result.data.session_token!==body.spectatorToken)return out({error:"UNAUTHORIZED"},403);
      authenticatedSpectator=result.data;
    }
    const actorKey = authenticatedSpectator ? `spectator:${code}:${authenticatedSpectator.id}` : me ? `player:${code}:${me.id}` : host ? `host:${code}` : `guest:${ip}`;
    if(actorRateLimited(actorKey,now))return out({error:'RATE_LIMITED'},429);

    if (["createAdminInvite", "revokeAdminAccess"].includes(action)) return await routeCreateAdminInvite({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "redeemAdminInvite") return await routeRedeemAdminInvite({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "adminState") return await routeAdminState({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (room.enabled_roles?.pending_shot && room.phase !== "finished" && ["act","vote","resolveVote","resolveNight","startVote","startDiscussion","passDiscussion","finishDiscussion","advanceVerdict","togglePause","jail","lawyerProtect"].includes(action)) return out({ error: "WAITING_LAST_SHOT" }, 409);
    if (action === "lastShot") return await routeLastShot({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "joinSpectator") return await routeJoinSpectator({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "spectatorState") return await routeSpectatorState({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "claimSeat") return await routeClaimSeat({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "join") return await routeJoin({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "leave") return await routeLeave({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "returnToLobby") return await routeReturnToLobby({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "start" || action === "restart") return await routeStart({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "kick") return await routeKick({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "warnPlayer" || action === "expelPlayer") return await routeWarnPlayer({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "addBot") return await routeAddBot({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "mute") return await routeMute({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "endGame") return await routeEndGame({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "saveWill") return await routeSaveWill({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "report") return await routeReport({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "moderationLog") return await routeModerationLog({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "transferHost") return await routeTransferHost({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "createReplacement") return await routeCreateReplacement({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "listSnapshots") return await routeListSnapshots({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "restoreSnapshot") return await routeRestoreSnapshot({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "systemStatus") return await routeSystemStatus({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "messages" || action === "sendMessage") return await routeMessages({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});


    if (action === "togglePause") return await routeTogglePause({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "electMafiaLeader") return await routeElectMafiaLeader({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "acknowledgeRole") return await routeAcknowledgeRole({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "beginNight") return await routeBeginNight({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "jail") return await routeJail({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "lawyerProtect") return await routeLawyerProtect({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "act") return await routeAct({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "resolveNight") return await routeResolveNight({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "setDiscussionClaim") return await routeSetDiscussionClaim({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "startDiscussion") return await routeStartDiscussion({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "controlDiscussion") return await routeControlDiscussion({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "passDiscussion" || action === "finishDiscussion") return await routePassDiscussion({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "startVote") return await routeStartVote({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "advanceVerdict") return await routeAdvanceVerdict({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "vote") return await routeVote({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "resolveVote") return await routeResolveVote({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    return out({ error: "BAD_ACTION" }, 400);
  } catch (error) {
    if (["STALE_GAME", "STALE_ACTION"].includes(error?.message)) return out({ error: error.message }, 409);
    if (error?.code === "P0001" && ["STALE_GAME", "GAME_STARTED", "ROOM_FULL", "NAME_TAKEN", "ROOM_NOT_FOUND"].includes(error.message)) {
      return out({ error: error.message }, error.message === "ROOM_NOT_FOUND" ? 404 : 409);
    }
    return out({ error: "SERVER_ERROR" }, 500);
  }
}
async function reconcileDeparture(room:any,players:any[]) {
  if(!room.enabled_roles?.departure_pending)return false;
  requestDatabase.getStore()!.plan=new TransitionPlan(room,players);
  const settings={...room.enabled_roles};delete settings.departure_pending;
  await persist(db.from('mafia_rooms').update({enabled_roles:settings}).eq('code',room.code));
  if(!['lobby','finished'].includes(room.phase)){
    await promoteMafia(room.code);await checkWin(room.code);
  }
  return true;
}
async function commitRequest(request:Request) {
  try {
  const response=await handleRequest(request);
  const plan=requestDatabase.getStore()!.plan;
  if(!plan || !response.ok)return response;
  const {data,error}=await currentDatabase().rpc('mafia_commit_transition',{
    p_before_room:plan.beforeRoom,p_before_players:plan.beforePlayers,
    p_room:plan.room,p_players:plan.players,p_snapshots:plan.snapshots,p_audits:plan.audits,p_stats:plan.stats,
  });
  if(error || data?.error || data?.ok!==true)return out({error:data?.error || (error?.message==='STALE_GAME'?'STALE_GAME':'SERVER_ERROR')},data?.error==='STALE_GAME'||error?.message==='STALE_GAME'?409:500);
  const body=await response.json();body.lifecycleVersion=data.lifecycleVersion;
  // SQL phase triggers run at commit time. Never return the pre-commit clock.
  if (body.phaseClock) {
    const saved = await currentDatabase().from('mafia_rooms').select('phase_started_at,phase_paused_at,lifecycle_version').eq('code',plan.room.code).single();
    if (saved.error || !saved.data) return out({error:'SERVER_ERROR'},500);
    if (saved.data.lifecycle_version !== data.lifecycleVersion) return out({error:'STALE_GAME'},409);
    body.phaseClock.startedAt = new Date(saved.data.phase_started_at).getTime();
    body.phaseClock.pausedAt = plan.room.enabled_roles?.pending_shot && plan.room.phase !== 'finished'
      ? (plan.room.enabled_roles.pending_shot.startedAt || body.phaseClock.startedAt)
      : saved.data.phase_paused_at ? new Date(saved.data.phase_paused_at).getTime() : null;
    body.serverTime = Date.now();
  }
  return out(body);
  } catch { return out({error:'SERVER_ERROR'},500); }
}
Deno.serve(async (request) => requestDatabase.run({headers:{},requestId:crypto.randomUUID(),started:Date.now()}, async () => recordResponse(await commitRequest(request))));
