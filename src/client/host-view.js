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
