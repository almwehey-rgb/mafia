async function routeSetDiscussionClaim(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!me || !me.alive || me.role !== "mafia_boss") return out({ error: "UNAUTHORIZED" }, 403);
      if (!["night", "day"].includes(room.phase) || room.round !== 1 || room.enabled_roles?.discussion_state || typeof roleState(me).discussionClaim === "boolean" || typeof body.claim !== "boolean") return out({ error: "CHOICE_LOCKED" }, 409);
      const { data: changed, error } = await db.from("mafia_players").update({ role_state: { ...roleState(me), discussionClaim: body.claim } }).eq("room_code",code).eq("id", me.id).eq("session_token", body.playerToken).eq("role_state",JSON.stringify(roleState(me))).select("id");
      if (error) throw error;
      if (!changed?.length) return out({error:"CHOICE_LOCKED"},409);
      ({ room, players } = await load(code));
      return out(publicView(room, players, me.id));
    
  }
}
