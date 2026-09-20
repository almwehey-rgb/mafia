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

