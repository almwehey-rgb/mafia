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

