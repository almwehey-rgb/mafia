async function recordStats(room: any, players: any[]) {
  if (!room.winner || room.stats_recorded) return;
  const plan=requestDatabase.getStore()?.plan;
  if(plan){plan.stats=true;return;}
  for (const player of players.filter((x) => x.profile_token && !x.is_bot)) {
    const team = mafiaRole(player.role) ? "mafia" : player.role === "serial_killer" || player.role === "jester" ? "independent" : "village";
    const won = room.winner === team || (room.winner === "serial_killer" && player.role === "serial_killer") || (room.winner === "jester" && player.id === room.winner_player);
    const { data: profile } = await db.from("mafia_profiles").select("*").eq("profile_token", player.profile_token).maybeSingle();
    const base = profile || { games: 0, wins: 0, village_wins: 0, mafia_wins: 0, independent_wins: 0 };
    await persist(db.from("mafia_profiles").upsert({ profile_token: player.profile_token, nickname: player.name, games: base.games + 1, wins: base.wins + (won ? 1 : 0), village_wins: base.village_wins + (won && team === "village" ? 1 : 0), mafia_wins: base.mafia_wins + (won && team === "mafia" ? 1 : 0), independent_wins: base.independent_wins + (won && team === "independent" ? 1 : 0), updated_at: new Date().toISOString() }));
    const season = currentSeason();
    const { data: seasonProfile } = await db.from("mafia_season_stats").select("games,wins").eq("profile_token", player.profile_token).eq("season", season).maybeSingle();
    await persist(db.from("mafia_season_stats").upsert({ profile_token: player.profile_token, season, games: Number(seasonProfile?.games || 0) + 1, wins: Number(seasonProfile?.wins || 0) + (won ? 1 : 0), updated_at: new Date().toISOString() }));
  }
  await persist(db.from("mafia_rooms").update({ stats_recorded: true }).eq("code", room.code));
}

