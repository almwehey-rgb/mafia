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
