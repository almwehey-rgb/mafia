async function routeAdminState(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      // Secret oversight belongs only to the original host, never delegated players.
      const access=room.enabled_roles?.admin_access;
      const admin=typeof body.adminToken==="string" && access?.sessionHash && access.expiresAt>Date.now() && access.hostHash===await sha256(room.host_token) && await sha256(body.adminToken)===access.sessionHash;
      if (!(typeof body.hostToken === "string" && body.hostToken && body.hostToken === room.host_token) && !admin) return out({ error: "UNAUTHORIZED" }, 403);
      const overview = { phase: room.phase, round: room.round, players: players.map(adminPlayerView),
        jailed: room.jailed_player, linked: room.linked_players || [], doctorLastTarget: room.doctor_last_target,
        executions: room.jailer_executions, pendingShot: room.enabled_roles?.pending_shot ? {playerId: room.enabled_roles.pending_shot.playerId, target: room.enabled_roles.pending_shot.target || null} : null };
      if (body.chat === true) {
        let query=db.from("mafia_messages").select("id,channel,author_id,author_name,content,created_at,round").eq("room_code",code);
        if(body.beforeId){if(!/^[1-9][0-9]{0,18}$/.test(String(body.beforeId)))return out({error:"INVALID_CURSOR"},400);query=query.lt("id",String(body.beforeId));}
        const {data,error}=await query.order("id",{ascending:false}).limit(81);
        if(error)throw error;
        const page=(data||[]).slice(0,80);
        return out({...overview,hasMore:(data||[]).length>80,nextCursor:page.length?String(page.at(-1).id):null,messages:page.reverse().map(m=>({id:String(m.id),channel:m.channel,name:players.find(p=>p.id===m.author_id)?.name||m.author_name,text:m.content,at:m.created_at,round:m.round}))});
      }
      if (body.history === true) {
        const { data, error } = await db.from("mafia_snapshots").select("phase,round,reason,created_at,players_state").eq("room_code", code).order("created_at", { ascending: false }).limit(20);
        if (error) throw error;
        return out({ ...overview, history: (data || []).map((s) => ({ phase:s.phase, round:s.round, reason:s.reason, at:s.created_at, players:(s.players_state || []).map(adminPlayerView) })) });
      }
      return out(overview);
    
  }
}
