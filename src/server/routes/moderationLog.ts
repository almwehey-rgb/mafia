async function routeModerationLog(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      const { data } = await db.from("mafia_reports").select("id,reporter_id,target_id,reason,created_at").eq("room_code", code).order("created_at", { ascending: false }).limit(50);
      return out({ reports: data || [] });
    
  }
}
