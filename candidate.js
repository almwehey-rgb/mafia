const API = "https://unsxzbrpqvppecjnirqx.supabase.co/functions/v1/candidate-room?forceFunctionRegion=ap-southeast-1";
const $ = (sel) => document.querySelector(sel);
const CARD_INFO = {
  scandal: { name: "فضيحة إعلامية", text: "ألغِ نصف أصوات خصم في منطقة واحدة هذا الدور." },
  convoy: { name: "قافلة انتخابية", text: "ضاعف أصواتك في منطقة تختارها." },
  fortify: { name: "تحصين", text: "أضف 4 دفاع لمنطقة تسيطر عليها." },
  intercept: { name: "اعتراض", text: "ألغِ كرت خصم هذا الدور." },
  speech: { name: "خطاب ناري", text: "أضف 5 أصوات مجانية لمنطقة واحدة." },
  blackout: { name: "تعتيم", text: "اسمك لا يظهر في كشف الأصوات على التلفزيون." },
  coup: { name: "انقلاب", text: "استولِ على منطقة إذا كان الفارق 3 أصوات أو أقل." },
  leak: { name: "تسريب", text: "اطلع سرًا على خطة خصم في هذا الدور." },
};
const PHASE_NAME = { lobby: "الردهة", plan: "التخطيط", cards: "الكروت", reveal: "النتائج", debate: "المناظرة", paused: "إيقاف", finished: "النهاية" };

let game = null, hostToken = "", playerToken = "", playerId = "", pollTimer = 0, districtTab = "d0";
let plan = { attack: {}, defend: {}, support: [] };
let selectedCard = null, cardTarget = null, cardRegion = null;

const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const notice = (msg) => { const el = $("#roomTag"); if (el) el.textContent = msg; };
function sessionKey(code) { return "candidate-session-" + code; }
function saveSession(isHost) {
  if (!game?.code) return;
  localStorage.setItem(sessionKey(game.code), JSON.stringify({ code: game.code, hostToken: isHost ? hostToken : "", playerToken, playerId }));
  if (isHost) localStorage.setItem("candidate-host", JSON.stringify({ code: game.code, hostToken }));
}
function playerById(id) { return game?.players?.find((p) => p.id === id); }
function remainingBudget() {
  const income = game?.me?.secret?.income || 0;
  const spent = Object.values(plan.attack).reduce((s, n) => s + n, 0)
    + Object.values(plan.defend).reduce((s, n) => s + n, 0)
    + plan.support.reduce((s, r) => s + r.amount, 0);
  return income - spent;
}
function owned(id) { return game?.control?.[id] === game?.me?.id; }

async function api(body) {
  const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "API"), { code: data.code || data.error });
  return data;
}

function startPolling() {
  clearTimeout(pollTimer);
  const tick = async () => {
    if (!game?.code) return;
    try {
      const next = await api({ action: "state", code: game.code, hostToken, id: playerId, playerToken });
      const changed = JSON.stringify({ p: game.phase, r: game.round, v: game.lifecycleVersion, n: game.players?.length, ready: game.players?.map((p) => p.ready) })
        !== JSON.stringify({ p: next.phase, r: next.round, v: next.lifecycleVersion, n: next.players?.length, ready: next.players?.map((p) => p.ready) });
      if (next.phase === "plan" && (game.phase !== "plan" || game.round !== next.round)) {
        const saved = next.me?.secret?.plan;
        plan = saved ? { attack: { ...(saved.attack || {}) }, defend: { ...(saved.defend || {}) }, support: [...(saved.support || [])] } : { attack: {}, defend: {}, support: [] };
      }
      game = next;
      $("#reconnect")?.classList.remove("show");
      if (changed) render();
      else updateTimer();
    } catch {
      $("#reconnect")?.classList.add("show");
    }
    pollTimer = setTimeout(tick, 1500);
  };
  pollTimer = setTimeout(tick, 1500);
}

function updateTimer() {
  const el = $("#phaseTimer");
  if (!el || !game?.phaseClock) return;
  const { startedAt, seconds, pausedAt } = game.phaseClock;
  const left = Math.max(0, Math.ceil((startedAt + seconds * 1000 - (pausedAt || Date.now())) / 1000));
  el.textContent = left;
  el.classList.toggle("urgent", left <= 10);
}

function phaseBar() {
  const live = hostToken && game && !["lobby", "finished"].includes(game.phase);
  return `<div class="phase-bar">
    <span>${PHASE_NAME[game.phase] || ""}</span>
    <b>الجولة ${game.round || 0} / 5</b>
    ${!["lobby","finished"].includes(game.phase) ? `<span class="phase-timer" id="phaseTimer">—</span>` : ""}
    ${live ? `<button class="phase-pause" onclick="hostAction('togglePause')">${game.phase === "paused" ? "▶️" : "⏸️"}</button>
      <button class="btn" onclick="hostAction('advance')">التالي</button>` : ""}
  </div>`;
}

function standings() {
  const rows = [...(game.players || [])].sort((a, b) => b.seats - a.seats || b.regionsCount - a.regionsCount);
  return `<div class="standings">${rows.map((p) => `<div class="stand">
    <span class="swatch" style="background:${p.color}"></span>
    <b>${escapeHtml(p.name)}${p.botLabel ? ` · ${escapeHtml(p.botLabel)}` : ""}${p.afk ? " · غائب" : ""}</b>
    <span class="seat-chip">${p.seats} مقعد</span>
    <small>${p.regionsCount} مناطق</small>
  </div>`).join("")}</div>`;
}

function mapView(clickable = false) {
  const districts = game.map || [];
  return `<div class="cand-map">${districts.map((d) => `<section class="district"><h3>${escapeHtml(d.name)}</h3>
    <div class="district-grid">${d.regions.map((r) => {
      const owner = playerById(game.control?.[r.id]);
      const style = owner ? `style="background:${owner.color}22;border-color:${owner.color}"` : "";
      const handler = clickable ? `onclick="selectRegion('${r.id}')"` : "";
      const cls = [ "region", plan.attack[r.id] || plan.defend[r.id] ? "on" : "", owned(r.id) ? "mine" : "" ].join(" ");
      return `<button class="${cls}" ${style} ${handler} type="button">
        <b>${escapeHtml(r.name)}</b>
        <small>${owner ? escapeHtml(owner.name) : "متنازع عليها"}</small>
        ${clickable ? `<small>هجوم ${plan.attack[r.id] || 0} · دفاع ${plan.defend[r.id] || 0}</small>` : ""}
      </button>`;
    }).join("")}</div></section>`).join("")}</div>`;
}

function commentary() {
  const lines = game.commentary || [];
  if (!lines.length) return "";
  return lines.map((t) => `<div class="ticker">${escapeHtml(t)}</div>`).join("");
}

function renderLanding() {
  $("#roomTag").textContent = "أوراق جديدة";
  $("#app").innerHTML = `<section class="card hero cand-hero">
    <p class="cand-kicker">أوراق · مناطق · مقاعد</p>
    <div class="paper-fan" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <h1>الانتخابات</h1>
    <p>اجمع أوراق الأصوات ووزّعها على 25 منطقة. كل دائرة مقعدان: للأول والثاني. خمس جولات، والكروت تُلعب في لحظتها.</p>
    <ul class="howto">
      <li>كل ورقة صوت تضعها سرًا على منطقة تدعم موقفك في الساحة.</li>
      <li>أظهر اهتمامًا بدائرة على التلفزيون، وهاجم دائرة أخرى بأوراقك.</li>
      <li>أوراقك وكروتك تظهر لك وحدك على الجوال.</li>
    </ul>
    <button class="btn gold wide" onclick="createRoom()">إنشاء غرفة للتلفزيون</button>
    <label for="roomCode">كود الغرفة</label>
    <input class="input" id="roomCode" inputmode="numeric" maxlength="4" dir="ltr">
    <label for="playerName">اسمك</label>
    <input class="input" id="playerName" maxlength="20" placeholder="اكتب اسم المرشح">
    <button class="btn red wide" onclick="joinRoom()">دخول من الجوال</button>
    <button class="btn wide" onclick="replacementForm()">استلام مكان لاعب</button>
    <p class="muted"><a href="/" style="color:#1c4bb8">العودة إلى مافيا</a></p>
  </section>`;
}

function qrSvg() {
  if (typeof qrcode !== "function" || !game?.code) return "";
  const url = `${location.origin}/candidate.html?room=${game.code}`;
  const qr = qrcode(0, "M"); qr.addData(url); qr.make();
  return `<div class="cand-qr">${qr.createSvgTag({ cellSize: 5, margin: 16, scalable: true })}</div>`;
}

function renderHost() {
  if (!game) return;
  document.body.classList.toggle("screen-lobby", game.phase === "lobby" || game.phase === "plan" || game.phase === "reveal");
  $("#roomTag").textContent = `غرفة ${game.code}`;
  if (game.phase === "lobby") {
    $("#app").innerHTML = `<div class="grid host-lobby">
      <div class="card hero"><div class="code">${game.code}</div>${qrSvg()}
        <p>امسحوا الباركود أو أدخلوا الكود — كل لاعب يدخل بأوراقه من الجوال</p>
        <button class="btn gold wide" onclick="hostAction('start')">بدء توزيع الأوراق</button>
      </div>
      <div class="card"><h2>المرشحون (${game.players.length}/8)</h2>${standings()}
        <div class="host-actions">
          <button class="btn" onclick="addBot('pro')">➕ بوت محترف</button>
          <button class="btn" onclick="addBot('chaos')">➕ بوت خرابيط</button>
          ${game.players.some((p) => p.bot) ? `<button class="btn danger" onclick="hostAction('removeBot')">➖ احذف بوت</button>` : ""}
        </div>
        <ul class="howto">
          <li>كل دائرة مقعدان كل جولة: أول وثانٍ.</li>
          <li>الفوز بمجموع المقاعد بعد 5 جولات، ثم عدد المناطق، ثم مناظرة.</li>
        </ul>
      </div>
    </div>`;
    return;
  }
  if (game.phase === "finished") {
    const w = game.winner;
    $("#app").innerHTML = `${phaseBar()}<div class="card hero"><h1>🏆 ${escapeHtml(w?.name || "مرشح")}</h1>
      <p>${w?.reason === "debate" ? "حُسم التعادل بالمناظرة وتصويت اللاعبين." : "أكبر عدد من المقاعد بعد خمس جولات."}</p>
      ${standings()}<button class="btn gold" onclick="hostAction('returnToLobby')">عودة للردهة</button></div>`;
    return;
  }
  $("#app").innerHTML = `${phaseBar()}
    <div class="grid host-lobby">
      <div class="card"><h2>${PHASE_NAME[game.phase]}</h2>
        <p class="phase-help">${hostHelp()}</p>
        ${mapView(false)}
        ${commentary()}
      </div>
      <aside class="card">
        ${standings()}
        <p>جاهزون: ${game.players.filter((p) => p.ready || p.afk).length}/${game.players.length}</p>
        <p>اهتمام معلن: ${game.players.filter((p) => p.spotlight).map((p) => `${escapeHtml(p.name)} → ${districtName(p.spotlight)}`).join("، ") || "لا أحد بعد"}</p>
        <div class="host-actions">
          ${game.players.map((p) => `<button class="btn" onclick="replacePlayer('${p.id}')">بديل لـ ${escapeHtml(p.name)}</button>
            <button class="btn danger" onclick="kickPlayer('${p.id}')">غائب: ${escapeHtml(p.name)}</button>`).join("")}
        </div>
      </aside>
    </div>`;
  updateTimer();
}

function districtName(id) { return (game.map || []).find((d) => d.id === id)?.name || id; }
function hostHelp() {
  return ({
    plan: "المرشحون يوزعون أصواتهم سرًا. الاهتمام الظاهر على الخريطة قد يكون خدعة.",
    cards: "لحظة الكروت السياسية. قد يتغير توزيع الجولة الآن.",
    reveal: "نتائج الدوائر والمقاعد تظهر للجمهور.",
    debate: "تعادل المقاعد والمناطق. صوّت اللاعبون لمن يستحق الرئاسة.",
    paused: "أوقف الأدمن الجولة. يمكن المواصلة في أي لحظة.",
  })[game.phase] || "";
}

function renderPlayer() {
  document.body.classList.remove("screen-lobby");
  $("#roomTag").textContent = game.me?.name || "مرشح";
  if (game.phase === "lobby") {
    $("#app").innerHTML = `<div class="card"><h1>مرحبًا ${escapeHtml(game.me.name)}</h1>
      <p>انتظر بدء الانتخابات على التلفزيون. قراراتك تبقى سرية على جوالك.</p>${standings()}</div>`;
    return;
  }
  if (game.phase === "finished") {
    $("#app").innerHTML = `<div class="card hero"><h1>${game.winner?.id === game.me.id ? "أنت الفائز" : "انتهت الانتخابات"}</h1>${standings()}</div>`;
    return;
  }
  if (game.phase === "plan") return renderPlan();
  if (game.phase === "cards") return renderCards();
  if (game.phase === "reveal") return renderRevealPrivate();
  if (game.phase === "debate") return renderDebate();
  if (game.phase === "paused") {
    $("#app").innerHTML = `${phaseBar()}<div class="card"><h2>إيقاف مؤقت</h2><p>الأدمن أوقف الجولة. خطتك محفوظة.</p></div>`;
    updateTimer();
  }
}

function renderPlan() {
  const districts = game.map || [];
  const current = districts.find((d) => d.id === districtTab) || districts[0];
  const income = game.me.secret?.income || 0;
  $("#app").innerHTML = `${phaseBar()}
    <div class="card">
      <div class="budget"><span class="chip" aria-hidden="true"></span><span>أوراقك: ${remainingBudget()} / ${income}</span></div>
      <p class="muted">وزّع الأوراق على المناطق. غير المُنفق يُحفظ للجولة التالية (حد 18).</p>
      <div class="tabs">${districts.map((d) => `<button class="${d.id === current.id ? "on" : ""}" onclick="districtTab='${d.id}';renderPlan()">${escapeHtml(d.name)}</button>`).join("")}</div>
      <button class="btn ${game.me.spotlight === current.id ? "gold" : ""} wide" onclick="setSpotlight('${current.id}')">
        ${game.me.spotlight === current.id ? "اهتمامك الظاهر على هذه الدائرة" : "أظهر اهتمامك بهذه الدائرة (قد تكون خدعة)"}
      </button>
      ${current.regions.map((r) => `<div class="vote-row">
        <div><b>${escapeHtml(r.name)}</b><small> ${owned(r.id) ? "تحت سيطرتك — يمكن الدفاع" : (playerById(game.control?.[r.id])?.name || "مفتوحة")}</small></div>
        <div>
          <div class="stepper"><button onclick="addVote('${r.id}','attack',-1)">−</button><b>${plan.attack[r.id] || 0}</b><button onclick="addVote('${r.id}','attack',1)">+</button></div>
          ${owned(r.id) ? `<div class="stepper"><small>دفاع</small><button onclick="addVote('${r.id}','defend',-1)">−</button><b>${plan.defend[r.id] || 0}</b><button onclick="addVote('${r.id}','defend',1)">+</button></div>` : ""}
        </div>
      </div>`).join("")}
      <h3>دعم سري لحليف</h3>
      <select class="input" id="ally">${game.players.filter((p) => p.id !== game.me.id).map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")}</select>
      <button class="btn wide" onclick="addSupport()">أرسل صوتًا واحدًا لحليف في أول منطقة بالدائرة</button>
      <button class="btn red wide" onclick="submitPlan()">${game.me.ready ? "تحديث الخطة" : "اعتماد الخطة"}</button>
    </div>`;
  updateTimer();
}

function renderCards() {
  const hand = game.me.hand || [];
  $("#app").innerHTML = `${phaseBar()}<div class="card">
    <h2>أوراق سياسية</h2>
    <p>العب ورقة واحدة هذا الدور، أو احتفظ بها للجولة القادمة.</p>
    <div class="card-grid">${hand.map((id) => `<button class="pol-card ${selectedCard === id ? "on" : ""}" onclick="selectedCard='${id}';renderCards()">
      <b>${CARD_INFO[id]?.name || id}</b><small>${CARD_INFO[id]?.text || ""}</small></button>`).join("") || "<p>لا توجد كروت.</p>"}</div>
    ${selectedCardNeeds()}
    <button class="btn red wide" onclick="submitCard(false)" ${selectedCard ? "" : "disabled"}>لعب الورقة</button>
    <button class="btn wide" onclick="submitCard(true)">الاحتفاظ بالأوراق</button>
  </div>`;
  updateTimer();
}

function selectedCardNeeds() {
  if (!selectedCard) return "";
  const needPlayer = ["scandal", "intercept", "leak"].includes(selectedCard);
  const needRegion = ["scandal", "convoy", "fortify", "speech", "coup"].includes(selectedCard);
  const regions = (game.map || []).flatMap((d) => d.regions.map((r) => ({ ...r, district: d.name })));
  return `${needPlayer ? `<select class="input" id="cardPlayer">${game.players.filter((p) => p.id !== game.me.id).map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")}</select>` : ""}
    ${needRegion ? `<select class="input" id="cardRegion">${regions.map((r) => `<option value="${r.id}">${escapeHtml(r.district)} — ${escapeHtml(r.name)}</option>`).join("")}</select>` : ""}`;
}

function renderRevealPrivate() {
  const priv = game.me.secret?.lastPrivate || {};
  const leak = priv.leaked;
  $("#app").innerHTML = `${phaseBar()}<div class="card">
    <h2>نتيجتك الخاصة</h2>
    <p>ربحت ${priv.gainedSeats || 0} مقعدًا. أنفقت ${priv.spent || 0} وبقي ${priv.leftover || 0}.</p>
    ${priv.cancelled ? "<p class='warn'>كُرتك اعتُرض.</p>" : ""}
    ${leak ? `<p>تسريب: ${escapeHtml(leak.name)} يهاجم ${Object.entries(leak.attack || {}).map(([id, n]) => `${regionName(id)} (${n})`).join("، ") || "بدون هجوم"}.</p>` : ""}
    <p class="muted">التفاصيل العامة على التلفزيون فقط. خطط الآخرين تبقى مخفية إلا عبر تسريب.</p>
    ${standings()}
  </div>`;
  updateTimer();
}

function regionName(id) {
  for (const d of game.map || []) for (const r of d.regions) if (r.id === id) return r.name;
  return id;
}

function renderDebate() {
  const tied = new Set(game.debateTied || game.players.map((p) => p.id));
  const options = game.players.filter((p) => p.id !== game.me.id && tied.has(p.id));
  $("#app").innerHTML = `${phaseBar()}<div class="card"><h2>مناظرة حسم</h2>
    <p>تعادل المقاعد والمناطق. صوّت لمرشح آخر.</p>
    ${options.map((p) => `<button class="pick" onclick="voteDebate('${p.id}')">${escapeHtml(p.name)}</button>`).join("")}
  </div>`;
  updateTimer();
}

function render() {
  if (hostToken) renderHost();
  else if (playerId) renderPlayer();
  else renderLanding();
}

window.createRoom = async function createRoom() {
  try {
    game = await api({ action: "create" });
    hostToken = game.hostToken; playerId = ""; playerToken = "";
    saveSession(true); renderHost(); startPolling();
  } catch { notice("تعذر إنشاء الغرفة"); }
};
window.joinRoom = async function joinRoom() {
  const code = ($("#roomCode")?.value || new URLSearchParams(location.search).get("room") || "").replace(/\D/g, "").slice(0, 4);
  const name = $("#playerName")?.value?.trim() || "";
  if (!/^\d{4}$/.test(code) || !name) { notice("أدخل الكود والاسم"); return; }
  playerId = crypto.randomUUID(); playerToken = crypto.randomUUID(); hostToken = "";
  try {
    game = await api({ action: "join", code, id: playerId, playerToken, name });
    playerId = game.playerId; playerToken = game.playerToken;
    saveSession(false); renderPlayer(); startPolling();
  } catch (e) {
    notice(({ GAME_STARTED: "بدأت المباراة", ROOM_FULL: "الغرفة ممتلئة", NAME_TAKEN: "الاسم مستخدم" })[e.code] || "تعذر الدخول");
  }
};
window.addVote = function addVote(regionId, kind, delta) {
  const cur = plan[kind][regionId] || 0;
  const next = Math.max(0, cur + delta);
  if (delta > 0 && remainingBudget() < 1) return;
  if (next === 0) delete plan[kind][regionId]; else plan[kind][regionId] = next;
  renderPlan();
};
window.setSpotlight = async function setSpotlight(id) {
  try { game = await api({ action: "spotlight", code: game.code, id: playerId, playerToken, spotlight: id }); renderPlan(); }
  catch { notice("تعذر تسجيل الاهتمام"); }
};
window.addSupport = function addSupport() {
  if (remainingBudget() < 1) return;
  const targetId = $("#ally")?.value;
  const regionId = (game.map.find((d) => d.id === districtTab) || game.map[0]).regions[0].id;
  if (!targetId) return;
  plan.support.push({ targetId, regionId, amount: 1 });
  renderPlan();
};
window.submitPlan = async function submitPlan() {
  try {
    game = await api({ action: "plan", code: game.code, id: playerId, playerToken, attack: plan.attack, defend: plan.defend, support: plan.support, spotlight: game.me.spotlight });
    render();
  } catch (e) { notice(e.code === "OVER_BUDGET" ? "تجاوزت عدد الأصوات" : "تعذر اعتماد الخطة"); }
};
window.submitCard = async function submitCard(skip) {
  try {
    game = await api({
      action: "playCard", code: game.code, id: playerId, playerToken, skip,
      cardId: selectedCard, targetPlayerId: $("#cardPlayer")?.value, regionId: $("#cardRegion")?.value,
    });
    selectedCard = null; render();
  } catch { notice("تعذر لعب الكرت"); }
};
window.voteDebate = async function voteDebate(target) {
  try { game = await api({ action: "voteDebate", code: game.code, id: playerId, playerToken, target }); render(); }
  catch { notice("تعذر التصويت"); }
};
window.hostAction = async function hostAction(action) {
  try { game = await api({ action, code: game.code, hostToken }); render(); }
  catch { notice("تعذر تنفيذ أمر الأدمن"); }
};
window.addBot = async function addBot(level) {
  try { game = await api({ action: "addBot", code: game.code, hostToken, level }); render(); }
  catch (e) { notice(e.code === "ROOM_FULL" ? "الغرفة ممتلئة" : "تعذر إضافة بوت"); }
};
window.kickPlayer = async function kickPlayer(target) {
  try { game = await api({ action: "kick", code: game.code, hostToken, target }); render(); }
  catch { notice("تعذر"); }
};
window.replacePlayer = async function replacePlayer(target) {
  try {
    const res = await api({ action: "createReplacement", code: game.code, hostToken, target });
    notice("رمز البديل: " + res.replacementCode);
    alert("رمز استلام المكان: " + res.replacementCode);
  } catch { notice("تعذر إنشاء البديل"); }
};
window.replacementForm = function replacementForm() {
  $("#app").innerHTML = `<div class="card"><h1>استلام مكان</h1>
    <input class="input" id="roomCode" placeholder="كود الغرفة" maxlength="4">
    <input class="input" id="replacementCode" placeholder="رمز الاستبدال">
    <input class="input" id="playerName" placeholder="اسمك">
    <button class="btn red wide" onclick="claimSeat()">دخول</button>
    <button class="btn" onclick="renderLanding()">رجوع</button></div>`;
};
window.claimSeat = async function claimSeat() {
  try {
    game = await api({ action: "claimSeat", code: $("#roomCode").value, replacementCode: $("#replacementCode").value, name: $("#playerName").value, playerToken: crypto.randomUUID() });
    playerId = game.playerId; playerToken = game.playerToken; hostToken = "";
    saveSession(false); renderPlayer(); startPolling();
  } catch { notice("رمز غير صالح"); }
};

setInterval(updateTimer, 1000);
window.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(location.search);
  const room = (params.get("room") || "").replace(/\D/g, "").slice(0, 4);
  if (room) {
    const saved = JSON.parse(localStorage.getItem(sessionKey(room)) || "null");
    if (saved?.playerToken && saved?.playerId && !saved?.hostToken) {
      playerToken = saved.playerToken; playerId = saved.playerId; hostToken = "";
      try { game = await api({ action: "state", code: saved.code, id: playerId, playerToken }); renderPlayer(); startPolling(); return; } catch { playerId = ""; }
    }
    renderLanding();
    const input = $("#roomCode"); if (input) input.value = room;
    return;
  }
  const savedHost = JSON.parse(localStorage.getItem("candidate-host") || "null");
  if (savedHost?.hostToken && savedHost?.code) {
    hostToken = savedHost.hostToken;
    try { game = await api({ action: "state", code: savedHost.code, hostToken }); renderHost(); startPolling(); return; } catch { hostToken = ""; }
  }
  renderLanding();
});
window.renderPlan = renderPlan;
window.renderLanding = renderLanding;
window.render = render;
