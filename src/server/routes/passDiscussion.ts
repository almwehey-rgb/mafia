async function routePassDiscussion(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const discussion = discussionView(room);
      if (room.phase !== "day" || discussion.status !== "active") return out({ error: "INVALID_ACTION" }, 409);
      if (action === "finishDiscussion" && !host) return out({ error: "UNAUTHORIZED" }, 403);
      if (action === "passDiscussion" && (!host && (!me?.alive || me.id !== discussion.speakerId))) return out({ error: "UNAUTHORIZED" }, 403);
      if (body.discussionId !== discussion.id || (action === "passDiscussion" && (discussion.mode !== "turns" || body.speakerId !== discussion.speakerId))) return out({ error: "STALE_TURN" }, 409);
      const saved = room.enabled_roles.discussion_state;
      if (action === "passDiscussion" && Date.now() < saved.turnStartedAt) return out({ error: "DRAW_IN_PROGRESS" }, 409);
      const next = action === "finishDiscussion" ? { ...saved, finished: true, version: saved.version + 1 } : { ...saved, cursor: discussion.index + 1, turnStartedAt: Date.now(), version: saved.version + 1 };
      const { data: changed, error } = await db.from("mafia_rooms").update({ enabled_roles: { ...room.enabled_roles, discussion_state: next } }).eq("code", code).eq("phase", "day").eq("enabled_roles->discussion_state->>id", saved.id).eq("enabled_roles->discussion_state->>version", String(saved.version)).select("code");
      if (error) throw error;
      if (!changed?.length) return out({ error: "STALE_TURN" }, 409);
      ({ room, players } = await load(code));
      return out(publicView(room, players, me?.id, host));
    
  }
}
