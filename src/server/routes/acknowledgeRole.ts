async function routeAcknowledgeRole(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (room.phase !== "reveal" || !me) return out({ error: "INVALID_ACTION" }, 400);
      await patchRoleState(code, me, { ack: true });
      ({ room, players } = await load(code));
      return out(publicView(room, players, me.id));
    
  }
}
