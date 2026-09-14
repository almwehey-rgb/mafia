const API = 'https://unsxzbrpqvppecjnirqx.supabase.co/functions/v1/mafia-room?forceFunctionRegion=ap-southeast-1';
const $ = (selector) => document.querySelector(selector);
let game = null;
let hostToken = '';
let hostAccessToken = localStorage.getItem('mafia-host-access-token') || '';
let playerToken = '';
let playerId = '';
let mafiaCount = 3;
let detectiveCount = 1;
let detectiveQuestions = 3;
const detectiveQuestionCount = (value) => Number.isFinite(Number(value)) && value != null ? Math.max(1, Math.min(5, Math.round(Number(value)))) : 3;
let enabledRoles = { doctor: true, detective: true, lawyer: true, jailer: true, vigilante: false, witch: false, serial_killer: false, jester: false, cupid: false, escort: false, godfather_innocent: true, mafia_kill_start_round: 2, mafia_kill_mode: 'always', mafia_kill_enabled: true, reveal_dead_roles: false, allow_no_vote: true, full_trial: true, kids_mode: false };
let spectatorToken = '';
Object.assign(enabledRoles, { discussion_mode: 'turns', discussion_seconds: 180, speaker_seconds: 30 });
let spectatorId = '';
let spectatorMode = false;
let delegatedHostMode = false;
let profileToken = localStorage.getItem('mafia-profile-token') || crypto.randomUUID();
localStorage.setItem('mafia-profile-token', profileToken);
let pollTimer;
let pollingEpoch = 0;
let pollFails = 0;
let busyCount = 0;
let apiWarmed = false;
let setupStep = 1;
let lobbyPane = 'setup';
let lobbyPlayerPage = 0;
let phaseStartedAt = Date.now();
let phaseDuration = Number(localStorage.getItem('mafia-phase-seconds')) || 60;
let soundEnabled = localStorage.getItem('mafia-sound') !== 'off';
let localHistory = [];
let preferenceSaveTimer;

function signalPhase() {
  phaseStartedAt = Date.now();
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  if (!soundEnabled) return;
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 620;
    gain.gain.setValueAtTime(.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .28);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + .28);
  } catch {}
}
function phaseIcon(phase = game?.phase) { return ({ lobby: '🎴', reveal: '👁️', night: '🌙', day: '☀️', nomination: '☝️', trial: '⚖️', verdict: '🔨', vote: '🗳️', paused: '⏸️', finished: '🏆' })[phase] || '🎭'; }
function phaseName(phase = game?.phase) { return ({ lobby: discussionText('الانتظار','Lobby'), reveal: discussionText('كشف الأدوار','Role reveal'), night: discussionText('الليل','Night'), day: discussionText('الصباح','Morning'), nomination: discussionText('الترشيح','Nomination'), trial: discussionText('المحاكمة','Trial'), verdict: discussionText('الحكم','Verdict'), vote: discussionText('التصويت','Voting'), paused: discussionText('متوقفة مؤقتًا','Paused'), finished: discussionText('النهاية','Results') })[phase] || ''; }
function lobbyIcon(name){const paths={wait:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',admin:'<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/><path d="m8 12 3 3 5-6"/>',shield:'<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/>',leave:'<path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4"/>',back:'<path d="M5 12h14m-6-6 6 6-6 6"/>',share:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',bots:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 7h.1M17 7h.1M12 12h.1M7 17h.1M17 17h.1"/>',user:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',play:'<path d="m7 3 14 9L7 21V3Z"/>',pause:'<path d="M7 4v16M17 4v16"/>',camera:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>'};return '<svg class="lobby-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>'}
function noirEmblem(){return `<aside class="home-emblem" aria-hidden="true"><img src="/assets/mafia-gold-icon.webp" alt="" width="220" height="220"><span>◆ MAFIA NIGHT ◆</span></aside>`;}
function noirPageFrame(cardHtml,{wide=false}={}){return `<section class="noir-entry noir-subpage"><div class="noir-content${wide?' noir-content-wide':''}"><div class="card hero join-card auth-card">${cardHtml}</div><div class="noir-links"><button class="btn" type="button" onclick="home()">${discussionText('الرجوع للرئيسية','Back to home')}</button></div></div>${noirEmblem()}</section>`;}
function removePlayerChrome(){document.querySelector('.player-tools')?.remove();document.querySelector('.player-dock')?.remove();document.body.classList.remove('has-player-dock')}
function backFromLobby(){pollingEpoch++;clearTimeout(pollTimer);closeSheet();removePlayerChrome();game=null;if(hostAccessToken)renderHostHome();else renderHostLogin()}
function phaseBar() { const controller=(hostToken||game?.me?.isHost)&&game;const live=controller&&!['lobby','finished'].includes(game.phase);const pause=live?`<button type="button" class="phase-pause phase-icon-btn" aria-label="${discussionText(game.phase==='paused'?'استكمال المباراة':'إيقاف مؤقت',game.phase==='paused'?'Resume game':'Pause game')}" onclick="hostAction('togglePause')">${lobbyIcon(game.phase==='paused'?'play':'pause')}</button>`:'';const toLobby=controller&&game.phase!=='lobby'?`<button type="button" class="phase-pause lobby-action lobby-back" onclick="returnToLobby()">${lobbyIcon('back')}<span class="btn-label">${discussionText('اللوبي','Lobby')}</span></button>`:'';const admin=live?`<button type="button" class="phase-pause phase-icon-btn" aria-label="${discussionText('إدارة المباراة','Game management')}" onclick="showMatchTools()">${lobbyIcon('shield')}</button>`:'';const back=delegatedHostMode?`<button type="button" class="phase-pause phase-icon-btn" aria-label="${discussionText('العودة لدوري','Back to my role')}" onclick="toggleDelegatedHost()">${lobbyIcon('user')}</button>`:'';return `<div class="phase-bar"><span class="phase-symbol">${game?.phase==='lobby'?lobbyIcon('wait'):phaseIcon()}</span><b class="phase-label">${phaseName()}</b>${game?.round ? `<small>${discussionText('الجولة','Round')} ${game.round}</small>` : ''}${game&&!["lobby","finished"].includes(game.phase)?`<span class="phase-timer" id="phaseTimer" role="timer" aria-label="${discussionText('الوقت المتبقي','Time remaining')}">${phaseDuration}</span>`:''}${game?.phase==='lobby'?`<button type="button" class="phase-pause lobby-action lobby-back" onclick="backFromLobby()">${lobbyIcon('back')}<span class="btn-label">${discussionText('الرئيسية','Home')}</span></button>`:''}${pause}${toLobby}${admin}${hostToken?`<button type="button" class="phase-pause lobby-action" onclick="showAdminQR()" aria-label="${discussionText('وضع الأدمن الخاص','Private admin access')}">${lobbyIcon('admin')}<span class="btn-label">${discussionText('أدمن','Admin')}</span></button>`:''}${back}${!spectatorMode ? `<button type="button" class="phase-pause lobby-action lobby-exit" onclick="leaveRoom()" aria-label="${discussionText('مغادرة الغرفة','Leave room')}">${lobbyIcon('leave')}<span class="btn-label">${discussionText('مغادرة','Leave')}</span></button>` : ""}</div>`; }
function clientPhaseRemaining() {
  const clock=game?.phaseClock;
  if(!clock||!Number.isFinite(clock.startedAt))return Infinity;
  return Math.max(0,clock.startedAt+clock.seconds*1000-(clock.pausedAt||Date.now()+discussionClockOffset));
}
function phaseTimeExpired(){return game?.phase!=='paused'&&clientPhaseRemaining()===0;}
function updatePhaseTimer() {
  for(const button of document.querySelectorAll('[data-timeout-action]')) {
    const action=button.dataset.timeoutAction;
    const ready=action==='resolveNight'?game?.nightReady:action==='advanceVerdict'?true:game?.voteCount>=Math.max(0,alivePlayers().length-(game.phase==='verdict'?1:0));
    button.disabled=!(ready||phaseTimeExpired());
  }
  const trialHint=$('#trialTimerHint');
  if(trialHint) {
    const expired=phaseTimeExpired();
    trialHint.hidden=!expired;
    trialHint.textContent=discussionText('انتهى وقت الدفاع — انتقل إلى الحكم.','Defense time is over — move to verdict.');
    if(expired) trialHint.classList.add('urgent');
  }
  updateDiscussionClocks();
  updateHostProgress();
  const el = $('#phaseTimer');
  if (!el) return;
  const discussion = clientDiscussion();
  const discussionDay = game?.phase === 'day' || (game?.phase === 'paused' && game.enabledRoles?.paused_phase === 'day');
  if (discussionDay && discussion.status !== 'off') {
    el.textContent = discussion.status === 'waiting' ? '—' : formatDiscussionTime(discussion.remainingMs || 0);
    el.classList.toggle('urgent', discussion.status === 'active' && discussion.remainingMs <= 10000);
    return;
  }
  const remaining=clientPhaseRemaining();
  const left=Number.isFinite(remaining)?Math.ceil(remaining/1000):null;
  el.textContent=left===null?'—':left;
  el.classList.toggle('urgent', left !== null && left <= 10);
}
setInterval(updatePhaseTimer,1000);
function toggleSound(){soundEnabled=!soundEnabled;localStorage.setItem('mafia-sound',soundEnabled?'on':'off');schedulePreferenceSave();renderHost()}
function cycleTimer(){phaseDuration=phaseDuration===30?60:phaseDuration===60?90:30;localStorage.setItem('mafia-phase-seconds',String(phaseDuration));phaseStartedAt=Date.now();enabledRoles.phase_seconds=phaseDuration;schedulePreferenceSave();renderHost()}
function copyText(value){if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(value);const area=document.createElement('textarea');area.value=value;document.body.append(area);area.select();document.execCommand('copy');area.remove();return Promise.resolve()}
async function shareRoom(){const url=`${location.origin}/game.html?room=${game.code}`;try{if(navigator.share)await navigator.share({title:'لعبة مافيا',text:`ادخل غرفة ${game.code}`,url});else{await copyText(url);notice(discussionText('تم نسخ رابط الغرفة ✅','Room link copied ✅'))}}catch{}}
async function shareResult(){const text=`${winnerTitle().replace(/<[^>]*>/g,'')} — غرفة ${game.code}`;try{if(navigator.share)await navigator.share({title:'نتيجة لعبة مافيا',text,url:location.origin});else{await copyText(text);notice(discussionText('تم نسخ النتيجة ✅','Result copied ✅'))}}catch{}}

function warmApi() {
  if (apiWarmed) return;
  apiWarmed = true;
  // The first real request establishes the connection. An extra OPTIONS probe
  // duplicates browser-managed preflight and can keep startup network-idle open.
}
function setBusy(active, message = discussionText('جاري التحميل…','Loading…')) {
  busyCount = Math.max(0, busyCount + (active ? 1 : -1));
  let overlay = document.getElementById('busyOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'busyOverlay';
    overlay.className = 'busy-overlay';
    overlay.innerHTML = `<div class="busy-box" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span><strong></strong><small>${discussionText('لا تغلق الصفحة','Keep this page open')}</small></div>`;
    document.body.appendChild(overlay);
  }
  overlay.querySelector('strong').textContent = message;
  overlay.classList.toggle('show', busyCount > 0);
}

async function withBusy(message, task) {
  setBusy(true, message);
  try { return await task(); }
  finally { setBusy(false); }
}
const roleTitles = {
  mafia_boss: ['👑 العرّاب', '👑 Godfather'],
  mafia: ['🔪 فرد المافيا', '🔪 Mafioso'],
  doctor: ['🩺 الطبيب', '🩺 Doctor'],
  detective: ['🕵️ المحقق', '🕵️ Detective'],
  jailer: ['🔐 السجّان', '🔐 Jailer'],
  lawyer: ['⚖️ المحامي', '⚖️ Lawyer'],
  vigilante: ['🎯 القناص', '🎯 Vigilante'],
  witch: ['🧪 الساحرة', '🧪 Witch'],
  serial_killer: ['🩸 القاتل المتسلسل', '🩸 Serial Killer'],
  jester: ['🃏 المهرج', '🃏 Jester'],
  revealer: ['📡 الكاشف', '📡 Revealer'],
  cupid: ['💘 كيوبيد', '💘 Cupid'],
  escort: ['🚫 المعطّل', '🚫 Escort'],
  citizen: ['🏘️ المواطن', '🏘️ Citizen'],
};
const kidsRoleTitles = {
  mafia_boss: ['🕵️ قائد الفريق الغامض', '🕵️ Mystery leader'],
  mafia: ['🕵️ الفريق الغامض', '🕵️ Mystery team'],
  doctor: ['🛡️ الحارس', '🛡️ Guard'],
  detective: ['🔎 المحقق', '🔎 Detective'],
  citizen: ['🙂 الأصدقاء', '🙂 Friends'],
};
const roleNames = Object.fromEntries(Object.entries(roleTitles).map(([role, pair]) => [role, pair[0]]));
const roleCardCopy = {
  mafia_boss: {
    team: ['فريق المافيا', 'Mafia'],
    task: ['قد فريقك سرًا واختر هدف الاغتيال.', 'Lead your team in secret and pick the kill.'],
    ability: ['اختر لاعبًا خارج المافيا، أو تخطَّ الليلة. قرارك هو النهائي.', 'Choose a non-Mafia player, or skip tonight. Your choice is final.'],
    limits: ['الليلة الأولى للمحقق فقط. الاغتيال يبدأ حسب إعداد الغرفة.', 'Night one is detective-only. Later kills follow room settings.'],
    win: ['تفوز المافيا إذا ساوت أو فاقت بقية الأحياء، ولم يبقَ قاتل متسلسل.', 'Mafia wins at parity or majority, with no Serial Killer left.'],
  },
  mafia: {
    team: ['فريق المافيا', 'Mafia'],
    task: ['تعاون مع فريقك ليلاً، وابتعد عن الشبهة نهارًا.', 'Work with your team at night and stay undercover by day.'],
    ability: ['اقترح هدفًا أو تخطَّ. يُعتمد اختيار الزعيم إن وُجد.', 'Suggest a target or skip. The Boss’s choice wins if they act.'],
    limits: ['لا تستهدف المافيا. الاغتيال غير متاح في الليلة الأولى.', 'You cannot target Mafia. There is no kill on night one.'],
    win: ['تفوز المافيا إذا ساوت أو فاقت بقية الأحياء، ولم يبقَ قاتل متسلسل.', 'Mafia wins at parity or majority, with no Serial Killer left.'],
  },
  doctor: {
    team: ['فريق القرية', 'Village'],
    task: ['احمِ لاعبًا من هجوم الليل.', 'Protect one player from a night attack.'],
    ability: ['من الليلة الثانية احمِ لاعبًا كل ليلة، ويمكنك حماية نفسك.', 'From night two, protect one player each night, including yourself.'],
    limits: ['لا تكرر نفس اللاعب ليلتين. الحماية لا تمنع إعدام السجّان أو موت الربط.', 'Do not repeat the same player two nights. Jailer execution and lover death still happen.'],
    win: ['تفوز القرية بعد خروج كل المافيا والقتلة المتسلسلين.', 'Village wins after all Mafia and Serial Killers are gone.'],
  },
  detective: {
    team: ['فريق القرية', 'Village'],
    task: ['اجمع نتائج سرية تكشف المافيا أثناء النقاش.', 'Gather private results to expose Mafia during discussion.'],
    ability: ['افحص لاعبًا واحدًا كل جولة متاحة. النتيجة تظهر صباحًا.', 'Investigate one player each eligible round. The result arrives in the morning.'],
    limits: ['الفحوص الفائتة لا تتراكم. «بريء» لا تعني أن اللاعب من القرية.', 'Missed checks do not stack. Innocent does not prove the player is Village.'],
    win: ['تفوز القرية بعد خروج كل المافيا والقتلة المتسلسلين.', 'Village wins after all Mafia and Serial Killers are gone.'],
  },
  jailer: {
    team: ['فريق القرية', 'Village'],
    task: ['احبس مشتبهًا وقرر مصيره.', 'Jail a suspect and decide their fate.'],
    ability: ['اختر سجينًا نهارًا، ثم اعفُ عنه أو أعدمه ليلًا.', 'Pick a prisoner by day, then spare or execute at night.'],
    limits: ['لديك 3 إعدامات. السجين لا يستخدم قدرته، وإعدامك يتجاوز الحماية المعتادة.', 'You have 3 executions. The prisoner cannot use an ability, and your execute bypasses normal protection.'],
    win: ['تفوز القرية بعد خروج كل المافيا والقتلة المتسلسلين.', 'Village wins after all Mafia and Serial Killers are gone.'],
  },
  lawyer: {
    team: ['فريق القرية', 'Village'],
    task: ['امنع إقصاء لاعب تختاره بالتصويت.', 'Stop one chosen player from being voted out.'],
    ability: ['احمِ لاعبًا حيًا من نتيجة تصويت هذه الجولة، ويمكنك حماية نفسك.', 'Protect a living player from this round’s vote, including yourself.'],
    limits: ['الحماية للتصويت فقط، ولا تكشف الدور. اختر من جديد كل جولة.', 'This blocks votes only, not night kills, and does not reveal the role. Choose again each round.'],
    win: ['تفوز القرية بعد خروج كل المافيا والقتلة المتسلسلين.', 'Village wins after all Mafia and Serial Killers are gone.'],
  },
  vigilante: {
    team: ['فريق القرية', 'Village'],
    task: ['عند خروجك تملك فرصة أخيرة للتأثير.', 'When you are eliminated, you get one last shot.'],
    ability: ['إذا خرجت بالتصويت أو باغتيال المافيا، اختر لاعبًا حيًا لطلقتك.', 'If voted out or killed by Mafia, choose one living player for your shot.'],
    limits: ['طلقة واحدة فقط، وليست قدرة ليلية عادية. بعدها تتابع كمشاهد.', 'One shot only, and it is not a normal night action. Then you spectate.'],
    win: ['تفوز القرية بعد خروج كل المافيا والقتلة المتسلسلين.', 'Village wins after all Mafia and Serial Killers are gone.'],
  },
  witch: {
    team: ['فريق القرية', 'Village'],
    task: ['أنقذ لاعبًا أو اضرب بجرعة السم.', 'Save a player or strike with poison.'],
    ability: ['من الليلة الثانية اختر جرعة حياة أو سم. كل جرعة مرة واحدة.', 'From night two, choose a life or poison dose. Each dose is used once.'],
    limits: ['يمكنك إنقاذ نفسك، ولا تسمّم نفسك. الحماية قد تنقذ هدف السم.', 'You may save yourself, but cannot poison yourself. Protection can save a poison target.'],
    win: ['تفوز القرية بعد خروج كل المافيا والقتلة المتسلسلين.', 'Village wins after all Mafia and Serial Killers are gone.'],
  },
  serial_killer: {
    team: ['دور مستقل', 'Independent'],
    task: ['أبعد الجميع حتى تبقى الأقوى وحدك.', 'Eliminate others until you outnumber the rest.'],
    ability: ['من الليلة الثانية اقتل لاعبًا حيًا غير نفسك كل ليلة.', 'From night two, kill one other living player each night.'],
    limits: ['الحماية أو السجن أو التعطيل قد يوقف هجومك. فحصك يظهر بريئًا.', 'Protection, jail, or block can stop you. Investigation shows Innocent.'],
    win: ['تفوز إذا لم تبقَ مافيا، ووصل عدد القتلة إلى بقية الأحياء أو تجاوزه.', 'You win with no Mafia left, when Serial Killers equal or outnumber the rest.'],
  },
  jester: {
    team: ['دور مستقل', 'Independent'],
    task: ['اجعل الجميع يصوّتون لإقصائك.', 'Convince everyone to vote you out.'],
    ability: ['ناقش وصوّت كالباقين. لا توجد قدرة ليلية.', 'Talk and vote like everyone else. You have no night ability.'],
    limits: ['الموت باغتيال لا يفوز. يجب إقصاؤك بالتصويت دون حماية المحامي.', 'A night kill does not win. You must be voted out, and Lawyer protection can block that.'],
    win: ['تفوز وحدك إذا أُقصيت فعلًا بنتيجة التصويت.', 'You win alone if you are actually eliminated by vote.'],
  },
  revealer: {
    team: ['فريق القرية', 'Village'],
    task: ['اعرف عدد المافيا الأحياء دون معرفة أسمائهم.', 'Learn how many Mafia remain, without names.'],
    ability: ['من الليلة الثانية استخدم كشفك مرة واحدة، أو احتفظ به.', 'From night two, use your one reveal, or save it.'],
    limits: ['الكشف مرة واحدة. النتيجة صباح تلك الجولة فقط ولا تكشف الهويات.', 'One use only. The morning result is for that round and reveals no identities.'],
    win: ['تفوز القرية بعد خروج كل المافيا والقتلة المتسلسلين.', 'Village wins after all Mafia and Serial Killers are gone.'],
  },
  cupid: {
    team: ['فريق القرية', 'Village'],
    task: ['اربط مصير لاعبين معًا.', 'Bind two players’ fates together.'],
    ability: ['في الليلة الثانية فقط اختر لاعبين أحياء غير نفسك.', 'On night two only, choose two other living players.'],
    limits: ['يجب اكتمال الاختيارين. موت أحدهما يميت الآخر.', 'Both picks must be completed. If one dies, the other dies too.'],
    win: ['تفوز القرية بعد خروج كل المافيا والقتلة المتسلسلين.', 'Village wins after all Mafia and Serial Killers are gone.'],
  },
  escort: {
    team: ['فريق القرية', 'Village'],
    task: ['عطّل قدرة لاعب مشتبه به ليلة واحدة.', 'Block a suspect’s ability for one night.'],
    ability: ['من الليلة الثانية اختر لاعبًا حيًا غير نفسك لتعطيله.', 'From night two, choose one other living player to block.'],
    limits: ['التعطيل لا يكشف الدور ولا يقصي. تعطيل قروي قد يضر الحماية أو الفحص.', 'Block does not reveal or kill. Blocking a villager can stop a save or check.'],
    win: ['تفوز القرية بعد خروج كل المافيا والقتلة المتسلسلين.', 'Village wins after all Mafia and Serial Killers are gone.'],
  },
  citizen: {
    team: ['فريق القرية', 'Village'],
    task: ['راقب التناقضات وصوّت لكشف المافيا.', 'Watch for contradictions and vote out Mafia.'],
    ability: ['لا قدرة ليلية. قوتك في النقاش والترشيح والتصويت.', 'No night ability. Your power is discussion, nomination, and voting.'],
    limits: ['الاتهام ليس دليلًا. نتيجة «بريء» لا تكشف الدور الكامل.', 'An accusation is not proof. An Innocent result does not reveal the full role.'],
    win: ['تفوز القرية بعد خروج كل المافيا والقتلة المتسلسلين.', 'Village wins after all Mafia and Serial Killers are gone.'],
  },
};
function roleTeamLabel(role) {
  const copy = roleCardCopy[role];
  return copy ? discussionText(...copy.team) : '';
}
function detailedRoleProperties(role, personal=false) {
  const copy = roleCardCopy[role];
  if (!copy) return '';
  const sections = [
    [discussionText('مهمتك', 'Your task'), discussionText(...copy.task)],
    [discussionText('قدرتك', 'Your ability'), discussionText(...copy.ability)],
    [discussionText('قيودك', 'Limits'), discussionText(...copy.limits)],
    [discussionText('كيف تفوز', 'How you win'), discussionText(...copy.win)],
  ];
  if (personal && role === 'mafia_boss') sections.push([discussionText('غرفتك', 'This room'), game.enabledRoles?.godfather_innocent ? discussionText('تمويه العرّاب مفعّل: تظهر بريئًا للمحقق.', 'Godfather disguise is on: you appear Innocent.') : discussionText('تمويه العرّاب ملغي: يكشفك فحص المحقق.', 'Godfather disguise is off: investigation finds Mafia.')]);
  if (personal && role === 'detective') sections.push([discussionText('غرفتك', 'This room'), discussionText(`جولات الفحص: ${detectiveQuestionCount(game.detectiveQuestions ?? game.detective_questions)}. سؤال واحد في كل جولة.`, `Investigation rounds: ${detectiveQuestionCount(game.detectiveQuestions ?? game.detective_questions)}. One question per round.`)]);
  const privacy = '';
  return `${privacy}<div class="role-rule-sections">${sections.map(([heading, text]) => `<section><h3>${heading}</h3><p>${escapeHtml(text)}</p></section>`).join('')}</div>`;
}
function kidsModeActive() {
  return enabledRoles.kids_mode === true || game?.enabledRoles?.kids_mode === true;
}
function applyKidsRoleLocks(roles, playerCount = game?.players?.length ?? 0) {
  if (!roles.kids_mode) return roles;
  return {
    ...roles,
    lawyer: false,
    jailer: false,
    vigilante: false,
    witch: false,
    serial_killer: false,
    jester: false,
    cupid: false,
    escort: false,
    revealer: false,
    godfather_innocent: false,
    doctor: playerCount >= 5 ? roles.doctor !== false : false,
    detective: playerCount >= 4 ? roles.detective !== false : false,
    reveal_dead_roles: true,
    allow_no_vote: roles.allow_no_vote !== false,
    full_trial: false,
  };
}
function roleLabel(role){
  const pair = (kidsModeActive() && kidsRoleTitles[role]) || roleTitles[role];
  return pair ? discussionText(pair[0], pair[1]) : (roleNames[role] || role);
}
const eventText = {
  game_started: ['بدأ القيم', 'Game started'],
  mafia_locked: ['🔒 تعطّل اغتيال المافيا لأن أحد أفرادها كان مسجونًا.', '🔒 Mafia kill is locked because a member is jailed.'],
  mafia_skipped: ['🌙 قررت المافيا تخطي الاغتيال هذه الليلة.', '🌙 Mafia skipped the kill tonight.'],
  mafia_disabled: ['🌙 قرر المضيف أن تكون هذه الليلة بدون اغتيال مافيا.', '🌙 The host disabled the Mafia kill tonight.'],
  mafia_delayed: ['🌙 الليلة الأولى بدون اغتيال. يبدأ اغتيال المافيا من الليلة الثانية.', '🌙 No kill on night one. Mafia kills begin on night two.'],
  doctor_saved: ['🩺 أنقذ الطبيب هدف المافيا.', '🩺 The Doctor saved the Mafia target.'],
  jail_saved: ['🔐 كان هدف المافيا داخل السجن ونجا.', '🔐 The Mafia target was jailed and survived.'],
  mafia_kill: ['🔪 نفذت المافيا اغتيالها.', '🔪 Mafia completed their kill.'],
  jailer_executed: ['⚖️ نفّذ السجّان حكم الإعدام.', '⚖️ The Jailer executed the prisoner.'],
  lawyer_saved: ['⚖️ أنقذ المحامي اللاعب من نتيجة التصويت.', '⚖️ The Lawyer saved the player from the vote.'],
  vote_eliminated: ['🗳️ تم استبعاد اللاعب صاحب أعلى تصويت.', '🗳️ The player with the most votes was eliminated.'],
  vote_tie: ['🤝 تعادل التصويت ولم يُستبعد أحد.', '🤝 The vote tied and nobody was eliminated.'],
  serial_kill: ['🩸 نفّذ القاتل المتسلسل جريمته.', '🩸 The Serial Killer completed a kill.'],
  vigilante_kill: ['🎯 أطلق القناص طلقته الأخيرة.', '🎯 The sniper took their final shot.'],
  vigilante_skipped: ['🎯 تم تخطي طلقة القناص.', '🎯 The final shot was skipped.'],
  witch_poison: ['☠️ استخدمت الساحرة جرعة السم.', '☠️ The Witch used poison.'],
  witch_saved: ['🧪 أنقذت الساحرة لاعبًا بجرعة الحياة.', '🧪 The Witch saved a player with the life potion.'],
  escort_blocked: ['🚫 عطّل المعطّل قدرة لاعب هذه الليلة.', '🚫 The Escort blocked a player tonight.'],
  lovers_died: ['💔 مات الحبيبان معًا.', '💔 The linked players died together.'],
  jester_won: ['🃏 نجح المهرج في خداع الجميع.', '🃏 The Jester fooled everyone.'],
  player_accused: ['⚖️ تم اختيار متهم للمحاكمة.', '⚖️ A player was accused for trial.'],
  nomination_tie: ['🤝 تعادل الترشيح — لا متهم. تبدأ ليلة جديدة بدون نقاش نهار.', '🤝 Nomination tied — no accused. A new night begins with no day talk.'],
  trial_guilty: ['🔨 صدر الحكم بالإدانة.', '🔨 The verdict is guilty.'],
  trial_innocent: ['🕊️ صدر الحكم بالبراءة.', '🕊️ The verdict is innocent.'],
  host_ended: ['⛔ أنهى المضيف المباراة.', '⛔ The host ended the match.'],
  host_expelled: ['⛔ استبعد المضيف لاعبًا.', '⛔ The host expelled a player.'],
  detective_only_night: ['🔎 الليلة الأولى للمحقق فقط؛ لا اغتيال ولا قدرات أخرى.', '🔎 First night: detective only. No kills or other role actions.'],
};
function eventLabel(event) {
  const value = eventText[event];
  if (Array.isArray(value)) return discussionText(value[0], value[1]);
  return value || event;
}

const pendingReads=new Map();
function requestError(code,status=0) {const error=new Error(code);error.code=code;error.status=status;return error;}
async function api(payload) {
  const reading=['state','spectatorState','adminState','messages','moderationLog','listSnapshots','systemStatus'];
  const reconnecting=document.getElementById('reconnect')?.classList.contains('show');
  if(payload.code && game?.code===payload.code && !reading.includes(payload.action) && (navigator.onLine===false || reconnecting)) {
    const error=new Error(discussionText('انتظر استعادة الاتصال قبل إرسال اختيارك','Wait for reconnection before sending your choice'));error.code='RECONNECTING';throw error;
  }
  if (payload.code && game?.code === payload.code && payload.lifecycleVersion === undefined) {
    payload = {...payload,lifecycleVersion:game.lifecycleVersion};
  }
  const key=reading.includes(payload.action)?JSON.stringify(payload):null;
  if(key&&pendingReads.has(key))return structuredClone(await pendingReads.get(key));
  const task=(async()=>{
  let response;
  try {response = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });}catch(error){throw requestError(error.name==='TimeoutError'?'REQUEST_TIMEOUT':'NETWORK_ERROR');}
  let data;
  try {data=await response.json();}catch{throw requestError('INVALID_RESPONSE',response.status);}
  if (Number.isFinite(data.serverTime)) {
    discussionClockOffset = data.serverTime - Date.now();
    delete data.serverTime;
  }
  if (!response.ok) {
    throw requestError(data.error || 'REQUEST_FAILED',response.status);
  }
  return data;
  })();
  if(key)pendingReads.set(key,task);
  try{return await task;}finally{if(key)pendingReads.delete(key);}
}
function notice(message) {
  let el = document.getElementById('gameNotice');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gameNotice';
    el.className = 'game-notice';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => el.classList.remove('show'), 4200);
}
window.notice = notice;
function setReconnect(on) {
  const el = document.getElementById('reconnect');
  if (!el) return;
  el.classList.toggle('show', on);
  el.hidden = !on;
}
function setRoomTag(text = game?.code ? discussionText(`غرفة ${game.code}`, `Room ${game.code}`) : discussionText('جاهز', 'Ready')) {
  $('#roomTag').textContent = text;
}
function sessionKey(code) { return `mafia-session-${code}`; }
function saveSession(host) {
  const session = { code: game.code, host, hostToken, playerToken, playerId, profileToken };
  localStorage.setItem('mafia-session', JSON.stringify(session));
  localStorage.setItem(sessionKey(game.code), JSON.stringify(session));
}
function clearSession() {
  localStorage.removeItem('mafia-session');
}
function nameOf(id) { return game?.players.find((player) => player.id === id)?.name || 'لاعب'; }
function alivePlayers() { return game.players.filter((player) => player.alive); }
function investigationResultLabel(result) {
  const r = String(result || '').trim();
  if (r === 'MAFIA' || r === 'مافيا') return discussionText('مافيا', 'Mafia');
  if (r === 'INNOCENT' || r === 'بريء' || r === 'برئ') return discussionText('بريء', 'Innocent');
  if (/Ù|Ø/.test(r)) return r.includes('Ø¨') || r.includes('Ø±') ? discussionText('بريء', 'Innocent') : discussionText('مافيا', 'Mafia');
  return discussionText(r, r);
}
function choiceButtons(players, action, options = {}) {
  const inner = players.map((player) => `<button class="pick" data-target="${escapeHtml(player.id)}" aria-pressed="false" onclick="${action}(${jsArg(player.id)})">${options.icon || '👤'} ${escapeHtml(player.name)}${player.id === playerId ? ` (${discussionText('أنت','You')})` : ''}</button>`).join('');
  return `<div class="choice-stack">${inner}</div>`;
}
function jsArg(value) { return escapeHtml(JSON.stringify(String(value))); }
function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
function normalizeEnabledRoles(value = {}) {
  const legacyRound = value.mafia_kill_mode === 'disabled' || value.mafia_kill_enabled === false ? 0 : value.mafia_kill_mode === 'after_first' ? 2 : 1;
  let killStartRound = Number.isFinite(+value.mafia_kill_start_round) ? Math.max(0, Math.min(10, Math.round(+value.mafia_kill_start_round))) : legacyRound;
  if (killStartRound === 1) killStartRound = 2;
  const base = {
    doctor: value.doctor !== false,
    detective: value.detective !== false,
    lawyer: value.lawyer !== false,
    jailer: value.jailer !== false,
    vigilante: value.vigilante === true,
    witch: value.witch === true,
    serial_killer: value.serial_killer === true,
    jester: value.jester === true,
    cupid: value.cupid === true,
    revealer: value.revealer === true,
    escort: value.escort === true,
    godfather_innocent: value.godfather_innocent !== false,
    mafia_kill_start_round: killStartRound,
    mafia_kill_mode: killStartRound === 0 ? 'disabled' : killStartRound === 1 ? 'always' : killStartRound === 2 ? 'after_first' : 'scheduled',
    mafia_kill_enabled: killStartRound > 0,
    reveal_dead_roles: value.reveal_dead_roles === true,
    allow_no_vote: value.allow_no_vote !== false,
    full_trial: value.full_trial !== false,
    kids_mode: value.kids_mode === true,
    phase_seconds: [30,60,90].includes(+value.phase_seconds) ? +value.phase_seconds : 60,
    discussion_mode: ['off', 'group', 'turns'].includes(value.discussion_mode) ? value.discussion_mode : 'turns',
    discussion_seconds: [30, 60, 120, 180, 300, 600, 900, 1800, 3600].includes(+value.discussion_seconds) ? +value.discussion_seconds : 180,
    speaker_seconds: [15, 30, 45, 60, 90, 120].includes(+value.speaker_seconds) ? +value.speaker_seconds : 30,
    paused_phase: value.paused_phase || null,
  };
  return applyKidsRoleLocks(base, game?.players?.length ?? 0);
}

function currentPreferences() {
  return { mafiaCount, detectiveCount, detectiveQuestions, enabledRoles: normalizeEnabledRoles(enabledRoles), phaseDuration, soundEnabled };
}
function applyHostPreferences(value = {}) {
  mafiaCount = Math.max(1, Math.min(8, Math.round(Number(value.mafiaCount) || mafiaCount)));
  detectiveCount = Math.max(0, Math.min(8, Math.round(Number.isFinite(+value.detectiveCount) ? +value.detectiveCount : detectiveCount)));
  detectiveQuestions = detectiveQuestionCount(value.detectiveQuestions);
  enabledRoles = normalizeEnabledRoles(value.enabledRoles || enabledRoles);
  phaseDuration = [30, 60, 90].includes(+value.phaseDuration) ? +value.phaseDuration : phaseDuration;
  soundEnabled = value.soundEnabled !== false;
  localStorage.setItem('mafia-phase-seconds', String(phaseDuration));
  localStorage.setItem('mafia-sound', soundEnabled ? 'on' : 'off');
  localStorage.setItem('mafia-host-preferences', JSON.stringify(currentPreferences()));
}
function schedulePreferenceSave() {
  const settings = currentPreferences();
  localStorage.setItem('mafia-host-preferences', JSON.stringify(settings));
  clearTimeout(preferenceSaveTimer);
  preferenceSaveTimer = setTimeout(async () => {
    if (!hostAccessToken) return;
    const status = $('#prefsStatus');
    if (status) status.textContent = 'جاري الحفظ…';
    try {
      await api({ action: 'hostPreferences', hostAccessToken, settings });
      if ($('#prefsStatus')) $('#prefsStatus').textContent = 'تم حفظ الإعدادات تلقائيًا ✓';
    } catch {
      if ($('#prefsStatus')) $('#prefsStatus').textContent = 'تعذر الحفظ — سيُعاد عند التغيير';
    }
  }, 450);
}
function landingMarkup() {
  return `<section class="noir-entry"><div class="noir-content"><p class="noir-kicker">MAFIA · ${discussionText('مافيا الليل','MAFIA NIGHT')}</p><h2 class="noir-heading">${discussionText('كل وجه يخفي سرًّا','Every face hides a secret')}</h2><p class="noir-intro">${discussionText('ليلة من الشك، ولعبة تكشف الحقيقة.<br>اجمع أصحابك… واكتشف من يقف خلف القناع.','A night of doubt and a game that reveals the truth.<br>Gather your friends… and find who hides behind the mask.')}</p><div class="card hero join-card auth-card"><h1>${discussionText('دخول لاعب','Join as player')}</h1><p class="muted">${discussionText('اكتب كود الغرفة واسمك للانضمام.','Enter the room code and your name to join.')}</p><label for="roomCode">${discussionText('كود الغرفة','Room code')}</label><input class="input" id="roomCode" inputmode="numeric" maxlength="4" autocomplete="one-time-code" dir="ltr" enterkeyhint="next" aria-describedby="joinHint"><p id="joinHint" class="entry-hint">${discussionText('اطلب الكود من المضيف أو امسح باركود الغرفة من جوالك.','Ask the host for the code or scan the room QR on your phone.')}</p><label for="playerName">${discussionText('اسمك','Your name')}</label><input class="input" id="playerName" maxlength="20" autocomplete="name" enterkeyhint="go" placeholder="${discussionText('اكتب اسمك','Enter your name')}"><p id="joinFeedback" class="entry-feedback" role="alert" hidden></p><button class="btn red wide" type="button" onclick="joinRoom()">${discussionText('دخول اللعبة','Join game')}</button><button class="btn wide btn-with-icon" type="button" onclick="focusRoomCode()" aria-label="${escapeHtml(discussionText('لدي باركود — امسحه من الكاميرا أو اكتب الكود','I have a QR code — scan or enter the code'))}">${lobbyIcon('camera')}<span>${discussionText('لدي باركود','I have a QR code')}</span></button></div><div class="noir-links"><button class="btn" type="button" onclick="spectatorForm()">${discussionText('دخول متفرج','Spectate')}</button><button class="btn" type="button" onclick="renderHostLogin()">${discussionText('دخول المضيف','Host login')}</button></div><p class="noir-caption">◆ ${discussionText('لا تثق بأحد… راقب الجميع','Trust no one… watch everyone')} ◆</p><p class="noir-site-footer"><a href="/candidate.html">${discussionText('الانتخابات · أوراق الأصوات','Elections · ballot game')}</a></p></div>${noirEmblem()}</section>`;
}
function focusRoomCode() {
  notice(discussionText('امسح باركود المضيف من الكاميرا أو اكتب الكود يدويًا.','Scan the host QR with your camera or enter the code manually.'));
  $('#roomCode')?.focus({ preventScroll: true });
}
function wireJoinFields(focusName = false) {
  const nameInput = $('#playerName');
  const codeInput = $('#roomCode');
  if (!nameInput || !codeInput) return;
  if (codeInput.dataset.wired === '1') {
    (focusName ? nameInput : codeInput).focus({ preventScroll: true });
    return;
  }
  codeInput.dataset.wired = '1';
  nameInput.dataset.wired = '1';
  nameInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.isComposing) joinRoom(); });
  codeInput.addEventListener('input', () => { codeInput.value = normalizeEntryDigits(codeInput.value).replace(/\D/g, '').slice(0, 4); });
  codeInput.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); nameInput.focus(); } });
  for (const input of [codeInput, nameInput]) input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); const feedback = $('#joinFeedback'); if (feedback) feedback.hidden = true; });
  (focusName ? nameInput : codeInput).focus({ preventScroll: true });
}
function renderLanding() {
  setShowingRole(false);
  setRoomTag();
  spectatorMode = false;
  delegatedHostMode = false;
  hostToken = '';
  $('#app').innerHTML = landingMarkup();
  $('#app').removeAttribute('data-login-shell');
  if (!$('#app').querySelector('.cinema-cards')) $('#app').insertAdjacentHTML('beforeend', homeCharacters());
  wireJoinFields(false);
}
function renderHostLogin() {
  setRoomTag('🔒');
  $('#app').removeAttribute('data-login-shell');
  $('#app').innerHTML = `<section class="noir-entry"><div class="noir-content"><p class="noir-kicker">MAFIA · مافيا الليل</p><h2 class="noir-heading">كل وجه يخفي سرًّا</h2><p class="noir-intro">أدخل الرمز السري لإنشاء الغرف وإدارة اللعب.</p><div class="card hero join-card auth-card"><h1>دخول المضيف</h1><p class="muted">الرمز مكوّن من 8 أرقام.</p><label for="hostPin">الرمز السري</label><input class="input auth-pin" id="hostPin" type="password" inputmode="numeric" maxlength="8" autocomplete="current-password" enterkeyhint="go"><button class="btn red wide" type="button" onclick="loginHost()">دخول المضيف</button></div><div class="noir-links"><button class="btn" type="button" onclick="home()">رجوع</button></div></div>${noirEmblem()}</section>${homeCharacters()}`;
  const input = $('#hostPin');
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') loginHost(); });
  input.focus({ preventScroll: true });
}
async function loginHost() {
  const pin = normalizeEntryDigits($('#hostPin')?.value || '');
  if (!/^\d{8}$/.test(pin || '')) { notice(discussionText('أدخل الرمز المكوّن من 8 أرقام','Enter the 8-digit code')); return; }
  try {
    const result = await withBusy('جاري تسجيل الدخول…', () => api({ action: 'hostLogin', pin }));
    hostAccessToken = result.hostAccessToken;
    localStorage.setItem('mafia-host-access-token', hostAccessToken);
    applyHostPreferences(result.preferences || {});
    renderHostHome();
  } catch (error) {
    notice(error.code === 'LOGIN_RATE_LIMITED' ? discussionText('محاولات كثيرة. انتظر 15 دقيقة.','Too many attempts. Wait 15 minutes.') : discussionText('الرمز السري غير صحيح','Incorrect secret code'));
  }
}
async function logoutHost() {
  const rooms = [];
  for (let i=0;i<localStorage.length;i++) {
    const key=localStorage.key(i);
    if(key==='mafia-session'||key.startsWith('mafia-session-')) {
      try { const session=JSON.parse(localStorage.getItem(key));if(session?.hostToken)rooms.push({code:session.code,hostToken:session.hostToken}); } catch {}
    }
  }
  try { await api({action:'hostLogout',hostAccessToken,rooms}); }
  catch { notice(discussionText('تعذر إلغاء الجلسات، حاول تسجيل الخروج مرة ثانية.','Could not revoke sessions. Please try logging out again.')); return; }
  pollingEpoch++; clearTimeout(pollTimer);closeSheet();
  hostAccessToken='';hostToken='';playerToken='';playerId='';game=null;delegatedHostMode=false;
  const keys=[];for(let i=0;i<localStorage.length;i++)keys.push(localStorage.key(i));
  for(const key of keys)if(key==='mafia-host-access-token'||key==='mafia-session'||key.startsWith('mafia-session-'))localStorage.removeItem(key);
  removePlayerChrome();renderLanding();
}
function renderHostHome() {
 setRoomTag();
 const saved=localStorage.getItem('mafia-session');
 $('#app').innerHTML=`<section class="noir-entry noir-host-home"><div class="noir-content"><p class="noir-kicker">MAFIA · ${discussionText('لوحة المضيف','Host panel')}</p><h2 class="noir-heading">${discussionText('أنشئ غرفة وادِر الليلة','Create a room and run the night')}</h2><p class="noir-intro">${discussionText('يفضّل 6 لاعبين فأكثر. وضع الأطفال من إعداد الغرفة بعد الإنشاء.','6+ players recommended. Enable kids mode in room setup after creating.')}</p><div class="card hero join-card auth-card"><button class="btn red wide" type="button" onclick="createRoom()">${discussionText('إنشاء غرفة','Create room')}</button>${saved?`<button class="btn wide" type="button" onclick="resumeGame()">${discussionText('مواصلة اللعبة','Resume game')}</button>`:''}<div class="noir-links host-home-links"><button class="btn" type="button" onclick="joinForm()">${discussionText('دخول لاعب','Join as player')}</button><button class="btn" type="button" onclick="spectatorForm()">${discussionText('مشاهدة','Spectate')}</button></div></div><nav class="host-home-tools" aria-label="${discussionText('أدوات اللعبة','Game tools')}"><button type="button" class="mini-card modern-tool" onclick="showGuide()"><span class="tool-glyph" aria-hidden="true">♧</span><strong>${discussionText('الأدوار والقواعد','Roles & rules')}</strong></button><button type="button" class="mini-card modern-tool" onclick="showTrainingHelp()"><span class="tool-glyph" aria-hidden="true">◇</span><strong>${discussionText('التدريب','Training')}</strong></button><button type="button" class="mini-card modern-tool" onclick="showLeaderboard()"><span class="tool-glyph" aria-hidden="true">♛</span><strong>${discussionText('الترتيب','Leaderboard')}</strong></button><button type="button" class="mini-card modern-tool" onclick="showProfile()"><span class="tool-glyph" aria-hidden="true">◎</span><strong>${discussionText('ملفي','My profile')}</strong></button></nav><details class="host-home-more"><summary>${discussionText('خيارات إضافية','More options')}</summary><div class="noir-links"><button class="btn" type="button" onclick="replacementForm()">${discussionText('استبدال لاعب','Replace player')}</button><button class="btn" type="button" onclick="recoveryForm()">${discussionText('استرجاع الحساب','Recover account')}</button><button class="btn" type="button" onclick="logoutHost()">${discussionText('تسجيل الخروج','Log out')}</button></div></details></div>${noirEmblem()}</section>${homeCharacters()}`;
}
async function loadHostPreferences() {
  try {
    const result = await api({ action: 'hostPreferences', hostAccessToken });
    applyHostPreferences(result.preferences || {});
    renderHostHome();
  } catch {
    hostAccessToken = '';
    localStorage.removeItem('mafia-host-access-token');
    renderHostLogin();
  }
}
function readSavedSession(code='') {
  try { const raw=localStorage.getItem(code?sessionKey(code):'mafia-session')||localStorage.getItem('mafia-session');const session=JSON.parse(raw||'null');return /^\d{4}$/.test(session?.code||'')&&(!code||session.code===code)?session:null; } catch { return null; }
}
function renderResumeCard(session,offline=false) {
  setRoomTag();
  $('#app').innerHTML=`<section class="noir-entry noir-subpage" data-no-translate><div class="noir-content"><p class="noir-kicker">MAFIA · ${discussionText('مافيا الليل','MAFIA NIGHT')}</p><h2 class="noir-heading">${discussionText('مواصلة المباراة','Resume game')}</h2><p class="noir-intro">${discussionText('ارجع لنفس اسمك ودورك في الغرفة','Return to your same name and role in room')} <b dir="ltr">${escapeHtml(session.code)}</b></p><div class="card hero join-card auth-card">${offline?`<p class="muted">${discussionText('تعذر الاتصال. جلستك محفوظة؛ أعد المحاولة.','Connection failed. Your session is saved; try again.')}</p>`:''}<button class="btn red wide" type="button" onclick="resumeGame(${jsArg(session.code)})">${discussionText('مواصلة','Resume')}</button><div class="noir-links"><button class="btn" type="button" onclick="joinForm()">${discussionText('دخول غرفة أخرى','Join another room')}</button><button class="btn" type="button" onclick="renderHostLogin()">${discussionText('دخول المضيف','Host login')}</button></div></div></div>${noirEmblem()}</section>`;
}
function home() {
  pollingEpoch++;
  warmApi();
  clearTimeout(pollTimer);
  removePlayerChrome();
  closeSheet();
  game = null;
  const roomCode = new URLSearchParams(location.search).get('room');
  const session=readSavedSession(/^\d{4}$/.test(roomCode||'')?roomCode:'');
  if(session){renderResumeCard(session);return;}
  if (/^\d{4}$/.test(roomCode || '')) { joinForm(roomCode); return; }
  const local = JSON.parse(localStorage.getItem('mafia-host-preferences') || 'null');
  if (local) applyHostPreferences(local);
  if (!hostAccessToken) { renderLanding(); return; }
  renderHostHome();
  loadHostPreferences();
}

function achievements(profile) {
  if (!profile) return [];
  return [
    { icon: '🎴', name: 'أول مباراة', on: profile.games >= 1 },
    { icon: '🏆', name: 'أول فوز', on: profile.wins >= 1 },
    { icon: '🔥', name: 'مخضرم', on: profile.games >= 10 },
    { icon: '👑', name: 'خمسة انتصارات', on: profile.wins >= 5 },
    { icon: '🏘️', name: 'بطل القرية', on: profile.village_wins >= 3 },
    { icon: '🔪', name: 'سيد المافيا', on: profile.mafia_wins >= 3 },
  ];
}
async function showProfile() {
  setRoomTag('🏅');
  const result = await withBusy('جاري تحميل الملف…', () => api({ action: 'profile', profileToken }));
  const p = result.profile;
  if (!p) { $('#app').innerHTML = noirPageFrame(`<h1>${discussionText('ملف اللاعب','Player profile')}</h1><p class="muted">${discussionText('العب أول مباراة حتى تبدأ إحصائياتك.','Play your first match to start tracking stats.')}</p>`); return; }
  const rate = p.games ? Math.round(p.wins / p.games * 100) : 0;
  $('#app').innerHTML = noirPageFrame(`<div class="role-badge">${discussionText('ملف اللاعب','Player profile')}</div><h1>${escapeHtml(p.nickname)}</h1><div class="stat-grid"><div><b>${p.games}</b><span>${discussionText('مباراة','Games')}</span></div><div><b>${p.wins}</b><span>${discussionText('فوز','Wins')}</span></div><div><b>${rate}%</b><span>${discussionText('نسبة الفوز','Win rate')}</span></div></div><div class="season-card"><b>${discussionText('الموسم','Season')} ${escapeHtml(p.season||'')}</b><span>${p.season_wins||0} ${discussionText('فوز من','wins from')} ${p.season_games||0} ${discussionText('مباراة','games')}</span></div><div class="status wait">${discussionText('رمز نقل الحساب','Account recovery code')}: <b>${escapeHtml(p.recovery_code||'—')}</b><br><small>${discussionText('احتفظ به لاسترجاع حسابك على جهاز آخر.','Keep it to recover your account on another device.')}</small></div><h2>${discussionText('الإنجازات','Achievements')}</h2><div class="achievement-grid">${achievements(p).map((a) => `<div class="achievement ${a.on?'unlocked':'locked'}"><span>${a.icon}</span><b>${a.name}</b><small>${a.on?discussionText('مفتوح','Unlocked'):discussionText('مغلق','Locked')}</small></div>`).join('')}</div>`,{wide:true});
}
async function showLeaderboard() {
  setRoomTag('🏆');
  const result = await withBusy('جاري تحميل الترتيب…', () => api({ action: 'leaderboard' }));
  const rows=(items)=>items.map((p,i)=>`<div class="leader-row"><b>${i+1}</b><span>${escapeHtml(p.nickname)}</span><strong>${p.wins} فوز</strong><small>${p.games} مباراة</small></div>`).join('')||'<p class="muted">لا توجد نتائج بعد.</p>';
  $('#app').innerHTML = noirPageFrame(`<h1>${discussionText('الترتيب','Leaderboard')}</h1><h2>${discussionText('الموسم','Season')} ${escapeHtml(result.season||'')}</h2><div class="leaderboard">${rows(result.seasonLeaderboard||[])}</div><h2>${discussionText('الترتيب العام','All-time')}</h2><div class="leaderboard">${rows(result.leaderboard||[])}</div>`,{wide:true});
}
function showTrainingHelp() {
  setRoomTag('🤖');
  $('#app').innerHTML = noirPageFrame(`<h1>${discussionText('التدريب بالبوتات','Bot training')}</h1><p class="muted">${discussionText('أنشئ غرفة، ثم استخدم أيقونة النرد في اللوبي لإكمال العدد. تقدر تتدرب وحدك أو مع أصدقاء.','Create a room, then use the dice icon in the lobby to fill seats. Train solo or with friends.')}</p><button class="btn red wide" type="button" onclick="createRoom()">${discussionText('إنشاء غرفة تدريب','Create training room')}</button>`);
}
const reviewCardViews = new Map();
const kidsCardRoles = new Set(['mafia_boss','mafia','detective','doctor','citizen']);
function roleCardAsset(role,thumbnail=false,kids=false){return `/assets/${kids&&kidsCardRoles.has(role)?'role-cards-kids':'role-cards-v3'}/${role}${thumbnail?'-thumb':''}.webp`;}
function selectRoleView(card,open){
 card=card?.closest?.('.role-reader');
 if(!card)return;
 card.dataset.view=open?'details':'image';
 card.setAttribute('aria-pressed',String(open));
 card.querySelector('.role-image-view')?.setAttribute('aria-hidden',String(open));
 card.querySelector('.role-details-view')?.setAttribute('aria-hidden',String(!open));
 if(card.classList.contains('personal-role-card'))personalCardState.open=open;
 if(card.dataset.reviewRole)reviewCardViews.set(card.dataset.reviewRole,open);
}
function cardsUseKidsMode(){
 return game?.phase==='lobby' ? enabledRoles.kids_mode===true : game?.enabledRoles?.kids_mode===true;
}
function interactiveRoleCard(role, {personal=false, compact=false, image='', open=false, review=false, reveal=false, count=0}={}) {
 if(review)open=reviewCardViews.get(role)===true;
 const label=escapeHtml(roleLabel(role));
 const kids=(personal?game?.enabledRoles?.kids_mode===true:cardsUseKidsMode())&&kidsCardRoles.has(role);
 const art=roleCardAsset(role,false,kids);
 image = kids?art:(!image||image.includes('/role-cards-kids/')?art:image);
 const title=roleLabel(role);
 const teammates=personal&&mafiaRoleClient(role)?(game.me.mafiaTeam||[]).filter(p=>p.id!==game.me.id):[];
 const team=personal&&mafiaRoleClient(role)?`<aside class="role-allies" data-no-translate><h3>${discussionText('زملاؤك في المافيا','Your Mafia allies')} <small>${discussionText('خاص بفريقك','Team only')}</small></h3><div>${teammates.map(p=>`<span>${escapeHtml(p.name)}</span>`).join('')||`<p>${discussionText('أنت عضو المافيا الوحيد','You are the only Mafia member')}</p>`}</div></aside>`:'';
 const identity=compact||reveal?'':`<header class="role-identity" data-no-translate><h2>${escapeHtml(title)}</h2><span>${escapeHtml(roleTeamLabel(role))}</span>${review?`<span class="review-role-count" aria-label="${discussionText('عدد اللاعبين','Player count')}">× ${count}</span>`:''}</header>`;
 const flipHint=discussionText('اضغط','Tap');
 return `<section class="role-presentation ${review?'review-role-presentation':''} ${compact?'compact-presentation':''} ${reveal?'reveal-presentation':''}" data-no-translate>${identity}<button type="button" class="role-reader turning-role ${kids?'kids-role-card':''} ${personal?'personal-role-card':''} ${compact?'compact':''} ${reveal?'reveal-card':''}" ${review?`data-review-role="${role}"`:''} data-view="${open?'details':'image'}" style="--role-art:url('${image}')" aria-label="${label} — ${discussionText('اضغط لقلب الكرت','Tap to flip')}" aria-pressed="${open}" onclick="event.preventDefault();selectRoleView(this,this.dataset.view!=='details')"><div class="role-turn-inner"><div class="role-image-view" aria-hidden="${open}"><img src="${image}" alt="" width="1024" height="1536" loading="lazy" decoding="async"><span class="role-turn-hint">${flipHint}</span></div><div class="role-details-view" aria-hidden="${!open}"><div class="personal-card-properties">${detailedRoleProperties(role,personal)}</div></div></div></button>${team}</section>`;
}
let homeGalleryObserver;
function mountHomeCharacters() {
 homeGalleryObserver?.disconnect();
 const gallery=document.querySelector('.home-role-gallery');
 if(!gallery || gallery.childElementCount)return;
 const populate=()=>{if(gallery.isConnected&&!gallery.childElementCount)gallery.innerHTML=Object.keys(roleNames).map(role=>interactiveRoleCard(role)).join('');};
 if(!('IntersectionObserver' in window)){populate();return;}
 homeGalleryObserver=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){homeGalleryObserver.disconnect();populate();}},{rootMargin:'0px'});
 homeGalleryObserver.observe(gallery);
}
function homeCharacters() {
 return `<section class="cinema-cards home-role-strip" aria-label="${discussionText('الشخصيات الرئيسية','Main characters')}">${[['detective',discussionText('المحقق','Detective')],['mafia_boss',discussionText('زعيم المافيا','Godfather')],['doctor',discussionText('الطبيب','Doctor')]].map(([role,title])=>`<button class="cinema-character" type="button" onclick="previewHomeRole('${role}')" aria-label="${discussionText('شرح دور','Explain role')} ${title}"><img src="/assets/role-cards-v3/${role}-thumb.webp" alt="${title}" width="1024" height="1536" loading="lazy" decoding="async"></button>`).join('')}<p>${discussionText('اكتشف دورك… والعبها بذكاء','Discover your role… play smart')}</p></section>`;
}
function previewHomeRole(role){openSheet('شرح الشخصية',interactiveRoleCard(role,{open:true}));}
function showGuide() {
  setRoomTag('📖');
  const roles = (cardsUseKidsMode()?[...kidsCardRoles]:Object.keys(roleNames)).map(key => interactiveRoleCard(key)).join('');
  $('#app').innerHTML = noirPageFrame(`<h1>${discussionText('الأدوار والقواعد','Roles & rules')}</h1><div class="role-gallery">${roles}</div><div class="status">${discussionText('ليل: القدرات السرية · نهار: نقاش وتصويت · القرية تفوز بإخراج المافيا، والمافيا تفوز عند مساواة بقية الأحياء.','Night: secret powers · Day: talk and vote · Village wins by eliminating Mafia; Mafia wins at parity.')}</div>`,{wide:true});
}
function spectatorForm() {
  setRoomTag('👁️');
  $('#app').innerHTML = noirPageFrame(`<h1>${discussionText('دخول متفرج','Join as spectator')}</h1><label for="roomCode">${discussionText('كود الغرفة','Room code')}</label><input class="input" id="roomCode" inputmode="numeric" maxlength="4" dir="ltr"><label for="spectatorName">${discussionText('اسمك','Your name')}</label><input class="input" id="spectatorName" maxlength="20" autocomplete="name"><button class="btn red wide" type="button" onclick="joinSpectator()">${discussionText('مشاهدة اللعبة','Watch game')}</button>`);
}
async function joinSpectator() {
  try {
    spectatorId = crypto.randomUUID();
    game = await api({ action:'joinSpectator', code:$('#roomCode').value.trim(), id:spectatorId, name:$('#spectatorName').value.trim() });
    spectatorToken = game.spectatorToken; spectatorMode = true; hostToken = ''; playerToken = '';
    localStorage.setItem('mafia-session',JSON.stringify({code:game.code,spectator:true,spectatorId,spectatorToken}));
    renderSpectator(); startSpectatorPolling();
  } catch { notice(discussionText('تأكد من كود الغرفة والاسم','Check the room code and name')); }
}
function renderSpectatorContent() {
  removePlayerChrome();
  setRoomTag(`👁️ ${game.code}`);
  $('#app').innerHTML = `${phaseBar()}<div class="grid"><div class="card hero"><div class="role-title">${phaseIcon()}</div><h1>${phaseName()}</h1><p class="muted" data-no-translate>${discussionText(game.me?.alive===false?'خرجت من المباراة. تتابع فقط، بدون كلام أو تصويت أو قدرات.':'متابعة الأحداث العامة فقط، بدون كشف الأدوار السرية.','Watch public events only. No talking, voting or role actions.')}</p>${game.phase==='finished'?`<h2>${winnerTitle()}</h2>`:''}${eventCards()}${game.phase==='day'?discussionPanel(false):''}</div><div class="card"><h2>اللاعبون (${game.players.length})</h2><div class="players">${playerList()}</div></div></div>`;
}
function startSpectatorPolling(){clearTimeout(pollTimer);pollFails=0;const epoch=++pollingEpoch;const tick=async()=>{try{const next=await api({action:'spectatorState',code:game.code,id:spectatorId,spectatorToken});if(epoch!==pollingEpoch)return;pollFails=0;const changed=renderStateKey(next)!==renderStateKey(game);game=next;setReconnect(false);if(changed)renderSpectator()}catch{if(epoch===pollingEpoch){pollFails++;if(pollFails>=2)setReconnect(true)}}finally{if(epoch===pollingEpoch)pollTimer=setTimeout(tick,2000)}};pollTimer=setTimeout(tick,700)}
function replacementForm() {
  setRoomTag('🔄');
  $('#app').innerHTML = noirPageFrame(`<h1>${discussionText('استبدال لاعب','Replace player')}</h1><p class="muted">${discussionText('خذ رمز الاستبدال من المضيف.','Get the replacement code from the host.')}</p><label for="roomCode">${discussionText('كود الغرفة','Room code')}</label><input class="input" id="roomCode" inputmode="numeric" maxlength="4" dir="ltr" placeholder="1234"><label for="replacementCode">${discussionText('رمز الاستبدال','Replacement code')}</label><input class="input" id="replacementCode" maxlength="8" dir="ltr"><label for="playerName">${discussionText('اسم اللاعب الجديد','New player name')}</label><input class="input" id="playerName" maxlength="20" autocomplete="name"><button class="btn red wide" type="button" onclick="claimSeat()">${discussionText('استلام مكان اللاعب','Take player seat')}</button>`);
}
async function claimSeat(){spectatorMode=false;delegatedHostMode=false;hostToken='';try{game=await api({action:'claimSeat',code:$('#roomCode').value.trim(),replacementCode:$('#replacementCode').value.trim(),name:$('#playerName').value.trim(),profileToken});playerId=game.playerId;playerToken=game.playerToken;profileToken=game.profileToken||profileToken;saveSession(false);renderPlayer();startPolling(false)}catch{notice(discussionText('رمز الاستبدال غير صحيح أو انتهت مدته','Invalid or expired replacement code'))}}
function recoveryForm(){setRoomTag('🔑');$('#app').innerHTML=noirPageFrame(`<h1>${discussionText('استرجاع الحساب','Recover account')}</h1><p class="muted">${discussionText('أدخل رمز الاسترجاع الموجود في ملفك.','Enter the recovery code from your profile.')}</p><label for="recoveryCode">${discussionText('رمز الاسترجاع','Recovery code')}</label><input class="input" id="recoveryCode" maxlength="12" dir="ltr" autocomplete="one-time-code"><button class="btn red wide" type="button" onclick="recoverProfile()">${discussionText('استرجاع','Recover')}</button>`)}
async function recoverProfile(){try{const result=await api({action:'recoverProfile',recoveryCode:$('#recoveryCode').value.trim()});profileToken=result.profileToken;localStorage.setItem('mafia-profile-token',profileToken);notice(discussionText(`تم استرجاع حساب ${result.nickname} ✅`,`Account ${result.nickname} recovered ✅`));showProfile()}catch{notice(discussionText('رمز الاسترجاع غير صحيح','Invalid recovery code'))}}

async function createRoom() {
  spectatorMode=false;delegatedHostMode=false;playerId='';playerToken='';
  try {
    game = await withBusy(discussionText('جاري إنشاء الغرفة…','Creating room…'), () => api({ action: 'create', hostAccessToken, mafiaCount, detectiveCount, detectiveQuestions, enabledRoles }));
    hostToken = game.hostToken;
    enabledRoles = normalizeEnabledRoles(game.enabledRoles);
    saveSession(true);
    renderHost();
    startPolling(true);
  } catch (error) { if (error.code === 'UNAUTHORIZED') { logoutHost(); notice(discussionText('انتهت جلسة المضيف. سجّل الدخول من جديد.','Host session expired. Sign in again.')); } else notice(discussionText('تعذر إنشاء الغرفة','Could not create room')); }
}
function joinForm(prefill = '') {
  spectatorMode=false;delegatedHostMode=false;
  hostToken = '';
  const code = normalizeEntryDigits(prefill).replace(/\D/g, '').slice(0, 4);
  const directJoin = code.length === 4;
  if (!directJoin) { renderLanding(); return; }
  setRoomTag(discussionText(`غرفة ${code}`, `Room ${code}`));
  $('#app').innerHTML = noirPageFrame(`<div class="role-badge">${discussionText('مسحت الباركود بنجاح','QR scanned')}</div><h2>${discussionText('اكتب اسمك وادخل مباشرة','Enter your name to join')}</h2><input type="hidden" id="roomCode" value="${escapeHtml(code)}"><label for="playerName">${discussionText('اسمك','Your name')}</label><input class="input" id="playerName" maxlength="20" autocomplete="name" enterkeyhint="go" placeholder="${discussionText('اكتب اسمك','Enter your name')}"><p id="joinFeedback" class="entry-feedback" role="alert" hidden></p><button class="btn red wide" type="button" onclick="joinRoom()">${discussionText('دخول اللعبة','Join game')}</button>`);
  wireJoinFields(true);
}
function normalizeEntryDigits(value) {
 return String(value).trim().replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit <= '٩' ? 1632 : 1776)));
}
function showJoinFeedback(message, field) {
 const feedback = $('#joinFeedback');
 if (!feedback) { notice(message); if (field) field.focus(); return; }
 feedback.textContent=message; feedback.hidden=false;
 if(field){field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby','joinFeedback');field.focus();}
}
function joinErrorMessage(error) {
  return ({GAME_STARTED:discussionText('المباراة بدأت. انتظر الردهة أو ادخل كمتفرج.','The game already started. Wait for the lobby or join as a spectator.'),ROOM_FULL:discussionText('الغرفة مكتملة؛ الحد الأقصى 20 لاعبًا.','The room is full. Maximum 20 players.'),NAME_TAKEN:discussionText('هذا الاسم مستخدم في الغرفة. اختر اسمًا آخر.','That name is already in the room. Choose another.')})[error?.code] || discussionText('تأكد من الكود والاسم','Check the code and name');
}
async function joinRoom() {
  const code = normalizeEntryDigits($('#roomCode')?.value || '');
  const name = $('#playerName')?.value.trim() || '';
  if(!/^\d{4}$/.test(code)){showJoinFeedback(discussionText('أدخل كود الغرفة المكوّن من 4 أرقام.','Enter the 4-digit room code.'),$('#roomCode'));return;}
  if(!name){showJoinFeedback(discussionText('اكتب اسمك ليعرفك اللاعبون.','Enter your name so players can recognize you.'),$('#playerName'));return;}
  const pendingKey='mafia-pending-join-'+code;
  const stored = JSON.parse(localStorage.getItem(sessionKey(code)) || localStorage.getItem(pendingKey) || 'null');
  playerId = stored?.playerId || crypto.randomUUID();
  playerToken = stored?.playerToken || crypto.randomUUID();
  localStorage.setItem(pendingKey,JSON.stringify({playerId,playerToken}));
  try {
    game = await withBusy(discussionText('جاري دخول الغرفة…','Joining room…'), () => api({ action: 'join', code, id: playerId, playerToken, profileToken, name }));
  } catch (error) {
    if (error.code === 'SESSION_INVALID') {
      playerId = crypto.randomUUID();
      playerToken = crypto.randomUUID();
      localStorage.setItem(pendingKey,JSON.stringify({playerId,playerToken}));
      try { game = await withBusy(discussionText('جاري دخول الغرفة…','Joining room…'), () => api({ action: 'join', code, id: playerId, playerToken, profileToken, name })); }
      catch (retryError) { showJoinFeedback(joinErrorMessage(retryError)); return; }
    } else {
      showJoinFeedback(joinErrorMessage(error));
      return;
    }
  }
  playerToken = game.playerToken;
  profileToken = game.profileToken || profileToken;
  localStorage.setItem('mafia-profile-token', profileToken);
  saveSession(false);
  localStorage.removeItem(pendingKey);
  renderPlayer();
  startPolling(false);
}
async function resumeGame(code='') {
  const session=readSavedSession(code);
  try {
    spectatorMode=false;delegatedHostMode=false;hostToken='';playerToken='';playerId='';
    if (!session?.code) throw new Error('NO_SESSION');
    if(session.spectator){spectatorMode=true;spectatorId=session.spectatorId;spectatorToken=session.spectatorToken;game=await api({action:'spectatorState',code:session.code,id:spectatorId,spectatorToken});renderSpectator();startSpectatorPolling();return}
    hostToken = session.hostToken || '';
    playerToken = session.playerToken || '';
    playerId = session.playerId || '';
    profileToken = session.profileToken || profileToken;
    game = await api({ action: 'state', code: session.code, id: playerId, playerToken, hostToken });
    if (!session.host && !game.me) throw new Error('SESSION_EXPIRED');
    mafiaCount = game.mafiaCount || 1;
    detectiveCount = game.detectiveCount ?? 1;
    detectiveQuestions = detectiveQuestionCount(game.detectiveQuestions);
    enabledRoles = normalizeEnabledRoles(game.enabledRoles);
    session.host ? renderHost() : renderPlayer();
    saveSession(Boolean(session.host));
    startPolling(Boolean(session.host));
  } catch (error) {
    if(['UNAUTHORIZED','SESSION_EXPIRED','ROOM_NOT_FOUND','NO_SESSION'].includes(error.code||error.message)){
      if(session?.code)localStorage.removeItem(sessionKey(session.code));clearSession();
      notice(discussionText('الجلسة غير صالحة؛ ادخل الغرفة مجددًا.','Session is invalid. Join the room again.'));home();
    }else if(session)renderResumeCard(session,true);
  }
}
function renderStateKey(state) {
  if (!state) return '';
  const { serverTime, discussion, ...view } = state;
  // The existing clock updater derives these fields without rebuilding the page.
  const clockFields = new Set(['remainingMs','deadline','index','speakerId','status','complete']);
  const stableDiscussion = discussion?.id ? Object.fromEntries(Object.entries(discussion).filter(([key]) => !clockFields.has(key))) : discussion;
  return JSON.stringify({ ...view, discussion: stableDiscussion });
}

function startPolling(host) {
  clearTimeout(pollTimer);
  pollFails = 0;
  const epoch=++pollingEpoch;
  const tick = async () => {
    try {
      const next = await api({ action: 'state', code: game.code, id: playerId, playerToken, hostToken });
      if(epoch!==pollingEpoch)return;
      pollFails = 0;
      setReconnect(false);
      const previousPhase = game?.phase;
      const previousChatKey=chatReadKey();
      const changed = renderStateKey(next) !== renderStateKey(game);
      if (host && next.canControl === false) { host=false;hostToken='';saveSession(false); }
      game = next;
      if(previousChatKey!==chatReadKey()){unreadChat=false;if(document.querySelector('.chat-list'))closeSheet();}
      if (previousPhase && previousPhase !== next.phase) signalPhase();
      if (document.querySelector('.chat-list') && !chatAllowed()) closeSheet();
      if (host) rememberEvent();
      if(!game.me?.isHost)delegatedHostMode=false;
      if (changed) (host || delegatedHostMode) ? renderHost() : renderPlayer();
      pollChatNotification();
    } catch (error) {
      if (error.code === 'UNAUTHORIZED') {
        pollingEpoch++;clearTimeout(pollTimer);
        if(game?.code)localStorage.removeItem(sessionKey(game.code));
        clearSession();hostToken='';delegatedHostMode=false;
        notice(discussionText('انتهت صلاحية هذه الجلسة أو انتقلت إدارة الغرفة إلى لاعب آخر.','This session expired or host control moved to another player.'));
        home();return;
      }
      pollFails++;
      if (pollFails >= 2) setReconnect(true);
    } finally {
      if(epoch===pollingEpoch)pollTimer = setTimeout(tick, game?.phase === 'lobby' ? 2500 : 2200);
    }
  };
  pollTimer = setTimeout(tick, game?.phase === 'lobby' ? 250 : 500);
}

function syncHistoryMatch() {
  if(!game?.matchId)return;
  const key=`mafia-history-match-${game.code}`;
  if(localStorage.getItem(key)!==game.matchId){
    localHistory=[];localStorage.removeItem(`mafia-history-${game.code}`);
    localStorage.setItem(key,game.matchId);
  }
}
function rememberEvent() {
  syncHistoryMatch();
  if (game?.phase === 'lobby' || !game?.lastEvent || game.lastEvent === localHistory.at(-1)?.event && game.round === localHistory.at(-1)?.round) return;
  localHistory.push({ round: game.round, phase: game.phase, event: game.lastEvent, deaths: [...(game.lastDeaths || [])] });
  localHistory = localHistory.slice(-30);
  localStorage.setItem(`mafia-history-${game.code}`, JSON.stringify(localHistory));
}
function historyCards() {
  syncHistoryMatch();
  if (!localHistory.length) localHistory = JSON.parse(localStorage.getItem(`mafia-history-${game.code}`) || '[]');
  return localHistory.slice().reverse().map((item) => `<div class="timeline-item"><b>${phaseIcon(item.phase)} الجولة ${item.round || 1}</b><span>${String(item.event || '').split(',').map((e) => eventText[e] || e).join(' • ')}</span></div>`).join('');
}

function roleDistribution() {
  const count = game.players.length;
  const kids = enabledRoles.kids_mode === true;
  const mafia = kids
    ? Math.min(2, Math.max(1, Math.round(count / 4)))
    : count < 4 ? Math.min(1, count) : Math.min(Math.floor((count - 1) / 2), Math.max(1, mafiaCount));
  const doctor = kids ? (enabledRoles.doctor && count >= 5 ? 1 : 0) : enabledRoles.doctor && count >= 4 ? 1 : 0;
  const lawyer = kids ? 0 : enabledRoles.lawyer && count >= 5 ? 1 : 0;
  const jailer = kids ? 0 : enabledRoles.jailer && count >= 6 ? 1 : 0;
  const vigilante = kids ? 0 : enabledRoles.vigilante ? 1 : 0;
  const witch = kids ? 0 : enabledRoles.witch ? 1 : 0;
  const serialKiller = kids ? 0 : enabledRoles.serial_killer ? 1 : 0;
  const jester = kids ? 0 : enabledRoles.jester ? 1 : 0;
  const cupid = kids ? 0 : enabledRoles.cupid ? 1 : 0;
  const escort = kids ? 0 : enabledRoles.escort ? 1 : 0;
  const revealer = kids ? 0 : enabledRoles.revealer ? 1 : 0;
  const fixed = doctor + lawyer + jailer + vigilante + witch + serialKiller + jester + cupid + escort + revealer;
  const maxDetectives = count < 3 ? 0 : Math.max(0, count - mafia - fixed);
  const detectives = enabledRoles.detective ? Math.min(maxDetectives, detectiveCount) : 0;
  const selectedTotal = mafia + fixed + (enabledRoles.detective ? detectiveCount : 0);
  return { mafia, doctor, lawyer, jailer, detectives, vigilante, witch, serialKiller, jester, cupid, escort, revealer, selectedTotal, valid: selectedTotal <= count, citizens: Math.max(0, count - mafia - fixed - detectives) };
}
function roleCard(role, icon, label, count, locked = false) {
  const active = Boolean(locked || enabledRoles[role]);
  const state = locked ? discussionText('أساسي','Required') : active ? discussionText('مفعّل','Enabled') : discussionText('غير مفعّل','Disabled');
  const art = role;
  return `<button type="button" data-role="${role}" data-kids="${enabledRoles.kids_mode===true&&kidsCardRoles.has(art)}" class="role-toggle illustrated-role ${active ? 'active' : 'off'} ${locked ? 'locked' : ''}" ${locked ? 'disabled' : `onclick="toggleRole('${role}')"`} aria-label="${escapeHtml(label)}" aria-pressed="${active}"><img src="${roleCardAsset(art,false,enabledRoles.kids_mode===true)}" alt="${escapeHtml(label)}" width="512" height="768" loading="lazy" decoding="async"><span class="selection-mark" aria-hidden="true">${locked ? '◆' : active ? '✓' : '+'}</span><span class="selection-count" aria-label="${discussionText('عدد اللاعبين','Player count')}">× ${count}</span><span class="selection-caption"><strong>${escapeHtml(label)}</strong><small>${state}</small></span></button>`;
}
function godfatherRevealCard() {
  const disguised = enabledRoles.godfather_innocent;
  return `<button type="button" class="role-toggle ${disguised ? 'active' : 'off'}" onclick="toggleGodfatherReveal()" aria-pressed="${disguised}"><span>${discussionText('🕵️ تمويه العرّاب','🕵️ Godfather disguise')}</span><b>${disguised ? discussionText('بريء','Innocent') : discussionText('مافيا','Mafia')}</b><small>${disguised ? discussionText('يظهر بريء','Appears innocent') : discussionText('ينكشف مافيا','Revealed as Mafia')}</small></button>`;
}
function playerList(showConnection = true, allowKick = false, players = game.players) {
  return players.map((player) => `<div class="player ${player.alive ? '' : 'dead'}">${showConnection ? `<span class="dot ${player.connected ? 'on' : ''}"></span>` : ''}<span>${player.isBot?'🤖':player.alive?'👤':'☠️'} ${escapeHtml(player.name)}${player.role?`<small>${roleLabel(player.role)}</small>`:''}${player.will?`<small>📜 ${escapeHtml(player.will)}</small>`:''}</span>${(hostToken||game.me?.isHost)&&player.alive&&!['lobby','finished'].includes(game.phase)?disciplineButtons(player):''}${allowKick?`<details class="player-management"><summary data-no-translate>${discussionText('إدارة','Manage')}</summary><button class="kick" aria-label="${discussionText('طرد','Remove')} ${escapeHtml(player.name)}" onclick="kickPlayer(${jsArg(player.id)})">${discussionText('طرد','Remove')}</button></details>`:''}${(hostToken||game.me?.isHost)&&game.phase!=='lobby'&&!player.isBot?`<button aria-label="${discussionText(player.muted?'إلغاء كتم':'كتم',player.muted?'Unmute':'Mute')} ${escapeHtml(player.name)}" aria-pressed="${!!player.muted}" class="mute-btn ${player.muted?'on':''}" onclick="mutePlayer(${jsArg(player.id)},${!player.muted})">${player.muted?'🔇':'🔊'}</button>`:''}</div>`).join('');
}

function setLobbyPane(pane) {
  if (!['room', 'setup', 'players'].includes(pane)) return;
  lobbyPane = pane;
  renderHost();
}
function changeLobbyPlayerPage(amount) {
  lobbyPlayerPage = Math.max(0, lobbyPlayerPage + amount);
  renderHost();
}
function lobbyPlayers() {
  const perPage = innerHeight >= 850 ? 12 : innerHeight >= 680 ? 8 : 4;
  const pages = Math.max(1, Math.ceil(game.players.length / perPage));
  lobbyPlayerPage = Math.min(lobbyPlayerPage, pages - 1);
  const players = game.players.slice(lobbyPlayerPage * perPage, (lobbyPlayerPage + 1) * perPage);
  const en = (localStorage.getItem('mafia-lang') || 'ar') === 'en';
  return `<div class="players lobby-roster">${playerList(true, true, players) || `<p class="muted lobby-empty" data-no-translate>${en ? 'Waiting for players to join' : 'بانتظار دخول اللاعبين'}</p>`}</div>${pages > 1 ? `<nav class="roster-pages" aria-label="${en ? 'Player pages' : 'صفحات اللاعبين'}" data-no-translate><button type="button" ${lobbyPlayerPage === 0 ? 'disabled' : ''} onclick="changeLobbyPlayerPage(-1)">${en ? 'Previous' : 'السابق'}</button><span>${lobbyPlayerPage + 1} / ${pages}</span><button type="button" ${lobbyPlayerPage === pages - 1 ? 'disabled' : ''} onclick="changeLobbyPlayerPage(1)">${en ? 'Next' : 'التالي'}</button></nav>` : ''}`;
}
function lobbyPaneTabs() {
  const en = (localStorage.getItem('mafia-lang') || 'ar') === 'en';
  return `<nav class="lobby-pane-tabs" aria-label="${en ? 'Lobby sections' : 'أقسام الغرفة'}" data-no-translate>${[['room', en ? 'Room' : 'الغرفة'], ['setup', en ? 'Setup' : 'الإعداد'], ['players', en ? 'Players' : 'اللاعبون']].map(([pane, label]) => `<button type="button" aria-pressed="${lobbyPane === pane}" onclick="setLobbyPane('${pane}')">${label}${pane === 'players' ? ` (${game.players.length})` : ''}</button>`).join('')}</nav>`;
}
function eventCards() {
  const events = String(game.lastEvent || '').split(',').filter(Boolean);
  const kids={
    mafia_kill: discussionText('🌙 اختار الفريق الغامض لاعبًا للخروج.','🌙 The mystery team chose a player to leave.'),
    mafia_skipped: discussionText('🌙 لم يختر الفريق الغامض أحدًا.','🌙 The mystery team chose nobody.'),
    mafia_disabled: discussionText('🌙 هذه اللعبة بدون اختيار ليلي للفريق الغامض.','🌙 This game has no mystery-team night pick.'),
    mafia_delayed: discussionText('🌙 تبدأ اختيارات الفريق الغامض من الليلة الثانية.','🌙 Mystery-team picks begin on night two.'),
    doctor_saved: discussionText('🛡️ حمى الحارس اللاعب.','🛡️ The guard protected the player.'),
    vote_eliminated: discussionText('🗳️ خرج اللاعب باختيار المجموعة.','🗳️ The player left by group vote.'),
  };
  return events.map((event) => { const startRound = normalizeEnabledRoles(game.enabledRoles || {}).mafia_kill_start_round || 2; const delayed = event === 'mafia_delayed' ? discussionText(`🌙 لا يوجد اغتيال مافيا هذه الليلة. يبدأ من الليلة ${startRound}.`,`🌙 No Mafia kill tonight. It begins on night ${startRound}.`) : null; return `<div class="event">${delayed || (game.enabledRoles?.kids_mode && kids[event] ? kids[event] : eventLabel(event))}</div>`; }).join('');
}

function applyPreset(kind) {
  const presets = {
    quick: { mafia: Math.max(1, Math.round(game.players.length / 4)), detective: 1, roles: { doctor: true, detective: true, lawyer: false, jailer: false, vigilante: false, witch: false, serial_killer: false, jester: false, cupid: false, escort: false } },
    balanced: { mafia: Math.max(1, Math.round(game.players.length / 3)), detective: 1, roles: { doctor: true, detective: true, lawyer: game.players.length >= 7, jailer: game.players.length >= 6, vigilante: false, witch: false, serial_killer: false, jester: false, cupid: false, escort: false } },
    pro: { mafia: Math.max(1, Math.round(game.players.length / 3)), detective: 1, roles: { doctor: true, detective: true, lawyer: true, jailer: true, vigilante: game.players.length >= 9, witch: false, serial_killer: false, jester: game.players.length >= 10, cupid: false, escort: game.players.length >= 11 } },
    chaos: { mafia: Math.max(1, Math.round(game.players.length / 3)), detective: 1, roles: { doctor: true, detective: true, lawyer: false, jailer: true, vigilante: true, witch: true, serial_killer: true, jester: true, cupid: true, escort: true } },
    kids: { mafia: Math.min(2, Math.max(1, Math.round(game.players.length / 4))), detective: 1, roles: { kids_mode:true, doctor: game.players.length >= 5, detective: game.players.length >= 4, lawyer:false, jailer:false, vigilante:false, witch:false, serial_killer:false, jester:false, cupid:false, escort:false, reveal_dead_roles:true, allow_no_vote:true, full_trial:false, godfather_innocent:false } },
  };
  const preset = presets[kind]; if (!preset) return;
  mafiaCount = preset.mafia; detectiveCount = preset.detective;
  enabledRoles = normalizeEnabledRoles({ ...enabledRoles, ...preset.roles, kids_mode: kind === 'kids' });
  schedulePreferenceSave(); setupStep = 2; renderHost();
}
function setSetupStep(step){setupStep=Math.min(3,Math.max(1,step));lobbyPane='setup';renderHost()}
function toggleOption(key){
  if(key==='kids_mode'&&!enabledRoles.kids_mode){applyPreset('kids');setupStep=3;return}
  enabledRoles[key]=!enabledRoles[key];
  enabledRoles=normalizeEnabledRoles(enabledRoles);
  schedulePreferenceSave();renderHost();
}
function changeMafiaKillStart(amount){const rounds=[0,2,3,4,5,6,7,8,9,10];const current=normalizeEnabledRoles(enabledRoles).mafia_kill_start_round;enabledRoles.mafia_kill_start_round=rounds[Math.max(0,Math.min(rounds.length-1,rounds.indexOf(current)+amount))];enabledRoles=normalizeEnabledRoles(enabledRoles);schedulePreferenceSave();renderHost()}
function presetButtons(){const presets=[['kids','✦','أطفال','Kids','بداية سهلة للصغار','A simple first game'],['quick','ϟ','سريعة','Quick','جولة خفيفة وسريعة','A short, fast round'],['balanced','⚖','متوازنة','Balanced','التشكيلة الكلاسيكية','The classic lineup'],['pro','♛','احترافية','Expert','أدوار أكثر وتحدٍ أكبر','More roles, more challenge'],['chaos','◆','فوضوية','Chaos','قدرات ومفاجآت متنوعة','Unexpected combinations']];return '<div class="preset-grid">'+presets.map(([id,icon,ar,en,detail,detailEn])=>'<button class="preset-choice" onclick="applyPreset(\''+id+'\')" data-no-translate><span class="preset-icon" aria-hidden="true">'+icon+'</span><span><strong>'+discussionText(ar,en)+'</strong><small>'+discussionText(detail,detailEn)+'</small></span><span class="preset-arrow" aria-hidden="true">‹</span></button>').join('')+'</div>'}

function setupTabs(){return `<div class="setup-tabs" data-no-translate><button class="${setupStep===1?'on':''}" onclick="setSetupStep(1)">1 ${discussionText('الإعداد','Setup')}</button><button class="${setupStep===2?'on':''}" onclick="setSetupStep(2)">2 ${discussionText('الأدوار','Roles')}</button><button class="${setupStep===3?'on':''}" onclick="setSetupStep(3)">3 ${discussionText('المراجعة','Review')}</button></div>`}
function setupRoleCards(roles, review = false) {
  const cards = enabledRoles.kids_mode
    ? [
      ['mafia_boss', '👑', roleLabel('mafia_boss'), Math.min(1, roles.mafia), true],
      ['mafia', '◆', roleLabel('mafia'), Math.max(0, roles.mafia - 1), true],
      ['doctor', '🛡️', roleLabel('doctor'), roles.doctor],
      ['detective', '🔎', roleLabel('detective'), roles.detectives],
      ['citizen', '🙂', roleLabel('citizen'), roles.citizens, true],
    ]
    : [
      ['mafia_boss', '👑', roleLabel('mafia_boss'), Math.min(1, roles.mafia), true],
      ['mafia', '◆', roleLabel('mafia'), Math.max(0, roles.mafia - 1), true],
      ['doctor', '🩺', roleLabel('doctor'), roles.doctor],
      ['detective', '🕵️', roleLabel('detective'), roles.detectives],
      ['lawyer', '⚖️', roleLabel('lawyer'), roles.lawyer],
      ['jailer', '🔐', roleLabel('jailer'), roles.jailer],
      ['vigilante', '🎯', roleLabel('vigilante'), roles.vigilante],
      ['witch', '🧪', roleLabel('witch'), roles.witch],
      ['serial_killer', '🩸', roleLabel('serial_killer'), roles.serialKiller],
      ['jester', '🃏', roleLabel('jester'), roles.jester],
      ['revealer', '📡', roleLabel('revealer'), roles.revealer],
      ['cupid', '💘', roleLabel('cupid'), roles.cupid],
      ['escort', '🚫', roleLabel('escort'), roles.escort],
      ['citizen', '🏘️', roleLabel('citizen'), roles.citizens, true],
    ];
  const visible = review ? cards.filter(card => card[3] > 0).sort((a,b) => b[3] - a[3]) : cards;
  if(review)return '<div class="review-role-cards">' + visible.map(([role,,,count]) => interactiveRoleCard(role,{review:true,count})).join('') + '</div>';
  return '<div class="role-preview">' + visible.map(card => roleCard(...card)).join('') + '</div>';
}
function setupPanel(roles){
  if(setupStep===1)return `${setupTabs()}<h2>${discussionText('اختر التشكيلة','Choose a preset')}</h2>${presetButtons()}${discussionSettings()}<details class="advanced-settings" data-disclosure-key="setup-counts"><summary data-no-translate>${discussionText('خيارات متقدمة: الأعداد والتحقيق','Advanced: counts and investigations')}</summary><div class="settings">${settingRow(discussionText('عدد المافيا','Mafia count'), 'mafiaCount', mafiaCount, 1, 8)}${settingRow(discussionText('عدد المحققين','Detective count'), 'detectiveCount', detectiveCount, 0, 8)}${settingRow(discussionText('إجمالي أسئلة كل محقق','Total questions per detective'), 'detectiveQuestions', detectiveQuestions, 1, 5)}<p data-no-translate>${discussionText('سؤال واحد في كل جولة حتى انتهاء العدد المحدد.','One question per round until the selected total is reached.')}</p></div></details><button class="btn red wide" onclick="setSetupStep(2)">${discussionText('التالي','Next')} ←</button>`;
  if(setupStep===2)return `${setupTabs()}<h3 class="role-picker-title" data-no-translate>${enabledRoles.kids_mode?discussionText('شخصيات وضع الأطفال فقط — اضغط البطاقة لتفعيلها أو إلغائها','Kids mode characters only — tap a card to enable or disable'):discussionText('اضغط البطاقة لتفعيلها أو إلغائها','Tap a card to enable or disable')}</h3>${setupRoleCards(roles)}<div class="actions"><button class="btn" onclick="setSetupStep(1)">رجوع</button><button class="btn red" onclick="setSetupStep(3)">التالي</button></div>`;
  const killStart=Number.isFinite(+enabledRoles.mafia_kill_start_round)?+enabledRoles.mafia_kill_start_round:1;
  const killLabel=killStart===0?'مغلق':`من الليلة ${killStart}`;
  return `${setupTabs()}<h3 class="role-picker-title" data-no-translate>${discussionText("الأدوار المختارة — من الأكثر عددًا للأقل","Selected roles — highest count first")}</h3><p class="muted" data-no-translate>${discussionText("اضغط الكرت لقلبه وقراءة خصائصه ومهامه.","Tap a card to flip it and read its abilities and tasks.")}</p>${setupRoleCards(roles,true)}<button class="btn" onclick="setSetupStep(2)" data-no-translate>${discussionText("تعديل الأدوار","Edit roles")}</button>${setupSummary(roles,false)}<details class="advanced-settings" data-disclosure-key="setup-rules" open><summary data-no-translate>${discussionText('خيارات بدء اللعبة','Game start options')}</summary><div class="rule-grid"><button class="rule-chip ${enabledRoles.kids_mode?'on':''}" onclick="toggleOption('kids_mode')">🧒 وضع الأطفال: ${enabledRoles.kids_mode?'مفعّل':'ملغي'}</button><div class="rule-chip kill-range ${killStart>0?'on':''}"><button onclick="changeMafiaKillStart(-1)" aria-label="تقليل ليلة بدء الاغتيال">−</button><span>🌙 اغتيال المافيا<br><b>${killLabel}</b></span><button onclick="changeMafiaKillStart(1)" aria-label="زيادة ليلة بدء الاغتيال">+</button></div>${enabledRoles.kids_mode?'':`<button class="rule-chip ${enabledRoles.godfather_innocent?'on':''}" onclick="toggleGodfatherReveal()">🕵️ العرّاب: ${enabledRoles.godfather_innocent?'يظهر بريئًا':'ينكشف مافيا'}</button>`}<button class="rule-chip ${enabledRoles.reveal_dead_roles?'on':''}" onclick="toggleOption('reveal_dead_roles')">🎭 كشف دور الميت: ${enabledRoles.reveal_dead_roles?'نعم':'لا'}</button><button class="rule-chip ${enabledRoles.allow_no_vote?'on':''}" onclick="toggleOption('allow_no_vote')">✋ عدم التصويت: ${enabledRoles.allow_no_vote?'مسموح':'ممنوع'}</button><button class="rule-chip ${enabledRoles.full_trial?'on':''}" onclick="toggleOption('full_trial')">⚖️ المحاكمة: ${enabledRoles.full_trial?'كاملة':'تصويت مباشر'}</button><button class="rule-chip on" onclick="cycleTimer()">⏱️ المؤقت: ${phaseDuration} ثانية</button><button class="rule-chip ${soundEnabled?'on':''}" onclick="toggleSound()">${soundEnabled?'🔊':'🔇'} الصوت</button></div></details><div class="preference-status" id="prefsStatus">تم حفظ الإعدادات تلقائيًا ✓</div>${enabledRoles.kids_mode?'<div class="status">🧒 لعب بسيط: الفريق الغامض، الحارس، المحقق والأصدقاء فقط.</div>':''}${roles.valid?`<div class="status" data-no-translate>${discussionText(game.players.length<2?'بانتظار لاعبين على الأقل لبدء المباراة.':'✓ عدد الأدوار مناسب للاعبين.',game.players.length<2?'Waiting for at least two players.':'✓ Role counts fit the players.')}</div>`:`<div class="status wait">⚠️ اخترت ${roles.selectedTotal} دورًا ويوجد ${game.players.length} لاعبين فقط</div>`}<button class="btn red wide" ${game.players.length<2||!roles.valid?'disabled':''} onclick="startGame()" data-no-translate>${discussionText("توزيع الأدوار وبدء اللعبة","Deal roles and start game")}</button>`;
}

// Keep the QR local and reuse it across lobby updates.
let roomQrUrl = '', roomQrImage = '';
function roomQrSource(url) {
  if(typeof qrcode!=='function') {
    loadFeatureScript('/qrcode.js').then(()=>{
      if(game?.phase!=='lobby')return;
      const currentUrl=`${location.origin}/game.html?room=${game.code}`;
      document.querySelectorAll('.host-lobby img.qr').forEach(image=>image.src=roomQrSource(currentUrl));
    }).catch(()=>{});
    return 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  }
  if (roomQrUrl !== url) {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    roomQrImage = qr.createDataURL(8, 16);
    roomQrUrl = url;
  }
  return roomQrImage;
}

function lobbyJoinActionsHtml() {
  const share = discussionText('مشاركة الغرفة', 'Share room');
  const bots = discussionText('إكمال إلى 8 بالبوتات', 'Fill to 8 with bots');
  const back = discussionText('العودة لدوري', 'Back to my role');
  const l = (s) => escapeHtml(s);
  return `<div class="actions center lobby-join-actions"><button type="button" class="btn lobby-tool" onclick="shareRoom()" aria-label="${l(share)}" title="${l(share)}">${lobbyIcon('share')}</button><button type="button" class="btn lobby-tool" onclick="fillBots()" aria-label="${l(bots)}" title="${l(bots)}">${lobbyIcon('bots')}</button>${delegatedHostMode ? `<button type="button" class="btn lobby-tool" onclick="toggleDelegatedHost()" aria-label="${l(back)}" title="${l(back)}">${lobbyIcon('user')}</button>` : ''}</div>`;
}

function renderHostContent() {
  setRoomTag();
  if (game.phase === 'lobby') {
    const roles = roleDistribution();
    const joinUrl = `${location.origin}/game.html?room=${game.code}`;
    $('#app').innerHTML = `${phaseBar()}${lobbyPaneTabs()}<div class="grid host-lobby" data-pane="${lobbyPane}"><aside class="lobby-side"><div class="card hero lobby-join"><div class="lobby-join-details"><div class="code">${game.code}</div></div><div class="lobby-qr-block"><img class="qr" width="420" height="420" src="${roomQrSource(joinUrl)}" alt="${discussionText('باركود الغرفة','Room QR code')}"></div>${lobbyJoinActionsHtml()}</div><div class="card lobby-players"><div class="toolbar"><h2>${discussionText(`اللاعبون (${game.players.length})`,`Players (${game.players.length})`)}</h2><span class="connection-count">${game.players.filter((p)=>p.connected||p.isBot).length} ${discussionText('جاهز','ready')}</span></div>${lobbyPlayers()}</div></aside><section class="card setup-card" data-step="${setupStep}">${setupPanel(roles)}</section></div>`;
    return;
  }
  if (game.phase === 'paused') {
    $('#app').innerHTML = `${phaseBar()}<div class="card hero"><div class="role-title">⏸️ المباراة متوقفة</div><p>يمكن متابعة المباراة من المرحلة نفسها.</p><button class="btn red" onclick="hostAction('togglePause')">▶️ متابعة المباراة</button><button class="btn gold wide" type="button" onclick="returnToLobby()">${discussionText('إيقاف والرجوع للوبي','Stop and return to lobby')}</button></div>`;
    return;
  }
  if (game.phase === 'reveal') {
    const ready = game.roleReadyCount || 0, total = game.players.length;
    $('#app').innerHTML = `${phaseBar()}<div class="grid"><div class="card hero"><div class="counter">${ready} / ${total}</div><div class="progress"><span style="width:${total?ready/total*100:0}%"></span></div><button class="btn red wide" ${ready<total?'disabled':''} onclick="hostAction('beginNight')">🌙 ${discussionText('بدء الليل','Start night')}</button></div><div class="card"><h2>${discussionText('اللاعبون','Players')}</h2><div class="players">${playerList()}</div></div></div>`;
    return;
  }
  if (game.phase === 'night') {
    $('#app').innerHTML = `${phaseBar()}<div class="grid"><section class="card hero phase-play night-play"><div class="status ${game.nightReady ? '' : 'wait'}">${game.nightReady ? discussionText('اكتملت اختيارات الليل ✅','Night choices complete ✅') : discussionText('بانتظار الاختيارات…','Waiting for choices…')}</div><button class="btn red wide" ${game.nightReady||phaseTimeExpired() ? '' : 'disabled'} data-timeout-action="resolveNight" onclick="hostAction('resolveNight')">${discussionText('إعلان الصباح','Announce morning')}</button></section><div class="card">${eventCards()}<h2>${discussionText('اللاعبون','Players')}</h2><div class="players">${playerList()}</div></div></div>`;
    return;
  }
  if (game.phase === 'day') {
    const ready = ((game.lawyerReady && game.jailerReady)||phaseTimeExpired()) && clientDiscussion().complete;
    const draw = typeof openingDrawActive === 'function' && openingDrawActive(clientDiscussion());
    const talk = discussionPanel(true);
    const talkBlock = talk && !draw ? `<details class="cycle-talk" open data-disclosure-key="host-day-talk"><summary>${discussionText('النقاش','Discussion')}</summary>${talk}</details>` : talk;
    $('#app').innerHTML = `${phaseBar()}<div class="grid"><section class="card hero day-stage phase-play day-play"><div class="role-title">☀️ ${discussionText('الصباح','Morning')}</div>${morningBriefPanel(true)}<section class="day-action-panel cycle-action" data-no-translate><h2>${discussionText('اختيارات النهار','Day choices')}</h2><div class="status ${game.lawyerReady ? '' : 'wait'}">${game.lawyerReady ? discussionText('المحامي جاهز ✅','Lawyer ready ✅') : discussionText('بانتظار حماية المحامي…','Waiting for Lawyer protection…')}</div><div class="status ${game.jailerReady ? '' : 'wait'}">${game.jailerReady ? discussionText('السجّان اختار السجين ✅','Jailer chose the prisoner ✅') : discussionText('بانتظار اختيار السجّان…','Waiting for the Jailer…')}</div><button class="btn gold wide" data-discussion-vote ${ready ? '' : 'disabled'} onclick="hostAction('startVote')">${discussionText('بدء التصويت','Start voting')}</button></section>${talkBlock}</section><div class="card"><h2>${discussionText('الأحياء','Alive')}</h2><div class="players">${playerList(false, false, alivePlayers())}</div></div></div>`;
    return;
  }
  if (game.phase === 'nomination') {
    const alive = alivePlayers().length;
    $('#app').innerHTML = `${phaseBar()}<div class="grid"><section class="card hero phase-play nomination-play"><div class="counter">${game.voteCount} / ${alive}</div><button class="btn red wide" ${game.voteCount<alive&&!phaseTimeExpired()?'disabled':''} data-timeout-action="resolveVote" onclick="hostAction('resolveVote')">${discussionText('اختيار المتهم','Choose the accused')}</button></section><div class="card"><h2>${discussionText('الأحياء','Alive')}</h2><div class="players">${playerList(false, false, alivePlayers())}</div></div></div>`;
    return;
  }
  if (game.phase === 'trial') {
    $('#app').innerHTML = `${phaseBar()}<div class="card hero trial-stage phase-play trial-play"><div class="accused-name">${escapeHtml(nameOf(game.accusedPlayer))}</div><p id="trialTimerHint" class="status wait" hidden></p><button class="btn gold wide" type="button" data-timeout-action="advanceVerdict" onclick="hostAction('advanceVerdict')">${discussionText('الانتقال إلى الحكم','Move to verdict')}</button></div>`;
    return;
  }
  if (game.phase === 'verdict') {
    const alive = Math.max(0,alivePlayers().length-1);
    $('#app').innerHTML = `${phaseBar()}<div class="grid"><section class="card hero phase-play verdict-play"><div class="accused-name">${escapeHtml(nameOf(game.accusedPlayer))}</div><div class="counter">${game.voteCount} / ${alive}</div><button class="btn red wide" ${game.voteCount<alive&&!phaseTimeExpired()?'disabled':''} data-timeout-action="resolveVote" onclick="hostAction('resolveVote')">${discussionText('إعلان الحكم','Reveal verdict')}</button></section><div class="card"><h2>${discussionText('المصوتون','Voters')}</h2><div class="players">${playerList(false)}</div></div></div>`;
    return;
  }
  if (game.phase === 'vote') {
    const alive = alivePlayers().length;
    $('#app').innerHTML = `${phaseBar()}<div class="grid"><section class="card hero phase-play vote-play"><div class="counter">${game.voteCount} / ${alive}</div><button class="btn red wide" ${game.voteCount < alive && !phaseTimeExpired() ? 'disabled' : ''} data-timeout-action="resolveVote" onclick="hostAction('resolveVote')">${discussionText('كشف النتيجة','Reveal result')}</button></section><div class="card"><h2>${discussionText('اللاعبون','Players')}</h2><div class="players">${playerList(false)}</div></div></div>`;
    return;
  }
    $('#app').innerHTML = `${phaseBar()}<div class="grid"><div class="card hero"><div class="role-title">${winnerTitle()}</div><div class="players final-roles">${game.players.map((player) => `<div class="player"><span>${escapeHtml(player.name)} — ${roleLabel(player.role)}</span></div>`).join('')}</div><div class="actions center"><button class="btn gold wide" onclick="returnToLobby()">👥 ${discussionText('الرجوع للوبي وتغيير اللاعبين','Return to lobby and change players')}</button><button class="btn red" onclick="startGame()">🔄 ${discussionText('إعادة مباراة بنفس اللاعبين','Rematch with the same players')}</button><button class="btn" onclick="shareResult()">↗ ${discussionText('مشاركة النتيجة','Share result')}</button><button class="btn" onclick="home()">${discussionText('الرئيسية','Home')}</button></div></div><div class="card"><h2>${discussionText('سجل المباراة','Match log')}</h2><div class="timeline">${historyCards()||`<p class="muted">${discussionText('ستظهر أحداث المباراة هنا.','Match events will appear here.')}</p>`}</div></div></div>`;
}
function winnerTitle() {
  if (game.winner === 'draw') return discussionText('⚖️ تعادل — لم يبقَ أحد حيًا','⚖️ Draw — no survivors');
  if (game.winner === 'cancelled') return discussionText('⛔ انتهت المباراة بدون نتيجة','⛔ Match ended with no result');
  if (game.winner === 'mafia') return discussionText('🔴 فازت المافيا','🔴 Mafia wins');
  if (game.winner === 'jester') return `${discussionText('🃏 فاز المهرج','🃏 Jester wins')}${game.winnerPlayer ? `: ${escapeHtml(nameOf(game.winnerPlayer))}` : ''}`;
  if (game.winner === 'serial_killer') return discussionText('🩸 فاز القاتل المتسلسل','🩸 Serial Killer wins');
  return discussionText('🏘️ فازت القرية','🏘️ Village wins');
}
function settingRow(label, key, value, min, max) {
  return `<div class="setting"><h3>${label}</h3><div class="step"><button aria-label="تقليل" onclick="changeSetting('${key}',-1,${min},${max})">−</button><span class="number">${value}</span><button aria-label="زيادة" onclick="changeSetting('${key}',1,${min},${max})">+</button></div></div>`;
}
function changeSetting(key, amount, min, max) {
  if (key === 'mafiaCount') mafiaCount = Math.min(max, Math.max(min, mafiaCount + amount));
  if (key === 'detectiveCount') detectiveCount = Math.min(max, Math.max(min, detectiveCount + amount));
  if (key === 'detectiveQuestions') detectiveQuestions = detectiveQuestionCount(detectiveQuestions + amount);
  schedulePreferenceSave(); renderHost();
}
function toggleRole(role) {
  if (enabledRoles.kids_mode) {
    const kidsToggles = new Set(['doctor', 'detective']);
    if (!kidsToggles.has(role)) return;
  }
  if (!Object.prototype.hasOwnProperty.call(enabledRoles, role)) return;
  enabledRoles[role] = !enabledRoles[role];
  enabledRoles = normalizeEnabledRoles(enabledRoles);
  schedulePreferenceSave(); renderHost();
}
function toggleGodfatherReveal() {
  enabledRoles.godfather_innocent = !enabledRoles.godfather_innocent;
  schedulePreferenceSave(); renderHost();
}
let lifecycleRequestPending = false;
async function leaveRoom() {
  if (lifecycleRequestPending || !game) return;
  confirmSheet(discussionText('مغادرة الغرفة نهائيًا؟ ستفقد مقعدك. إغلاق الصفحة مؤقتًا يحفظ مقعدك.','Leave the room for good? You will lose your seat. Closing the tab briefly keeps your seat.'),()=>leaveRoomConfirmed());
  return;
}
async function leaveRoomConfirmed() {
  lifecycleRequestPending = true;
  try {
    const code = game.code;
    await withBusy('جاري مغادرة الغرفة…', () => api({action:'leave',code,
      lifecycleVersion:game.lifecycleVersion,hostToken,id:playerId,playerToken}));
    pollingEpoch++;
    clearTimeout(pollTimer);
    localStorage.removeItem(sessionKey(code));
    clearSession();
    hostToken='';playerToken='';playerId='';delegatedHostMode=false;
    home();
  } catch {
    notice('لم تتأكد المغادرة. جلستك محفوظة؛ أعد المحاولة بعد عودة الاتصال.');
  } finally { lifecycleRequestPending = false; }
}
async function returnToLobby() {
  if (lifecycleRequestPending || !game || game.phase === 'lobby') return;
  if (!(hostToken || game.me?.isHost)) return;
  const midMatch = game.phase !== 'finished';
  if (midMatch && !confirm(discussionText('إيقاف القيم والرجوع للوبي؟ تقدر تدخل أو تطلع لاعبين وبعدين تبدأ قيم جديد.','Stop the match and return to the lobby? You can add or remove players, then start a new game.'))) return;
  lifecycleRequestPending = true;
  const send = (version) => api({
    action:'returnToLobby', code:game.code, lifecycleVersion:version,
    hostToken, id:playerId, playerToken
  });
  try {
    const next = await withBusy(discussionText('جاري الرجوع للوبي…','Returning to lobby…'), async () => {
      try { return await send(game.lifecycleVersion); }
      catch (error) {
        if (error.code !== 'STALE_GAME') throw error;
        const fresh = await api({ action:'state', code:game.code, id:playerId, playerToken, hostToken });
        game = fresh;
        return await send(fresh.lifecycleVersion);
      }
    });
    game = next;
    localHistory = [];
    localStorage.removeItem(`mafia-history-${game.code}`);
    setupStep = 1;
    closeSheet();
    delegatedHostMode = true;
    renderHost();
  } catch (error) {
    notice(error.code === 'STALE_GAME' ? discussionText('تغيّرت حالة الغرفة. انتظر تحديث الشاشة.','The room state changed. Wait for the screen to update.') : discussionText('تعذر الرجوع للوبي، حاول مجددًا.','Could not return to the lobby. Try again.'));
  } finally { lifecycleRequestPending = false; }
}
async function startGame() {
  if (lifecycleRequestPending) return;
  lifecycleRequestPending = true;
  enabledRoles.phase_seconds=phaseDuration;
  try {
    game = await withBusy(discussionText('جاري توزيع الأدوار…','Dealing roles…'), () => api({ action: 'start', code: game.code, lifecycleVersion:game.lifecycleVersion, hostToken, id:playerId, playerToken, mafiaCount, detectiveCount, detectiveQuestions, enabledRoles }));
    localHistory = []; localStorage.removeItem(`mafia-history-${game.code}`);
    signalPhase(); rememberEvent();
    renderHost();
  } catch (error) { notice(error.code === 'STALE_GAME' ? discussionText('تغيّرت حالة الغرفة. انتظر تحديث الشاشة ثم حاول مجددًا.','The room state changed. Wait for the screen to update, then try again.') : discussionText('تأكد من وجود لاعبين كافين','Check the player count')); }
  finally { lifecycleRequestPending = false; }
}
async function hostAction(action) {
  try { const previous=game.phase; game = await api({ action, code: game.code, hostToken, id:playerId, playerToken }); if(previous!==game.phase)signalPhase(); rememberEvent(); renderHost(); }
  catch (error) { notice(error.code === 'STALE_GAME' ? 'تغيّرت حالة الغرفة أثناء الطلب. انتظر تحديث الشاشة ثم حاول مجددًا.' : error.code === 'WAITING_ACTIONS' ? 'بانتظار بقية اختيارات الليل' : 'بانتظار بقية اللاعبين'); }
}
async function kickPlayer(target){if(!confirm(discussionText('طرد اللاعب ','Remove player ')+nameOf(target)+discussionText(' من الغرفة؟ سيحتاج إلى الدخول مجددًا.',' from the room? They will need to rejoin.')))return;try{game=await api({action:'kick',code:game.code,hostToken,id:playerId,playerToken,target});renderHost()}catch{notice('تعذر طرد اللاعب')}}
async function addBot(){try{game=await api({action:'addBot',code:game.code,hostToken,id:playerId,playerToken});renderHost()}catch{notice('تعذر إضافة البوت')}}
async function fillBots(){while(game.players.length<8){await addBot()}renderHost()}
async function mutePlayer(target,muted){try{game=await api({action:'mute',code:game.code,hostToken,id:playerId,playerToken,target,muted});renderHost()}catch{notice('تعذر تعديل الكتم')}}
async function endGame(){if(!confirm(discussionText('إنهاء المباراة نهائيًا؟ لن تتمكن من استكمال هذه الجولة. للإيقاف المؤقت استخدم زر الإيقاف.','End this match permanently? This round cannot be resumed. Use Pause for a temporary break.')))return;try{game=await api({action:'endGame',code:game.code,hostToken,id:playerId,playerToken});closeSheet();renderHost()}catch{notice('تعذر إنهاء المباراة')}}
async function transferHost(target){if(!confirm(discussionText('تسليم تحكم المضيف لهذا اللاعب؟','Transfer host control to this player?')))return;try{game=await api({action:'transferHost',code:game.code,hostToken,id:playerId,playerToken,target});notice(discussionText('تم تسليم التحكم ✅','Control transferred ✅'));renderHost()}catch{notice(discussionText('تعذر نقل التحكم','Could not transfer control'))}}
async function createReplacement(target){try{const result=await api({action:'createReplacement',code:game.code,hostToken,id:playerId,playerToken,target});await copyText(result.replacementCode);notice(discussionText(`رمز استبدال ${result.target.name}: ${result.replacementCode} (15 دقيقة)`, `Replacement code for ${result.target.name}: ${result.replacementCode} (15 min)`))}catch{notice(discussionText('تعذر إنشاء رمز الاستبدال','Could not create replacement code'))}}
async function restoreSnapshot(snapshotId){if(!confirm(discussionText('استعادة هذه المرحلة؟ سيتم حفظ الوضع الحالي أولًا.','Restore this checkpoint? The current state will be saved first.')))return;try{game=await api({action:'restoreSnapshot',code:game.code,hostToken,id:playerId,playerToken,snapshotId});renderHost()}catch{notice(discussionText('تعذر استعادة النسخة','Could not restore snapshot'))}}
async function showModeration(){try{const auth={code:game.code,hostToken,id:playerId,playerToken};const [log,status,saved]=await Promise.all([api({action:'moderationLog',...auth}),api({action:'systemStatus',...auth}),api({action:'listSnapshots',...auth})]);const reports=log.reports||[],snapshots=saved.snapshots||[];closeSheet();$('#app').innerHTML=`${phaseBar()}<div class="card"><div class="toolbar"><h1>🛡️ إدارة اللعبة</h1><button class="btn" onclick="renderHost()">رجوع</button></div><div class="stat-grid"><div><b>${status.spectators}</b><span>متفرج</span></div><div><b>${status.snapshots}</b><span>نسخة</span></div><div><b>${status.averageMs}</b><span>ms</span></div></div><h2>اللاعبون</h2><div class="admin-list">${game.players.filter(p=>!p.isBot).map(p=>`<div class="player"><span>${p.connected?'🟢':'⚪'} ${escapeHtml(p.name)}</span>${p.alive&&!['lobby','finished'].includes(game.phase)?disciplineButtons(p):''}<button class="mini-action" aria-label="${discussionText('نقل الاستضافة إلى','Transfer hosting to')} ${escapeHtml(p.name)}" onclick="transferHost(${jsArg(p.id)})">👑</button><button class="mini-action" aria-label="${discussionText('استبدال اللاعب','Replace player')} ${escapeHtml(p.name)}" onclick="createReplacement(${jsArg(p.id)})">🔄</button></div>`).join('')}</div><h2>النسخ التلقائية</h2>${snapshots.map(s=>`<div class="report"><b>${phaseIcon(s.phase)} الجولة ${s.round}</b><span>${new Date(s.created_at).toLocaleTimeString()}</span><button class="btn" onclick="restoreSnapshot(${s.id})">استعادة</button></div>`).join('')||'<p class="muted">ستُحفظ نسخة قبل نتائج الليل والتصويت.</p>'}<h2>البلاغات</h2>${reports.map(r=>`<div class="report"><b>${escapeHtml(nameOf(r.reporter_id))} ← ${escapeHtml(nameOf(r.target_id))}</b><p>${escapeHtml(r.reason)}</p></div>`).join('')||'<p class="muted">لا توجد بلاغات.</p>'}</div>`}catch{notice('تعذر تحميل لوحة الإدارة')}}

function roleAcknowledged() { return game?.me?.acknowledged === true; }
async function acknowledgeRole() { try{game=await api({action:'acknowledgeRole',code:game.code,id:playerId,playerToken});if(navigator.vibrate)navigator.vibrate(80);renderPlayer()}catch{notice('تعذر تأكيد الدور، حاول مرة ثانية')} }
function roleProperties() {
  return detailedRoleProperties(game.me.role,true);
}
let personalCardState = {key:'',open:false};
function personalRoleCard(compact=false, extra={}) {
  const role=game?.me?.role;
  if(!Object.prototype.hasOwnProperty.call(roleNames,role))return '';
  const key=[game.code,game.matchId,game.me.id,role,roleAcknowledged()].join(':');
  if(personalCardState.key!==key)personalCardState={key,open:false};
  return interactiveRoleCard(role,{personal:true,compact,open:personalCardState.open,...extra});
}
function setShowingRole(on){document.body.classList.toggle('showing-role',!!on)}
function roleReveal() {
  setShowingRole(true);
  $('#app').innerHTML=`<section class="role-reveal-only">${personalRoleCard(false,{reveal:true})}<button class="btn red reveal-ack" onclick="acknowledgeRole()"><span class="phase-timer" id="phaseTimer" role="timer" aria-label="${discussionText('الوقت المتبقي','Time remaining')}">${phaseDuration}</span><span>${discussionText('فهمت','Got it')}</span></button></section>`;
}
function mafiaRoleClient(role){return role==='mafia'||role==='mafia_boss'}
function renderPlayerContent() {
  setRoomTag();
  removePlayerChrome();
  const me = game.me;
  if (game.phase === 'lobby') {
    $('#app').innerHTML = `<div class="card hero"><div class="role-title">✅ ${discussionText('دخلت الغرفة','Joined the room')}</div><h2>${escapeHtml(me?.name || '')}</h2><p>${discussionText('انتظر المضيف لبدء القيم. انقطاع الاتصال المؤقت يحفظ مقعدك.','Wait for the host to start. A brief disconnect keeps your seat.')}</p><button class="btn" onclick="leaveRoom()">🚪 ${discussionText('مغادرة الغرفة','Leave room')}</button><div class="counter">${game.players.length}</div><p class="muted">${discussionText('لاعبون داخل الغرفة','Players joined')}</p>${me?.isHost?`<button class="btn gold" onclick="toggleDelegatedHost()">👑 ${discussionText('فتح تحكم المضيف','Open host controls')}</button>`:''}</div>`;
    return;
  }
  if (!me) { $('#app').innerHTML = '<div class="card hero"><h2>فقدنا جلسة اللاعب</h2><button class="btn" onclick="home()">دخول من جديد</button></div>'; return; }
  if (!me.alive) { delegatedHostMode=false; if(document.querySelector('.game-sheet'))closeSheet(); renderSpectator(); return; }
  setTimeout(mountPlayerTools, 0);
  if (game.phase === 'paused') { pendingDockPlay={abilityTitle:'',abilityBody:'',voteBody:'',tab:''}; $('#app').innerHTML = `${phaseBar()}<div class="card hero"><div class="role-title">⏸️ المباراة متوقفة</div><p>المضيف سيكمل المباراة من المرحلة نفسها.</p>${me.isHost?`<button class="btn gold wide" type="button" onclick="returnToLobby()">${discussionText('إيقاف والرجوع للوبي','Stop and return to lobby')}</button>`:''}</div>`; return; }
  if (game.phase === 'finished') {
    $('#app').innerHTML = `${phaseBar()}<div class="card hero"><div class="role-title">${winnerTitle()}</div><p>${discussionText('دورك','Your role')}: ${roleLabel(me.role)}</p><p class="muted">${me.isHost ? discussionText('افتح تحكم المضيف لإعادة المباراة.','Open host controls to play again.') : discussionText('انتظر المضيف لإعادة المباراة.','Wait for the host to play again.')}</p></div>`;
    return;
  }
  if (game.phase === 'reveal') { if (!roleAcknowledged()) roleReveal(); else $('#app').innerHTML = `${phaseBar()}<div class="card hero"><div class="role-title">✅ جاهز</div><p>انتظر بقية اللاعبين ثم يبدأ الليل.</p><div class="counter">${game.roleReadyCount} / ${game.players.length}</div></div>`; return; }
  if (!roleAcknowledged()) { roleReveal(); return; }
  if (game.phase === 'night') { renderNight(); $('#app').innerHTML = wrapCyclePlay('night', $('#app').innerHTML); }
  else if (game.phase === 'day') { renderDay(); $('#app').innerHTML = wrapCyclePlay('day', $('#app').innerHTML); }
  else if (game.phase === 'trial') { renderTrialPlayer(); $('#app').innerHTML = wrapCyclePlay('trial', $('#app').innerHTML); }
  else if (game.phase === 'verdict') { renderVerdict(); $('#app').innerHTML = wrapCyclePlay('verdict', $('#app').innerHTML); }
  else { renderVote(); $('#app').innerHTML = wrapCyclePlay(game.phase === 'nomination' ? 'nomination' : 'vote', $('#app').innerHTML); }
}

// VisualViewport follows mobile keyboards that do not resize the layout viewport.
function syncVisibleViewport(){
 const viewport=window.visualViewport;
 document.documentElement.style.setProperty('--visible-height',`${viewport?.height||innerHeight}px`);
 document.documentElement.style.setProperty('--visible-top',`${viewport?.offsetTop||0}px`);
 const focused=document.activeElement;
 if(focused?.matches('input,textarea,select')&&focused.closest('.game-sheet'))requestAnimationFrame(()=>focused.scrollIntoView({block:'nearest'}));
}
window.visualViewport?.addEventListener('resize',syncVisibleViewport);
window.visualViewport?.addEventListener('scroll',syncVisibleViewport);
window.addEventListener('resize',syncVisibleViewport);
syncVisibleViewport();
function dockChatLabel(){
  if(game?.me?.jailed||game?.me?.role==='jailer')return discussionText('محادثة السجن','Jail chat');
  return discussionText('محادثة المافيا','Mafia chat');
}
let pendingDockPlay={abilityTitle:'',abilityBody:'',voteBody:'',tab:''};
let dockAutoKey='';
function extractDockAction(html){
  const box=document.createElement('div');
  box.innerHTML=html||'';
  if(box.querySelector('.wait-only')&&!box.querySelector('button,.pick'))return '';
  const card=box.querySelector(':scope > .card');
  return (card||box).innerHTML;
}
function selectDockTab(tab){
  pendingDockPlay.tab=pendingDockPlay.tab===tab?'none':tab;
  document.querySelector('.player-dock')?.remove();
  document.body.classList.remove('has-player-dock');
  mountPlayerTools();
}
function mountPlayerTools(){
  if(!game?.me?.alive||['lobby','reveal','finished'].includes(game.phase)||document.querySelector('.player-dock'))return;
  const canChat=chatAllowed();
  const unread=canChat&&chatHasUnread();
  const tab=pendingDockPlay.tab;
  let play='';
  if(tab==='ability'){
    play=`<section class="dock-play">${pendingDockPlay.abilityTitle?`<h2 class="role-act-title" data-no-translate>${pendingDockPlay.abilityTitle}</h2>`:''}${pendingDockPlay.abilityBody||`<p class="muted">${discussionText('ما فيه إجراء الحين.','No action right now.')}</p>`}</section>`;
  }else if(tab==='vote'){
    play=`<section class="dock-play"><h2 class="role-act-title" data-no-translate>${discussionText('التصويت','Vote')}</h2>${pendingDockPlay.voteBody||`<p class="muted">${discussionText('ما فيه نتيجة تصويت بعد.','No vote result yet.')}</p>`}</section>`;
  }else if(tab==='card'){
    play=`<section class="dock-play dock-card-play">${personalRoleCard(true,{reveal:true})}</section>`;
  }
  const chatOn=canChat?' dock-chat-on':'';
  const on=name=>tab===name?' is-on':'';
  const dock=document.createElement('nav');
  dock.className='player-dock';
  dock.setAttribute('aria-label',discussionText('شريط اللاعب','Player bar'));
  dock.innerHTML=`${play}<div class="dock-row">
    <button type="button" class="dock-item${on('ability')}" onclick="selectDockTab('ability')"><span class="dock-icon">⚡</span><span>${discussionText('قدرتي','Ability')}</span></button>
    <button type="button" class="dock-item${on('vote')}" onclick="selectDockTab('vote')"><span class="dock-icon">🗳️</span><span>${discussionText('التصويت','Vote')}</span></button>
    <button type="button" class="dock-item dock-card-tab${on('card')}" onclick="selectDockTab('card')"><span class="dock-icon">🃏</span><span>${discussionText('كرتي','My card')}</span></button>
    <button type="button" class="dock-item${chatOn}" data-chat-button ${canChat?'':'disabled'} onclick="openChat()"><span class="dock-icon">💬</span><span>${discussionText('محادثة','Chat')}</span><i class="dock-badge" ${unread?'':'hidden'}></i></button>
    <button type="button" class="dock-item" onclick="openDockMore()"><span class="dock-icon">⋯</span><span>${discussionText('المزيد','More')}</span></button>
  </div>`;
  document.body.append(dock);
  document.body.classList.add('has-player-dock');
}
function openDockMore(){
  const host=game?.me?.isHost?`<button class="btn gold wide" type="button" onclick="toggleDelegatedHost()">👑 ${discussionText('تحكم','Host')}</button><button class="btn wide" type="button" onclick="returnToLobby()">🏠 ${discussionText('اللوبي','Lobby')}</button>`:'';
  openSheet(discussionText('المزيد','More'),`<div class="player-tools-list" data-no-translate><button class="btn wide" type="button" onclick="openWill()">📜 ${discussionText('وصية','Will')}</button><button class="btn wide" type="button" onclick="openReport()">🚩 ${discussionText('بلاغ','Report')}</button>${host}</div>`);
}
function openMyRole(){
  if(!game?.me?.role)return;
  openSheet(discussionText('دوري','My role'), interactiveRoleCard(game.me.role,{personal:true,reveal:true}));
}
function toggleDelegatedHost(){delegatedHostMode=!delegatedHostMode;removePlayerChrome();delegatedHostMode?renderHost():renderPlayer()}
let sheetReturnFocus=null;
function closeSheet(){stopChatPolling();const sheet=document.querySelector('.game-sheet');if(!sheet)return;sheet.remove();document.querySelector('.shell')?.removeAttribute('inert');document.querySelector('.utility-bar')?.removeAttribute('inert');document.querySelector('.player-dock')?.removeAttribute('inert');if(sheetReturnFocus?.isConnected)sheetReturnFocus.focus();sheetReturnFocus=null;}
function openSheet(title,body){closeSheet();sheetReturnFocus=document.activeElement;const sheet=document.createElement('div');sheet.className='game-sheet';sheet.innerHTML=`<div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="sheetTitle"><div class="toolbar"><h2 id="sheetTitle">${title}</h2><button aria-label="${discussionText('إغلاق','Close')}" class="close-sheet" onclick="closeSheet()">×</button></div>${body}</div>`;document.body.appendChild(sheet);document.querySelector('.shell')?.setAttribute('inert','');document.querySelector('.utility-bar')?.setAttribute('inert','');document.querySelector('.player-dock')?.setAttribute('inert','');sheet.querySelector('.close-sheet').focus();
 sheet.addEventListener('keydown',event=>{
 if(event.key==='Escape'){event.preventDefault();closeSheet();return;}
 if(event.key!=='Tab')return;
 const items=[...sheet.querySelectorAll('button,input,textarea,select,a[href],[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
 const first=items[0],last=items.at(-1);
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 });}
let confirmSheetCallback=null;
function confirmSheet(message, callback) {
  confirmSheetCallback=callback;
  openSheet(discussionText('تأكيد','Confirm'), `<p class="confirm-sheet-msg">${message}</p><div class="actions confirm-sheet-actions"><button class="btn wide" type="button" onclick="closeConfirmSheet()">${discussionText('إلغاء','Cancel')}</button><button class="btn red wide" type="button" onclick="runConfirmSheet()">${discussionText('تأكيد','Confirm')}</button></div>`);
}
function runConfirmSheet(){const cb=confirmSheetCallback;confirmSheetCallback=null;closeSheet();cb?.();}
function closeConfirmSheet(){confirmSheetCallback=null;closeSheet();}
function openWill(){openSheet('📜 وصيتي',`<p class="muted">اكتب ملاحظاتك. تظهر وصيتك بعد موتك إذا كان كشف الأدوار مفعّلًا.</p><label for="willText">${discussionText('وصيتك','Your will')}</label><textarea class="input will-input" id="willText" maxlength="500">${escapeHtml(game.me.willText||'')}</textarea><button class="btn red wide" onclick="saveWill()">حفظ الوصية</button>`)}
async function saveWill(){try{game=await api({action:'saveWill',code:game.code,id:playerId,playerToken,text:$('#willText').value});closeSheet();renderPlayer()}catch{notice('تعذر حفظ الوصية')}}
let unreadChat=false,chatNoticeAt=0,chatNoticePending=false;
function chatReadKey(){return `mafia-chat-read-${game?.code}-${playerId}-${game?.round}-${game?.me?.jailed||game?.me?.role==='jailer'?'jail':'mafia'}`;}
function chatHasUnread(){return unreadChat&&chatAllowed();}
function chatButtonLabel(unread=false){return `💬 ${discussionText('محادثة','Chat')}${unread?' •':''}`;}
function paintChatDock(){
  const unread=chatHasUnread();
  for(const button of document.querySelectorAll('[data-chat-button]')){
    if(button.classList.contains('dock-item')){
      button.classList.toggle('has-unread',unread);
      const badge=button.querySelector('.dock-badge');
      if(badge)badge.hidden=!unread;
      const label=button.querySelector('span:not(.dock-icon)');
      if(label)label.textContent=discussionText('محادثة','Chat');
      button.disabled=!chatAllowed();
      button.classList.toggle('dock-chat-on',chatAllowed());
    }else button.textContent=`${unread?'🔴 ':''}💬 ${dockChatLabel()}`;
  }
}
function markChatRead(messages){const latest=messages?.at(-1);if(latest)localStorage.setItem(chatReadKey(),String(latest.id));unreadChat=false;paintChatDock();}
async function pollChatNotification(){
 if(!chatAllowed()||document.querySelector('.chat-list')||chatNoticePending||Date.now()-chatNoticeAt<5000)return;
 chatNoticeAt=Date.now();chatNoticePending=true;const key=chatReadKey(),epoch=pollingEpoch;
 try{const result=await api({action:'messages',code:game.code,id:playerId,playerToken});
  if(epoch!==pollingEpoch||key!==chatReadKey()||!chatAllowed())return;
  const seen=Number(localStorage.getItem(key)||0);
  unreadChat=(result.messages||[]).some(m=>Number(m.id)>seen&&m.author_id!==playerId);
  paintChatDock();
 }catch{}finally{chatNoticePending=false;}
}
let chatCache=[],chatOlderCursor=null,chatHasOlder=false,chatLoadingOlder=false;
let chatTimer;
let chatEpoch = 0;
let chatSending = false;
let chatRevision = 0;
function stopChatPolling(){clearTimeout(chatTimer);chatEpoch++;}
function chatAllowed(){return game?.me?.alive && (game.me.jailed||['mafia','mafia_boss','jailer'].includes(game.me.role)) && (game.phase==='night' || (game.phase==='paused' && game.enabledRoles?.paused_phase==='night'));}
function chatMessageHtml(messages){return messages.map(m=>`<div class="chat-message"><b data-no-translate>${escapeHtml(m.author_name)}</b><span data-no-translate>${escapeHtml(m.content)}</span></div>`).join('')||`<p>${discussionText('ابدأ المحادثة.','Start the conversation.')}</p>`;}
function updateChatMessages(result,older=false){
 const list=document.querySelector('.chat-list');if(!list)return;
 const merged=new Map(chatCache.map(m=>[String(m.id),m]));
 for(const message of result.messages||[])merged.set(String(message.id),message);
 chatCache=[...merged.values()].sort((a,b)=>Number(a.id)-Number(b.id));
 if(older||chatOlderCursor===null){chatOlderCursor=result.nextCursor;chatHasOlder=result.hasMore===true;}
 const more=document.querySelector('[data-chat-older]');if(more)more.hidden=!chatHasOlder;
 if(!older)markChatRead(result.messages);
 const signature=JSON.stringify(chatCache);if(list.dataset.messages===signature)return;
 const atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<60;
 list.innerHTML=chatMessageHtml(chatCache);list.dataset.messages=signature;
 if(atBottom)list.scrollTop=list.scrollHeight;
}
function startChatPolling(){
 const epoch=chatEpoch;
 const tick=async()=>{
  if(epoch!==chatEpoch||!document.querySelector('.chat-list'))return;
  if(!chatAllowed()){closeSheet();return;}
  const revision=chatRevision;
  try{
   if(!chatSending){
    const result=await api({action:'messages',code:game.code,id:playerId,playerToken});
    if(epoch!==chatEpoch||revision!==chatRevision)return;
    updateChatMessages(result);
    const status=document.querySelector('.chat-status');if(status)status.textContent='';
   }
  }catch(error){
   if(epoch!==chatEpoch)return;
   if(['UNAUTHORIZED','INVALID_ACTION'].includes(error.code)){closeSheet();return;}
   const status=document.querySelector('.chat-status');if(status)status.textContent=discussionText('انقطع الاتصال، نحاول نرجع…','Reconnecting…');
  }finally{if(epoch===chatEpoch&&document.querySelector('.chat-list'))chatTimer=setTimeout(tick,1000);}
 };
 chatTimer=setTimeout(tick,1000);
}
async function openChat(){
 stopChatPolling();const epoch=chatEpoch;
 try{const result=await api({action:'messages',code:game.code,id:playerId,playerToken});if(epoch===chatEpoch&&chatAllowed())renderChatSheet(result)}catch{notice(discussionText('المحادثة غير متاحة الآن','Chat is unavailable right now'))}
}
function renderChatSheet(result){
 chatCache=[];chatOlderCursor=null;chatHasOlder=false;
 const label=result.channel==='mafia'?discussionText('🔪 محادثة المافيا','🔪 Mafia chat'):discussionText('🔐 محادثة السجن','🔐 Jail chat');
 openSheet(label,`<button class="btn" data-chat-older data-no-translate onclick="loadOlderChat()">${discussionText('رسائل أقدم','Older messages')}</button><div class="chat-list" tabindex="0" role="region" aria-label="${discussionText('رسائل المحادثة','Chat messages')}" aria-live="polite"></div><p class="chat-status" data-no-translate role="status"></p>${game.me.muted?`<div class="status wait">${discussionText('تم كتمك بواسطة المضيف','You were muted by the host')}</div>`:`<div class="chat-compose"><input class="input" id="chatText" maxlength="240" placeholder="${discussionText('اكتب رسالة','Write a message')}"><button class="btn red" id="chatSend" onclick="sendChat()">${discussionText('إرسال','Send')}</button></div>`}`);
 updateChatMessages(result);const list=document.querySelector('.chat-list');list.scrollTop=list.scrollHeight;
 document.querySelector('#chatText')?.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();sendChat();}});
 startChatPolling();
}
async function loadOlderChat(){
 if(chatLoadingOlder||!chatHasOlder||!chatOlderCursor)return;
 chatLoadingOlder=true;const epoch=chatEpoch;const button=document.querySelector('[data-chat-older]');if(button)button.disabled=true;
 try{const result=await api({action:'messages',code:game.code,id:playerId,playerToken,beforeId:chatOlderCursor});
 if(epoch!==chatEpoch)return;const list=document.querySelector('.chat-list');const height=list?.scrollHeight||0,top=list?.scrollTop||0;
 updateChatMessages(result,true);if(list)list.scrollTop=top+list.scrollHeight-height;
 }catch{if(epoch===chatEpoch)notice(discussionText('تعذر تحميل الرسائل القديمة.','Could not load older messages.'));}
 finally{chatLoadingOlder=false;if(button)button.disabled=false;}
}
async function sendChat(){
 const input=$('#chatText'),text=input?.value.trim();if(!text||chatSending)return;
 chatSending=true;chatRevision++;const epoch=chatEpoch;const button=$('#chatSend');if(button)button.disabled=true;
 try{
  const result=await api({action:'sendMessage',code:game.code,id:playerId,playerToken,text});
  if(epoch!==chatEpoch)return;
  chatRevision++;updateChatMessages(result);if(input.value.trim()===text)input.value='';
  const list=document.querySelector('.chat-list');if(list)list.scrollTop=list.scrollHeight;
 }catch(error){if(epoch===chatEpoch)notice(error.code==='MUTED'?discussionText('تم كتمك بواسطة المضيف','You were muted by the host'):error.code==='RATE_LIMITED'?discussionText('انتظر لحظة وأعد الإرسال','Wait a moment and send again'):discussionText('تعذر إرسال الرسالة','Could not send the message'))}
 finally{chatSending=false;if(button)button.disabled=false;}
}
function openReport(){const targets=game.players.filter((p)=>p.id!==playerId);openSheet('🚩 إبلاغ المضيف',`<label for="reportTarget">${discussionText('اللاعب المعني','Player concerned')}</label><select class="input" id="reportTarget"><option value="">بلاغ عام</option>${targets.map((p)=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}</select><label for="reportReason">${discussionText('سبب البلاغ','Report reason')}</label><textarea class="input" id="reportReason" maxlength="160" placeholder="اكتب سبب البلاغ"></textarea><button class="btn danger wide" onclick="sendReport()">إرسال البلاغ</button>`)}
async function sendReport(){try{await api({action:'report',code:game.code,id:playerId,playerToken,target:$('#reportTarget').value,reason:$('#reportReason').value});closeSheet();notice('تم إرسال البلاغ للمضيف')}catch{notice('اكتب سببًا واضحًا للبلاغ')}}

function renderTrialPlayer(){
  $('#app').innerHTML=`<div class="card hero trial-stage"><div class="accused-name">${escapeHtml(nameOf(game.accusedPlayer))}</div><p id="trialTimerHint" class="status wait" hidden></p></div>`;
}
function renderVerdict(){
  const accused=game.accusedPlayer===playerId;
  const options=`<div class="verdict-grid choice-stack"><button class="pick execute" data-target="GUILTY" aria-pressed="false" onclick="castVote('GUILTY')">${discussionText('🔨 مذنب','🔨 Guilty')}</button><button class="pick innocent" data-target="INNOCENT" aria-pressed="false" onclick="castVote('INNOCENT')">${discussionText('🕊️ بريء','🕊️ Innocent')}</button></div>`;
  $('#app').innerHTML=`<div class="card hero"><div class="accused-name">${escapeHtml(nameOf(game.accusedPlayer))}</div>${accused||game.me.voted?'':options}</div>`;
}

function renderNight() {
  const me = game.me;
  if (game.round === 1 && me.role !== 'detective') {
    $('#app').innerHTML = `<div class="card wait-only"></div>`;
    return;
  }
  if (me.jailed) {
    $('#app').innerHTML = `<div class="card wait-only"></div>`;
    return;
  }
  if ((me.role === 'mafia' || me.role === 'mafia_boss') && me.mafiaLocked) {
    $('#app').innerHTML = `<div class="card hero"><div class="role-title">🔐 المافيا متوقفة</div><p>أحد أفراد المافيا مسجون، لذلك لا يوجد اغتيال هذه الليلة.</p></div>`;
    return;
  }
  if ((me.role === 'mafia' || me.role === 'mafia_boss') && game.enabledRoles?.mafia_kill_enabled === false) {
    const start=Number(game.enabledRoles?.mafia_kill_start_round)||0, delayed=start>game.round;
    $('#app').innerHTML = `<div class="card hero"><div class="role-title">🌙 ${delayed?'ليلة هادئة':'بدون اغتيال'}</div><p>${delayed?`يبدأ اغتيال المافيا من الليلة ${start}.`:'قرر المضيف أن هذه اللعبة لا تحتوي على اغتيال للمافيا.'}</p></div>`;
    return;
  }
  if (me.role === 'mafia' || me.role === 'mafia_boss') {
    const teamIds = new Set((me.mafiaTeam || []).map((x) => x.id));
    const targets = alivePlayers().filter((player) => !teamIds.has(player.id));
    $('#app').innerHTML = `<div class="card">${(me.mafiaTeam||[]).length?`<div class="status wait">${(me.mafiaTeam||[]).map((x)=>escapeHtml(x.name)).join('، ')}</div>`:''}${me.acted ? '' : `${choiceButtons(targets, 'nightAction', { icon: '🔪' })}<button class="pick skip" onclick="nightAction('SKIP')">⏭️ ${discussionText('تخطي','Skip')}</button>`}</div>`;
    return;
  }
  if (me.role === 'doctor') {
    if (!me.doctorAvailable) {
    $('#app').innerHTML = `<div class="card wait-only"></div>`;
      return;
    }
    const targets = alivePlayers().filter((player) => player.id !== me.doctorLastTarget);
    $('#app').innerHTML = `<div class="card" data-no-translate>${me.acted ? '' : `<h2>من ستحمي الليلة؟</h2>${choiceButtons(targets, 'nightAction', { icon: '🩺' })}`}</div>`;
    return;
  }
  if (me.role === 'revealer') {
    $('#app').innerHTML = `<div class="card" data-no-translate>${me.mafiaCountResult||me.acted?'':`<button class="btn wide" onclick="nightAction('COUNT')">${discussionText('استخدام الكشف','Use reveal')}</button><button class="btn wide" onclick="nightAction('SKIP')">${discussionText('لاحقاً','Later')}</button>`}</div>`;
    return;
  }
  if (me.role === 'detective') {
    const targets = alivePlayers().filter((player) => player.id !== playerId && !(me.selectedIds || []).includes(player.id));
    const finished = game.round > detectiveQuestionCount(game.detectiveQuestions);
    $('#app').innerHTML = `<div class="card" data-no-translate>${finished||me.acted?'':choiceButtons(targets, 'nightAction', { icon: '🔎' })}</div>`;
    return;
  }
  if (me.role === 'vigilante') {
    $('#app').innerHTML = `<div class="card wait-only"></div>`;
    return;
  }
  if (me.role === 'witch') {
    const targets = alivePlayers();
    $('#app').innerHTML = `<div class="card"><div class="role-title">${roleLabel('witch')}</div><p>🧪 الحياة: ${me.charges?.life ? 'متوفرة' : 'استُخدمت'} · ☠️ السم: ${me.charges?.poison ? 'متوفرة' : 'استُخدمت'}</p>${me.acted ? '<h2 class="ok">تم تسجيل الجرعة ✅</h2>' : `${me.charges?.life ? `<h2>جرعة الحياة</h2>${choiceButtons(targets, "witchAction.bind(null,'SAVE')", { icon: '💚' })}` : ''}${me.charges?.poison ? `<h2>جرعة السم</h2>${choiceButtons(targets.filter((p) => p.id !== playerId), 'confirmPoison', { icon: '☠️' })}` : ''}`}</div>`;
    return;
  }
  if (me.role === 'serial_killer') {
    const targets = alivePlayers().filter((player) => player.id !== playerId);
    $('#app').innerHTML = `<div class="card">${me.acted ? '' : `<h2>من ستقتل الليلة؟</h2>${choiceButtons(targets, 'nightAction', { icon: '🩸' })}`}</div>`;
    return;
  }
  if (me.role === 'cupid') {
    if (game.round !== 2) {
      $('#app').innerHTML = `<div class="card wait-only"></div>`;
      return;
    }
    const targets = alivePlayers().filter((player) => player.id !== playerId && !(me.selectedIds || []).includes(player.id));
    $('#app').innerHTML = `<div class="card"><div class="role-title">${roleLabel('cupid')}</div><h2>اختر حبيبين: ${(me.selectedIds || []).length} / 2</h2>${me.acted ? '<h2 class="ok">تم ربط مصيرهما 💘</h2>' : choiceButtons(targets, 'nightAction', { icon: '💘' })}</div>`;
    return;
  }
  if (me.role === 'escort') {
    const targets = alivePlayers().filter((player) => player.id !== playerId);
    $('#app').innerHTML = `<div class="card">${me.acted ? '' : `<h2>من ستعطّل الليلة؟</h2>${choiceButtons(targets, 'nightAction', { icon: '🚫' })}`}</div>`;
    return;
  }
  if (me.role === 'jailer') {
    if (!me.jailedPlayer || me.executionsLeft <= 0) {
      $('#app').innerHTML = `<div class="card wait-only"></div>`;
    } else {
    $('#app').innerHTML = `<div class="card hero"><div class="role-title">${roleLabel('jailer')}</div>${me.acted ? '' : `<h2>${discussionText('السجين','Prisoner')}: ${escapeHtml(me.jailedPlayer)}</h2><div class="actions" style="justify-content:center"><button class="btn green" onclick="nightAction('SPARE')">${discussionText('إطلاقه','Spare')}</button><button class="btn danger" onclick="confirmExecute()">${discussionText('إعدامه','Execute')}</button></div>`}</div>`;
    }
    return;
  }
  $('#app').innerHTML = `<div class="card wait-only"></div>`;
}

function firstNightOnly(){return game?.phase==='night'&&game.round===1}
function firstNightLabel(){return discussionText('الليلة الأولى: للمحقق فقط','First night: detective only')}
function roleActTitle(){
  const me=game?.me, phase=game?.phase;
  if(!me)return '';
  if(me.jailed&&phase==='night')return discussionText('السجن','Jail');
  if(phase==='night'){
    if(mafiaRoleClient(me.role))return discussionText('اغتيال','Kill');
    if(me.role==='doctor')return discussionText('حماية','Protect');
    if(me.role==='detective')return discussionText('فحص','Investigate');
    if(me.role==='witch')return discussionText('جرعة','Potion');
    if(me.role==='serial_killer')return discussionText('اغتيال','Kill');
    if(me.role==='cupid')return discussionText('ربط','Link');
    if(me.role==='escort')return discussionText('تعطيل','Block');
    if(me.role==='jailer')return discussionText('السجين','Prisoner');
    if(me.role==='revealer')return discussionText('كشف','Reveal');
    if(me.role==='vigilante')return discussionText('طلقة','Shot');
    return '';
  }
  if(phase==='day'){
    if(me.role==='detective')return discussionText('نتيجة الفحص','Investigation result');
    if(me.role==='jailer')return discussionText('سجن','Jail');
    if(me.role==='lawyer')return discussionText('حماية','Protect');
    return '';
  }
  if(phase==='nomination')return discussionText('ترشيح','Nominate');
  if(phase==='verdict')return discussionText('الحكم','Verdict');
  if(phase==='vote')return discussionText('تصويت','Vote');
  if(phase==='trial')return discussionText('المحاكمة','Trial');
  return '';
}
function wrapCyclePlay(cycle, actionHtml) {
  const isDay = cycle === 'day';
  const isNight = cycle === 'night';
  const view = typeof clientDiscussion === 'function' ? clientDiscussion() : {status:'off'};
  const draw = isDay && typeof openingDrawActive === 'function' && openingDrawActive(view);
  const talk = isDay ? discussionPanel(false) : '';
  const hasPick = /class="[^"]*\bpick\b/.test(actionHtml);
  const talkBlock = !talk ? '' : (draw ? talk : `<details class="cycle-talk" data-disclosure-key="cycle-talk"${hasPick?'':' open'}><summary>${discussionText('النقاش','Discussion')}</summary>${talk}</details>`);
  const extra = isNight || isDay ? bossDiscussionChoice() : '';
  const detectHits=(game.me?.investigationResults||[]).filter(r=>r.round===game.round);
  const detect=isDay&&game.me?.role==='detective'?investigationPanel():'';
  const action=extractDockAction(actionHtml);
  const votes=voteSummaryCard();
  const voteNeed=['nomination','vote','verdict','trial'].includes(game.phase);
  const abilityTitle=voteNeed?(detectHits.length?discussionText('نتيجة الفحص','Investigation result'):discussionText('قدرتي','Ability')):(roleActTitle()||discussionText('قدرتي','Ability'));
  const abilityBody=voteNeed?detect:[detect,extra,action].filter(Boolean).join('');
  const voteBody=voteNeed?[action,votes].filter(Boolean).join(''):votes;
  const auto=detectHits.length?'ability':(votes||voteNeed?'vote':(abilityBody?'ability':''));
  const key=[game.matchId,game.round,game.phase,detectHits.length,!!game.voteSummary].join('|');
  if(key!==dockAutoKey){dockAutoKey=key;pendingDockPlay.tab=auto;}
  pendingDockPlay={...pendingDockPlay,abilityTitle,abilityBody,voteBody};
  if(pendingDockPlay.tab!=='none'&&!pendingDockPlay.tab)pendingDockPlay.tab=auto;
  return `${phaseBar()}<div class="phase-play ${cycle}-play">${isDay?morningBriefPanel():''}${talkBlock}</div>`;
}
function morningBriefPanel(embedded=false) {
  const deaths = (game.lastDeaths || []).map((id) => `<div class="event danger-text">☠️ ${escapeHtml(nameOf(id))}</div>`).join('');
  const body = `${eventCards()}${deaths || `<div class="status">${discussionText('لم يمت أحد','Nobody died')}</div>`}`;
  return `<section class="${embedded?'morning-brief':'card morning-brief'}" data-no-translate><h2>${discussionText('نتائج الليل','Night results')}</h2>${body}</section>`;
}
function investigationPanel() {
  const results=(game.me?.investigationResults||[]).filter(r=>r.round===game.round);
  return `<section class="card" data-no-translate><h2>${discussionText('نتائج التحقيق','Investigation results')}</h2>${results.map(r=>`<p><b>${escapeHtml(r.name)}</b>: ${investigationResultLabel(r.result)}</p>`).join('')||`<p>${(game.round>detectiveQuestionCount(game.detectiveQuestions)?discussionText('انتهت فرص التحقيق المحددة.','Your investigation rounds are over.'):discussionText('لا توجد نتيجة هذه الليلة؛ قد تكون القدرة معطّلة أو لم يُسجّل اختيار.','No result tonight; your ability may have been blocked or no choice was recorded.'))}</p>`}</section>`;
}
function renderDay() {
  const me = game.me;
  if (me.role === 'jailer') {
    const targets = alivePlayers().filter((player) => player.id !== playerId);
    $('#app').innerHTML = `<div class="card">${me.jailerSelected ? '' : `<h2>من ستسجن الليلة؟</h2>${choiceButtons(targets, 'jailPlayer', { icon: '🔐' })}`}</div>`;
    return;
  }
  if (me.role === 'lawyer') {
    $('#app').innerHTML = `<div class="card">${me.acted ? '' : `<h2>من ستحمي من التصويت؟</h2>${choiceButtons(alivePlayers(), 'lawyerProtect', { icon: '⚖️' })}`}</div>`;
    return;
  }
  $('#app').innerHTML = '';
}
function renderVote() {
  const me = game.me;
  const targets = alivePlayers().filter((player) => player.id !== playerId);
  const nomination=game.phase==='nomination';
  $('#app').innerHTML = `<div class="card">${me.voted?'':`<h2>${nomination?discussionText('من تريد محاكمته؟','Who should stand trial?'):discussionText('اختر لاعبًا','Choose a player')}</h2>`}${choiceButtons(targets,'castVote')}${game.enabledRoles?.allow_no_vote?`<button class="pick skip" onclick="castVote('SKIP')">✋ ${discussionText('تخطي','Skip')}</button>`:''}</div>`;
}

let actionFeedback = null;
let playerActionPending = false;
function actionContext(){return [game?.code,game?.matchId,game?.round,game?.phase,playerId].join(':');}
function paintActionFeedback(){
  document.getElementById('actionFeedback')?.remove();
  if(!actionFeedback || actionFeedback.context!==actionContext())return;
  const {state,target}=actionFeedback;
  const displayTarget=target.replace(/^(SAVE|POISON):/,'');
  const label=game.players.find(p=>p.id===displayTarget)?.name || ({SKIP:discussionText('تخطي','Skip'),GUILTY:discussionText('مذنب','Guilty'),INNOCENT:discussionText('بريء','Innocent')})[target] || '';
  const message=state==='pending'?discussionText('جاري إرسال الاختيار…','Sending choice…'):state==='success'?discussionText('✓ تم تسجيل اختيارك','✓ Choice recorded'):discussionText('تعذر تأكيد الإرسال. تحقق من الاتصال والحالة قبل المحاولة مجددًا.','Could not confirm delivery. Check your connection and current state before trying again.');
  const card=document.createElement('p');card.id='actionFeedback';card.className='status action-feedback '+state;card.setAttribute('role',state==='error'?'alert':'status');card.setAttribute('data-no-translate','');card.textContent=message+(label?' — '+label:'');
  document.querySelector('#app .phase-bar')?.insertAdjacentElement('afterend',card) || document.getElementById('app').prepend(card);
  for(const button of document.querySelectorAll('#app .pick')){
    button.disabled=state==='pending';
    if(button.dataset.target)button.setAttribute('aria-pressed',String(button.dataset.target===displayTarget));
  }
}
async function playerAction(action, target) {
  if(playerActionPending)return;
  const context=actionContext();
  playerActionPending=true;actionFeedback={context,target,state:'pending'};paintActionFeedback();
  try {
    const next = await api({ action, code: game.code, id: playerId, playerToken, target });
    if(context!==actionContext())return;
    game=next;actionFeedback={context,target,state:'success'};
    renderPlayer();
  } catch (error) {
    if(context===actionContext()){actionFeedback={context,target,state:'error'};paintActionFeedback();}
  } finally {playerActionPending=false;}
}
function nightAction(target) { return playerAction('act', target); }
function confirmShot(target){confirmSheet(discussionText('استخدام طلقتك الوحيدة على هذا اللاعب؟','Use your only shot on this player?'),()=>nightAction(target))}
function confirmPoison(target){confirmSheet(discussionText('استخدام جرعة السم على هذا اللاعب؟','Use poison on this player?'),()=>witchAction('POISON',target))}
function confirmExecute(){confirmSheet(discussionText('تأكيد إعدام السجين؟ سيتم خصم إعدام واحد.','Execute the prisoner? One execution will be used.'),()=>nightAction('EXECUTE'))}
function witchAction(type, target) { return nightAction(`${type}:${target}`); }
function jailPlayer(target) { return playerAction('jail', target); }
function lawyerProtect(target) { return playerAction('lawyerProtect', target); }
function castVote(target) { return playerAction('vote', target); }

home();

function eliminationNotice() {
  const causes = {
    mafia_kill:['اغتيال المافيا','Killed by Mafia'], vote_eliminated:['الاستبعاد بالتصويت','Voted out'], trial_guilty:['حكم التصويت بالإدانة','Voted guilty'],
    vigilante_kill:['طلقة القناص الأخيرة','Sniper final shot'], serial_kill:['اغتيال القاتل المتسلسل','Killed by Serial Killer'], witch_poison:['سم الساحرة','Witch poison'],
    jailer_executed:['إعدام السجّان','Jailer execution'], lovers_died:['الارتباط بلاعب مستبعد','Linked partner eliminated'], host_expelled:['استبعاد من المضيف','Expelled by host'], eliminated:['الاستبعاد','Eliminated']
  };
  const rows=(game?.eliminations||[]).map(p=>{const label=causes[p.reason]||causes.eliminated;return `<p><b>${escapeHtml(p.name)}</b> — ${discussionText(...label)}${p.detail?`: ${escapeHtml(p.detail)}`:''}</p>`;}).join('');
  return rows?`<section id="eliminationNotice" class="card elimination-notice" role="status" data-no-translate><b>${discussionText('المستبعدون','Eliminated players')}</b>${rows}</section>`:'';
}
function renderPendingShot(controller=false) {
  const shot=game?.pendingShot;
  if(!shot || game.phase==='finished')return false;
  removePlayerChrome();
  if(document.querySelector('.game-sheet'))closeSheet();
  if(shot.resolving){$('#app').innerHTML=`<section class="card" data-no-translate><p>${discussionText('جاري تنفيذ الطلقة الأخيرة…','Resolving the final shot…')}</p>${shot.target?`<button class="btn" onclick="takeLastShot(${jsArg(shot.target)})">${discussionText('إعادة المحاولة إذا تأخر التنفيذ','Retry if resolution stalls')}</button>`:''}</section>`;return true;}
  const canShoot=game.me?.id===shot.playerId || (controller&&game.players.find(p=>p.id===shot.playerId)?.isBot);
  $('#app').innerHTML=`<section class="card hero" data-no-translate><h2>${discussionText('🎯 طلقة القناص الأخيرة','🎯 Sniper final shot')}</h2><p>${escapeHtml(nameOf(shot.playerId))}</p>${canShoot?`<p>${discussionText('اختر لاعبًا حيًا لطلقتك الأخيرة، وبعدها تتابع فقط.','Choose a living player for your final shot, then spectate.')}</p>${choiceButtons(alivePlayers(),'takeLastShot',{icon:'🎯'})}`:`<p>${discussionText('بانتظار اختيار القناص قبل مواصلة اللعبة.','Waiting for the sniper before the game continues.')}</p>`}${canShoot||controller?`<button class="btn wide" onclick="takeLastShot('SKIP')">${discussionText('تخطي الطلقة ومواصلة اللعبة','Skip shot and continue')}</button>`:''}</section>`;
  return true;
}
async function takeLastShot(target) {
  const shotId=game?.pendingShot?.id;
  if(!shotId)return;
  const prompt=target==='SKIP'?discussionText('تخطي الطلقة نهائيًا؟','Permanently skip the shot?'):discussionText('تأكيد الطلقة الأخيرة على ','Confirm final shot at ')+nameOf(target)+'؟';
  if(!confirm(prompt))return;
  try {
    game=await withBusy(discussionText('جاري تثبيت الاختيار…','Saving choice…'),()=>api({action:'lastShot',code:game.code,id:playerId,playerToken,hostToken,shotId,target}));
    (hostToken||delegatedHostMode)?renderHost():renderPlayer();
  } catch { notice(discussionText('تعذّر تثبيت الاختيار. حدّث الحالة وحاول مجددًا.','Could not save the choice. Refresh and try again.')); }
}
async function electMafiaLeader(target){
  try{game=await api({action:'electMafiaLeader',code:game.code,id:playerId,playerToken,target});renderPlayer();}catch{notice(discussionText('تعذر تسجيل اختيار الزعيم، حاول مرة ثانية.','Could not record your leader vote.'));}
}
function resignOfferKey(){return `mafia-resign:${game?.matchId||game?.code||''}:${playerId}`;}
function dismissResignOffer(){try{localStorage.setItem(resignOfferKey(),'done');}catch{}document.getElementById('leaderElectionCard')?.remove();}
async function resignMafiaLeader(){
 if(!confirm('التنازل وفتح تصويت سري لمدة 30 ثانية لاختيار زعيم بديل؟'))return;
 dismissResignOffer();
 await electMafiaLeader('RESIGN');
}
function leaderElectionCard(){
 if(!game?.me?.alive||!roleAcknowledged()||['lobby','finished','paused'].includes(game.phase))return '';
 if(game.me.leaderElection){
  const ended=Date.now()+discussionClockOffset>=game.me.leaderDeadline;
  return `<section id="leaderElectionCard" class="card"><h2>اختيار زعيم المافيا الجديد</h2><p>تصويت سري بعد التنازل. الأكثر أصواتًا يصبح الزعيم، والتعادل بقرعة. تنتهي المهلة خلال 30 ثانية، وتبقى القيادة الحالية حتى حسم البديل.</p>${ended?'<button class="btn gold" onclick="electMafiaLeader(&quot;FINALIZE&quot;)">حسم التصويت وتحديث الكروت</button>':game.me.leaderVote?'<p>تم تسجيل صوتك. بانتظار بقية الفريق.</p>':choiceButtons((game.me.mafiaTeam||[]).filter(p=>p.id!==game.me.leaderFormer&&p.alive!==false),'electMafiaLeader',{icon:'👑'})}</section>`;
 }
 if(game.me.role!=='mafia_boss'||!(game.me.mafiaTeam||[]).some(p=>p.id!==game.me.id&&p.alive!==false))return '';
 if(localStorage.getItem(resignOfferKey())==='done')return '';
 return `<section id="leaderElectionCard" class="card" data-no-translate><button class="btn red wide" onclick="resignMafiaLeader()">التنازل عن القيادة</button><button class="btn wide" type="button" onclick="dismissResignOffer()">${discussionText('إخفاء — يظهر مرة واحدة','Hide — shown once')}</button></section>`;
}
function voteSummaryCard() {
  const summary=game?.voteSummary;
  if(!summary)return '';
  const label=name=>summary.phase==='verdict'?(name==='GUILTY'?discussionText('مذنب','Guilty'):discussionText('بريء','Innocent')):name;
  return `<section id="voteSummaryNotice" class="card" data-no-translate><h3>${discussionText('نتائج التصويت — الجولة','Voting results — round')} ${escapeHtml(summary.round)}</h3>${summary.counts.map(item=>`<div style="display:flex;justify-content:space-between;gap:16px;padding:6px 0"><b>${escapeHtml(label(item.name))}</b><strong>${escapeHtml(item.count)}</strong></div>`).join('')}<div style="display:flex;justify-content:space-between;gap:16px;padding:6px 0"><b>${discussionText('ما صوّت','Did not vote')}</b><strong>${escapeHtml(summary.abstained)}</strong></div></section>`;
}
function renderWithNotices(content,controller=false) {
  const app=$('#app'), focused=document.activeElement;
  const focusPhase=[game?.matchId,game?.phase,game?.round].join('|');
  const keepFocus=app?.dataset?.focusPhase===focusPhase&&app.contains(focused)&&focused?.matches('button,[role="button"]');
  const focusAttributes=['id','onclick','data-target','aria-label'];
  const focusValues=keepFocus?focusAttributes.map(name=>focused.getAttribute(name)):null;
  const sameControl=element=>element.tagName===focused.tagName&&focusAttributes.every((name,index)=>element.getAttribute(name)===focusValues[index]);
  const focusIndex=keepFocus?[...app.querySelectorAll('button,[role="button"]')].filter(sameControl).indexOf(focused):-1;
  const disclosures = new Map([...app.querySelectorAll('details[data-disclosure-key]')].map(element => [element.dataset.disclosureKey, element.open]));
  try { if(!renderPendingShot(controller))content(); }
  finally {
    for (const element of app.querySelectorAll('details[data-disclosure-key]')) {
      if (disclosures.has(element.dataset.disclosureKey)) element.open = disclosures.get(element.dataset.disclosureKey);
    }
    if(!roleAcknowledged() && !controller)return;
    if(game?.me?.isHost && !controller && !document.getElementById('controllerNotice'))$('#app').insertAdjacentHTML('afterbegin','<section id="controllerNotice" class="status"><p>👑 أنت تدير الغرفة الآن.</p><button class="btn" onclick="toggleDelegatedHost()">فتح تحكم المضيف</button></section>');
    if(!document.getElementById('leaderElectionCard'))$('#app').insertAdjacentHTML('afterbegin',leaderElectionCard());
    if(game?.me?.alive&&game.me.mafiaCountResult&&!document.getElementById('revealerResult')){const result=game.me.mafiaCountResult;$('#app').insertAdjacentHTML('afterbegin',`<section id="revealerResult" class="card" data-no-translate><h3>${discussionText('📡 نتيجة كشف الجولة','📡 Reveal result, round')} ${escapeHtml(result.round)}</h3><p>${discussionText('عدد المافيا الباقين عند إعلان الصباح','Mafia alive at dawn')}: <strong>${escapeHtml(result.count)}</strong></p></section>`);}
    if(controller && !document.getElementById('voteSummaryNotice'))$('#app').insertAdjacentHTML('afterbegin',voteSummaryCard());
    if(!document.getElementById('eliminationNotice'))$('#app').insertAdjacentHTML('afterbegin',eliminationNotice());
    if(game?.me?.alive && game.me.warnings?.length && !controller && !document.getElementById('hostWarningNotice')){const warning=game.me.warnings.at(-1);$('#app').insertAdjacentHTML('afterbegin',`<section id="hostWarningNotice" class="status wait" role="alert" data-no-translate><b>${discussionText('⚠️ إنذار من المضيف','⚠️ Warning from the host')}</b><p>${escapeHtml(warning.reason)}</p></section>`);}
    if(game?.me?.promotedBoss&&!controller&&!document.getElementById('bossPromotionNotice'))$('#app').insertAdjacentHTML('afterbegin',`<div id="bossPromotionNotice" class="status" data-no-translate>${discussionText('👑 انتقلت لك زعامة المافيا. قرار الاغتيال النهائي عندك.','👑 You are now Mafia Boss. Your kill choice is final.')}</div>`);
    if(keepFocus&&!focused.isConnected&&document.activeElement===document.body){
      const replacement=[...app.querySelectorAll('button,[role="button"]')].filter(sameControl)[focusIndex];
      if(replacement&&!replacement.disabled&&!replacement.closest('[inert]')&&replacement.getClientRects().length)replacement.focus({preventScroll:true});
    }
    if(app?.dataset)app.dataset.focusPhase=focusPhase;
  }
}
function renderPlayer(){
  setShowingRole(!!(game?.me?.alive && !roleAcknowledged() && !['lobby','finished'].includes(game.phase)));
  renderWithNotices(renderPlayerContent);
  if(!roleAcknowledged())return;
  enhanceJourney(false);
}
function setupSummary(roles, showCounts = true){
  const counts=[['mafia',roles.mafia],['doctor',roles.doctor],['detective',roles.detectives],['lawyer',roles.lawyer],['jailer',roles.jailer],['vigilante',roles.vigilante],['witch',roles.witch],['serial_killer',roles.serialKiller],['jester',roles.jester],['cupid',roles.cupid],['escort',roles.escort],['revealer',roles.revealer],['citizen',roles.citizens]];
  return `<section class="setup-summary"><h2 data-no-translate>${discussionText('ملخص المباراة قبل التوزيع','Review before dealing')}</h2><p data-no-translate>${discussionText('اللاعبون','Players')}: <b>${game.players.length}</b> · ${discussionText('مهلة المرحلة','Phase time')}: <b>${phaseDuration}</b> ${discussionText('ثانية','seconds')}</p>${showCounts ? `<ul>${counts.filter(([,count])=>count>0).map(([role,count])=>`<li>${roleLabel(role)} <b>× ${count}</b></li>`).join('')}</ul>` : ''}<p data-no-translate>${discussionText('بعد التوزيع يقرأ الجميع أدوارهم ويؤكدونها، ثم تبدأ الليلة الأولى للمحقق فقط.','After dealing, everyone reads and confirms their role. The first night is for detectives only.')}</p></section>`;
}
function showMatchTools(){
  openSheet(discussionText('إدارة المباراة','Game management'),`<div data-no-translate><button class="btn gold wide" onclick="returnToLobby()">${discussionText('إيقاف والرجوع للوبي','Stop and return to lobby')}</button><p class="muted">${discussionText('وقف القيم، يدخل أو يطلع أحد، وبعدين تبدأ قيم جديد بنفس الغرفة.','Stop the match, add or remove players, then start a new game in the same room.')}</p><button class="btn wide" onclick="showModeration()">${discussionText('اللاعبون والبلاغات','Players and reports')}</button><section class="danger-zone"><h3>${discussionText('إنهاء نهائي','End permanently')}</h3><p>${discussionText('للاستراحة استخدم الإيقاف المؤقت. الإنهاء ينهي المباراة الحالية بدون رجوع للوبي.','Use Pause for a break. Ending closes this match without returning to the lobby.')}</p><button class="btn danger wide" onclick="endGame()">${discussionText('إنهاء المباراة','End match')}</button></section></div>`);
}
function controllerTaskHint() {
  const messages = {
    lobby: ['شارك كود الغرفة، اختر التشكيلة، ثم راجع الملخص قبل التوزيع.', 'Share the room code, choose a preset, then review before dealing.'],
    reveal: [`بانتظار تأكيد ${Math.max(0,game.players.length-(game.roleReadyCount||0))} لاعب. يبدأ الليل عند تأكيد الجميع.`, `Waiting for ${Math.max(0,game.players.length-(game.roleReadyCount||0))} players. Night can begin when everyone confirms.`],
    night: firstNightOnly() ? ['الليلة الأولى: للمحقق فقط. أعلن الصباح بعد فحص المحقق أو انتهاء المهلة.', 'First night: detective only. Announce morning after the investigation or the timer.'] : ['أعلن الصباح بعد اكتمال اختيارات الليل أو انتهاء المهلة.', 'Announce morning when night choices complete or time runs out.'],
    day: ['راجع نتائج الليل، أدر النقاش، ثم ابدأ التصويت بعد اكتمال أفعال النهار.', 'Review night results, run discussion, then start voting after day actions complete.'],
    nomination: ['اختر المتهم بعد اكتمال الترشيحات أو انتهاء المهلة.', 'Resolve the accused when nominations complete or time runs out.'],
    trial: ['اترك وقت الدفاع للمتهم، ثم انتقل للحكم عند انتهاء الوقت.', 'Let the accused defend, then move to verdict when time ends.'],
    verdict: ['أعلن الحكم بعد اكتمال الأصوات أو انتهاء المهلة.', 'Reveal the verdict when votes complete or time runs out.'],
    vote: ['اكشف نتيجة التصويت بعد اكتمال الأصوات أو انتهاء المهلة.', 'Reveal voting results when votes complete or time runs out.'],
  };
  return messages[game.phase] ? discussionText(...messages[game.phase]) : '';
}
function playerTaskHint() {
  const me=game?.me;
  if(!me)return '';
  if(game.phase==='reveal')return roleAcknowledged()?discussionText('تم تأكيد دورك. انتظر بداية الليل.','Your role is confirmed. Wait for night to begin.'):'';
  if(game.phase==='paused')return discussionText('المباراة متوقفة. انتظر المضيف ليستكملها.','The match is paused. Wait for the host to resume.');
  if(game.phase==='night') {
    if(game.round===1&&me.role!=='detective')return firstNightLabel();
    if(me.jailed)return discussionText('أنت مسجون؛ قدرتك متوقفة هذه الليلة. انتظر قرار السجّان.','You are jailed; your ability is blocked tonight. Wait for the Jailer.');
    if(me.acted)return discussionText('تم تسجيل اختيارك. انتظر إعلان الصباح.','Your choice is recorded. Wait for morning.');
    if(mafiaRoleClient(me.role))return discussionText('اختر هدف الاغتيال أو تخطَّ الليلة.','Choose a kill target or skip tonight.');
    if(me.role==='doctor')return me.doctorAvailable?discussionText('اختر لاعبًا لتحميه هذه الليلة.','Choose one player to protect tonight.'):discussionText('حمايتك تبدأ من الليلة الثانية. انتظر الصباح.','Your protection starts on night two. Wait for morning.');
    if(me.role==='detective')return game.round>detectiveQuestionCount(game.detectiveQuestions)?discussionText('انتهت فرص التحقيق. انتظر الصباح.','Your investigations are over. Wait for morning.'):discussionText('اختر لاعبًا واحدًا لفحصه؛ النتيجة تظهر صباحًا.','Choose one player to investigate; the result appears in the morning.');
    if(['witch','serial_killer','cupid','escort'].includes(me.role))return discussionText('اختر هدف قدرتك لهذه الليلة.','Choose your ability target tonight.');
    if(me.role==='jailer')return me.jailedPlayer&&me.executionsLeft>0?discussionText('قرر مصير السجين: عفو أو إعدام.','Decide the prisoner’s fate: spare or execute.'):discussionText('لا يوجد قرار ليلي الآن. انتظر الصباح.','No night decision now. Wait for morning.');
    return discussionText('لا توجد قدرة ليلية لك الآن. انتظر الصباح.','You have no night action now. Wait for morning.');
  }
  if(game.phase==='day') {
    if(me.role==='jailer')return me.jailerSelected?discussionText('تم اختيار السجين. شارك في النقاش وانتظر التصويت.','Prisoner selected. Join discussion and wait for voting.'):discussionText('اختر لاعبًا ليسجن في الليلة القادمة.','Choose one player to jail tonight.');
    if(me.role==='lawyer')return me.acted?discussionText('تم تسجيل حماية التصويت. شارك في النقاش.','Vote protection recorded. Join discussion.'):discussionText('اختر لاعبًا لتحميه من نتيجة التصويت.','Choose one player to protect from voting.');
    return discussionText('شارك في النقاش وراقب التناقضات حتى يبدأ التصويت.','Join discussion and watch for contradictions until voting starts.');
  }
  if(game.phase==='nomination')return me.voted?discussionText('تم تسجيل ترشيحك ويمكنك تغييره حتى يعلن المضيف النتيجة.','Your nomination is saved and can be changed until resolved.'):discussionText('رشّح لاعبًا للمحاكمة أو اختر عدم الاختيار.','Nominate a player for trial or skip.');
  if(game.phase==='trial')return game.accusedPlayer===playerId?discussionText('أنت المتهم. دافع عن نفسك الآن.','You are accused. Defend yourself now.'):discussionText('استمع لدفاع المتهم وجهّز حكمك.','Listen to the accused and prepare your verdict.');
  if(game.phase==='verdict')return game.accusedPlayer===playerId?discussionText('أنت المتهم ولا تصوّت. انتظر الحكم.','You are accused and do not vote. Wait for the verdict.'):me.voted?discussionText('تم تسجيل حكمك ويمكنك تغييره حتى الإعلان.','Your verdict is saved and can be changed until reveal.'):discussionText('صوّت: مذنب أو بريء.','Vote: guilty or innocent.');
  if(game.phase==='vote')return me.voted?discussionText('تم تسجيل صوتك ويمكنك تغييره حتى كشف النتيجة.','Your vote is saved and can be changed until reveal.'):discussionText('اختر لاعبًا للاستبعاد أو اختر عدم الاختيار.','Choose a player to eliminate or skip.');
  return '';
}
function enhanceJourney(controller){
  if(!game)return;
  if(!document.querySelector('#app .phase-bar'))$('#app').insertAdjacentHTML('afterbegin',phaseBar());
  const hint=controller?controllerTaskHint():playerTaskHint();
  if(hint){const node=document.createElement('section');node.className='journey-hint next-action-hint';node.setAttribute('data-no-translate','');node.innerHTML=`<b>${discussionText('المطلوب الآن','Now')}</b><p>${escapeHtml(hint)}</p>`;document.querySelector('#app .phase-bar').insertAdjacentElement('afterend',node);}
  document.querySelectorAll('.setup-tabs button').forEach((button,index)=>{if(index+1===setupStep)button.setAttribute('aria-current','step');});
  paintActionFeedback();updatePhaseTimer();
}
function renderHost(){setShowingRole(false);renderWithNotices(renderHostContent,true);enhanceJourney(true);mountHostProgress();}
function renderSpectator(){renderWithNotices(renderSpectatorContent);}

function disciplineButtons(player) {
  return `<span class="discipline-actions" data-no-translate><button class="mini-action" aria-label="${discussionText('إنذار اللاعب','Warn player')}" onclick="openDiscipline(${jsArg(player.id)},'warnPlayer')">⚠️${player.warningCount||''}</button><button class="mini-action danger" aria-label="${discussionText('استبعاد اللاعب من القيم','Expel player from match')}" onclick="openDiscipline(${jsArg(player.id)},'expelPlayer')">⛔</button></span>`;
}
function openDiscipline(target,action) {
  const expel=action==='expelPlayer';
  openSheet(discussionText(expel?'⛔ استبعاد لاعب':'⚠️ إنذار لاعب',expel?'⛔ Expel player':'⚠️ Warn player'),`<div data-no-translate><p><b>${escapeHtml(nameOf(target))}</b></p><p>${discussionText(expel?'سيصبح متابعًا فقط. السبب يظهر للمشاركين.':'يظهر الإنذار لهذا اللاعب فقط.',expel?'They will become a spectator. The reason is shown to participants.':'Only this player sees the warning.')}</p><label for="disciplineReason">${discussionText('السبب','Reason')}</label><textarea id="disciplineReason" class="input" maxlength="160"></textarea><button class="btn ${expel?'danger':'gold'} wide" onclick="submitDiscipline(${jsArg(target)},'${action}')">${discussionText(expel?'تأكيد الاستبعاد':'إرسال الإنذار',expel?'Confirm expulsion':'Send warning')}</button><p id="disciplineError" role="status"></p></div>`);
}
async function submitDiscipline(target,action) {
  const reason=$('#disciplineReason')?.value.trim();
  if(!reason){$('#disciplineError').textContent=discussionText('اكتب السبب أولًا.','Enter a reason first.');return;}
  try {
    game=await withBusy(discussionText('جاري تنفيذ القرار…','Applying decision…'),()=>api({action,code:game.code,hostToken,id:playerId,playerToken,target,reason}));
    closeSheet();
    if(!hostToken&&!game.me?.isHost)delegatedHostMode=false;
    (hostToken||delegatedHostMode)?renderHost():renderPlayer();
  } catch { const error=$('#disciplineError');if(error)error.textContent=discussionText('تعذّر تنفيذ القرار؛ قد تكون حالة اللاعب تغيّرت. حاول مجددًا.','Could not apply the decision; the player state may have changed. Please retry.'); }
}

let hostProgressObserver;
function mountHostProgress() {
  hostProgressObserver?.disconnect();
  if (game?.phase !== 'lobby') return;
  const app = document.querySelector('#app');
  const lobby = true;
  const actions = {reveal:'beginNight',night:'resolveNight',day:'startVote',nomination:'resolveVote',trial:'advanceVerdict',verdict:'resolveVote',vote:'resolveVote',paused:'togglePause'};
  const handler = lobby ? (setupStep < 3 ? 'setSetupStep(' + (setupStep + 1) + ')' : 'startGame()') : actions[game?.phase] ? "hostAction('" + actions[game.phase] + "')" : '';
  const scope = app.querySelector(lobby ? '.setup-card' : '.hero');
  const primary = [...(scope?.querySelectorAll('button') || [])].find(button => !button.closest('.setup-tabs') && button.getAttribute('onclick') === handler);
  if (!primary) return;
  const dock = document.createElement('nav');
  dock.className = 'host-progress';
  dock.setAttribute('aria-label', discussionText('متابعة إعداد ومراحل المباراة','Game setup and phase controls'));
  dock.innerHTML = '<div class="host-progress-info" data-no-translate><strong id="hostProgressTitle"></strong><span id="hostProgressStatus" role="status"></span></div><div class="host-progress-actions"></div>';
  const controls = dock.querySelector('.host-progress-actions');
  if (lobby && setupStep > 1) {
    const back = document.createElement('button');
    back.type = 'button';back.className = 'btn host-progress-back';
    back.textContent = discussionText('رجوع','Back');
    back.setAttribute('data-no-translate','');
    back.setAttribute('onclick', 'setSetupStep(' + (setupStep - 1) + ')');
    controls.append(back);
    // The dock is the single place for setup navigation.
    for (const button of scope.querySelectorAll('button')) {
      if (button !== primary && !button.closest('.setup-tabs') && button.getAttribute('onclick') === 'setSetupStep(' + (setupStep - 1) + ')') button.remove();
    }
  }
  primary.dataset.progressPrimary = '';
  primary.setAttribute('aria-describedby','hostProgressStatus');
  controls.append(primary);
  app.append(dock);
  const measure = () => document.documentElement.style.setProperty('--host-progress-height', Math.ceil(dock.getBoundingClientRect().height) + 'px');
  hostProgressObserver = new ResizeObserver(measure);hostProgressObserver.observe(dock);
  updateHostProgress();measure();
}
function updateHostProgress() {
  const dock = document.querySelector('.host-progress');
  if (!dock || !game) return;
  const button = dock.querySelector('[data-progress-primary]');
  let title = phaseName(), status = '';
  if (game.phase === 'lobby') {
    title = discussionText(['','١ من ٣ · إعداد المباراة','٢ من ٣ · اختيار الأدوار','٣ من ٣ · جاهزية المباراة'][setupStep],['','1 of 3 · Game setup','2 of 3 · Select roles','3 of 3 · Ready to play'][setupStep]);
    const roles = roleDistribution();
    status = !roles.valid ? discussionText('الأدوار أكثر من اللاعبين؛ قلّل الأدوار.','Too many roles; reduce the selection.') : game.players.length < 2 ? discussionText('يلزم لاعبان على الأقل لبدء المباراة.','At least two players are needed to start.') : game.players.length < 6 ? discussionText(`${game.players.length} لاعبين · يفضّل 6 فأكثر لتجربة أفضل`,`${game.players.length} players · 6+ recommended for a better game`) : discussionText(game.players.length + ' لاعبين · عدد الأدوار مناسب',game.players.length + ' players · Role counts fit');
  } else if (game.phase === 'reveal') {
    status = discussionText('أكد دوره ' + (game.roleReadyCount || 0) + ' من ' + game.players.length,(game.roleReadyCount || 0) + ' of ' + game.players.length + ' roles confirmed');
  } else if (game.phase === 'paused') {
    status = discussionText('استكمل من المرحلة نفسها.','Resume from the same phase.');
  } else if (!button.disabled) {
    status = discussionText('جاهز للمتابعة','Ready to continue');
  } else if (game.phase === 'night') {
    status = discussionText('بانتظار اختيارات الليل أو انتهاء المهلة.','Waiting for night choices or the timer.');
  } else if (game.phase === 'day') {
    status = !clientDiscussion().complete ? discussionText('بانتظار انتهاء النقاش.','Waiting for discussion to finish.') : discussionText('بانتظار قدرات النهار أو انتهاء المهلة.','Waiting for day abilities or the timer.');
  } else {
    const total = Math.max(0, alivePlayers().length - (game.phase === 'verdict' ? 1 : 0));
    status = discussionText('صوّت ' + (game.voteCount || 0) + ' من ' + total + ' · بانتظار البقية أو المهلة',(game.voteCount || 0) + ' of ' + total + ' voted · Waiting for votes or timer');
  }
  for (const [selector,value] of [['#hostProgressTitle',title],['#hostProgressStatus',status]]) {
    const element = dock.querySelector(selector);
    if (element.textContent !== value) element.textContent = value;
  }
}
