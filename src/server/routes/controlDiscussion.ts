async function routeControlDiscussion(context:RoomRouteContext) {
  let {body, action, ip, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      if (room.phase !== "day" || room.enabled_roles?.pending_shot) return out({ error: "INVALID_ACTION" }, 409);
      const view = discussionView(room);
      const saved = room.enabled_roles?.discussion_state;
      if (!saved || !["active", "paused"].includes(view.status)) return out({ error: "INVALID_ACTION" }, 409);
      if (body.discussionId !== saved.id || body.version !== saved.version || (saved.mode === "turns" && body.speakerId !== view.speakerId)) return out({ error: "STALE_TURN" }, 409);
      const now = Date.now();
      let next: any;
      if (body.operation === "pause" && view.status === "active") next = { ...saved, pausedAt: now, manualPaused: true };
      else if (body.operation === "resume" && view.status === "paused") {
        const elapsed = now - saved.pausedAt;
        next = { ...saved, roulette:saved.roulette?{...saved.roulette,at:saved.roulette.at+elapsed}:null, pausedAt: null, manualPaused: false, turnStartedAt: saved.turnStartedAt + elapsed, endsAt: saved.endsAt + elapsed };
      } else if (body.operation === "reset") {
        const at = saved.pausedAt || now;
        if (at < saved.turnStartedAt) return out({ error: "DRAW_IN_PROGRESS" }, 409);
        next = { ...saved, cursor: view.index, turnStartedAt: at, endsAt: at + saved.seconds * 1000 };
      } else return out({ error: "INVALID_ACTION" }, 409);
      next.version = saved.version + 1;
      const { data: changed, error } = await db.from("mafia_rooms").update({ enabled_roles: { ...room.enabled_roles, discussion_state: next } }).eq("code", code).eq("phase", "day").eq("enabled_roles", JSON.stringify(room.enabled_roles)).select("code");
      if (error) throw error;
      if (!changed?.length) return out({ error: "STALE_TURN" }, 409);
      ({ room, players } = await load(code));
      return out(publicView(room, players, me?.id, host));
    
  }
}
