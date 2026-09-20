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
    game = await withBusy('جاري تجهيز لعبة فردية… / Preparing solo game…', () => api({ action: 'create', hostAccessToken, mafiaCount: 2, detectiveCount: 1, detectiveQuestions: 3, enabledRoles: { ...enabledRoles, solo_mode: true } }));
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
