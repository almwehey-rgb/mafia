function signalPhase() {
  phaseStartedAt = Date.now();
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  if (!soundEnabled) return;
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 620;
    gain.gain.setValueAtTime(.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .28);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + .28);
  } catch {}
}
function phaseIcon(phase = game?.phase) { return ({ lobby: '🎴', reveal: '👁️', night: '🌙', day: '☀️', nomination: '☝️', trial: '⚖️', verdict: '🔨', vote: '🗳️', paused: '⏸️', finished: '🏆' })[phase] || '🎭'; }
function phaseName(phase = game?.phase) { return ({ lobby: 'الانتظار', reveal: 'كشف الأدوار', night: 'الليل', day: 'الصباح', nomination: 'الترشيح', trial: 'المحاكمة', verdict: 'الحكم', vote: 'التصويت', paused: 'متوقفة مؤقتًا', finished: 'النهاية' })[phase] || ''; }
function lobbyIcon(name){const paths={wait:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',admin:'<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/><path d="m8 12 3 3 5-6"/>',leave:'<path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4"/>',back:'<path d="M5 12h14m-6-6 6 6-6 6"/>'};return '<svg class="lobby-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>'}
function backFromLobby(){pollingEpoch++;clearTimeout(pollTimer);closeSheet();document.querySelector('.player-tools')?.remove();game=null;if(hostAccessToken)renderHostHome();else renderHostLogin()}
function phaseBar() { const controller=(hostToken||game?.me?.isHost)&&game;const live=controller&&!['lobby','finished'].includes(game.phase);const pause=live?`<button class="phase-pause" aria-label="${discussionText(game.phase==='paused'?'استكمال المباراة':'إيقاف مؤقت',game.phase==='paused'?'Resume game':'Pause game')}" onclick="hostAction('togglePause')">${game.phase==='paused'?'▶️':'⏸️'}</button>`:'';const restart=live?`<button class="phase-pause phase-restart" aria-label="${discussionText('إعادة القيم وتوزيع أدوار جديدة','Restart game and deal new roles')}" title="${discussionText('إعادة القيم','Restart game')}" onclick="restartGame()">↻<span>${discussionText('إعادة القيم','Restart')}</span></button>`:'';const admin=live?`<button class="phase-pause" aria-label="${discussionText('إدارة المباراة','Game management')}" onclick="showMatchTools()">🛡️</button>`:'';const back=delegatedHostMode?'<button class="phase-pause" onclick="toggleDelegatedHost()">👤</button>':'';return `<div class="phase-bar"><span class="phase-symbol">${game?.phase==='lobby'?lobbyIcon('wait'):phaseIcon()}</span><b class="phase-label">${phaseName()}</b>${game?.round ? `<small>الجولة ${game.round}</small>` : ''}${game&&!["lobby","finished"].includes(game.phase)?`<span class="phase-timer" id="phaseTimer" role="timer" aria-label="الوقت المتبقي / Time remaining">${phaseDuration}</span>`:''}${game?.phase==='lobby'?`<button class="phase-pause lobby-action lobby-back" onclick="backFromLobby()">${lobbyIcon('back')}<span>${discussionText('الرئيسية','Home')}</span></button>`:''}${restart}${pause}${admin}${hostToken?`<button class="phase-pause lobby-action" onclick="showAdminQR()" aria-label="وضع الأدمن الخاص">${lobbyIcon('admin')}<span>${discussionText('أدمن','Admin')}</span></button>`:''}${back}${!spectatorMode ? `<button class="phase-pause lobby-action lobby-exit" onclick="leaveRoom()" aria-label="مغادرة الغرفة">${lobbyIcon('leave')}<span>${discussionText('مغادرة','Leave')}</span></button>` : ""}</div>`; }
function clientPhaseRemaining() {
  const clock=game?.phaseClock;
  if(!clock||!Number.isFinite(clock.startedAt))return Infinity;
  return Math.max(0,clock.startedAt+clock.seconds*1000-(clock.pausedAt||Date.now()+discussionClockOffset));
}
function firstNightWithoutDetective(){return game?.phase==='night'&&game.round===1&&!game.players?.some(player=>player.alive&&player.role==='detective')}
function phaseTimeExpired(){return game?.phase!=='paused'&&clientPhaseRemaining()===0;}
function updatePhaseTimer() {
  for(const button of document.querySelectorAll('[data-timeout-action]')) {
    const action=button.dataset.timeoutAction;
    const ready=action==='resolveNight'?(game?.nightReady||firstNightWithoutDetective()):game?.voteCount>=Math.max(0,alivePlayers().length-(game.phase==='verdict'?1:0));
    button.disabled=!(ready||phaseTimeExpired());
  }
  updateDiscussionClocks();
  updateHostProgress();
  const el = $('#phaseTimer');
  if (!el) return;
  const discussion = clientDiscussion();
  const discussionDay = game?.phase === 'day' || (game?.phase === 'paused' && game.enabledRoles?.paused_phase === 'day');
  if (discussionDay && discussion.status !== 'off') {
    el.textContent = discussion.status === 'waiting' ? '—' : formatDiscussionTime(discussion.remainingMs || 0);
    el.classList.toggle('urgent', discussion.status === 'active' && discussion.remainingMs <= 10000);
    return;
  }
  const remaining=clientPhaseRemaining();
  const left=Number.isFinite(remaining)?Math.ceil(remaining/1000):null;
  el.textContent=left===null?'—':left;
  el.classList.toggle('urgent', left !== null && left <= 10);
}
setInterval(updatePhaseTimer,1000);
function toggleSound(){soundEnabled=!soundEnabled;localStorage.setItem('mafia-sound',soundEnabled?'on':'off');schedulePreferenceSave();renderHost()}
function cycleTimer(){phaseDuration=phaseDuration===30?60:phaseDuration===60?90:30;localStorage.setItem('mafia-phase-seconds',String(phaseDuration));phaseStartedAt=Date.now();enabledRoles.phase_seconds=phaseDuration;schedulePreferenceSave();renderHost()}
function copyText(value){if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(value);const area=document.createElement('textarea');area.value=value;document.body.append(area);area.select();document.execCommand('copy');area.remove();return Promise.resolve()}
async function shareRoom(){const url=`${location.origin}/game.html?room=${game.code}`;try{if(navigator.share)await navigator.share({title:'لعبة مافيا',text:`ادخل غرفة ${game.code}`,url});else{await copyText(url);alert('تم نسخ رابط الغرفة ✅')}}catch{}}
async function shareResult(){const text=`${winnerTitle().replace(/<[^>]*>/g,'')} — غرفة ${game.code}`;try{if(navigator.share)await navigator.share({title:'نتيجة لعبة مافيا',text,url:location.origin});else{await copyText(text);alert('تم نسخ النتيجة ✅')}}catch{}}
