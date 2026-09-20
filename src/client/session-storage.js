function sessionKey(code) { return `mafia-session-${code}`; }
function saveSession(host) {
  const session = { code: game.code, host, hostToken, playerToken, playerId, profileToken };
  localStorage.setItem('mafia-session', JSON.stringify(session));
  localStorage.setItem(sessionKey(game.code), JSON.stringify(session));
}
function clearSession() {
  localStorage.removeItem('mafia-session');
}
