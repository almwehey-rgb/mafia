async function routeReport(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!me) return out({ error: "UNAUTHORIZED" }, 403);
      const reason = cleanText(body.reason, 160);
      if (reason.length < 2) return out({ error: "REASON_REQUIRED" }, 400);
      await persist(db.from("mafia_reports").insert({ room_code: code, reporter_id: me.id, target_id: cleanText(body.target, 80) || null, reason }));
      return out({ ok: true });
    
  }
}
