function nameOf(id) { return game?.players.find((player) => player.id === id)?.name || 'لاعب'; }
function alivePlayers() { return game.players.filter((player) => player.alive); }
function choiceButtons(players, action, options = {}) {
  return players.map((player) => `<button class="pick" data-target="${escapeHtml(player.id)}" aria-pressed="false" onclick="${action}(${jsArg(player.id)})">${options.icon || '👤'} ${escapeHtml(player.name)}${player.id === playerId ? ' (أنت / You)' : ''}</button>`).join('');
}
function jsArg(value) { return escapeHtml(JSON.stringify(String(value))); }
function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
