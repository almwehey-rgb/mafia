async function routeSystemStatus(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const [{ count: reports }, { count: snapshots }, { count: spectators }, { data: recentAudit }] = await Promise.all([
        db.from("mafia_reports").select("id", { count: "exact", head: true }).eq("room_code", code),
        db.from("mafia_snapshots").select("id", { count: "exact", head: true }).eq("room_code", code),
        db.from("mafia_spectators").select("id", { count: "exact", head: true }).eq("room_code", code),
        db.from("mafia_audit_events").select("status,duration_ms,created_at").eq("room_code", code).gte("created_at", since).order("created_at", { ascending: false }).limit(50),
      ]);
      const durations = (recentAudit || []).map((x) => Number(x.duration_ms) || 0);
      return out({ status: "ok", version: 18, reports: reports || 0, snapshots: snapshots || 0, spectators: spectators || 0, averageMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0 });
    
  }
}
