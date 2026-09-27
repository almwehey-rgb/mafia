function readSavedSession(code='') {
  try { const raw=localStorage.getItem(code?sessionKey(code):'mafia-session')||localStorage.getItem('mafia-session');const session=JSON.parse(raw||'null');return /^\d{4}$/.test(session?.code||'')&&(!code||session.code===code)?session:null; } catch { return null; }
}
function renderResumeCard(session,offline=false) {
  setRoomTag();
  $('#app').innerHTML=`<section class="card resume-card" data-no-translate aria-labelledby="resumeTitle"><div class="resume-emblem" aria-hidden="true">♠</div><span class="resume-eyebrow">${discussionText('مكانك محفوظ','YOUR SEAT IS SAVED')}</span><h1 id="resumeTitle">${discussionText('نكمل اللعب؟','Ready to return?')}</h1><p class="resume-description">${discussionText('ارجع للمباراة بنفس اسمك ودورك.','Return to the match with your same name and role.')}</p><div class="resume-room"><span>${discussionText('رقم الغرفة','ROOM CODE')}</span><strong dir="ltr">${escapeHtml(session.code)}</strong></div>${offline?`<p class="resume-offline" role="status">${discussionText('تعذر الاتصال. جلستك محفوظة؛ أعد المحاولة.','Connection failed. Your session is saved; try again.')}</p>`:''}<button class="btn resume-primary" onclick="resumeGame(${jsArg(session.code)})"><span>${discussionText('مواصلة المباراة','Resume game')}</span><span aria-hidden="true">←</span></button><div class="resume-secondary"><button class="btn" onclick="joinForm()">${discussionText('دخول غرفة أخرى','Join another room')}</button><button class="btn" onclick="renderHostLogin()">${discussionText('دخول المضيف','Host login')}</button></div><p class="resume-footnote">${discussionText('دورك سرّك. خلك مستعد.','Keep your role secret. Stay ready.')}</p></section>`;
}
function home() {
  pollingEpoch++;
  warmApi();
  clearTimeout(pollTimer);
  document.querySelector('.player-tools')?.remove();
  closeSheet();
  game = null;
  if(new URLSearchParams(location.search).get('admin')==='1'&&!hostAccessToken){renderHostLogin();return;}
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
