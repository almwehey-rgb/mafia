async function routeHostLogout(context:RouteContext) {
  let {body, action, ip, now, started}=context;
  {
      const token = cleanText(body.hostAccessToken, 200);
      if (token) {
        const hash = await sha256(token);
        const { error } = await db.from("mafia_rooms").update({ host_token: crypto.randomUUID() }).eq("host_session_hash", hash);
        if (error) throw error;
        const { error: sessionError } = await db.from("mafia_host_sessions").delete().eq("token_hash", hash);
        if (sessionError) throw sessionError;
      }
      // Revoke legacy room keys too, but only with proof of possession.
      for (const session of (Array.isArray(body.rooms) ? body.rooms : []).slice(0,100)) {
        if (!/^\d{4}$/.test(session.code) || typeof session.hostToken !== "string" || !session.hostToken) continue;
        const { error } = await db.from("mafia_rooms").update({ host_token: crypto.randomUUID() }).eq("code", session.code).eq("host_token", session.hostToken);
        if (error) throw error;
      }
      return out({ ok: true });
    
  }
}
