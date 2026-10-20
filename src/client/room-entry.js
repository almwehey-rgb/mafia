async function createRoom() {
  spectatorMode=false;delegatedHostMode=false;playerId='';playerToken='';
  try {
    game = await withBusy('جاري إنشاء الغرفة… / Creating room…', () => api({ action: 'create', hostAccessToken, mafiaCount, detectiveCount, detectiveQuestions, enabledRoles }));
    hostToken = game.hostToken;
    enabledRoles = normalizeEnabledRoles(game.enabledRoles);
    saveSession(true);
    renderHost();
    startPolling(true);
  } catch (error) { if (error.code === 'UNAUTHORIZED') { logoutHost(); alert('انتهت جلسة المضيف. سجّل الدخول من جديد.'); } else alert(hostCodeError(error)||'تعذر إنشاء الغرفة / Could not create room'); }
}
async function joinHostSeat() {
 if(playerId&&game.players.some(p=>p.id===playerId))return true;
 const name=(prompt('اسمك داخل المباراة — ستشارك كلاعب')||'').trim().slice(0,20);if(!name)return false;
 const id=crypto.randomUUID(),token=crypto.randomUUID();
 try{game=await api({action:'join',code:game.code,id,playerToken:token,profileToken,name,hostToken});playerId=id;playerToken=game.playerToken||token;saveSession(true);renderHost();return true;}
 catch{alert('تعذر الانضمام. تأكد أن الاسم غير مستخدم وأن الغرفة ليست ممتلئة.');return false;}
}
async function createSoloRoom() {
  spectatorMode=false;delegatedHostMode=false;playerId='';playerToken='';
  const soloName = (window.prompt('اكتب اسمك في اللعبة / Enter your name', 'أنت') || '').trim().slice(0,20);
  if (!soloName) return;
  const chosenDifficulty = (window.prompt('اختر الصعوبة: easy أو balanced أو hard', 'balanced') || 'balanced').trim().toLowerCase();
  const soloDifficulty = ['easy','balanced','hard'].includes(chosenDifficulty) ? chosenDifficulty : 'balanced';
  try {
    game = await withBusy('جاري تجهيز لعبة فردية… / Preparing solo game…', () => api({ action: 'create', hostAccessToken, mafiaCount: 2, detectiveCount: 1, detectiveQuestions: 3, enabledRoles: { ...enabledRoles, solo_mode: true, solo_difficulty: soloDifficulty } }));
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
  const codeField=$('#roomCode');if(codeField.type!=='hidden')codeField.outerHTML=`<div class="room-entry-actions">${codeField.outerHTML}${cameraJoinButton()}</div>`;
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
let roomScanner=null;
function cameraJoinButton(){return '<button class="btn camera-join" type="button" onclick="openRoomScanner()" aria-label="مسح باركود الغرفة بالكاميرا" title="مسح باركود الغرفة بالكاميرا"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 7h4l2-3h6l2 3h4v13H3Z"/><circle cx="12" cy="13" r="4"/></svg></button>';}
function scannedRoomCode(value){
 const text=String(value||'').trim();if(/^\d{4}$/.test(text))return text;
 try{const url=new URL(text);return url.origin===location.origin&&['/','/game','/game.html'].includes(url.pathname)&&/^\d{4}$/.test(url.searchParams.get('room')||'')?url.searchParams.get('room'):null;}catch{return null;}
}
function stopRoomScanner(){
 const scanner=roomScanner;roomScanner=null;if(!scanner)return;
 clearTimeout(scanner.timer);scanner.stream?.getTracks().forEach(track=>track.stop());
 if(scanner.video)scanner.video.srcObject=null;
}
async function openRoomScanner(){
 openSheet('مسح باركود الغرفة',`<div class="room-scanner"><video id="roomScanVideo" autoplay muted playsinline aria-label="معاينة الكاميرا"></video><p id="roomScanStatus" role="status">جاري فتح الكاميرا…</p><p class="muted">وجّه الكاميرا نحو باركود الغرفة. الصور تُقرأ على جهازك ولا تُرفع.</p><button class="btn wide" onclick="closeSheet();joinForm()">إدخال رقم الغرفة يدويًا</button></div>`);
 const scanner={video:document.getElementById('roomScanVideo'),stream:null,timer:null};roomScanner=scanner;
 const status=document.getElementById('roomScanStatus');
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('CAMERA_UNAVAILABLE');
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  if(roomScanner!==scanner){stream.getTracks().forEach(track=>track.stop());return;}
  scanner.stream=stream;scanner.video.srcObject=stream;await scanner.video.play();
  let detector=null;
  if(window.BarcodeDetector){try{detector=new window.BarcodeDetector({formats:['qr_code']});}catch{}}
  if(!detector){await loadFeatureScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');if(typeof window.jsQR!=='function')throw Error('DECODER_UNAVAILABLE');}
  if(roomScanner!==scanner)return;
  status.textContent='ضع الباركود داخل إطار الكاميرا';
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
  async function scan(){
   if(roomScanner!==scanner)return;
   try{
    let value='';
    if(scanner.video.readyState>=2){
     if(detector)value=(await detector.detect(scanner.video))[0]?.rawValue||'';
     else{const scale=Math.min(1,640/scanner.video.videoWidth);canvas.width=Math.round(scanner.video.videoWidth*scale);canvas.height=Math.round(scanner.video.videoHeight*scale);context.drawImage(scanner.video,0,0,canvas.width,canvas.height);const pixels=context.getImageData(0,0,canvas.width,canvas.height);value=window.jsQR(pixels.data,canvas.width,canvas.height)?.data||'';}
    }
    if(roomScanner!==scanner)return;
    const code=scannedRoomCode(value);
    if(code){closeSheet();joinForm(code);return;}
    if(value)status.textContent='هذا ليس باركود غرفة من موقع اللعبة';
   }catch{if(roomScanner===scanner)status.textContent='تعذرت قراءة الباركود، قرّب الكاميرا وحاول مجددًا';}
   if(roomScanner===scanner)scanner.timer=setTimeout(scan,180);
  }
  scan();
 }catch(error){
  if(roomScanner!==scanner)return;stopRoomScanner();
  status.textContent=error.name==='NotAllowedError'?'اسمح باستخدام الكاميرا من إعدادات المتصفح، أو أدخل رقم الغرفة يدويًا.':'تعذر تشغيل الماسح. تأكد من الكاميرا والاتصال أو أدخل رقم الغرفة يدويًا.';
 }
}
window.addEventListener('pagehide',stopRoomScanner);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&roomScanner)closeSheet();});
