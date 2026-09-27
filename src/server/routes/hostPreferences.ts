async function routeHostPreferences(context:RouteContext) {
  let {body, action, ip, now, started}=context;
  {
      const access=await getHostAccess(body.hostAccessToken);
      if (!access) return out({ error: "UNAUTHORIZED" }, 403);
      const hostAccess={isOwner:access.isOwner,remaining:access.remaining,label:access.label};
      if (!access.isOwner) {
        const preferences=cleanPreferences(body.settings || access.preferences || {});
        if(body.settings)await persist(db.from('mafia_host_codes').update({preferences}).eq('id',access.codeId));
        return out({preferences,hostAccess,saved:Boolean(body.settings)});
      }
      if (body.settings) {
        const settings = cleanPreferences(body.settings);
        await persist(db.from("mafia_host_preferences").upsert({ id: "default", settings, updated_at: new Date().toISOString() }));
        return out({ preferences: settings, saved: true, hostAccess });
      }
      const { data: prefs } = await db.from("mafia_host_preferences").select("settings").eq("id", "default").maybeSingle();
      return out({ preferences: cleanPreferences(prefs?.settings || {}), hostAccess });
    
  }
}
