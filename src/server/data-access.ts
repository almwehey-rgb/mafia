async function load(code: string) {
  const [roomResult, playersResult] = await Promise.all([
    db.from("mafia_rooms").select("*").eq("code", code).single(),
    db.from("mafia_players").select("*").eq("room_code", code).order("joined_at"),
  ]);
  if (roomResult.error && roomResult.error.code !== 'PGRST116') throw roomResult.error;
  if (playersResult.error) throw playersResult.error;
  return { room:roomResult.data, players: playersResult.data || [] };
}
