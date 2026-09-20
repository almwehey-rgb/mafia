async function routeListSnapshots(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      const { data } = await db.from("mafia_snapshots").select("id,phase,round,reason,created_at").eq("room_code", code).order("created_at", { ascending: false }).limit(20);
      return out({ snapshots: data || [] });
    
  }
}
