async function routeProfile(context:RouteContext) {
  let {body, action, ip, now, started}=context;
  {
      const profileToken = cleanText(body.profileToken, 80);
      if (!profileToken) return out({ profile: null });
      const [{ data }, { data: seasonData }] = await Promise.all([
        db.from("mafia_profiles").select("nickname,games,wins,village_wins,mafia_wins,independent_wins,correct_votes,recovery_code").eq("profile_token", profileToken).maybeSingle(),
        db.from("mafia_season_stats").select("games,wins").eq("profile_token", profileToken).eq("season", currentSeason()).maybeSingle(),
      ]);
      let profile = data;
      if (profile && !profile.recovery_code) {
        const recoveryCode = shortCode();
        const { data: updated } = await db.from("mafia_profiles").update({ recovery_code: recoveryCode }).eq("profile_token", profileToken).select("nickname,games,wins,village_wins,mafia_wins,independent_wins,correct_votes,recovery_code").single();
        profile = updated || { ...profile, recovery_code: recoveryCode };
      }
      return out({ profile: profile ? { ...profile, season: currentSeason(), season_games: seasonData?.games || 0, season_wins: seasonData?.wins || 0 } : null });
    
  }
}
