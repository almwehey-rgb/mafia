async function routeLeave(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const { data, error } = await db.rpc("mafia_leave_room", {
        p_code: code, p_version: body.lifecycleVersion,
        p_host_token: body.hostToken || null, p_player_id: body.id || null,
        p_player_token: body.playerToken || null,
      });
      if (error) throw error;
      if (data?.error) return out({ error: data.error }, data.error === "UNAUTHORIZED" ? 403 : 409);
      if (data?.ok !== true) throw new Error("LEAVE_FAILED");
      // This request may finish only its own committed departure. An old leave
      // receipt must never trigger reconciliation against a later game.
      if (data.lifecycleVersion !== body.lifecycleVersion + 1) return out({left:true});
      const scope=requestDatabase.getStore()!;
      scope.headers={'x-mafia-room':code,'x-mafia-generation':String(data.lifecycleVersion)};
      scope.client=undefined;
      ({ room, players } = await load(code));
      await reconcileDeparture(room,players);
      return out({ left: true });
    
  }
}
