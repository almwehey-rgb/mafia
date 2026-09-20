async function routeLeaderboard(context:RouteContext) {
  let {body, action, ip, now, started}=context;
  {
      const [{ data }, { data: seasonRows }] = await Promise.all([
        db.from("mafia_profiles").select("nickname,games,wins").gt("games", 0).order("wins", { ascending: false }).order("games", { ascending: true }).limit(20),
        db.from("mafia_season_stats").select("profile_token,games,wins").eq("season", currentSeason()).gt("games", 0).order("wins", { ascending: false }).order("games", { ascending: true }).limit(20),
      ]);
      const tokens = (seasonRows || []).map((x) => x.profile_token);
      const { data: seasonNames } = tokens.length ? await db.from("mafia_profiles").select("profile_token,nickname").in("profile_token", tokens) : { data: [] };
      const names = new Map((seasonNames || []).map((x) => [x.profile_token, x.nickname]));
      return out({ leaderboard: data || [], season: currentSeason(), seasonLeaderboard: (seasonRows || []).map((x) => ({ nickname: names.get(x.profile_token) || "Player", games: x.games, wins: x.wins })) });
    
  }
}
