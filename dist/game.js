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
function phaseName(phase = game?.phase) { return ({ lobby: 'الانتظار', reveal: 'كشف الأدوار', night: 'الليل', day: 'الصباح', nomination: 'الترشيح', trial: 'المحاكمة', verdict: 'الحكم', vote: 'التصويت', paused: 'متوقفة مؤقتًا', finished: 'النهاية' })[phase] || ''; }
function lobbyIcon(name){const paths={wait:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',admin:'<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/><path d="m8 12 3 3 5-6"/>',leave:'<path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4"/>',back:'<path d="M5 12h14m-6-6 6 6-6 6"/>'};return '<svg class="lobby-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>'}
function backFromLobby(){pollingEpoch++;clearTimeout(pollTimer);closeSheet();document.querySelector('.player-tools')?.remove();game=null;if(hostAccessToken)renderHostHome();else renderHostLogin()}
function phaseBar() { const controller=(hostToken||game?.me?.isHost)&&game;const live=controller&&!['lobby','finished'].includes(game.phase);const pause=live?`<button class="phase-pause" aria-label="${discussionText(game.phase==='paused'?'استكمال المباراة':'إيقاف مؤقت',game.phase==='paused'?'Resume game':'Pause game')}" onclick="hostAction('togglePause')">${game.phase==='paused'?'▶️':'⏸️'}</button>`:'';const admin=live?`<button class="phase-pause" aria-label="${discussionText('إدارة المباراة','Game management')}" onclick="showMatchTools()">🛡️</button>`:'';const back=delegatedHostMode?'<button class="phase-pause" onclick="toggleDelegatedHost()">👤</button>':'';return `<div class="phase-bar"><span class="phase-symbol">${game?.phase==='lobby'?lobbyIcon('wait'):phaseIcon()}</span><b class="phase-label">${phaseName()}</b>${game?.round ? `<small>الجولة ${game.round}</small>` : ''}${game&&!["lobby","finished"].includes(game.phase)?`<span class="phase-timer" id="phaseTimer" role="timer" aria-label="الوقت المتبقي / Time remaining">${phaseDuration}</span>`:''}${game?.phase==='lobby'?`<button class="phase-pause lobby-action lobby-back" onclick="backFromLobby()">${lobbyIcon('back')}<span>${discussionText('الرئيسية','Home')}</span></button>`:''}${pause}${admin}${hostToken?`<button class="phase-pause lobby-action" onclick="showAdminQR()" aria-label="وضع الأدمن الخاص">${lobbyIcon('admin')}<span>${discussionText('أدمن','Admin')}</span></button>`:''}${back}${!spectatorMode ? `<button class="phase-pause lobby-action lobby-exit" onclick="leaveRoom()" aria-label="مغادرة الغرفة">${lobbyIcon('leave')}<span>${discussionText('مغادرة','Leave')}</span></button>` : ""}</div>`; }
function clientPhaseRemaining() {
  const clock=game?.phaseClock;
  if(!clock||!Number.isFinite(clock.startedAt))return Infinity;
  return Math.max(0,clock.startedAt+clock.seconds*1000-(clock.pausedAt||Date.now()+discussionClockOffset));
}
function firstNightWithoutDetective(){return game?.phase==='night'&&game.round===1&&!game.players?.some(player=>player.alive&&player.role==='detective')}
function phaseTimeExpired(){return game?.phase!=='paused'&&clientPhaseRemaining()===0;}
function updatePhaseTimer() {
  for(const button of document.querySelectorAll('[data-timeout-action]')) {
    const action=button.dataset.timeoutAction;
    const ready=action==='resolveNight'?(game?.nightReady||firstNightWithoutDetective()):game?.voteCount>=Math.max(0,alivePlayers().length-(game.phase==='verdict'?1:0));
    button.disabled=!(ready||phaseTimeExpired());
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
async function shareRoom(){const url=`${location.origin}/game.html?room=${game.code}`;try{if(navigator.share)await navigator.share({title:'لعبة مافيا',text:`ادخل غرفة ${game.code}`,url});else{await copyText(url);alert('تم نسخ رابط الغرفة ✅')}}catch{}}
async function shareResult(){const text=`${winnerTitle().replace(/<[^>]*>/g,'')} — غرفة ${game.code}`;try{if(navigator.share)await navigator.share({title:'نتيجة لعبة مافيا',text,url:location.origin});else{await copyText(text);alert('تم نسخ النتيجة ✅')}}catch{}}
function warmApi() {
  if (apiWarmed) return;
  apiWarmed = true;
  // The first real request establishes the connection. An extra OPTIONS probe
  // duplicates browser-managed preflight and can keep startup network-idle open.
}
function setBusy(active, message = 'جاري التحميل… / Loading…') {
  busyCount = Math.max(0, busyCount + (active ? 1 : -1));
  let overlay = document.getElementById('busyOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'busyOverlay';
    overlay.className = 'busy-overlay';
    overlay.innerHTML = '<div class="busy-box" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span><strong></strong><small>لا تغلق الصفحة / Keep this page open</small></div>';
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
const roleNames = {
  mafia_boss: '👑 العرّاب (زعيم المافيا) / Godfather',
  mafia: '🔪 فرد المافيا / Mafioso',
  doctor: '🩺 الطبيب / Doctor',
  detective: '🕵️ المحقق / Detective',
  jailer: '🔐 السجّان / Jailer',
  lawyer: '⚖️ المحامي / Lawyer',
  vigilante: '🎯 القناص / Vigilante',
  witch: '🧪 الساحرة / Witch',
  serial_killer: '🩸 القاتل المتسلسل / Serial Killer',
  jester: '🃏 المهرج / Jester',
  revealer: '📡 الكاشف / Revealer',
  cupid: '💘 كيوبيد / Cupid',
  escort: '🚫 المعطّل / Escort',
  citizen: '🏘️ المواطن / Citizen',
};
const roleDescriptions = {
  mafia_boss: ['فريق المافيا', 'اختر هدف الاغتيال أو تخطَّ الليلة. قرارك هو النهائي.'],
  mafia: ['فريق المافيا', 'صوّت على هدف الاغتيال أو تخطَّ الليلة.'],
  doctor: ['فريق القرية', 'تحمي لاعبًا كل ليلة من الليلة الثانية حتى نهاية القيم، بدون حد للاستخدامات. تقدر تحمي نفسك، ولا تكرر نفس اللاعب ليلتين. / Protect one player every night from night two until the game ends, with unlimited uses. You may protect yourself, but not the same player on consecutive nights.'],
  detective: ['فريق القرية', 'افحص لاعبًا واحدًا كل جولة، بعدد جولات يحدده المضيف، واعرف سرًا إن كان مافيا أو بريئًا. / Investigate one player per round for the number of rounds set by the host. Results are private.'],
  jailer: ['فريق القرية', 'اختر سجينًا نهارًا، ثم قرر ليلًا إطلاقه أو إعدامه. لديك 3 إعدامات.'],
  lawyer: ['فريق القرية', 'احمِ أي لاعب من نتيجة التصويت في كل جولة.'],
  vigilante: ['فريق القرية', 'عند خروجك بالتصويت أو اغتيال المافيا، لك طلقة أخيرة على لاعب حي، ثم تتابع فقط. / If voted out or killed by Mafia, take one final shot at a living player, then spectate.'],
  witch: ['فريق القرية', 'لديك جرعة حياة وجرعة سم، وكل جرعة تُستخدم مرة واحدة.'],
  serial_killer: ['دور مستقل', 'اقتل لاعبًا كل ليلة؛ تفوز بعد زوال المافيا عندما تساوي بقية الأحياء أو تتفوق عليهم عددًا.'],
  jester: ['دور مستقل', 'تفوز وحدك إذا صوّت اللاعبون على استبعادك.'],
  revealer: ['فريق القرية', 'تكشف عدد المافيا الأحياء مرة واحدة بالقيم بدون أسماء. اختر الليلة من الليلة الثانية، وتظهر النتيجة بالصباح. / Reveal the surviving Mafia count once per game without names. Choose a night from night two; the result arrives in the morning.'],
  cupid: ['فريق القرية', 'في الليلة الثانية اربط لاعبين؛ موت أحدهما يميت الآخر.'],
  escort: ['فريق القرية', 'عطّل قدرة لاعب واحد خلال هذه الليلة.'],
  citizen: ['فريق القرية', 'راقب وصوّت لكشف المافيا.'],
};
const detailedRoleRules = {
 mafia_boss: ['فريق المافيا','تقود اختيار هدف الاغتيال وتتعاون سرًا مع أعضاء فريقك.','اختر لاعبًا حيًا من خارج المافيا أو تخطَّ الاغتيال. اختيار الزعيم القادر على العمل يتقدم على اختيارات بقية المافيا.','الليلة الأولى للمحقق فقط؛ بدء الاغتيال وتوفره لاحقًا يتبعان إعدادات الغرفة. ظهورك بريئًا للمحقق يعتمد على تفعيل تمويه العرّاب.'],
 mafia: ['فريق المافيا','تعاون مع فريقك سرًا، وناقش نهارًا لإبعاد الشك عنكم.','اختر هدفًا حيًا من خارج المافيا أو تخطَّ. يُعتمد اختيار الزعيم المتاح؛ وفي غيابه تُستخدم اختيارات الأعضاء لتحديد الهدف.','لا تستطيع استهداف عضو من المافيا. الاغتيال غير متاح في الليلة الأولى، ويتبع بعد ذلك إعدادات الغرفة.'],
 doctor: ['فريق القرية','تحمي لاعبًا من هجمات الليل، وقد تنقذ نفسك أو أحد أفراد القرية.','ابتداءً من الليلة الثانية اختر لاعبًا حيًا كل ليلة. الاستخدامات غير محدودة، ويمكنك اختيار نفسك.','لا تختَر اللاعب نفسه ليلتين متتاليتين. الحماية تمنع هجمات المافيا والقاتل والسم، لكنها لا تمنع إعدام السجّان أو الموت بسبب الربط.'],
 detective: ['فريق القرية','تجمع نتائج سرية تساعدك على كشف المافيا أثناء النقاش.','اختر لاعبًا حيًا غير نفسك لفحصه مرة واحدة في الجولة. تبدأ الفحوص من الليلة الأولى، ولعدد الجولات الذي يحدده المضيف. تظهر النتائج بعد حسم الليل.','الفحوص الفائتة لا تتراكم. «بريء» تعني أن الفحص لم يكشف مافيا؛ لا تضمن أن اللاعب من القرية، وقد يظهر العرّاب بريئًا عند تفعيل التمويه.'],
 jailer: ['فريق القرية','تحتجز مشتبهًا به وتقرر إن كان يستحق الإعدام.','اختر نهارًا لاعبًا حيًا غير نفسك ليسجن في الليل التالي. تواصل معه في قناة السجن، ثم اختر العفو أو الإعدام.','لديك 3 إعدامات طوال المباراة. السجين لا ينفذ قدرته الليلية ويحتمي من الهجمات المعتادة؛ إعدامك يتجاوز تلك الحماية.'],
 lawyer: ['فريق القرية','تمنع إقصاء لاعب تختاره بنتيجة تصويت الجولة.','اختر أثناء النهار لاعبًا حيًا لحمايته، ويمكنك اختيار نفسك. تُلغى نتيجة الإقصاء إذا وقعت على اللاعب المحمي.','الحماية خاصة بالتصويت، ولا تحمي من هجمات الليل. اختر من جديد في الجولة التالية؛ الحماية لا تكشف لك دور اللاعب.'],
 vigilante: ['فريق القرية','تملك فرصة أخيرة للتأثير في المباراة عند إقصائك.','إذا أُقصيت بالتصويت أو باغتيال المافيا، تظهر لك طلقة أخيرة لاختيار لاعب حي. ينتظر حسم الفوز انتهاء هذه الفرصة.','لديك طلقة واحدة وليست قدرة ليلية عادية. بعد حسمها تتابع كمشاهد؛ وقد ينهي المضيف فرصة الطلقة بالتخطي.'],
 witch: ['فريق القرية','توازن بين إنقاذ لاعب واستهداف لاعب بجرعة السم.','من الليلة الثانية اختر جرعة حياة لحماية لاعب حي أو جرعة سم لاستهدافه. كل جرعة تُستهلك مرة واحدة عند تنفيذها، وتختار جرعة واحدة في الليلة.','يمكن استخدام الحياة على نفسك، ولا يمكن تسميم نفسك. الحماية قد تنقذ هدف السم. الساحرة محسوبة مع القرية في قواعد هذه النسخة.'],
 serial_killer: ['دور مستقل','تسعى لإخراج منافسيك والفوز بعيدًا عن فريقي القرية والمافيا.','من الليلة الثانية اختر لاعبًا حيًا غير نفسك لاستهدافه كل ليلة. هجومك مستقل عن اختيار المافيا.','الحماية قد تمنع هجومك، والسجن أو التعطيل قد يمنع تنفيذ قدرتك. نتيجة فحصك لدى المحقق تظهر «بريء»، لأنها تفحص انتماء المافيا.'],
 jester: ['دور مستقل','حاول إقناع اللاعبين بإقصائك عن طريق التصويت.','شارك في النقاش والتصويت مثل الآخرين، لكن هدفك أن تكون أنت اللاعب الذي ينتهي التصويت بإقصائه.','لا توجد قدرة ليلية. الموت باغتيال أو قدرة أخرى لا يحقق فوزك؛ يجب تنفيذ إقصائك بالتصويت فعلًا، دون أن تمنعه حماية المحامي.'],
 revealer: ['فريق القرية','تحصل على عدد المافيا الأحياء لتقدير الخطر دون معرفة أسمائهم.','من الليلة الثانية اختر ليلة لاستخدام الكشف، أو تخطَّ لتحتفظ به. تُعرض النتيجة الخاصة بك صباحًا بعد حسم الليل.','الكشف مرة واحدة خلال المباراة. النتيجة تخص الجولة التي استُخدمت فيها ولا تتجدد كل صباح، ولا تكشف أسماء المافيا أو هوياتهم.'],
 cupid: ['فريق القرية','تربط مصير لاعبين معًا، فيصبح موت أحدهما خطرًا على الآخر.','في الليلة الثانية فقط اختر لاعبين مختلفين وأحياء، ولا يمكنك اختيار نفسك. يجب اكتمال الاختيارين لتنفيذ الربط.','إذا مات أحد المرتبطين يموت الآخر تبعًا له. الربط لا يغيّر الأدوار أو يمنح فوزًا مستقلًا، وقد يضر القرية إذا أُسيء اختياره.'],
 escort: ['فريق القرية','تعطّل قدرة لاعب مشتبه به خلال الليل.','ابتداءً من الليلة الثانية اختر لاعبًا حيًا غير نفسك. يمنع التعطيل تنفيذ قدرته الليلية في تلك الليلة.','التعطيل لا يكشف دور الهدف ولا يقصيه. اختيار لاعب من القرية قد يمنع حمايته أو فحصه، لذلك استند إلى النقاش والنتائج المتاحة.'],
 citizen: ['فريق القرية','تعتمد على النقاش والملاحظة والتصويت لاكتشاف أصحاب الأدوار المعادية.','راقب الأقوال والنتائج، وقارن الادعاءات، ثم رشّح وصوّت وفق الأدلة. لا تحتاج إلى اختيار قدرة أثناء الليل.','لا توجد لك قدرة كشف أو حماية سرية. لا تعتبر الاتهام دليلًا قاطعًا، ولا تفترض أن نتيجة «بريء» تكشف الدور الكامل.']
};
function detailedRoleProperties(role, personal=false) {
 const rule=detailedRoleRules[role];
 if(!rule)return '';
 const title=role==='mafia_boss'?'زعيم المافيا':roleLabel(role).split(' / ')[0];
 const win=mafiaRoleClient(role)?'يفوز فريق المافيا عندما لا يبقى قاتل متسلسل، ويصبح عدد المافيا مساويًا لبقية الأحياء أو أكبر منهم.':role==='serial_killer'?'تفوز عند عدم بقاء أي مافيا، ووصول عدد القتلة المتسلسلين إلى عدد بقية الأحياء أو تجاوزه.':role==='jester'?'تفوز وحدك بمجرد إقصائك فعليًا بنتيجة التصويت.':'تفوز القرية بعد خروج جميع أفراد المافيا والقتلة المتسلسلين.';
 const sections=[['مهمتك',rule[1]],['استخدام القدرة',rule[2]],['القيود المهمة',rule[3]],['شرط الفوز',win]];
 if(personal&&role==='mafia_boss')sections.push(['إعداد غرفتك',game.enabledRoles?.godfather_innocent?'تمويه العرّاب مفعّل: تظهر بريئًا في فحص المحقق.':'تمويه العرّاب غير مفعّل: يكشفك فحص المحقق كعضو مافيا.']);
 if(personal&&role==='detective')sections.push(['إعداد غرفتك',`عدد جولات الفحص المحدد: ${detectiveQuestionCount(game.detectiveQuestions ?? game.detective_questions)}. فحص واحد في كل جولة مؤهلة.`]);
 return `<div class="role-rule-sections">${sections.map(([heading,text])=>`<section><h3>${heading}</h3><p>${escapeHtml(text)}</p></section>`).join('')}</div>`;
}
function roleLabel(role){
  if(!game?.enabledRoles?.kids_mode)return roleNames[role]||role;
  return ({mafia_boss:'🕵️ قائد الفريق الغامض',mafia:'🕵️ الفريق الغامض',doctor:'🛡️ الحارس',detective:'🔎 المحقق',citizen:'🙂 الأصدقاء'})[role]||roleNames[role]||role;
}
const eventText = {
  game_started: 'بدأ القيم / Game started',
  mafia_locked: '🔒 تعطّل اغتيال المافيا لأن أحد أفرادها كان مسجونًا.',
  mafia_skipped: '🌙 قررت المافيا تخطي الاغتيال هذه الليلة.',
  mafia_disabled: '🌙 قرر المضيف أن تكون هذه الليلة بدون اغتيال مافيا.',
  mafia_delayed: '🌙 الليلة الأولى بدون اغتيال. يبدأ اغتيال المافيا من الليلة الثانية.',
  doctor_saved: '🩺 أنقذ الطبيب هدف المافيا.',
  jail_saved: '🔐 كان هدف المافيا داخل السجن ونجا.',
  mafia_kill: '🔪 نفذت المافيا اغتيالها.',
  jailer_executed: '⚖️ نفّذ السجّان حكم الإعدام.',
  lawyer_saved: '⚖️ أنقذ المحامي اللاعب من نتيجة التصويت.',
  vote_eliminated: '🗳️ تم استبعاد اللاعب صاحب أعلى تصويت.',
  vote_tie: '🤝 تعادل التصويت ولم يُستبعد أحد.',
  serial_kill: '🩸 نفّذ القاتل المتسلسل جريمته.',
  vigilante_kill: '🎯 أطلق القناص طلقته الأخيرة. / The sniper took their final shot.',
  vigilante_skipped: '🎯 تم تخطي طلقة القناص. / The final shot was skipped.',
  witch_poison: '☠️ استخدمت الساحرة جرعة السم.',
  witch_saved: '🧪 أنقذت الساحرة لاعباً بجرعة الحياة.',
  escort_blocked: '🚫 عطّل المعطّل قدرة لاعب هذه الليلة.',
  lovers_died: '💔 مات الحبيبان معاً.',
  jester_won: '🃏 نجح المهرج في خداع الجميع.',
  player_accused: '⚖️ تم اختيار متهم للمحاكمة.',
  nomination_tie: '🤝 لم يتفق اللاعبون على متهم.',
  trial_guilty: '🔨 صدر الحكم بالإدانة.',
  trial_innocent: '🕊️ صدر الحكم بالبراءة.',
  host_ended: '⛔ أنهى المضيف المباراة.',
  host_expelled: '⛔ استبعد المضيف لاعبًا. / The host expelled a player.',
  detective_only_night: '🔎 الليلة الأولى للمحقق فقط؛ لا اغتيال ولا قدرات أخرى. / First night: detective only. No kills or other role actions.',
};

const pendingReads=new Map();
function requestError(code,status=0) {const error=new Error(code);error.code=code;error.status=status;return error;}
async function api(payload) {
  const reading=['state','spectatorState','adminState','messages','moderationLog','listSnapshots','systemStatus'];
  const reconnecting=document.getElementById('reconnect')?.classList.contains('show');
  if(payload.code && game?.code===payload.code && !reading.includes(payload.action) && (navigator.onLine===false || reconnecting)) {
    const error=new Error('انتظر استعادة الاتصال قبل إرسال اختيارك / Wait for reconnection');error.code='RECONNECTING';throw error;
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
function setRoomTag(text = game?.code ? `غرفة ${game.code} / Room ${game.code}` : 'جاهز / Ready') {
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
function choiceButtons(players, action, options = {}) {
  return players.map((player) => `<button class="pick" data-target="${escapeHtml(player.id)}" aria-pressed="false" onclick="${action}(${jsArg(player.id)})">${options.icon || '👤'} ${escapeHtml(player.name)}${player.id === playerId ? ' (أنت / You)' : ''}</button>`).join('');
}
function jsArg(value) { return escapeHtml(JSON.stringify(String(value))); }
function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
function normalizeEnabledRoles(value = {}) {
  const legacyRound = value.mafia_kill_mode === 'disabled' || value.mafia_kill_enabled === false ? 0 : value.mafia_kill_mode === 'after_first' ? 2 : 1;
  let killStartRound = Number.isFinite(+value.mafia_kill_start_round) ? Math.max(0, Math.min(10, Math.round(+value.mafia_kill_start_round))) : legacyRound;
  if (killStartRound === 1) killStartRound = 2;
  return {
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
function renderHostLogin() {
  setRoomTag('🔒');
  if ($('#app').hasAttribute('data-login-shell') && $('#hostPin')) {
    $('#app').removeAttribute('data-login-shell');
    $('#app').querySelectorAll('button[disabled]').forEach(button=>button.disabled=false);
    $('#app').insertAdjacentHTML('beforeend',homeCharacters());
  } else {
  $('#app').removeAttribute('data-login-shell');
  $('#app').innerHTML = `<section class="noir-entry"><div class="noir-content"><p class="noir-kicker">MAFIA · مافيا الليل</p><h2 class="noir-heading">كل وجه يخفي سرًّا</h2><p class="noir-intro">ليلة من الشك، ولعبة تكشف الحقيقة.<br>اجمع أصحابك… واكتشف من يقف خلف القناع.</p><div class="card hero join-card auth-card"><h1>دخول المضيف</h1><p class="muted">أدخل الرمز السري لفتح الصفحة الرئيسية وإنشاء الألعاب.</p><label for="hostPin">الرمز السري</label><input class="input auth-pin" id="hostPin" type="password" inputmode="numeric" maxlength="8" autocomplete="current-password" enterkeyhint="go"><button class="btn red wide" onclick="loginHost()">الدخول إلى اللعبة ←</button></div><div class="noir-links"><button class="btn" onclick="joinForm()">دخول لاعب</button><button class="btn" onclick="spectatorForm()">دخول متفرج</button></div><p class="noir-caption">◆ لا تثق بأحد… راقب الجميع ◆</p></div><aside class="home-emblem" aria-hidden="true"><img src="/assets/mafia-gold-icon.webp" alt="" width="220" height="220"><span>◆ MAFIA NIGHT ◆</span><p>لا تثق بأحد… راقب الجميع</p></aside></section>${homeCharacters()}`;
  }
  const input = $('#hostPin');
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') loginHost(); });
  input.focus({ preventScroll: true });
}
async function loginHost() {
  const pin = normalizeEntryDigits($('#hostPin')?.value || '');
  if (!/^\d{8}$/.test(pin || '')) { alert('أدخل الرمز المكوّن من 8 أرقام'); return; }
  try {
    const result = await withBusy('جاري تسجيل الدخول…', () => api({ action: 'hostLogin', pin }));
    hostAccessToken = result.hostAccessToken;
    localStorage.setItem('mafia-host-access-token', hostAccessToken);
    applyHostPreferences(result.preferences || {});
    renderHostHome();
  } catch (error) {
    alert(error.code === 'LOGIN_RATE_LIMITED' ? 'محاولات كثيرة. انتظر 15 دقيقة.' : 'الرمز السري غير صحيح');
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
  catch { alert(discussionText('تعذر إلغاء الجلسات، حاول تسجيل الخروج مرة ثانية.','Could not revoke sessions. Please try logging out again.')); return; }
  pollingEpoch++; clearTimeout(pollTimer);closeSheet();
  hostAccessToken='';hostToken='';playerToken='';playerId='';game=null;delegatedHostMode=false;
  const keys=[];for(let i=0;i<localStorage.length;i++)keys.push(localStorage.key(i));
  for(const key of keys)if(key==='mafia-host-access-token'||key==='mafia-session'||key.startsWith('mafia-session-'))localStorage.removeItem(key);
  document.querySelector('.player-tools')?.remove();renderHostLogin();
}
function renderHostHome() {
 setRoomTag();
 const saved=localStorage.getItem('mafia-session');
 $('#app').innerHTML=`<section class="cinema-home"><header class="cinema-brand"><img src="/assets/mafia-gold-icon.webp" alt="" width="100" height="100"><h1>مافيا</h1><p>كل وجه يخفي سرًّا</p></header>${homeCharacters()}<div class="cinema-actions"><button class="btn cinema-create" onclick="createRoom()">⊕ إنشاء غرفة</button>${saved?'<button class="btn cinema-resume" onclick="resumeGame()">مواصلة اللعبة</button>':''}<div><button class="btn" onclick="joinForm()">دخول لاعب</button><button class="btn" onclick="spectatorForm()">مشاهدة</button></div></div><nav class="cinema-tools" aria-label="أدوات اللعبة"><button onclick="showGuide()"><span aria-hidden="true">♧</span>الأدوار والقواعد</button><button onclick="showTrainingHelp()"><span aria-hidden="true">◇</span>التدريب</button><button onclick="showLeaderboard()"><span aria-hidden="true">♛</span>الترتيب</button><button onclick="showProfile()"><span aria-hidden="true">◎</span>ملفي</button></nav><details class="cinema-more"><summary>خيارات إضافية</summary><div><button class="btn" onclick="replacementForm()">استبدال لاعب</button><button class="btn" onclick="recoveryForm()">استرجاع الحساب</button><button class="btn" onclick="logoutHost()">تسجيل الخروج</button></div></details><p class="cinema-footer">ليلة واحدة. أسرار كثيرة.</p></section>`;
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
  $('#app').innerHTML=`<section class="card hero" data-no-translate><h1>${discussionText('مواصلة المباراة','Resume game')}</h1><p>${discussionText('ارجع لنفس اسمك ودورك في الغرفة','Return to your same name and role in room')} ${escapeHtml(session.code)}</p>${offline?`<p>${discussionText('تعذر الاتصال. جلستك محفوظة؛ أعد المحاولة.','Connection failed. Your session is saved; try again.')}</p>`:''}<button class="btn green" onclick="resumeGame(${jsArg(session.code)})">${discussionText('مواصلة','Resume')}</button><button class="btn" onclick="joinForm()">${discussionText('دخول غرفة أخرى','Join another room')}</button><button class="btn" onclick="renderHostLogin()">${discussionText('دخول المضيف','Host login')}</button></section>`;
}
function home() {
  pollingEpoch++;
  warmApi();
  clearTimeout(pollTimer);
  document.querySelector('.player-tools')?.remove();
  closeSheet();
  game = null;
  const roomCode = new URLSearchParams(location.search).get('room');
  const session=readSavedSession(/^\d{4}$/.test(roomCode||'')?roomCode:'');
  if(session){renderResumeCard(session);return;}
  if (/^\d{4}$/.test(roomCode || '')) { joinForm(roomCode); return; }
  const local = JSON.parse(localStorage.getItem('mafia-host-preferences') || 'null');
  if (local) applyHostPreferences(local);
  if (!hostAccessToken) { renderHostLogin(); return; }
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
  if (!p) { $('#app').innerHTML = `<div class="card hero"><div class="role-title">🏅 ملف اللاعب</div><p>العب أول مباراة حتى تبدأ إحصائياتك.</p><button class="btn" onclick="home()">رجوع</button></div>`; return; }
  const rate = p.games ? Math.round(p.wins / p.games * 100) : 0;
  $('#app').innerHTML = `<div class="card"><div class="toolbar"><div><div class="role-badge">ملف اللاعب</div><h1>${escapeHtml(p.nickname)}</h1></div><button class="btn" onclick="home()">رجوع</button></div><div class="stat-grid"><div><b>${p.games}</b><span>مباراة</span></div><div><b>${p.wins}</b><span>فوز</span></div><div><b>${rate}%</b><span>نسبة الفوز</span></div></div><div class="season-card"><b>الموسم ${escapeHtml(p.season||'')}</b><span>${p.season_wins||0} فوز من ${p.season_games||0} مباراة</span></div><div class="status wait">🔑 رمز نقل الحساب: <b>${escapeHtml(p.recovery_code||'—')}</b><br><small>احتفظ به لاسترجاع حسابك على جهاز آخر.</small></div><h2>الإنجازات</h2><div class="achievement-grid">${achievements(p).map((a) => `<div class="achievement ${a.on?'unlocked':'locked'}"><span>${a.icon}</span><b>${a.name}</b><small>${a.on?'مفتوح':'مغلق'}</small></div>`).join('')}</div></div>`;
}
async function showLeaderboard() {
  setRoomTag('🏆');
  const result = await withBusy('جاري تحميل الترتيب…', () => api({ action: 'leaderboard' }));
  const rows=(items)=>items.map((p,i)=>`<div class="leader-row"><b>${i+1}</b><span>${escapeHtml(p.nickname)}</span><strong>${p.wins} فوز</strong><small>${p.games} مباراة</small></div>`).join('')||'<p class="muted">لا توجد نتائج بعد.</p>';
  $('#app').innerHTML = `<div class="card"><div class="toolbar"><h1>🏆 الترتيب</h1><button class="btn" onclick="home()">رجوع</button></div><h2>الموسم ${escapeHtml(result.season||'')}</h2><div class="leaderboard">${rows(result.seasonLeaderboard||[])}</div><h2>الترتيب العام</h2><div class="leaderboard">${rows(result.leaderboard||[])}</div></div>`;
}
function showTrainingHelp() {
  setRoomTag('🤖');
  $('#app').innerHTML = `<div class="card hero"><div class="role-title">🤖 التدريب واللعب الفردي</div><p>ابدأ مباراة فردية مع ثمانية مقاعد من البوتات، أو أنشئ غرفة عادية واختر عدد اللاعبين بنفسك.</p><button class="btn red" onclick="createSoloRoom()">العب وحدك مع البوتات</button><button class="btn" onclick="createRoom()">إنشاء غرفة عادية</button><button class="btn" onclick="home()">رجوع</button></div>`;
}
const reviewCardViews = new Map();
const kidsCardRoles = new Set(['mafia_boss','mafia','detective','doctor','citizen']);
function roleCardAsset(role,thumbnail=false,kids=false){return `/assets/${kids&&kidsCardRoles.has(role)?'role-cards-kids':'role-cards-v3'}/${role}${thumbnail?'-thumb':''}.webp`;}
function selectRoleView(card,open){
 card=card.closest('.role-reader');
 card.dataset.view=open?'details':'image';
 card.setAttribute('aria-pressed',String(open));
 card.querySelector('.role-image-view').setAttribute('aria-hidden',String(open));
 card.querySelector('.role-details-view').setAttribute('aria-hidden',String(!open));
 if(card.classList.contains('personal-role-card'))personalCardState.open=open;
 if(card.dataset.reviewRole)reviewCardViews.set(card.dataset.reviewRole,open);
}
function cardsUseKidsMode(){
 return game?.phase==='lobby' ? enabledRoles.kids_mode===true : game?.enabledRoles?.kids_mode===true;
}
function interactiveRoleCard(role, {personal=false, compact=false, image='', open=false, review=false, count=0}={}) {
 if(review)open=reviewCardViews.get(role)===true;
 const label=escapeHtml(roleLabel(role));
 const kids=(personal?game?.enabledRoles?.kids_mode===true:cardsUseKidsMode())&&kidsCardRoles.has(role);
 const art=roleCardAsset(role,false,kids);
 image = kids?art:(!image||image.includes('/role-cards-kids/')?art:image);
 const title=kids?({mafia_boss:'قائد الفريق الغامض',mafia:'الفريق الغامض',doctor:'الطبيب',detective:'المحقق',citizen:'المواطن'}[role]):role==='mafia_boss'?'زعيم المافيا':roleLabel(role).split(' / ')[0];
 const teammates=personal&&mafiaRoleClient(role)?(game.me.mafiaTeam||[]).filter(p=>p.id!==game.me.id):[];
 const team=personal&&mafiaRoleClient(role)?`<aside class="role-allies"><h3>زملاؤك في المافيا <small>خاص بفريقك</small></h3><div>${teammates.map(p=>`<span>${escapeHtml(p.name)}</span>`).join('')||'<p>أنت عضو المافيا الوحيد</p>'}</div></aside>`:'';
 return `<section class="role-presentation ${review?'review-role-presentation':''}"><header class="role-identity"><h2>${escapeHtml(title)}</h2><span>${escapeHtml(detailedRoleRules[role]?.[0]||'')}</span>${review?`<span class="review-role-count" data-no-translate aria-label="${discussionText('عدد اللاعبين','Player count')}">× ${count}</span>`:''}</header>${team}<article class="role-reader turning-role ${kids?'kids-role-card':''} ${personal?'personal-role-card':''} ${compact?'compact':''}" ${review?`data-review-role="${role}"`:''} data-view="${open?'details':'image'}" style="--role-art:url('${image}')" role="button" tabindex="0" aria-label="${label}، اضغط لقلب الكرت" aria-pressed="${open}" onclick="selectRoleView(this,this.dataset.view!=='details')" onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();selectRoleView(this,this.dataset.view!=='details')}"><div class="role-turn-inner"><div class="role-image-view" aria-hidden="${open}"><img src="${image}" alt="${label}" width="1024" height="1536" loading="lazy" decoding="async"><span class="role-turn-hint">اضغط الكرت لقراءة الدور ↻</span></div><div class="role-details-view" aria-hidden="${!open}"><div class="personal-card-properties">${detailedRoleProperties(role,personal)}</div><span class="role-turn-hint">مرّر لقراءة المزيد · اضغط للعودة ↻</span></div></div></article></section>`;
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
 return `<section class="cinema-cards" aria-label="الشخصيات الرئيسية">${[['detective','المحقق'],['mafia_boss','زعيم المافيا'],['doctor','الطبيب']].map(([role,title])=>`<button class="cinema-character" onclick="previewHomeRole('${role}')" aria-label="شرح دور ${title}"><img src="/assets/role-cards-v3/${role}-thumb.webp" alt="${title}" width="1024" height="1536" loading="lazy" decoding="async"></button>`).join('')}<p>اكتشف دورك… والعبها بذكاء</p></section>`;
}
function previewHomeRole(role){openSheet('شرح الشخصية',interactiveRoleCard(role,{open:true}));}
function showGuide() {
  setRoomTag('📖');
  const roles = (cardsUseKidsMode()?[...kidsCardRoles]:Object.keys(roleNames)).map(key => interactiveRoleCard(key)).join('');
  $('#app').innerHTML = `<div class="card"><div class="toolbar"><h1>📖 الأدوار والقواعد</h1><button class="btn" onclick="home()">رجوع</button></div><div class="role-gallery">${roles}</div><div class="status">🌙 ليل: القدرات السرية · ☀️ نهار: نقاش وتصويت · 🏆 القرية تفوز بإخراج المافيا، والمافيا تفوز عند مساواة بقية الأحياء.</div></div>`;
}
function spectatorForm() {
  setRoomTag('👁️');
  $('#app').innerHTML = `<div class="card hero join-card"><h1>👁️ دخول متفرج</h1><label for="roomCode">كود الغرفة</label><input class="input" id="roomCode" inputmode="numeric" maxlength="4"><label for="spectatorName">اسمك</label><input class="input" id="spectatorName" maxlength="20"><button class="btn red wide" onclick="joinSpectator()">مشاهدة اللعبة</button><button class="btn" onclick="home()">رجوع</button></div>`;
}
async function joinSpectator() {
  try {
    spectatorId = crypto.randomUUID();
    game = await api({ action:'joinSpectator', code:$('#roomCode').value.trim(), id:spectatorId, name:$('#spectatorName').value.trim() });
    spectatorToken = game.spectatorToken; spectatorMode = true; hostToken = ''; playerToken = '';
    localStorage.setItem('mafia-session',JSON.stringify({code:game.code,spectator:true,spectatorId,spectatorToken}));
    renderSpectator(); startSpectatorPolling();
  } catch { alert('تأكد من كود الغرفة والاسم'); }
}
function renderSpectatorContent() {
  document.querySelector('.player-tools')?.remove();
  setRoomTag(`👁️ ${game.code}`);
  $('#app').innerHTML = `${phaseBar()}<div class="grid"><div class="card hero"><div class="role-title">${phaseIcon()}</div><h1>${phaseName()}</h1><p class="muted" data-no-translate>${discussionText(game.me?.alive===false?'خرجت من المباراة. تتابع فقط، بدون كلام أو تصويت أو قدرات.':'متابعة الأحداث العامة فقط، بدون كشف الأدوار السرية.','Watch public events only. No talking, voting or role actions.')}</p>${game.phase==='finished'?`<h2>${winnerTitle()}</h2>`:''}${eventCards()}${game.phase==='day'?discussionPanel(false):''}</div><div class="card"><h2>اللاعبون (${game.players.length})</h2><div class="players">${playerList()}</div></div></div>`;
}
function startSpectatorPolling(){clearTimeout(pollTimer);const epoch=++pollingEpoch;const tick=async()=>{try{const next=await api({action:'spectatorState',code:game.code,id:spectatorId,spectatorToken});if(epoch!==pollingEpoch)return;const changed=renderStateKey(next)!==renderStateKey(game);game=next;$('#reconnect').classList.remove('show');if(changed)renderSpectator()}catch{if(epoch===pollingEpoch)$('#reconnect').classList.add('show')}finally{if(epoch===pollingEpoch)pollTimer=setTimeout(tick,2000)}};pollTimer=setTimeout(tick,700)}
function replacementForm() {
  setRoomTag('🔄');
  $('#app').innerHTML = `<div class="card hero join-card"><h1>🔄 استبدال لاعب</h1><p>خذ رمز الاستبدال من المضيف.</p><input class="input" id="roomCode" inputmode="numeric" maxlength="4" placeholder="كود الغرفة"><input class="input" id="replacementCode" maxlength="8" placeholder="رمز الاستبدال"><input class="input" id="playerName" maxlength="20" placeholder="اسم اللاعب الجديد"><button class="btn red wide" onclick="claimSeat()">استلام مكان اللاعب</button><button class="btn" onclick="home()">رجوع</button></div>`;
}
async function claimSeat(){spectatorMode=false;delegatedHostMode=false;hostToken='';try{game=await api({action:'claimSeat',code:$('#roomCode').value.trim(),replacementCode:$('#replacementCode').value.trim(),name:$('#playerName').value.trim(),profileToken});playerId=game.playerId;playerToken=game.playerToken;profileToken=game.profileToken||profileToken;saveSession(false);renderPlayer();startPolling(false)}catch{alert('رمز الاستبدال غير صحيح أو انتهت مدته')}}
function recoveryForm(){setRoomTag('🔑');$('#app').innerHTML=`<div class="card hero join-card"><h1>🔑 استرجاع الحساب</h1><p>أدخل رمز الاسترجاع الموجود في ملفك.</p><input class="input" id="recoveryCode" maxlength="12" placeholder="رمز الاسترجاع"><button class="btn red wide" onclick="recoverProfile()">استرجاع</button><button class="btn" onclick="home()">رجوع</button></div>`}
async function recoverProfile(){try{const result=await api({action:'recoverProfile',recoveryCode:$('#recoveryCode').value.trim()});profileToken=result.profileToken;localStorage.setItem('mafia-profile-token',profileToken);alert(`تم استرجاع حساب ${result.nickname} ✅`);showProfile()}catch{alert('رمز الاسترجاع غير صحيح')}}

async function createRoom() {
  spectatorMode=false;delegatedHostMode=false;playerId='';playerToken='';
  try {
    game = await withBusy('جاري إنشاء الغرفة… / Creating room…', () => api({ action: 'create', hostAccessToken, mafiaCount, detectiveCount, detectiveQuestions, enabledRoles }));
    hostToken = game.hostToken;
    enabledRoles = normalizeEnabledRoles(game.enabledRoles);
    saveSession(true);
    renderHost();
    startPolling(true);
  } catch (error) { if (error.code === 'UNAUTHORIZED') { logoutHost(); alert('انتهت جلسة المضيف. سجّل الدخول من جديد.'); } else alert('تعذر إنشاء الغرفة / Could not create room'); }
}
async function createSoloRoom() {
  spectatorMode=false;delegatedHostMode=false;playerId='';playerToken='';
  const soloName = (window.prompt('اكتب اسمك في اللعبة / Enter your name', 'أنت') || '').trim().slice(0,20);
  if (!soloName) return;
  try {
    game = await withBusy('جاري تجهيز لعبة فردية… / Preparing solo game…', () => api({ action: 'create', hostAccessToken, mafiaCount: 2, detectiveCount: 1, detectiveQuestions: 3, enabledRoles }));
    hostToken = game.hostToken;
    enabledRoles = normalizeEnabledRoles(game.enabledRoles);
    saveSession(true);
    while (game.players.length < 8) {
      const before = game.players.length;
      game = await api({ action: 'addBot', code: game.code, hostToken, id: playerId, playerToken });
      if (game.players.length <= before) break;
    }
    playerId = crypto.randomUUID();
    playerToken = crypto.randomUUID();
    game = await api({ action: 'join', code: game.code, id: playerId, playerToken, profileToken, name: soloName });
    saveSession(false);
    renderPlayer();
    startPolling(false);
  } catch (error) {
    if (error.code === 'UNAUTHORIZED') logoutHost();
    else alert('تعذر تجهيز اللعبة الفردية / Could not prepare solo game');
  }
}
function joinForm(prefill = '') {
  spectatorMode=false;delegatedHostMode=false;
  hostToken = '';
  const code = normalizeEntryDigits(prefill).replace(/\D/g, '').slice(0, 4);
  const directJoin = code.length === 4;
  setRoomTag(directJoin ? `غرفة ${code} / Room ${code}` : 'دخول لاعب / Player join');
  $('#app').innerHTML = `<div class="card hero join-card"><div class="role-badge">${directJoin ? 'مسحت الباركود بنجاح / QR scanned' : 'دخول لاعب / Player join'}</div><h2>${directJoin ? 'اكتب اسمك وادخل مباشرة / Enter your name to join' : 'دخول الغرفة / Join room'}</h2>${directJoin ? `<input type="hidden" id="roomCode" value="${escapeHtml(code)}">` : `<label for="roomCode">كود الغرفة / Room code</label><input class="input" id="roomCode" inputmode="numeric" maxlength="4" autocomplete="one-time-code" dir="ltr" enterkeyhint="next" aria-describedby="joinHint"><p id="joinHint" class="entry-hint">اطلب الكود المكوّن من 4 أرقام من المضيف / Ask the host for the 4-digit code</p>`}<label for="playerName">اسمك / Your name</label><input class="input" id="playerName" maxlength="20" autocomplete="name" enterkeyhint="go" placeholder="اكتب اسمك / Enter your name"><p id="joinFeedback" class="entry-feedback" role="alert" hidden></p><button class="btn red wide" onclick="joinRoom()">دخول اللعبة / Join game</button><button class="btn wide entry-back" onclick="home()">رجوع / Back</button></div>`;
  const nameInput = $('#playerName');
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) joinRoom();
  });
  const codeInput = $('#roomCode');
  codeInput.addEventListener('input', () => { codeInput.value=normalizeEntryDigits(codeInput.value).replace(/\D/g,'').slice(0,4); });
  codeInput.addEventListener('keydown', event => { if(event.key==='Enter'&&!event.isComposing){event.preventDefault();nameInput.focus();} });
  for(const input of [codeInput,nameInput]) input.addEventListener('input',()=>{input.removeAttribute('aria-invalid');$('#joinFeedback').hidden=true;});
  (directJoin ? nameInput : codeInput).focus();
}
function normalizeEntryDigits(value) {
 return String(value).trim().replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit <= '٩' ? 1632 : 1776)));
}
function showJoinFeedback(message, field) {
 const feedback = $('#joinFeedback'); feedback.textContent=message; feedback.hidden=false;
 if(field){field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby','joinFeedback');field.focus();}
}
function joinErrorMessage(error) {
  return ({GAME_STARTED:'المباراة بدأت. انتظر عودة الغرفة للردهة لتدخل المباراة التالية، أو ادخل كمتفرج.',ROOM_FULL:'الغرفة مكتملة؛ الحد الأقصى 20 لاعبًا.',NAME_TAKEN:'هذا الاسم مستخدم في الغرفة. اختر اسمًا آخر.'})[error?.code] || 'تأكد من الكود والاسم / Check the code and name';
}
async function joinRoom() {
  const code = normalizeEntryDigits($('#roomCode').value);
  const name = $('#playerName').value.trim();
  if(!/^\d{4}$/.test(code)){showJoinFeedback(discussionText('أدخل كود الغرفة المكوّن من 4 أرقام.','Enter the 4-digit room code.'),$('#roomCode'));return;}
  if(!name){showJoinFeedback(discussionText('اكتب اسمك ليعرفك اللاعبون.','Enter your name so players can recognize you.'),$('#playerName'));return;}
  const pendingKey='mafia-pending-join-'+code;
  const stored = JSON.parse(localStorage.getItem(sessionKey(code)) || localStorage.getItem(pendingKey) || 'null');
  playerId = stored?.playerId || crypto.randomUUID();
  playerToken = stored?.playerToken || crypto.randomUUID();
  localStorage.setItem(pendingKey,JSON.stringify({playerId,playerToken}));
  try {
    game = await withBusy('جاري دخول الغرفة… / Joining room…', () => api({ action: 'join', code, id: playerId, playerToken, profileToken, name }));
  } catch (error) {
    if (error.code === 'SESSION_INVALID') {
      playerId = crypto.randomUUID();
      playerToken = crypto.randomUUID();
      localStorage.setItem(pendingKey,JSON.stringify({playerId,playerToken}));
      try { game = await withBusy('جاري دخول الغرفة… / Joining room…', () => api({ action: 'join', code, id: playerId, playerToken, profileToken, name })); }
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
      alert(discussionText('الجلسة غير صالحة؛ ادخل الغرفة مجددًا.','Session is invalid. Join the room again.'));home();
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
  const epoch=++pollingEpoch;
  const tick = async () => {
    try {
      const next = await api({ action: 'state', code: game.code, id: playerId, playerToken, hostToken });
      if(epoch!==pollingEpoch)return;
      $('#reconnect').classList.remove('show');
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
        alert('انتهت صلاحية هذه الجلسة أو انتقلت إدارة الغرفة إلى لاعب آخر.');
        home();return;
      }
      $('#reconnect').classList.add('show');
    } finally {
      if(epoch===pollingEpoch)pollTimer = setTimeout(tick, game?.phase === 'lobby' ? 1500 : 2000);
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
  const mafia = count < 4 ? Math.min(1, count) : Math.min(Math.floor((count - 1) / 2), Math.max(1, mafiaCount));
  const doctor = enabledRoles.doctor && count >= 4 ? 1 : 0;
  const lawyer = enabledRoles.lawyer && count >= 5 ? 1 : 0;
  const jailer = enabledRoles.jailer && count >= 6 ? 1 : 0;
  const vigilante = enabledRoles.vigilante ? 1 : 0;
  const witch = enabledRoles.witch ? 1 : 0;
  const serialKiller = enabledRoles.serial_killer ? 1 : 0;
  const jester = enabledRoles.jester ? 1 : 0;
  const cupid = enabledRoles.cupid ? 1 : 0;
  const escort = enabledRoles.escort ? 1 : 0;
  const revealer = enabledRoles.revealer ? 1 : 0;
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
  return `<button type="button" class="role-toggle ${disguised ? 'active' : 'off'}" onclick="toggleGodfatherReveal()" aria-pressed="${disguised}"><span>🕵️ تمويه العرّاب / Godfather disguise</span><b>${disguised ? 'بريء' : 'مافيا'}</b><small>${disguised ? 'يظهر بريء / Appears innocent' : 'ينكشف مافيا / Revealed as Mafia'}</small></button>`;
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
  const kids={mafia_kill:'🌙 اختار الفريق الغامض لاعبًا للخروج.',mafia_skipped:'🌙 لم يختر الفريق الغامض أحدًا.',mafia_disabled:'🌙 هذه اللعبة بدون اختيار ليلي للفريق الغامض.',mafia_delayed:'🌙 تبدأ اختيارات الفريق الغامض من الليلة الثانية.',doctor_saved:'🛡️ حمى الحارس اللاعب.',vote_eliminated:'🗳️ خرج اللاعب باختيار المجموعة.'};
  return events.map((event) => { const delayed = event === 'mafia_delayed' ? `🌙 لا يوجد اغتيال مافيا هذه الليلة. يبدأ من الليلة ${game.enabledRoles?.mafia_kill_start_round || 1}.` : null; return `<div class="event">${delayed || (game.enabledRoles?.kids_mode&&(kids[event])?kids[event]:(eventText[event] || escapeHtml(event)))}</div>`; }).join('');
}

function applyPreset(kind) {
  const simpleRules = { lawyer: false, jailer: false, vigilante: false, witch: false, serial_killer: false, jester: false, cupid: false, revealer: false, escort: false };
  const standardRules = { kids_mode: false, reveal_dead_roles: false, allow_no_vote: true, full_trial: true, godfather_innocent: true, mafia_kill_start_round: 2, mafia_kill_mode: 'after_first', mafia_kill_enabled: true };
  const presets = {
    quick: { mafia: Math.max(1, Math.round(game.players.length / 4)), detective: 1, roles: { ...simpleRules, ...standardRules, doctor: true, detective: true } },
    balanced: { mafia: Math.max(1, Math.round(game.players.length / 3)), detective: 1, roles: { ...simpleRules, ...standardRules, doctor: true, detective: true, lawyer: game.players.length >= 7, jailer: game.players.length >= 6 } },
    pro: { mafia: Math.max(1, Math.round(game.players.length / 3)), detective: 1, roles: { ...simpleRules, ...standardRules, doctor: true, detective: true, lawyer: true, jailer: true, vigilante: game.players.length >= 9, jester: game.players.length >= 10, escort: game.players.length >= 11 } },
    chaos: { mafia: Math.max(1, Math.round(game.players.length / 3)), detective: 1, roles: { ...simpleRules, ...standardRules, doctor: true, detective: true, jailer: true, vigilante: true, witch: true, serial_killer: true, jester: true, cupid: true, revealer: true, escort: true } },
    kids: { mafia: Math.min(2, Math.max(1, Math.round(game.players.length / 4))), detective: 1, roles: { ...simpleRules, kids_mode:true, doctor: game.players.length >= 5, detective: game.players.length >= 4, reveal_dead_roles:true, allow_no_vote:true, full_trial:false, godfather_innocent:false, mafia_kill_start_round:2, mafia_kill_mode:'after_first', mafia_kill_enabled:true } },
  };
  const preset = presets[kind]; if (!preset) return;
  mafiaCount = preset.mafia; detectiveCount = preset.detective;
  enabledRoles = normalizeEnabledRoles({ ...enabledRoles, ...preset.roles, kids_mode: kind === 'kids' });
  schedulePreferenceSave(); setupStep = 3; renderHost();
}
function setSetupStep(step){setupStep=Math.min(3,Math.max(1,step));lobbyPane='setup';renderHost()}
function toggleOption(key){if(key==='kids_mode'&&!enabledRoles.kids_mode){applyPreset('kids');setupStep=3;return}enabledRoles[key]=!enabledRoles[key];schedulePreferenceSave();renderHost()}
function changeMafiaKillStart(amount){const rounds=[0,2,3,4,5,6,7,8,9,10];const current=normalizeEnabledRoles(enabledRoles).mafia_kill_start_round;enabledRoles.mafia_kill_start_round=rounds[Math.max(0,Math.min(rounds.length-1,rounds.indexOf(current)+amount))];enabledRoles=normalizeEnabledRoles(enabledRoles);schedulePreferenceSave();renderHost()}
function presetChoice([id,icon,ar,en,detail,detailEn]){return '<button class="preset-choice" onclick="applyPreset(\''+id+'\')" data-no-translate><span class="preset-icon" aria-hidden="true">'+icon+'</span><span><strong>'+discussionText(ar,en)+'</strong><small>'+discussionText(detail,detailEn)+'</small></span><span class="preset-arrow" aria-hidden="true">‹</span></button>'}
function presetButtons(){const primary=[['quick','ϟ','سريعة','Quick','أفضل بداية · أدوار واضحة','Best start · Clear roles'],['balanced','⚖','كلاسيكية','Classic','للجولات المعتادة','For regular games']];const more=[['kids','✦','أطفال','Kids','بداية سهلة للصغار','A simple first game'],['pro','♛','احترافية','Expert','أدوار أكثر وتحدٍ أكبر','More roles, more challenge'],['chaos','◆','فوضوية','Chaos','قدرات ومفاجآت متنوعة','Unexpected combinations']];return '<div class="preset-grid preset-primary">'+primary.map(presetChoice).join('')+'</div><details class="advanced-settings preset-more" data-disclosure-key="setup-presets"><summary data-no-translate>'+discussionText('تشكيلات أخرى','More presets')+'</summary><div class="preset-grid">'+more.map(presetChoice).join('')+'</div></details>'}

function setupTabs(){return `<div class="setup-tabs"><button class="${setupStep===1?'on':''}" onclick="setSetupStep(1)">1 الإعداد</button><button class="${setupStep===2?'on':''}" onclick="setSetupStep(2)">2 الأدوار</button><button class="${setupStep===3?'on':''}" onclick="setSetupStep(3)">3 المراجعة</button></div>`}
function setupRoleCards(roles, review = false) {
  const cards = [['mafia_boss','👑',enabledRoles.kids_mode?'قائد الفريق الغامض':'زعيم المافيا',Math.min(1,roles.mafia),true],
    ['mafia','◆',enabledRoles.kids_mode?'الفريق الغامض':'فرد المافيا',Math.max(0,roles.mafia-1),true],
    ['doctor','🩺','الطبيب',roles.doctor],
    ['detective','🕵️','المحقق',roles.detectives],
    ['lawyer','⚖️','المحامي',roles.lawyer],
    ['jailer','🔐','السجّان',roles.jailer],
    ['vigilante','🎯','القناص',roles.vigilante],
    ['witch','🧪','الساحرة',roles.witch],
    ['serial_killer','🩸','القاتل المتسلسل',roles.serialKiller],
    ['jester','🃏','المهرج',roles.jester],
    ['revealer','📡','الكاشف',roles.revealer],
    ['cupid','💘','كيوبيد',roles.cupid],
    ['escort','🚫','المعطّل',roles.escort],
    ['citizen','🏘️','المواطن',roles.citizens,true]];
  const visible = review ? cards.filter(card => card[3] > 0).sort((a,b) => b[3] - a[3]) : cards;
  if(review)return '<div class="review-role-cards">' + visible.map(([role,,,count]) => interactiveRoleCard(role,{review:true,count})).join('') + '</div>';
  return '<div class="role-preview">' + visible.map(card => roleCard(...card)).join('') + '</div>';
}
function setupPanel(roles){
  if(setupStep===1)return `${setupTabs()}<h2>${discussionText('اختر طريقة اللعب','Choose how to play')}</h2><p class="muted" data-no-translate>${discussionText('اختر تشكيلة جاهزة لتصل مباشرة إلى المراجعة، أو خصّص الأدوار يدويًا.','Choose a ready preset to review it immediately, or customize roles manually.')}</p>${presetButtons()}${discussionSettings()}<details class="advanced-settings" data-disclosure-key="setup-counts"><summary data-no-translate>${discussionText('خيارات متقدمة: الأعداد والتحقيق','Advanced: counts and investigations')}</summary><div class="settings">${settingRow('عدد المافيا / Mafia', 'mafiaCount', mafiaCount, 1, 8)}${settingRow('عدد المحققين / Detectives', 'detectiveCount', detectiveCount, 0, 8)}${settingRow('إجمالي أسئلة كل محقق / Total questions per detective', 'detectiveQuestions', detectiveQuestions, 1, 5)}<p data-no-translate>${discussionText('سؤال واحد في كل جولة حتى انتهاء العدد المحدد.','One question per round until the selected total is reached.')}</p></div></details><div class="actions setup-choice-actions"><button class="btn" onclick="setSetupStep(2)" data-no-translate>${discussionText('تخصيص الأدوار','Customize roles')}</button><button class="btn red" onclick="setSetupStep(3)" data-no-translate>${discussionText('مراجعة وبدء','Review and start')} ←</button></div>`;
  if(setupStep===2)return `${setupTabs()}<h3 class="role-picker-title">اضغط البطاقة لتفعيلها أو إلغائها</h3>${setupRoleCards(roles)}<div class="actions"><button class="btn" onclick="setSetupStep(1)">رجوع</button><button class="btn red" onclick="setSetupStep(3)">التالي</button></div>`;
  const killStart=Number.isFinite(+enabledRoles.mafia_kill_start_round)?+enabledRoles.mafia_kill_start_round:1;
  const killLabel=killStart===0?'مغلق':`من الليلة ${killStart}`;
  return `${setupTabs()}<h3 class="role-picker-title" data-no-translate>${discussionText("الأدوار المختارة — من الأكثر عددًا للأقل","Selected roles — highest count first")}</h3><p class="muted" data-no-translate>${discussionText("اضغط الكرت لقلبه وقراءة خصائصه ومهامه.","Tap a card to flip it and read its abilities and tasks.")}</p>${setupRoleCards(roles,true)}<button class="btn" onclick="setSetupStep(2)" data-no-translate>${discussionText("تعديل الأدوار","Edit roles")}</button>${setupSummary(roles,false)}<details class="advanced-settings" data-disclosure-key="setup-rules" open><summary data-no-translate>${discussionText('خيارات بدء اللعبة','Game start options')}</summary><div class="rule-grid"><button class="rule-chip ${enabledRoles.kids_mode?'on':''}" onclick="toggleOption('kids_mode')">🧒 وضع الأطفال: ${enabledRoles.kids_mode?'مفعّل':'ملغي'}</button><div class="rule-chip kill-range ${killStart>0?'on':''}"><button onclick="changeMafiaKillStart(-1)" aria-label="تقليل ليلة بدء الاغتيال">−</button><span>🌙 اغتيال المافيا<br><b>${killLabel}</b></span><button onclick="changeMafiaKillStart(1)" aria-label="زيادة ليلة بدء الاغتيال">+</button></div><button class="rule-chip ${enabledRoles.godfather_innocent?'on':''}" onclick="toggleGodfatherReveal()">🕵️ العرّاب: ${enabledRoles.godfather_innocent?'يظهر بريئًا':'ينكشف مافيا'}</button><button class="rule-chip ${enabledRoles.reveal_dead_roles?'on':''}" onclick="toggleOption('reveal_dead_roles')">🎭 كشف دور الميت: ${enabledRoles.reveal_dead_roles?'نعم':'لا'}</button><button class="rule-chip ${enabledRoles.allow_no_vote?'on':''}" onclick="toggleOption('allow_no_vote')">✋ عدم التصويت: ${enabledRoles.allow_no_vote?'مسموح':'ممنوع'}</button><button class="rule-chip ${enabledRoles.full_trial?'on':''}" onclick="toggleOption('full_trial')">⚖️ المحاكمة: ${enabledRoles.full_trial?'كاملة':'تصويت مباشر'}</button><button class="rule-chip on" onclick="cycleTimer()">⏱️ المؤقت: ${phaseDuration} ثانية</button><button class="rule-chip ${soundEnabled?'on':''}" onclick="toggleSound()">${soundEnabled?'🔊':'🔇'} الصوت</button></div></details><div class="preference-status" id="prefsStatus">تم حفظ الإعدادات تلقائيًا ✓</div>${enabledRoles.kids_mode?'<div class="status">🧒 لعب بسيط: الفريق الغامض، الحارس، المحقق والأصدقاء فقط.</div>':''}${roles.valid?`<div class="status" data-no-translate>${discussionText(game.players.length<2?'بانتظار لاعبين على الأقل لبدء المباراة.':'✓ عدد الأدوار مناسب للاعبين.',game.players.length<2?'Waiting for at least two players.':'✓ Role counts fit the players.')}</div>`:`<div class="status wait">⚠️ اخترت ${roles.selectedTotal} دورًا ويوجد ${game.players.length} لاعبين فقط</div>`}<button class="btn red wide" ${game.players.length<2||!roles.valid?'disabled':''} onclick="startGame()" data-no-translate>${discussionText("توزيع الأدوار وبدء اللعبة","Deal roles and start game")}</button>`;
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
    roomQrImage = qr.createDataURL(5, 20);
    roomQrUrl = url;
  }
  return roomQrImage;
}

function renderHostContent() {
  setRoomTag();
  if (game.phase === 'lobby') {
    const roles = roleDistribution();
    const joinUrl = `${location.origin}/game.html?room=${game.code}`;
    $('#app').innerHTML = `${phaseBar()}${lobbyPaneTabs()}<div class="grid host-lobby" data-pane="${lobbyPane}"><aside class="lobby-side"><div class="card hero lobby-join"><div class="lobby-join-details"><div class="code">${game.code}</div><p class="muted">امسح الباركود للدخول مباشرة</p></div><img class="qr" width="240" height="240" src="${roomQrSource(joinUrl)}" alt="QR code"><div class="actions center"><button class="btn" onclick="shareRoom()">↗ مشاركة الغرفة</button><button class="btn" onclick="fillBots()">🤖 إكمال إلى 8 بالبوتات</button><button class="btn" onclick="showModeration()">🛡️ الإدارة</button>${delegatedHostMode?'<button class="btn" onclick="toggleDelegatedHost()">👤 العودة لدوري</button>':''}</div></div><div class="card lobby-players"><div class="toolbar"><h2>اللاعبون (${game.players.length})</h2><span class="connection-count">${game.players.filter((p)=>p.connected||p.isBot).length} جاهز</span></div>${lobbyPlayers()}</div></aside><section class="card setup-card" data-step="${setupStep}">${setupPanel(roles)}</section></div>`;
    return;
    $('#app').innerHTML = `<div class="grid host-lobby"><div><div class="card hero"><div class="code">${game.code}</div><img class="qr" src="${roomQrSource(joinUrl)}" alt="QR code"><p class="muted">امسح الباركود للدخول مباشرة / Scan to join</p></div><div class="card"><h2>اللاعبون / Players (${game.players.length})</h2><div class="players">${playerList()}</div></div></div><div class="card"><h2>إعداد القيم / Game setup</h2><div class="settings">${settingRow('عدد المافيا / Mafia', 'mafiaCount', mafiaCount, 1, 8)}${settingRow('عدد المحققين / Detectives', 'detectiveCount', detectiveCount, 0, 8)}${settingRow('إجمالي أسئلة كل محقق / Total questions per detective', 'detectiveQuestions', detectiveQuestions, 1, 5)}<p data-no-translate>${discussionText('سؤال واحد في كل جولة حتى انتهاء العدد المحدد.','One question per round until the selected total is reached.')}</p></div><h3 class="role-picker-title">كشف زعيم المافيا / Godfather investigation</h3><div class="role-preview boss-setting">${godfatherRevealCard()}</div><h3 class="role-picker-title">اضغط البطاقة لتفعيلها أو إلغائها</h3><div class="role-preview">${roleCard('mafia', '👑', 'المافيا والعرّاب', roles.mafia, true)}${roleCard('doctor', '🩺', 'الطبيب', roles.doctor)}${roleCard('detective', '🕵️', 'المحقق', roles.detectives)}${roleCard('lawyer', '⚖️', 'المحامي', roles.lawyer)}${roleCard('jailer', '🔐', 'السجّان', roles.jailer)}${roleCard('vigilante', '🎯', 'القناص', roles.vigilante)}${roleCard('witch', '🧪', 'الساحرة', roles.witch)}${roleCard('serial_killer', '🩸', 'القاتل المتسلسل', roles.serialKiller)}${roleCard('jester', '🃏', 'المهرج', roles.jester)}${roleCard('revealer','📡','الكاشف',roles.revealer)}${roleCard('cupid', '💘', 'كيوبيد', roles.cupid)}${roleCard('escort', '🚫', 'المعطّل', roles.escort)}${roleCard('citizen', '🏘️', 'المواطن', roles.citizens, true)}</div>${roles.valid ? '<p class="muted">الأدوار الملغية تتحول تلقائياً إلى مواطنين.</p>' : `<div class="status wait">⚠️ اخترت ${roles.selectedTotal} كرتاً ويوجد ${game.players.length} لاعبين فقط. ألغِ بعض الكروت.</div>`}<button class="btn red wide" ${game.players.length < 2 || !roles.valid ? 'disabled' : ''} onclick="startGame()">توزيع الأدوار وبدء الليل / Start game</button></div></div>`;
    return;
  }
  if (game.phase === 'paused') {
    $('#app').innerHTML = `${phaseBar()}<div class="card hero"><div class="role-title">⏸️ المباراة متوقفة</div><p>يمكن متابعة المباراة من المرحلة نفسها.</p><button class="btn red" onclick="hostAction('togglePause')">▶️ متابعة المباراة</button></div>`;
    return;
  }
  if (game.phase === 'reveal') {
    const ready = game.roleReadyCount || 0, total = game.players.length;
    $('#app').innerHTML = `${phaseBar()}<div class="grid"><div class="card hero"><div class="role-title">👁️ تأكيد الأدوار</div><div class="counter">${ready} / ${total}</div><p>كل لاعب يشاهد دوره سرًا ثم يضغط «فهمت دوري».</p><div class="progress"><span style="width:${total?ready/total*100:0}%"></span></div><button class="btn red wide" ${ready<total?'disabled':''} onclick="hostAction('beginNight')">🌙 بدء الليلة الأولى</button></div><div class="card"><h2>حالة اللاعبين</h2><div class="players">${playerList()}</div></div></div>`;
    return;
  }
  if (game.phase === 'night') {
    const firstNightNoDetective=firstNightWithoutDetective();
    const nightStatus=firstNightNoDetective?discussionText('لا يوجد محقق؛ لا توجد اختيارات هذه الليلة. أعلن الصباح الآن.','There is no detective, so there are no choices tonight. Announce morning now.'):game.nightReady?discussionText('اكتملت اختيارات الليل ✅','Night choices are complete ✅'):discussionText('بانتظار اختيارات الليل أو انتهاء المهلة…','Waiting for night choices or the timer…');
    $('#app').innerHTML = `${phaseBar()}<div class="grid"><div class="card hero"><div class="role-title">🌙 الليلة ${game.round}</div><p data-no-translate>${discussionText('الجميع يثبت اختياره سرًا. بعد المهلة يمكن إعلان الصباح دون اختيارات المتأخرين.','Everyone makes a private choice. After the timer, morning can be announced without late choices.')}</p><div class="status ${game.nightReady||firstNightNoDetective?'':'wait'}" data-no-translate>${nightStatus}</div><button class="btn red wide" ${game.nightReady||firstNightNoDetective||phaseTimeExpired() ? '' : 'disabled'} data-timeout-action="resolveNight" onclick="hostAction('resolveNight')">${discussionText('إعلان الصباح','Announce morning')}</button></div><div><div class="card">${eventCards()}<h2>حالة اللاعبين</h2><div class="players">${playerList()}</div></div></div></div>`;
    return;
  }
  if (game.phase === 'day') {
    const hasLawyer=game.players.some(player=>player.alive&&player.role==='lawyer'),hasJailer=game.players.some(player=>player.alive&&player.role==='jailer');
    const ready = (((!hasLawyer||game.lawyerReady) && (!hasJailer||game.jailerReady))||phaseTimeExpired()) && clientDiscussion().complete;
    const deaths = (game.lastDeaths || []).map((id) => `<div class="event danger-text">☠️ ${escapeHtml(nameOf(id))}</div>`).join('');
    const lawyerState=hasLawyer?`<div class="status ${game.lawyerReady ? '' : 'wait'}">${game.lawyerReady ? 'المحامي جاهز ✅' : 'بانتظار حماية المحامي…'}</div>`:'';
    const jailerState=hasJailer?`<div class="status ${game.jailerReady ? '' : 'wait'}">${game.jailerReady ? 'السجّان اختار السجين ✅' : 'بانتظار اختيار السجّان…'}</div>`:'';
    $('#app').innerHTML = `${phaseBar()}<div class="grid"><div class="card hero"><div class="role-title">☀️ الصباح</div>${eventCards()}${deaths || '<div class="status">لم يمت أحد هذه الليلة</div>'}${discussionPanel(true)}${lawyerState}${jailerState}<button class="btn gold wide" data-discussion-vote ${ready ? '' : 'disabled'} onclick="hostAction('startVote')">بدء التصويت</button></div><div class="card"><h2>الأحياء</h2><div class="players">${playerList(false, false, alivePlayers())}</div></div></div>`;
    return;
  }
  if (game.phase === 'nomination') {
    const alive = alivePlayers().length;
    $('#app').innerHTML = `${phaseBar()}<div class="grid"><div class="card hero"><div class="role-title">☝️ ترشيح متهم</div><div class="counter">${game.voteCount} / ${alive}</div><p>كل لاعب يرشّح شخصًا سرًا. بعد المهلة يُحسب غير المصوّت ممتنعًا.</p><button class="btn red wide" ${game.voteCount<alive&&!phaseTimeExpired()?'disabled':''} data-timeout-action="resolveVote" onclick="hostAction('resolveVote')">اختيار المتهم</button></div><div class="card"><h2>الأحياء</h2><div class="players">${playerList(false, false, alivePlayers())}</div></div></div>`;
    return;
  }
  if (game.phase === 'trial') {
    $('#app').innerHTML = `${phaseBar()}<div class="card hero trial-stage"><div class="role-title">⚖️ المتهم</div><div class="accused-name">${escapeHtml(nameOf(game.accusedPlayer))}</div><p>وقت الدفاع. المتهم يتحدث والبقية يستمعون.</p><button class="btn gold wide" onclick="hostAction('advanceVerdict')">الانتقال إلى الحكم</button></div>`;
    return;
  }
  if (game.phase === 'verdict') {
    const alive = Math.max(0,alivePlayers().length-1);
    $('#app').innerHTML = `${phaseBar()}<div class="grid"><div class="card hero"><div class="role-title">🔨 الحكم</div><h1>${escapeHtml(nameOf(game.accusedPlayer))}</h1><div class="counter">${game.voteCount} / ${alive}</div><p>إدانة أو براءة؟ بعد المهلة يُحسب غير المصوّت ممتنعًا.</p><button class="btn red wide" ${game.voteCount<alive&&!phaseTimeExpired()?'disabled':''} data-timeout-action="resolveVote" onclick="hostAction('resolveVote')">إعلان الحكم</button></div><div class="card"><h2>حالة المصوتين</h2><div class="players">${playerList(false)}</div></div></div>`;
    return;
  }
  if (game.phase === 'vote') {
    const alive = alivePlayers().length;
    $('#app').innerHTML = `${phaseBar()}<div class="grid"><div class="card hero"><div class="role-title">🗳️ التصويت السري</div><div class="counter">${game.voteCount} / ${alive}</div><p>بعد انتهاء المهلة يستطيع المضيف كشف النتيجة؛ غير المصوّت يُحسب ممتنعًا.</p><button class="btn red wide" ${game.voteCount < alive && !phaseTimeExpired() ? 'disabled' : ''} data-timeout-action="resolveVote" onclick="hostAction('resolveVote')">كشف النتيجة</button></div><div class="card"><h2>اللاعبون</h2><div class="players">${playerList(false)}</div></div></div>`;
    return;
  }
  $('#app').innerHTML = `${phaseBar()}<div class="grid"><div class="card hero"><div class="role-title">${winnerTitle()}</div><div class="players final-roles">${game.players.map((player) => `<div class="player"><span>${escapeHtml(player.name)} — ${roleNames[player.role] || player.role}</span></div>`).join('')}</div><div class="actions center"><button class="btn red" onclick="startGame()">🔄 إعادة مباراة</button><button class="btn" onclick="returnToLobby()">👥 العودة للردهة وتغيير اللاعبين</button><button class="btn" onclick="shareResult()">↗ مشاركة النتيجة</button><button class="btn" onclick="home()">الرئيسية</button></div></div><div class="card"><h2>سجل المباراة</h2><div class="timeline">${historyCards()||'<p class="muted">ستظهر أحداث المباراة هنا.</p>'}</div></div></div>`;
}
function winnerTitle() {
  if (game.winner === 'draw') return discussionText('⚖️ تعادل — لم يبقَ أحد حيًا','⚖️ Draw — no survivors');
  if (game.winner === 'cancelled') return '⛔ انتهت المباراة بدون نتيجة';
  if (game.winner === 'mafia') return '🔴 فازت المافيا';
  if (game.winner === 'jester') return `🃏 فاز المهرج${game.winnerPlayer ? `: ${escapeHtml(nameOf(game.winnerPlayer))}` : ''}`;
  if (game.winner === 'serial_killer') return '🩸 فاز القاتل المتسلسل';
  return '🏘️ فازت القرية';
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
  if (!Object.prototype.hasOwnProperty.call(enabledRoles, role)) return;
  enabledRoles[role] = !enabledRoles[role];
  schedulePreferenceSave(); renderHost();
}
function toggleGodfatherReveal() {
  enabledRoles.godfather_innocent = !enabledRoles.godfather_innocent;
  schedulePreferenceSave(); renderHost();
}
let lifecycleRequestPending = false;
async function leaveRoom() {
  if (lifecycleRequestPending || !game) return;
  if (!confirm('مغادرة الغرفة نهائيًا؟ ستفقد مقعدك في هذه المباراة. إغلاق الصفحة مؤقتًا يحفظ مقعدك.')) return;
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
    alert('لم تتأكد المغادرة. جلستك محفوظة؛ أعد المحاولة بعد عودة الاتصال.');
  } finally { lifecycleRequestPending = false; }
}
async function returnToLobby() {
  if (lifecycleRequestPending || game?.phase !== 'finished') return;
  lifecycleRequestPending = true;
  try {
    const next = await withBusy('جاري تجهيز ردهة الانتظار…', () => api({
      action:'returnToLobby', code:game.code, lifecycleVersion:game.lifecycleVersion,
      hostToken, id:playerId, playerToken
    }));
    game = next;
    localHistory = [];
    localStorage.removeItem(`mafia-history-${game.code}`);
    setupStep = 1;
    renderHost();
  } catch (error) {
    alert(error.code === 'STALE_GAME' ? 'تغيّرت حالة الغرفة. انتظر تحديث الشاشة.' : 'تعذر الرجوع للردهة، حاول مجددًا.');
  } finally { lifecycleRequestPending = false; }
}
async function startGame() {
  if (lifecycleRequestPending) return;
  lifecycleRequestPending = true;
  enabledRoles.phase_seconds=phaseDuration;
  try {
    game = await withBusy('جاري توزيع الأدوار… / Dealing roles…', () => api({ action: 'start', code: game.code, lifecycleVersion:game.lifecycleVersion, hostToken, id:playerId, playerToken, mafiaCount, detectiveCount, detectiveQuestions, enabledRoles }));
    localHistory = []; localStorage.removeItem(`mafia-history-${game.code}`);
    signalPhase(); rememberEvent();
    renderHost();
  } catch (error) { alert(error.code === 'STALE_GAME' ? 'تغيّرت حالة الغرفة. انتظر تحديث الشاشة ثم حاول مجددًا.' : 'تأكد من وجود لاعبين كافين / Check player count'); }
  finally { lifecycleRequestPending = false; }
}
async function hostAction(action) {
  try { const previous=game.phase; game = await api({ action, code: game.code, hostToken, id:playerId, playerToken }); if(previous!==game.phase)signalPhase(); rememberEvent(); renderHost(); }
  catch (error) { alert(error.code === 'STALE_GAME' ? 'تغيّرت حالة الغرفة أثناء الطلب. انتظر تحديث الشاشة ثم حاول مجددًا.' : error.code === 'WAITING_ACTIONS' ? 'بانتظار بقية اختيارات الليل' : 'بانتظار بقية اللاعبين'); }
}
async function kickPlayer(target){if(!confirm(discussionText('طرد اللاعب ','Remove player ')+nameOf(target)+discussionText(' من الغرفة؟ سيحتاج إلى الدخول مجددًا.',' from the room? They will need to rejoin.')))return;try{game=await api({action:'kick',code:game.code,hostToken,id:playerId,playerToken,target});renderHost()}catch{alert('تعذر طرد اللاعب')}}
async function addBot(){try{game=await api({action:'addBot',code:game.code,hostToken,id:playerId,playerToken});renderHost()}catch{alert('تعذر إضافة البوت')}}
async function fillBots(target){const chosen=target===undefined?prompt(discussionText('كم عدد اللاعبين الإجمالي؟ (2 إلى 20)','How many total players? (2 to 20)'),String(Math.max(8,game.players.length))):target;const desired=Math.max(2,Math.min(20,Number(chosen)||8));if(desired<game.players.length){alert(discussionText('العدد المطلوب أقل من عدد الموجودين. غادر بعض اللاعبين أولًا.','The requested total is below the current player count. Remove players first.'));return;}while(game.players.length<desired){const before=game.players.length;await addBot();if(game.players.length<=before)break;}renderHost()}
async function mutePlayer(target,muted){try{game=await api({action:'mute',code:game.code,hostToken,id:playerId,playerToken,target,muted});renderHost()}catch{alert('تعذر تعديل الكتم')}}
async function endGame(){if(!confirm(discussionText('إنهاء المباراة نهائيًا؟ لن تتمكن من استكمال هذه الجولة. للإيقاف المؤقت استخدم زر الإيقاف.','End this match permanently? This round cannot be resumed. Use Pause for a temporary break.')))return;try{game=await api({action:'endGame',code:game.code,hostToken,id:playerId,playerToken});closeSheet();renderHost()}catch{alert('تعذر إنهاء المباراة')}}
async function transferHost(target){if(!confirm('تسليم تحكم المضيف لهذا اللاعب؟'))return;try{game=await api({action:'transferHost',code:game.code,hostToken,id:playerId,playerToken,target});alert('تم تسليم التحكم ✅');renderHost()}catch{alert('تعذر نقل التحكم')}}
async function createReplacement(target){try{const result=await api({action:'createReplacement',code:game.code,hostToken,id:playerId,playerToken,target});await copyText(result.replacementCode);alert(`رمز استبدال ${result.target.name}: ${result.replacementCode}\nصالح 15 دقيقة وتم نسخه.`)}catch{alert('تعذر إنشاء رمز الاستبدال')}}
async function restoreSnapshot(snapshotId){if(!confirm('استعادة هذه المرحلة؟ سيتم حفظ الوضع الحالي أولًا.'))return;try{game=await api({action:'restoreSnapshot',code:game.code,hostToken,id:playerId,playerToken,snapshotId});renderHost()}catch{alert('تعذر استعادة النسخة')}}
async function showModeration(){try{const auth={code:game.code,hostToken,id:playerId,playerToken};const [log,status,saved]=await Promise.all([api({action:'moderationLog',...auth}),api({action:'systemStatus',...auth}),api({action:'listSnapshots',...auth})]);const reports=log.reports||[],snapshots=saved.snapshots||[];closeSheet();$('#app').innerHTML=`${phaseBar()}<div class="card"><div class="toolbar"><h1>🛡️ إدارة اللعبة</h1><button class="btn" onclick="renderHost()">رجوع</button></div><div class="stat-grid"><div><b>${status.spectators}</b><span>متفرج</span></div><div><b>${status.snapshots}</b><span>نسخة</span></div><div><b>${status.averageMs}</b><span>ms</span></div></div><h2>اللاعبون</h2><div class="admin-list">${game.players.filter(p=>!p.isBot).map(p=>`<div class="player"><span>${p.connected?'🟢':'⚪'} ${escapeHtml(p.name)}</span>${p.alive&&!['lobby','finished'].includes(game.phase)?disciplineButtons(p):''}<button class="mini-action" aria-label="${discussionText('نقل الاستضافة إلى','Transfer hosting to')} ${escapeHtml(p.name)}" onclick="transferHost(${jsArg(p.id)})">👑</button><button class="mini-action" aria-label="${discussionText('استبدال اللاعب','Replace player')} ${escapeHtml(p.name)}" onclick="createReplacement(${jsArg(p.id)})">🔄</button></div>`).join('')}</div><h2>النسخ التلقائية</h2>${snapshots.map(s=>`<div class="report"><b>${phaseIcon(s.phase)} الجولة ${s.round}</b><span>${new Date(s.created_at).toLocaleTimeString()}</span><button class="btn" onclick="restoreSnapshot(${s.id})">استعادة</button></div>`).join('')||'<p class="muted">ستُحفظ نسخة قبل نتائج الليل والتصويت.</p>'}<h2>البلاغات</h2>${reports.map(r=>`<div class="report"><b>${escapeHtml(nameOf(r.reporter_id))} ← ${escapeHtml(nameOf(r.target_id))}</b><p>${escapeHtml(r.reason)}</p></div>`).join('')||'<p class="muted">لا توجد بلاغات.</p>'}</div>`}catch{alert('تعذر تحميل لوحة الإدارة')}}
function roleAcknowledged() { return game?.me?.acknowledged === true; }
async function acknowledgeRole() { try{game=await api({action:'acknowledgeRole',code:game.code,id:playerId,playerToken});if(navigator.vibrate)navigator.vibrate(80);renderPlayer()}catch{alert('تعذر تأكيد الدور، حاول مرة ثانية')} }
function roleProperties() {
  return detailedRoleProperties(game.me.role,true);
}
let personalCardState = {key:'',open:false};
function personalRoleCard(compact=false) {
  const role=game?.me?.role;
  if(!Object.prototype.hasOwnProperty.call(roleNames,role))return '';
  const key=[game.code,game.matchId,game.me.id,role,roleAcknowledged()].join(':');
  if(personalCardState.key!==key)personalCardState={key,open:false};
  return interactiveRoleCard(role,{personal:true,compact,open:personalCardState.open});
}
function roleQuickSummary() {
  const role=game?.me?.role,rule=detailedRoleRules[role];
  if(!rule)return '';
  let first=discussionText('راقب المرحلة وانتظر ظهور اختيارك.','Watch the phase and wait for your choice.');
  if(role==='detective')first=discussionText('أول إجراء لك: افحص لاعبًا في الليلة الأولى.','First action: investigate a player on the first night.');
  else if(mafiaRoleClient(role))first=discussionText('أول اغتيال يبدأ من الليلة المحددة في إعداد الغرفة.','Your first kill starts on the night selected by the room settings.');
  else if(['doctor','witch','serial_killer','revealer','escort'].includes(role))first=discussionText('تظهر قدرتك الليلية عندما تصبح متاحة.','Your night ability appears when it becomes available.');
  else if(['jailer','lawyer'].includes(role))first=discussionText('يظهر اختيارك أثناء الصباح قبل التصويت.','Your choice appears during the day before voting.');
  else if(role==='vigilante')first=discussionText('تظهر طلقتك فقط إذا خرجت بالتصويت أو اغتالتك المافيا.','Your shot appears only if you are voted out or killed by Mafia.');
  else if(role==='cupid')first=discussionText('تظهر قدرتك في الليلة الثانية فقط.','Your ability appears on the second night only.');
  return `<section class="role-quick-summary" data-no-translate><span>${escapeHtml(rule[0])}</span><p>${escapeHtml(rule[1])}</p><strong>${escapeHtml(first)}</strong></section>`;
}
function roleReveal() {
  $('#app').innerHTML=`<section class="card hero personal-role-reveal"><div class="role-badge">${discussionText('دورك السري','Your secret role')}</div><h1 class="role-reveal-name">${escapeHtml(roleLabel(game.me.role))}</h1>${roleQuickSummary()}<p class="muted" data-no-translate>${discussionText('اقلب البطاقة لقراءة القواعد الكاملة.','Flip the card to read the full rules.')}</p>${personalRoleCard()}<div class="role-acknowledge"><button class="btn red wide" onclick="acknowledgeRole()" data-no-translate>${discussionText('فهمت دوري','I understand my role')}</button></div></section>`;
}
function mafiaRoleClient(role){return role==='mafia'||role==='mafia_boss'}
function renderPlayerContent() {
  setRoomTag();
  document.querySelector('.player-tools')?.remove();
  const me = game.me;
  if (game.phase === 'lobby') {
    const roster=game.players.map(player=>`<span>${player.connected||player.isBot?'●':'○'} ${escapeHtml(player.name)}</span>`).join('');
    $('#app').innerHTML = `<div class="card hero player-lobby"><div class="role-title">${discussionText('✅ أنت داخل الغرفة','✅ You are in the room')}</div><h2>${escapeHtml(me?.name || '')}</h2><p data-no-translate>${discussionText('المضيف يجهّز التشكيلة. سيظهر دورك هنا عند بدء المباراة، ومقعدك محفوظ عند الانقطاع المؤقت.','The host is preparing the game. Your role appears here when the match starts, and a brief disconnect keeps your seat.')}</p><div class="counter">${game.players.length}</div><p class="muted" data-no-translate>${discussionText('لاعبون داخل الغرفة','Players in the room')}</p><div class="player-lobby-roster" aria-label="${discussionText('أسماء اللاعبين','Player names')}">${roster}</div>${me?.isHost?'<button class="btn gold" onclick="toggleDelegatedHost()">👑 فتح تحكم المضيف</button>':''}</div>`;
    return;
  }
  if (!me) { $('#app').innerHTML = '<div class="card hero"><h2>فقدنا جلسة اللاعب</h2><button class="btn" onclick="home()">دخول من جديد</button></div>'; return; }
  if (!me.alive) { delegatedHostMode=false; if(document.querySelector('.game-sheet'))closeSheet(); renderSpectator(); return; }
  setTimeout(mountPlayerTools, 0);
  if (game.phase === 'paused') { $('#app').innerHTML = `${phaseBar()}<div class="card hero"><div class="role-title">⏸️ المباراة متوقفة</div><p>المضيف سيكمل المباراة من المرحلة نفسها.</p></div>`; return; }
  if (game.phase === 'finished') {
    $('#app').innerHTML = `${phaseBar()}<div class="card hero"><div class="role-title">${winnerTitle()}</div><p>دورك: ${roleNames[me.role]}</p><p class="muted">${me.isHost ? discussionText('افتح تحكم المضيف لإعادة المباراة.','Open host controls to play again.') : discussionText('انتظر المضيف لإعادة المباراة.','Wait for the host to play again.')}</p></div>`;
    return;
  }
  if (!me.alive) { $('#app').innerHTML = `<div class="card hero"><div class="role-title">💀 خرجت من القيم</div><p>تابع بصمت ولا تكشف دورك.</p><p class="muted">دورك: ${roleNames[me.role]}</p></div>`; return; }
  if (game.phase === 'reveal') { if (!roleAcknowledged()) roleReveal(); else $('#app').innerHTML = `${phaseBar()}<div class="card hero"><div class="role-title">✅ جاهز</div><p>انتظر بقية اللاعبين ثم يبدأ الليل.</p><div class="counter">${game.roleReadyCount} / ${game.players.length}</div></div>`; return; }
  if (!roleAcknowledged()) { roleReveal(); return; }
  if (game.phase === 'night') renderNight();
  else if (game.phase === 'day') { renderDay(); $('#app').insertAdjacentHTML('afterbegin', discussionPanel(false)+(me.role==='detective'?investigationPanel():'')); }
  else if (game.phase === 'trial') renderTrialPlayer();
  else if (game.phase === 'verdict') renderVerdict();
  else renderVote();
  $('#app').insertAdjacentHTML('afterbegin', bossDiscussionChoice());
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
function mountPlayerTools(){
  if(!game?.me?.alive||['lobby','reveal','finished'].includes(game.phase)||document.querySelector('.player-tools'))return;
  const canChat=game.phase==='night'&&(game.me.jailed||game.me.role==='jailer'||game.me.role==='mafia'||game.me.role==='mafia_boss');
  const tools=document.createElement('div');tools.className='player-tools';tools.innerHTML=`${game.me.isHost?'<button type="button" onclick="toggleDelegatedHost()">👑 التحكم / Host controls</button>':''}<button type="button" onclick="openWill()">📜 وصيتي / My will</button>${canChat?`<button type="button" data-chat-button onclick="openChat()">💬 محادثة / Chat ${chatHasUnread()?' 🔴':''}</button>`:''}<button type="button" onclick="openReport()">🚩 إبلاغ المضيف / Report to host</button>`;document.querySelector('#app').appendChild(tools);
}
function toggleDelegatedHost(){delegatedHostMode=!delegatedHostMode;document.querySelector('.player-tools')?.remove();delegatedHostMode?renderHost():renderPlayer()}
let sheetReturnFocus=null;
function closeSheet(){stopChatPolling();const sheet=document.querySelector('.game-sheet');if(!sheet)return;sheet.remove();document.querySelector('.shell')?.removeAttribute('inert');document.querySelector('.utility-bar')?.removeAttribute('inert');if(sheetReturnFocus?.isConnected)sheetReturnFocus.focus();sheetReturnFocus=null;}
function openSheet(title,body){closeSheet();sheetReturnFocus=document.activeElement;const sheet=document.createElement('div');sheet.className='game-sheet';sheet.innerHTML=`<div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="sheetTitle"><div class="toolbar"><h2 id="sheetTitle">${title}</h2><button aria-label="إغلاق / Close" class="close-sheet" onclick="closeSheet()">×</button></div>${body}</div>`;document.body.appendChild(sheet);document.querySelector('.shell')?.setAttribute('inert','');document.querySelector('.utility-bar')?.setAttribute('inert','');sheet.querySelector('.close-sheet').focus();
 sheet.addEventListener('focusin',event=>requestAnimationFrame(()=>event.target?.scrollIntoView?.({block:'nearest'})));
 sheet.addEventListener('keydown',event=>{
 if(event.key==='Escape'){event.preventDefault();closeSheet();return;}
 if(event.key!=='Tab')return;
 const items=[...sheet.querySelectorAll('button,input,textarea,select,a[href],[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
 const first=items[0],last=items.at(-1);
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 });}
function openWill(){openSheet('📜 وصيتي',`<p class="muted">اكتب ملاحظاتك. تظهر وصيتك بعد موتك إذا كان كشف الأدوار مفعّلًا.</p><label for="willText">${discussionText('وصيتك','Your will')}</label><textarea class="input will-input" id="willText" maxlength="500">${escapeHtml(game.me.willText||'')}</textarea><button class="btn red wide" onclick="saveWill()">حفظ الوصية</button>`)}
async function saveWill(){try{game=await api({action:'saveWill',code:game.code,id:playerId,playerToken,text:$('#willText').value});closeSheet();renderPlayer()}catch{alert('تعذر حفظ الوصية')}}
let unreadChat=false,chatNoticeAt=0,chatNoticePending=false;
function chatReadKey(){return `mafia-chat-read-${game?.code}-${playerId}-${game?.round}-${game?.me?.jailed||game?.me?.role==='jailer'?'jail':'mafia'}`;}
function chatHasUnread(){return unreadChat&&chatAllowed();}
function markChatRead(messages){const latest=messages?.at(-1);if(latest)localStorage.setItem(chatReadKey(),String(latest.id));unreadChat=false;document.querySelector('[data-chat-button]')?.replaceChildren(document.createTextNode('💬 محادثة / Chat'));}
async function pollChatNotification(){
 if(!chatAllowed()||document.querySelector('.chat-list')||chatNoticePending||Date.now()-chatNoticeAt<5000)return;
 chatNoticeAt=Date.now();chatNoticePending=true;const key=chatReadKey(),epoch=pollingEpoch;
 try{const result=await api({action:'messages',code:game.code,id:playerId,playerToken});
  if(epoch!==pollingEpoch||key!==chatReadKey()||!chatAllowed())return;
  const seen=Number(localStorage.getItem(key)||0);
  unreadChat=(result.messages||[]).some(m=>Number(m.id)>seen&&m.author_id!==playerId);
  const button=document.querySelector('[data-chat-button]');if(button)button.textContent=unreadChat?'💬 محادثة / Chat •':'💬 محادثة / Chat';
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
 try{const result=await api({action:'messages',code:game.code,id:playerId,playerToken});if(epoch===chatEpoch&&chatAllowed())renderChatSheet(result)}catch{alert(discussionText('المحادثة غير متاحة الآن','Chat is unavailable right now'))}
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
 }catch{if(epoch===chatEpoch)alert(discussionText('تعذر تحميل الرسائل القديمة.','Could not load older messages.'));}
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
 }catch(error){if(epoch===chatEpoch)alert(error.code==='MUTED'?discussionText('تم كتمك بواسطة المضيف','You were muted by the host'):error.code==='RATE_LIMITED'?discussionText('انتظر لحظة وأعد الإرسال','Wait a moment and send again'):discussionText('تعذر إرسال الرسالة','Could not send the message'))}
 finally{chatSending=false;if(button)button.disabled=false;}
}
function openReport(){const targets=game.players.filter((p)=>p.id!==playerId);openSheet('🚩 إبلاغ المضيف',`<label for="reportTarget">${discussionText('اللاعب المعني','Player concerned')}</label><select class="input" id="reportTarget"><option value="">بلاغ عام</option>${targets.map((p)=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}</select><label for="reportReason">${discussionText('سبب البلاغ','Report reason')}</label><textarea class="input" id="reportReason" maxlength="160" placeholder="اكتب سبب البلاغ"></textarea><button class="btn danger wide" onclick="sendReport()">إرسال البلاغ</button>`)}
async function sendReport(){try{await api({action:'report',code:game.code,id:playerId,playerToken,target:$('#reportTarget').value,reason:$('#reportReason').value});closeSheet();alert('تم إرسال البلاغ للمضيف')}catch{alert('اكتب سببًا واضحًا للبلاغ')}}

function renderTrialPlayer(){
  const accused=game.accusedPlayer===playerId;
  $('#app').innerHTML=`${phaseBar()}<div class="card hero trial-stage"><div class="role-title">⚖️ المحاكمة</div><div class="accused-name">${escapeHtml(nameOf(game.accusedPlayer))}</div><p>${accused?'أنت المتهم. دافع عن نفسك الآن.':'استمع إلى دفاع المتهم ثم قرر حكمك.'}</p></div>`;
}
function renderVerdict(){
  const accused=game.accusedPlayer===playerId;
  const options=`<div class="verdict-grid"><button class="pick execute" data-target="GUILTY" aria-pressed="false" onclick="castVote('GUILTY')">🔨 مذنب</button><button class="pick innocent" data-target="INNOCENT" aria-pressed="false" onclick="castVote('INNOCENT')">🕊️ بريء</button></div>`;
  $('#app').innerHTML=`${phaseBar()}<div class="card hero"><div class="role-title">🔨 الحكم</div><h1>${escapeHtml(nameOf(game.accusedPlayer))}</h1>${accused?'<div class="status wait">أنت المتهم ولا تصوّت على حكمك.</div>':(game.me.voted?'<div class="status">تم تسجيل حكمك ويمكنك تغييره.</div>':'')+options}</div>`;
}

function renderNight() {
  const me = game.me;
  if (game.round === 1 && me.role !== 'detective') {
    $('#app').innerHTML = `<div class="card" data-no-translate><h2>${discussionText('🔎 الليلة الأولى للمحقق فقط','🔎 First night: detective only')}</h2><p>${discussionText('لا اغتيال ولا حماية ولا قدرات أخرى هذه الليلة. انتظر الصباح.','No kills, protection, or other role actions tonight. Wait for morning.')}</p></div>`;
    return;
  }
  if (me.jailed) {
    $('#app').innerHTML = `<div class="card hero"><div class="role-title">🔒 أنت مسجون</div><p>قدرتك الليلية متوقفة. السجّان يقرر مصيرك هذه الليلة.</p></div>`;
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
    $('#app').innerHTML = `<div class="card"><div class="role-title">${roleNames[me.role]}</div><div class="status wait">فريقك: ${(me.mafiaTeam || []).map((x) => escapeHtml(x.name)).join('، ')}</div>${me.acted ? '<h2 class="ok">تم تسجيل اختيارك ✅</h2>' : `<h2>اختر هدف الاغتيال</h2>${choiceButtons(targets, 'confirmNightTarget', { icon: '🔪' })}<button class="pick skip" onclick="nightAction('SKIP')">⏭️ تخطي الاغتيال / Skip kill</button>`}<p class="muted">اختيار زعيم المافيا هو النهائي عند الاختلاف.</p></div>`;
    return;
  }
  if (me.role === 'doctor') {
    if (!me.doctorAvailable) {
    $('#app').innerHTML = `<div class="card" data-no-translate><h2>${discussionText('🩺 الطبيب','🩺 Doctor')}</h2><p>${discussionText('تبدأ الحماية من الليلة الثانية وتستمر حتى نهاية القيم.','Protection starts on night two and continues until the game ends.')}</p></div>`;
      return;
    }
    const targets = alivePlayers().filter((player) => player.id !== me.doctorLastTarget);
    $('#app').innerHTML = `<div class="card"><div class="role-title">${roleNames.doctor}</div>${me.acted ? '<h2 class="ok">تم تسجيل الحماية ✅</h2>' : `<h2>من ستحمي الليلة؟</h2>${choiceButtons(targets, 'nightAction', { icon: '🩺' })}`}<p class="muted">تقدر تحمي نفسك، ولا تقدر تكرر نفس اللاعب ليلتين.</p></div>`;
    return;
  }
  if (me.role === 'revealer') {
    $('#app').innerHTML = `<div class="card" data-no-translate><h2>${discussionText('📡 الكاشف','📡 Revealer')}</h2><p>${discussionText('كشف واحد بالقيم، بدون أسماء. اختر متى تستخدمه؛ النتيجة بالصباح.','One reveal per game, without names. Choose when to use it; result arrives in the morning.')}</p>${me.mafiaCountResult?`<p>${discussionText('استخدمت كشفك الوحيد. تقدر تواصل النقاش والتصويت.','Your reveal has been used. You can still discuss and vote.')}</p>`:me.acted?`<p>${discussionText('تم تسجيل قرارك ✅','Decision recorded ✅')}</p>`:`<button class="btn" onclick="nightAction('COUNT')">${discussionText('استخدام الكشف الوحيد','Use my one reveal')}</button> <button class="btn" onclick="nightAction('SKIP')">${discussionText('احتفظ بالكشف لليلة ثانية','Save for another night')}</button>`}</div>`;
    return;
  }
  if (me.role === 'detective') {
    const targets = alivePlayers().filter((player) => player.id !== playerId && !(me.selectedIds || []).includes(player.id));
    const finished = game.round > detectiveQuestionCount(game.detectiveQuestions);
    $('#app').innerHTML = `<div class="card" data-no-translate><div class="role-title">${discussionText('🕵️ المحقق','🕵️ Detective')}</div><p>${discussionText(`سؤال واحد كل جولة. إجمالي فرص التحقيق: ${detectiveQuestionCount(game.detectiveQuestions)}.`,`One question per round. Total investigation opportunities: ${detectiveQuestionCount(game.detectiveQuestions)}.`)}</p>${finished ? `<h2>${discussionText('انتهت فرص التحقيق المحددة. تقدر تواصل النقاش والتصويت.','Your investigation rounds are over. You can still discuss and vote.')}</h2>` : `<h2>${discussionText('سؤال الجولة','Round question')}: ${me.questionsUsed} / ${me.questionLimit}</h2>${me.acted ? `<p class="ok">${discussionText('تم تسجيل سؤالك. النتيجة بعد إعلان الصباح ✅','Question recorded. The result appears in the morning ✅')}</p>` : choiceButtons(targets, 'nightAction', { icon: '🔎' })}`}</div>`;
    return;
  }
  if (me.role === 'vigilante') {
    $('#app').innerHTML = `<div class="card" data-no-translate><div class="role-title">${discussionText('🎯 القناص','🎯 Sniper')}</div><p>${discussionText('لا توجد لك حركة ليلية. تتفعّل طلقتك الأخيرة إذا خرجت بالتصويت أو اغتالتك المافيا.','You have no night action. Your final shot activates if you are voted out or killed by Mafia.')}</p></div>`;
    return;
  }
  if (me.role === 'witch') {
    const targets = alivePlayers();
    $('#app').innerHTML = `<div class="card"><div class="role-title">${roleNames.witch}</div><p>🧪 الحياة: ${me.charges?.life ? 'متوفرة' : 'استُخدمت'} · ☠️ السم: ${me.charges?.poison ? 'متوفرة' : 'استُخدمت'}</p>${me.acted ? '<h2 class="ok">تم تسجيل الجرعة ✅</h2>' : `${me.charges?.life ? `<h2>جرعة الحياة</h2>${choiceButtons(targets, 'confirmLife', { icon: '💚' })}` : ''}${me.charges?.poison ? `<h2>جرعة السم</h2>${choiceButtons(targets.filter((p) => p.id !== playerId), 'confirmPoison', { icon: '☠️' })}` : ''}`}</div>`;
    return;
  }
  if (me.role === 'serial_killer') {
    const targets = alivePlayers().filter((player) => player.id !== playerId);
    $('#app').innerHTML = `<div class="card"><div class="role-title">${roleNames.serial_killer}</div>${me.acted ? '<h2 class="ok">تم اختيار الضحية ✅</h2>' : `<h2>من ستقتل الليلة؟</h2>${choiceButtons(targets, 'confirmNightTarget', { icon: '🩸' })}`}</div>`;
    return;
  }
  if (me.role === 'cupid') {
    if (game.round !== 2) {
      $('#app').innerHTML = `<div class="card hero"><div class="role-title">${roleNames.cupid}</div><p>قدرتك متاحة في الليلة الثانية فقط. انتظر الصباح.</p></div>`;
      return;
    }
    const targets = alivePlayers().filter((player) => player.id !== playerId && !(me.selectedIds || []).includes(player.id));
    $('#app').innerHTML = `<div class="card"><div class="role-title">${roleNames.cupid}</div><h2>اختر حبيبين: ${(me.selectedIds || []).length} / 2</h2>${me.acted ? '<h2 class="ok">تم ربط مصيرهما 💘</h2>' : choiceButtons(targets, 'nightAction', { icon: '💘' })}</div>`;
    return;
  }
  if (me.role === 'escort') {
    const targets = alivePlayers().filter((player) => player.id !== playerId);
    $('#app').innerHTML = `<div class="card"><div class="role-title">${roleNames.escort}</div>${me.acted ? '<h2 class="ok">تم تسجيل التعطيل ✅</h2>' : `<h2>من ستعطّل الليلة؟</h2>${choiceButtons(targets, 'nightAction', { icon: '🚫' })}`}</div>`;
    return;
  }
  if (me.role === 'jailer') {
    if (!me.jailedPlayer || me.executionsLeft <= 0) {
      $('#app').innerHTML = `<div class="card hero"><div class="role-title">${roleNames.jailer}</div><p>${me.executionsLeft <= 0 ? 'انتهت إعداماتك.' : 'لم تختر سجينًا لهذه الليلة.'}</p><p class="muted">الإعدامات المتبقية: ${me.executionsLeft}</p></div>`;
    } else {
      $('#app').innerHTML = `<div class="card hero"><div class="role-title">${roleNames.jailer}</div><h2>السجين: ${escapeHtml(me.jailedPlayer)}</h2><p>الإعدامات المتبقية: ${me.executionsLeft}</p>${me.acted ? '<h2 class="ok">تم تسجيل قرارك ✅</h2>' : '<div class="actions" style="justify-content:center"><button class="btn green" onclick="nightAction(\'SPARE\')">إطلاقه / Spare</button><button class="btn danger" onclick="confirmExecute()">إعدامه / Execute</button></div>'}</div>`;
    }
    return;
  }
  $('#app').innerHTML = `<div class="card hero"><div class="role-title">${roleNames[me.role]}</div><p>أغمض عينك وانتظر الصباح.</p></div>`;
}

function investigationPanel() {
  const results=(game.me?.investigationResults||[]).filter(r=>r.round===game.round);
  return `<section class="card" data-no-translate><h2>${discussionText('نتائج التحقيق','Investigation results')}</h2>${results.map(r=>`<p><b>${escapeHtml(r.name)}</b>: ${discussionText(r.result,r.result==='مافيا'?'Mafia':'Innocent')}</p>`).join('')||`<p>${(game.round>detectiveQuestionCount(game.detectiveQuestions)?discussionText('انتهت فرص التحقيق المحددة.','Your investigation rounds are over.'):discussionText('لا توجد نتيجة هذه الليلة؛ قد تكون القدرة معطّلة أو لم يُسجّل اختيار.','No result tonight; your ability may have been blocked or no choice was recorded.'))}</p>`}</section>`;
}
function renderDay() {
  const me = game.me;
  if (me.role === 'jailer') {
    const targets = alivePlayers().filter((player) => player.id !== playerId);
    $('#app').innerHTML = `<div class="card"><div class="role-title">${roleNames.jailer}</div>${me.jailerSelected ? `<h2 class="ok">السجين الليلة: ${escapeHtml(nameOf(me.jailerSelected))} ✅</h2>` : `<h2>من ستسجن الليلة؟</h2>${choiceButtons(targets, 'jailPlayer', { icon: '🔐' })}`}<p class="muted">المسجون لا يستخدم قدرته. إذا كان من المافيا يتوقف اغتيال الفريق.</p></div>`;
    return;
  }
  if (me.role === 'lawyer') {
    $('#app').innerHTML = `<div class="card"><div class="role-title">${roleNames.lawyer}</div>${me.acted ? '<h2 class="ok">تم تسجيل الحماية ✅</h2>' : `<h2>من ستحمي من التصويت؟</h2>${choiceButtons(alivePlayers(), 'lawyerProtect', { icon: '⚖️' })}`}</div>`;
    return;
  }
  $('#app').innerHTML = `<div class="card hero"><div class="role-title">☀️ الصباح</div>${eventCards()}<p>انتظر المضيف لبدء التصويت.</p></div>`;
}
function renderVote() {
  const me = game.me;
  const targets = alivePlayers().filter((player) => player.id !== playerId);
  const nomination=game.phase==='nomination';
  $('#app').innerHTML = `${phaseBar()}<div class="card"><div class="role-title">${nomination?'☝️ ترشيح متهم':'🗳️ التصويت السري'}</div>${me.voted?`<div class="status">✅ تم تسجيل صوتك ويمكنك تغييره حتى كشف النتيجة.</div>`:`<h2>${nomination?'من تريد محاكمته؟':'اختر لاعبًا للاستبعاد'}</h2>`}${choiceButtons(targets,'castVote')}${game.enabledRoles?.allow_no_vote?'<button class="pick skip" onclick="castVote(\'SKIP\')">✋ لا أريد اختيار أحد</button>':''}</div>`;
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
let pendingActionConfirmation=null;
function sensitiveActionCopy(kind,target){
  const name=target&&target!=='EXECUTE'?nameOf(String(target).replace(/^(SAVE|POISON):/,'')):'';
  const copies={
    kill:[discussionText('تأكيد الاستهداف','Confirm target'),discussionText('سيُسجل اختيارك على ','Your choice will be recorded for ')+name,discussionText('تأكيد الاختيار','Confirm choice')],
    poison:[discussionText('تأكيد جرعة السم','Confirm poison'),discussionText('ستُستهلك جرعة السم على ','Your poison charge will be used on ')+name,discussionText('استخدام السم','Use poison')],
    save:[discussionText('تأكيد جرعة الحياة','Confirm life potion'),discussionText('ستُستهلك جرعة الحياة لحماية ','Your life potion will be used to protect ')+name,discussionText('استخدام الجرعة','Use potion')],
    shot:[discussionText('تأكيد الطلقة الأخيرة','Confirm final shot'),discussionText('ستستخدم طلقتك الوحيدة على ','You will use your only shot on ')+name,discussionText('إطلاق','Shoot')],
    execute:[discussionText('تأكيد الإعدام','Confirm execution'),discussionText('سيُخصم إعدام واحد وينفذ القرار على السجين.','One execution will be spent and the prisoner will be executed.'),discussionText('تنفيذ الإعدام','Execute')],
  };
  return copies[kind]||copies.kill;
}
function confirmSensitiveAction(action,target,kind='kill'){
  if(playerActionPending)return;
  const [title,message,label]=sensitiveActionCopy(kind,target);
  pendingActionConfirmation={context:actionContext(),action,target};
  openSheet(title,`<div class="action-confirmation" data-no-translate><p>${escapeHtml(message)}</p><div class="actions"><button class="btn" onclick="cancelSensitiveAction()">${discussionText('إلغاء','Cancel')}</button><button class="btn danger" onclick="commitSensitiveAction()">${escapeHtml(label)}</button></div></div>`);
}
function cancelSensitiveAction(){pendingActionConfirmation=null;closeSheet()}
async function commitSensitiveAction(){
  const pending=pendingActionConfirmation;
  if(!pending||pending.context!==actionContext()){cancelSensitiveAction();return;}
  pendingActionConfirmation=null;closeSheet();
  await playerAction(pending.action,pending.target);
}
function confirmNightTarget(target){confirmSensitiveAction('act',target,'kill')}
function confirmShot(target){confirmSensitiveAction('act',target,'shot')}
function confirmPoison(target){confirmSensitiveAction('act',`POISON:${target}`,'poison')}
function confirmLife(target){confirmSensitiveAction('act',`SAVE:${target}`,'save')}
function confirmExecute(){confirmSensitiveAction('act','EXECUTE','execute')}
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
  document.querySelector('.player-tools')?.remove();
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
  } catch { alert(discussionText('تعذّر تثبيت الاختيار. حدّث الحالة وحاول مجددًا.','Could not save the choice. Refresh and try again.')); }
}
async function electMafiaLeader(target){
  try{game=await api({action:'electMafiaLeader',code:game.code,id:playerId,playerToken,target});renderPlayer();}catch{alert(discussionText('تعذر تسجيل اختيار الزعيم، حاول مرة ثانية.','Could not record your leader vote.'));}
}
async function resignMafiaLeader(){
 if(!confirm('التنازل وفتح تصويت سري لمدة 30 ثانية لاختيار زعيم بديل؟'))return;
 await electMafiaLeader('RESIGN');
}
function leaderElectionCard(){
 if(!game?.me?.alive||!roleAcknowledged()||['lobby','finished','paused'].includes(game.phase))return '';
 if(!game.me.leaderElection)return game.me.role==='mafia_boss'&&(game.me.mafiaTeam||[]).some(p=>p.id!==game.me.id&&p.alive!==false)?'<section id="leaderElectionCard" class="card"><button class="btn" onclick="resignMafiaLeader()">التنازل عن القيادة</button></section>':'';
 const ended=Date.now()+discussionClockOffset>=game.me.leaderDeadline;
 return `<section id="leaderElectionCard" class="card"><h2>اختيار زعيم المافيا الجديد</h2><p>تصويت سري بعد التنازل. الأكثر أصواتًا يصبح الزعيم، والتعادل بقرعة. تنتهي المهلة خلال 30 ثانية، وتبقى القيادة الحالية حتى حسم البديل.</p>${ended?'<button class="btn gold" onclick="electMafiaLeader(&quot;FINALIZE&quot;)">حسم التصويت وتحديث الكروت</button>':game.me.leaderVote?'<p>تم تسجيل صوتك. بانتظار بقية الفريق.</p>':choiceButtons((game.me.mafiaTeam||[]).filter(p=>p.id!==game.me.leaderFormer&&p.alive!==false),'electMafiaLeader',{icon:'👑'})}</section>`;
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
    if(game?.me?.isHost && !controller && !document.getElementById('controllerNotice'))$('#app').insertAdjacentHTML('afterbegin','<section id="controllerNotice" class="status"><p>👑 أنت تدير الغرفة الآن.</p><button class="btn" onclick="toggleDelegatedHost()">فتح تحكم المضيف</button></section>');
    if(!document.getElementById('leaderElectionCard'))$('#app').insertAdjacentHTML('afterbegin',leaderElectionCard());
    if(game?.me?.alive&&game.me.mafiaCountResult&&!document.getElementById('revealerResult')){const result=game.me.mafiaCountResult;$('#app').insertAdjacentHTML('afterbegin',`<section id="revealerResult" class="card" data-no-translate><h3>${discussionText('📡 نتيجة كشف الجولة','📡 Reveal result, round')} ${escapeHtml(result.round)}</h3><p>${discussionText('عدد المافيا الباقين عند إعلان الصباح','Mafia alive at dawn')}: <strong>${escapeHtml(result.count)}</strong></p></section>`);}
    if(!document.getElementById('voteSummaryNotice'))$('#app').insertAdjacentHTML('afterbegin',voteSummaryCard());
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
  renderWithNotices(renderPlayerContent);
  enhanceJourney(false);
  if(game?.me?.alive&&roleAcknowledged()&&!['lobby','finished'].includes(game.phase)&&!document.querySelector('.personal-role-card')){
    const bar=document.querySelector('#app .phase-bar');
    const reference=`<details class="role-reference"><summary>${discussionText('مراجعة دوري','Review my role')}: ${roleLabel(game.me.role)}</summary>${personalRoleCard(true)}</details>`;
    if(bar)bar.insertAdjacentHTML('afterend',reference);
    else $('#app').insertAdjacentHTML('afterbegin',reference);
  }
}
function playerStepStatus() {
  const me=game?.me;
  if(!me||!me.alive||['lobby','finished','paused'].includes(game.phase))return '';
  let state='wait',title=discussionText('انتظر المرحلة التالية','Wait for the next step'),detail=discussionText('لا يوجد إجراء مطلوب منك الآن.','No action is required from you right now.');
  if(game.phase==='reveal'){
    if(!roleAcknowledged()){state='action';title=discussionText('مطلوب منك الآن','Your action is needed');detail=discussionText('اقرأ دورك سرًا ثم أكد فهمه.','Read your role privately, then confirm it.');}
    else{state='done';title=discussionText('أنت جاهز','You are ready');detail=discussionText('بانتظار تأكيد بقية اللاعبين.','Waiting for the other players to confirm.');}
  }else if(document.querySelector('#app .pick:not(:disabled), #app .verdict-grid button:not(:disabled)')){
    state='action';title=discussionText('مطلوب اختيارك','Choose now');detail=discussionText('اختر هدفك، ثم انتظر رسالة تأكيد التسجيل.','Choose a target, then wait for the saved confirmation.');
  }else if(me.acted||me.voted){
    state='done';title=discussionText('تم تسجيل اختيارك','Your choice is saved');detail=discussionText('راقب المرحلة؛ سيخبرك المضيف أو المؤقت بالخطوة التالية.','Watch the phase; the host or timer will show the next step.');
  }else if(game.phase==='night'&&game.round===1&&me.role!=='detective'){
    title=discussionText('لا إجراء لك هذه الليلة','No action for you tonight');detail=discussionText('الليلة الأولى للتحقيق فقط. انتظر إعلان الصباح.','The first night is for investigation only. Wait for morning.');
  }else if(game.phase==='trial'){
    title=game.accusedPlayer===playerId?discussionText('دافع عن نفسك الآن','Defend yourself now'):discussionText('استمع إلى دفاع المتهم','Listen to the defense');
    detail=discussionText('يبدأ التصويت على الحكم بعد انتهاء الدفاع.','The verdict vote starts after the defense.');
  }else if(game.phase==='day'){
    title=discussionText('وقت النقاش','Discussion time');detail=discussionText('ناقش أحداث الجولة واستعد للتصويت.','Discuss the round and prepare to vote.');
  }
  return `<section class="player-step-status ${state}" data-no-translate role="status"><span>${state==='action'?'●':state==='done'?'✓':'○'}</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div></section>`;
}
function setupSummary(roles, showCounts = true){
  const counts=[['mafia',roles.mafia],['doctor',roles.doctor],['detective',roles.detectives],['lawyer',roles.lawyer],['jailer',roles.jailer],['vigilante',roles.vigilante],['witch',roles.witch],['serial_killer',roles.serialKiller],['jester',roles.jester],['cupid',roles.cupid],['escort',roles.escort],['revealer',roles.revealer],['citizen',roles.citizens]];
  return `<section class="setup-summary"><h2 data-no-translate>${discussionText('ملخص المباراة قبل التوزيع','Review before dealing')}</h2><p data-no-translate>${discussionText('اللاعبون','Players')}: <b>${game.players.length}</b> · ${discussionText('مهلة المرحلة','Phase time')}: <b>${phaseDuration}</b> ${discussionText('ثانية','seconds')}</p>${showCounts ? `<ul>${counts.filter(([,count])=>count>0).map(([role,count])=>`<li>${roleLabel(role)} <b>× ${count}</b></li>`).join('')}</ul>` : ''}<p data-no-translate>${discussionText('بعد التوزيع يقرأ الجميع أدوارهم ويؤكدونها، ثم تبدأ الليلة الأولى للمحقق فقط.','After dealing, everyone reads and confirms their role. The first night is for detectives only.')}</p></section>`;
}
function showMatchTools(){
  openSheet(discussionText('إدارة المباراة','Game management'),`<div data-no-translate><button class="btn wide" onclick="showModeration()">${discussionText('اللاعبون والبلاغات','Players and reports')}</button><section class="danger-zone"><h3>${discussionText('إنهاء نهائي','End permanently')}</h3><p>${discussionText('للاستراحة استخدم الإيقاف المؤقت. الإنهاء ينهي المباراة الحالية.','Use Pause for a break. Ending closes the current match.')}</p><button class="btn danger wide" onclick="endGame()">${discussionText('إنهاء المباراة','End match')}</button></section></div>`);
}
function enhanceJourney(controller){
  if(!game)return;
  if(typeof pendingActionConfirmation!=='undefined'&&pendingActionConfirmation&&pendingActionConfirmation.context!==actionContext())cancelSensitiveAction();
  if(!document.querySelector('#app .phase-bar'))$('#app').insertAdjacentHTML('afterbegin',phaseBar());
  if(!controller&&!document.getElementById('playerStepStatus')){
    const statusHtml=playerStepStatus();
    if(statusHtml){const holder=document.createElement('div');holder.innerHTML=statusHtml;const status=holder.firstElementChild;status.id='playerStepStatus';document.querySelector('#app .phase-bar').insertAdjacentElement('afterend',status);}
  }
  let hint='';
  if(controller){
    const messages={lobby:['شارك كود الغرفة، ثم اختر التشكيلة وراجع الملخص.','Share the room code, choose a preset, then review the summary.'],reveal:[`بانتظار تأكيد ${Math.max(0,game.players.length-(game.roleReadyCount||0))} لاعب. يبدأ الليل عند تأكيد الجميع.`,`Waiting for ${Math.max(0,game.players.length-(game.roleReadyCount||0))} players. Night can begin when everyone confirms.`],night:['إعلان الصباح متاح بعد اكتمال الاختيارات أو انتهاء المهلة.','Morning becomes available when choices are complete or time runs out.'],day:['بدء التصويت يتطلب انتهاء النقاش واكتمال قدرات النهار أو انتهاء مهلتها.','Voting requires discussion to finish and day abilities to complete or time out.'],nomination:['اختيار المتهم متاح بعد اكتمال الأصوات أو انتهاء المهلة.','Resolve nominations when all votes arrive or time runs out.'],verdict:['إعلان الحكم متاح بعد اكتمال الأصوات أو انتهاء المهلة.','Reveal the verdict when all votes arrive or time runs out.'],vote:['كشف النتيجة متاح بعد اكتمال الأصوات أو انتهاء المهلة.','Reveal the result when all votes arrive or time runs out.']};
    if(messages[game.phase])hint=discussionText(...messages[game.phase]);
  }else if(game.phase==='reveal'&&!roleAcknowledged())hint=discussionText('اقرأ شرح دورك بقلب البطاقة، ثم اضغط «فهمت دوري». لا تعرض شاشتك للآخرين.','Flip the card to read your role, then choose “I understand”. Keep your screen private.');
  else if(game.me?.alive&&document.querySelector('#app .pick'))hint=discussionText('اضغط اسم الهدف لإرسال اختيارك. انتظر رسالة تأكيد التسجيل.','Tap a target to send your choice. Wait for confirmation that it was recorded.');
  if(hint){const node=document.createElement('p');node.className='journey-hint';node.setAttribute('data-no-translate','');node.textContent=hint;(document.getElementById('playerStepStatus')||document.querySelector('#app .phase-bar')).insertAdjacentElement('afterend',node);}
  document.querySelectorAll('.setup-tabs button').forEach((button,index)=>{if(index+1===setupStep)button.setAttribute('aria-current','step');});
  paintActionFeedback();updatePhaseTimer();
}
function renderHost(){renderWithNotices(renderHostContent,true);enhanceJourney(true);mountHostProgress();}
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
  const app = document.querySelector('#app');
  const lobby = game?.phase === 'lobby';
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
    status = !roles.valid ? discussionText('الأدوار أكثر من اللاعبين؛ قلّل الأدوار.','Too many roles; reduce the selection.') : game.players.length < 2 ? discussionText('يلزم لاعبان على الأقل لبدء المباراة.','At least two players are needed to start.') : discussionText(game.players.length + ' لاعبين · عدد الأدوار مناسب',game.players.length + ' players · Role counts fit');
  } else if (game.phase === 'reveal') {
    status = discussionText('أكد دوره ' + (game.roleReadyCount || 0) + ' من ' + game.players.length,(game.roleReadyCount || 0) + ' of ' + game.players.length + ' roles confirmed');
  } else if (game.phase === 'paused') {
    status = discussionText('استكمل من المرحلة نفسها.','Resume from the same phase.');
  } else if (!button.disabled) {
    status = discussionText('جاهز للمتابعة','Ready to continue');
  } else if (game.phase === 'night') {
    status = firstNightWithoutDetective()?discussionText('لا توجد اختيارات؛ أعلن الصباح الآن.','No choices are needed; announce morning now.'):discussionText('بانتظار اختيارات الليل أو انتهاء المهلة.','Waiting for night choices or the timer.');
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
