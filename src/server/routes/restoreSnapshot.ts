async function routeRestoreSnapshot(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      const { data: saved } = await db.from("mafia_snapshots").select("*").eq("room_code", code).eq("id", Number(body.snapshotId)).maybeSingle();
      if (!saved) return out({ error: "SNAPSHOT_NOT_FOUND" }, 404);
      const savedRoom: any = saved.room_state;
      const savedPlayers: any[] = Array.isArray(saved.players_state) ? saved.players_state : [];
      if(room.stats_recorded || room.phase==='finished' || room.phase==='lobby' || room.enabled_roles?.departure_pending)
        return out({error:'SNAPSHOT_RESTORE_UNAVAILABLE'},409);
      // Snapshots contain old sessions and roles. Restore gameplay only if every
      // seat still belongs to the same player; never resurrect departed seats.
      const seatKeys=['id','session_token','profile_token','left_at'];
      const roster=(list:any[])=>JSON.stringify([...list].sort((a,b)=>a.id.localeCompare(b.id)).map(p=>seatKeys.map(k=>p[k]??null)));
      if(savedRoom?.code!==code || savedRoom.match_id!==room.match_id || roster(savedPlayers)!==roster(players))return out({error:'SNAPSHOT_ROSTER_CHANGED'},409);
      requestDatabase.getStore()!.plan=new TransitionPlan(room,players);
      await snapshot(room, players, "before_restore");
      const roomKeys = ["phase","round","jailed_player","accused_player","jailer_executions","doctor_last_target","linked_players","last_event","last_deaths","last_eliminated","last_saved","winner","winner_player"];
      const roomUpdate = Object.fromEntries(roomKeys.map((key) => [key, savedRoom[key]]));
      const settings={...savedRoom.enabled_roles};
      for(const key of ['admin_access','controller_spectator','departure_pending']){delete settings[key];if(room.enabled_roles?.[key]!==undefined)settings[key]=room.enabled_roles[key];}
      roomUpdate.enabled_roles=settings;
      await persist(db.from("mafia_rooms").update(roomUpdate).eq("code", code));
      for (const player of savedPlayers) {
        const playerKeys = ["role","role_state","alive","action_target","vote_target","investigation_result","will_text"];
        await persist(db.from("mafia_players").update(Object.fromEntries(playerKeys.map((key) => [key, player[key]]))).eq("room_code", code).eq("id", player.id));
      }
      ({ room, players } = await load(code));
      await audit(code, action, "ok", started);
      return out(publicView(room, players, me?.id, true));
    
  }
}
