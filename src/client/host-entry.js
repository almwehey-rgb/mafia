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
