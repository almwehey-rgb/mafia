let hostAccessInfo=null;
function hostCodeError(error) {
 return ({ACCESS_CODE_EXHAUSTED:'انتهى رصيد المباريات. تواصل مع صاحب اللعبة لزيادته.',ACCESS_CODE_DISABLED:'تم إيقاف رمز الاستضافة. تواصل مع صاحب اللعبة.',ACCESS_CODE_BOUND:'هذا الرمز مرتبط بحساب آخر. استخدم نفس الجهاز أو استرجع حسابك أولًا.',INVALID_ACCESS_CODE:'رمز الاستضافة غير صحيح أو موقوف.',LOGIN_RATE_LIMITED:'محاولات كثيرة. انتظر 15 دقيقة.'})[error?.code];
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
  $('#app .auth-card').insertAdjacentHTML('beforeend',`<details class="host-pass-login"><summary>عندي رمز استضافة</summary><p class="muted">الرمز يرتبط بحسابك الحالي عند أول استخدام. يُخصم رصيد عند بدء كل مباراة، بما فيها إعادة توزيع الأدوار.</p><label for="hostPassCode">رمز الاستضافة</label><input class="input" id="hostPassCode" maxlength="24" dir="ltr" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX"><button class="btn wide" onclick="loginHostPass()">دخول برمز الاستضافة</button></details>`);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') loginHost(); });
  $('#hostPassCode').addEventListener('keydown',event=>{if(event.key==='Enter')loginHostPass();});
  $('#app .host-pass-login').insertAdjacentHTML('beforeend','<button class="btn wide" onclick="recoveryForm()">استرجاع حسابي على جهاز آخر</button>');
  input.focus({ preventScroll: true });
}
async function loginHost() {
  const pin = normalizeEntryDigits($('#hostPin')?.value || '');
  if (!/^\d{8}$/.test(pin || '')) { alert('أدخل الرمز المكوّن من 8 أرقام'); return; }
  try {
    const result = await withBusy('جاري تسجيل الدخول…', () => api({ action: 'hostLogin', pin }));
    hostAccessToken = result.hostAccessToken;
    hostAccessInfo=result.hostAccess;
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
 renderHostAccessTools();
}
async function loadHostPreferences() {
  try {
    const result = await api({ action: 'hostPreferences', hostAccessToken });
    hostAccessInfo=result.hostAccess;
    applyHostPreferences(result.preferences || {});
    renderHostHome();
  } catch {
    hostAccessToken = '';
    localStorage.removeItem('mafia-host-access-token');
    renderHostLogin();
  }
}
function renderHostAccessTools() {
 if(hostAccessInfo?.isOwner)$('#app .cinema-tools')?.insertAdjacentHTML('afterbegin','<button onclick="showHostCodes()"><span aria-hidden="true">🔑</span>إدارة رموز الاستضافة</button>');
 else if(hostAccessInfo)$('#app .cinema-actions')?.insertAdjacentHTML('afterbegin',`<div class="status" role="status">رصيدك: <b>${Number(hostAccessInfo.remaining)||0}</b> مباريات<p class="muted">تُحسب عند بدء المباراة أو إعادة توزيع الأدوار.</p></div>`);
}
async function loginHostPass() {
 const accessCode=($('#hostPassCode')?.value||'').trim();
 if(!accessCode){alert('أدخل رمز الاستضافة');return;}
 try {
  const result=await withBusy('جاري تفعيل رمز الاستضافة…',()=>api({action:'hostLogin',accessCode,profileToken}));
  hostAccessToken=result.hostAccessToken;hostAccessInfo=result.hostAccess;
  localStorage.setItem('mafia-host-access-token',hostAccessToken);
  applyHostPreferences(result.preferences||{});renderHostHome();
 } catch(error){alert(hostCodeError(error)||'تعذر الدخول، حاول مرة أخرى.');}
}
let hostCodesBusy=false;
async function showHostCodes() {
 try {
  const result=await withBusy('جاري تحميل الرموز…',()=>api({action:'hostCodes',hostAccessToken}));
  setRoomTag('🔑');
  $('#app').innerHTML=`<section class="card host-code-manager"><div class="toolbar"><h1>رموز الاستضافة</h1><button class="btn" onclick="loadHostPreferences()">رجوع</button></div><p>كل رمز يرتبط بأول حساب يستخدمه. اللاعبون يدخلون الغرف مجانًا. يُخصم استخدام عند بدء المباراة أو إعادة توزيع الأدوار.</p><form onsubmit="event.preventDefault();createHostCode()"><label for="codeLabel">اسم الشخص / ملاحظة</label><input id="codeLabel" class="input" maxlength="80" required placeholder="مثال: أحمد"><label for="codeGames">عدد المباريات</label><input id="codeGames" class="input" type="number" min="1" max="10000" value="5" required><button class="btn red" type="submit">إنشاء رمز</button></form><h2>الرموز — أحدث 200 رمز</h2><div class="host-code-list">${result.codes.map(c=>`<article class="host-code-item"><div class="toolbar"><b>${escapeHtml(c.label||'بدون اسم')}</b><span>${c.active?(c.remaining?'نشط':'نفد الرصيد'):'موقوف'}</span></div><code dir="ltr">${escapeHtml(c.code.match(/.{1,4}/g).join('-'))}</code><p>المتبقي: <b>${c.remaining}</b> · المستخدم: ${c.used} · ${c.claimed_at?'مرتبط بحساب':'لم يُستخدم بعد'}</p><div class="actions"><button class="btn" onclick="copyHostCode(${jsArg(c.code)})">نسخ</button><button class="btn" onclick="addHostCodeGames(${jsArg(c.id)})">زيادة الرصيد</button><button class="btn" onclick="changeHostCode(${jsArg(c.id)},0,${!c.active})">${c.active?'إيقاف':'تفعيل'}</button></div></article>`).join('')||'<p class="muted">ما عندك رموز حتى الآن.</p>'}</div></section>`;
 }catch(error){alert(error.code==='UNAUTHORIZED'?'إدارة الرموز متاحة لصاحب الرمز الرئيسي فقط.':'تعذر تحميل الرموز. حاول مجددًا.');}
}
async function createHostCode() {
 if(hostCodesBusy)return;
 const label=$('#codeLabel').value.trim(),games=Number($('#codeGames').value);
 if(!label||!Number.isSafeInteger(games)||games<1||games>10000){alert('اكتب الاسم وعددًا من 1 إلى 10000.');return;}
 hostCodesBusy=true;
 try {await withBusy('جاري إنشاء الرمز…',()=>api({action:'hostCodes',operation:'create',hostAccessToken,label,games}));await showHostCodes();}
 catch{alert('تعذر تأكيد إنشاء الرمز. حدّث قائمة الرموز قبل إعادة المحاولة.');}
 finally{hostCodesBusy=false;}
}
async function copyHostCode(code) {
 try{await navigator.clipboard.writeText(code.match(/.{1,4}/g).join('-'));alert('تم نسخ رمز الاستضافة');}
 catch{window.prompt('انسخ الرمز:',code.match(/.{1,4}/g).join('-'));}
}
function addHostCodeGames(id) {
 const answer=window.prompt('كم مباراة تبي تضيف؟','5');if(answer===null)return;
 const games=Number(answer);if(!Number.isSafeInteger(games)||games<1||games>10000){alert('اكتب عددًا من 1 إلى 10000.');return;}
 changeHostCode(id,games);
}
async function changeHostCode(codeId,addGames,active) {
 if(hostCodesBusy)return;
 hostCodesBusy=true;
 try{await withBusy('جاري تحديث الرمز…',()=>api({action:'hostCodes',operation:'update',hostAccessToken,codeId,addGames,active}));await showHostCodes();}
 catch{alert('تعذر تأكيد التحديث. حدّث القائمة قبل إعادة المحاولة.');}
 finally{hostCodesBusy=false;}
}
