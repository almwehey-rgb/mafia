async function routeAct(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (room.round === 1 && me?.role !== "detective") return out({ error: "FIRST_NIGHT_DETECTIVE_ONLY" }, 409);
      if (room.phase !== "night" || !me?.alive || (room.round !== 1 && me.id === room.jailed_player)) return out({ error: "INVALID_ACTION" }, 400);
      const target = players.find((x) => x.id === body.target);
      if (mafiaRole(me.role)) {
        if (isMafiaLocked(room, players)) return out({ error: "MAFIA_LOCKED" }, 409);
        if (body.target !== "SKIP" && (!target?.alive || mafiaRole(target.role))) return out({ error: "INVALID_ACTION" }, 400);
        await persist(db.from("mafia_players").update({ action_target: body.target }).eq("room_code", code).eq("id", me.id));
      } else if (me.role === "revealer") {
        if (!["COUNT","SKIP"].includes(body.target) || me.action_target || roleState(me).mafiaCountResult) return out({ error: "INVALID_ACTION" }, 400);
        let query=db.from("mafia_players").update({action_target:body.target}).eq("room_code",code).eq("id",me.id);
        query=me.action_target==null?query.is("action_target",null):query.eq("action_target",me.action_target);
        const {data,error}=await query.select("id");if(error)throw error;
        if(!data?.length)return out({error:"STALE_ACTION"},409);
      } else if (me.role === "doctor") {
        if (!doctorAvailable(room)) return out({ error: "DOCTOR_UNAVAILABLE" }, 409);
        if (!target?.alive || target.id === room.doctor_last_target) return out({ error: "INVALID_ACTION" }, 400);
        await persist(db.from("mafia_players").update({ action_target: target.id }).eq("room_code", code).eq("id", me.id));
      } else if (me.role === "detective") {
        const picked = selected(me), limit = detectiveLimit(room, players);
        if (!target?.alive || target.id === me.id || picked.includes(target.id) || picked.length >= limit) return out({ error: "INVALID_ACTION" }, 400);
        let query = db.from("mafia_players").update({ action_target: [...picked, target.id].join(",") }).eq("room_code", code).eq("id", me.id);
        query = me.action_target == null ? query.is("action_target", null) : query.eq("action_target", me.action_target);
        const { data: changed, error } = await query.select("id");
        if (error) throw error;
        if (!changed?.length) return out({ error: "STALE_ACTION" }, 409);
      } else if (me.role === "vigilante") {
        return out({ error: "INVALID_ACTION" }, 400);
      } else if (me.role === "witch") {
        const [kind, targetId] = String(body.target || "").split(":");
        const potionTarget = players.find((x) => x.id === targetId && x.alive);
        const state = roleState(me);
        if (!potionTarget || !["SAVE", "POISON"].includes(kind) || (kind === "SAVE" && state.life === false) || (kind === "POISON" && (state.poison === false || potionTarget.id === me.id))) return out({ error: "INVALID_ACTION" }, 400);
        await persist(db.from("mafia_players").update({ action_target: `${kind}:${potionTarget.id}` }).eq("room_code", code).eq("id", me.id));
      } else if (me.role === "serial_killer" || me.role === "escort") {
        if (!target?.alive || target.id === me.id) return out({ error: "INVALID_ACTION" }, 400);
        await persist(db.from("mafia_players").update({ action_target: target.id }).eq("room_code", code).eq("id", me.id));
      } else if (me.role === "cupid") {
        const picked = selected(me);
        if (room.round !== 2 || !target?.alive || target.id === me.id || picked.includes(target.id) || picked.length >= 2) return out({ error: "INVALID_ACTION" }, 400);
        let query = db.from("mafia_players").update({action_target:[...picked,target.id].join(",")}).eq("room_code",code).eq("id",me.id);
        query=me.action_target==null?query.is("action_target",null):query.eq("action_target",me.action_target);
        const {data,error}=await query.select("id");if(error)throw error;
        if(!data?.length)return out({error:"STALE_ACTION"},409);
      } else if (me.role === "jailer") {
        const prisoner = players.find((x) => x.id === room.jailed_player && x.alive);
        const choice = String(body.target || "");
        if (!prisoner || !["SPARE", "EXECUTE"].includes(choice)) return out({ error: "INVALID_ACTION" }, 400);
        if (choice === "EXECUTE" && room.jailer_executions <= 0) return out({ error: "NO_EXECUTIONS" }, 409);
        await persist(db.from("mafia_players").update({ action_target: choice }).eq("room_code", code).eq("id", me.id));
      } else return out({ error: "INVALID_ACTION" }, 400);
      ({ room, players } = await load(code));
      return out(publicView(room, players, me.id));
    
  }
}
