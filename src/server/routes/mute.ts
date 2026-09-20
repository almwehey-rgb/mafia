async function routeMute(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      const target = players.find((x) => x.id === body.target);
      if (!target) return out({ error: "PLAYER_NOT_FOUND" }, 404);
      await patchRoleState(code, target, { muted: body.muted !== false });
      ({ room, players } = await load(code));
      return out(publicView(room, players, undefined, true));
    
  }
}
