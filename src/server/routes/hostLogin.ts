async function routeHostLogin(context:RouteContext) {
  let {body, action, ip, now, started}=context;
  {
      const loginBucket = loginBuckets.get(ip);
      if (!loginBucket || loginBucket.reset < now) loginBuckets.set(ip, { count: 1, reset: now + 15 * 60_000 });
      else if (++loginBucket.count > 5) return out({ error: "LOGIN_RATE_LIMITED" }, 429);
      const pinHash = await sha256(cleanText(body.pin, 32));
      const { data: auth } = await db.from("mafia_host_auth").select("pin_hash").eq("id", "default").maybeSingle();
      if (!auth || auth.pin_hash !== pinHash) {
        await audit(null, action, "denied", started);
        return out({ error: "INVALID_PIN" }, 403);
      }
      loginBuckets.delete(ip);
      const hostAccessToken = `${crypto.randomUUID()}.${crypto.randomUUID()}`;
      await persist(db.from("mafia_host_sessions").delete().lt("expires_at", new Date().toISOString()));
      await persist(db.from("mafia_host_sessions").insert({ token_hash: await sha256(hostAccessToken), expires_at: new Date(Date.now() + 90 * 24 * 60 * 60_000).toISOString() }));
      const { data: prefs } = await db.from("mafia_host_preferences").select("settings").eq("id", "default").maybeSingle();
      await audit(null, action, "ok", started);
      return out({ hostAccessToken, preferences: cleanPreferences(prefs?.settings || {}) });
    
  }
}
