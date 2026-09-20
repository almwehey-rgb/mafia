async function routeHostPreferences(context:RouteContext) {
  let {body, action, ip, now, started}=context;
  {
      if (!await validHostAccess(body.hostAccessToken)) return out({ error: "UNAUTHORIZED" }, 403);
      if (body.settings) {
        const settings = cleanPreferences(body.settings);
        await persist(db.from("mafia_host_preferences").upsert({ id: "default", settings, updated_at: new Date().toISOString() }));
        return out({ preferences: settings, saved: true });
      }
      const { data: prefs } = await db.from("mafia_host_preferences").select("settings").eq("id", "default").maybeSingle();
      return out({ preferences: cleanPreferences(prefs?.settings || {}) });
    
  }
}
