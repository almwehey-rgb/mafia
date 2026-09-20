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
