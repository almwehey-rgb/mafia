function renderStateKey(state) {
  if (!state) return '';
  const { serverTime, discussion, ...view } = state;
  // The existing clock updater derives these fields without rebuilding the page.
  const clockFields = new Set(['remainingMs','deadline','index','speakerId','status','complete']);
  const stableDiscussion = discussion?.id ? Object.fromEntries(Object.entries(discussion).filter(([key]) => !clockFields.has(key))) : discussion;
  return JSON.stringify({ ...view, discussion: stableDiscussion });
}

function startPolling(host) {
  clearTimeout(pollTimer);
  const epoch=++pollingEpoch;
  const tick = async () => {
    try {
      const next = await api({ action: 'state', code: game.code, id: playerId, playerToken, hostToken });
      if(epoch!==pollingEpoch)return;
      $('#reconnect').classList.remove('show');
      const previousPhase = game?.phase;
      const previousChatKey=chatReadKey();
      const changed = renderStateKey(next) !== renderStateKey(game);
      if (host && next.canControl === false) { host=false;hostToken='';saveSession(false); }
      game = next;
      if(previousChatKey!==chatReadKey()){unreadChat=false;if(document.querySelector('.chat-list'))closeSheet();}
      if (previousPhase && previousPhase !== next.phase) signalPhase();
      if (document.querySelector('.chat-list') && !chatAllowed()) closeSheet();
      if (host) rememberEvent();
      if(!game.me?.isHost)delegatedHostMode=false;
      if (changed) (host || delegatedHostMode) ? renderHost() : renderPlayer();
      pollChatNotification();
    } catch (error) {
      if (error.code === 'UNAUTHORIZED') {
        pollingEpoch++;clearTimeout(pollTimer);
        if(game?.code)localStorage.removeItem(sessionKey(game.code));
        clearSession();hostToken='';delegatedHostMode=false;
        alert('انتهت صلاحية هذه الجلسة أو انتقلت إدارة الغرفة إلى لاعب آخر.');
        home();return;
      }
      $('#reconnect').classList.add('show');
    } finally {
      if(epoch===pollingEpoch)pollTimer = setTimeout(tick, game?.phase === 'lobby' ? 1500 : 2000);
    }
  };
  pollTimer = setTimeout(tick, game?.phase === 'lobby' ? 250 : 500);
}

