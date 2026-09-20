function setRoomTag(text = game?.code ? `غرفة ${game.code} / Room ${game.code}` : 'جاهز / Ready') {
  $('#roomTag').textContent = text;
}
