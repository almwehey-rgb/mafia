async function routeBeginNight(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host || room.phase !== "reveal") return out({ error: "INVALID_ACTION" }, 400);
      if (!players.length || !players.every((x) => roleState(x).ack === true)) return out({ error: "WAITING_ROLES" }, 409);
      const election=room.enabled_roles?.leader_election;
      if(election?.pending&&!election.former){
        const team=players.filter(p=>p.alive&&mafiaRole(p.role));
        for(const bot of team.filter(p=>p.is_bot&&!roleState(p).leaderVote)){
          bot.role_state={...roleState(bot),leaderVote:randomItem(team)?.id};
          const {error}=await db.from("mafia_players").update({role_state:bot.role_state}).eq("room_code",code).eq("id",bot.id);if(error)throw error;
        }
        if(!election.winner && team.some(p=>!roleState(p).leaderVote) && !phaseExpired(room))return out({error:"WAITING_LEADER_VOTES"},409);
        let winner=election.winner;
        if(!winner){
          const counts=new Map(team.map(p=>[p.id,0]));
          for(const voter of team){const id=roleState(voter).leaderVote;if(counts.has(id))counts.set(id,counts.get(id)!+1);}
          const max=Math.max(...counts.values());winner=randomItem(team.filter(p=>counts.get(p.id)===max))?.id;
          if(!winner)return out({error:"NO_MAFIA"},409);
          const {data,error}=await db.from("mafia_rooms").update({enabled_roles:{...room.enabled_roles,leader_election:{pending:true,winner}}}).eq("code",code).eq("enabled_roles",JSON.stringify(room.enabled_roles)).select("code");if(error)throw error;
          if(!data?.length)return out({error:"STALE_ACTION"},409);
        }
        const {error}=await db.from("mafia_players").update({role:"mafia_boss"}).eq("room_code",code).eq("id",winner);if(error)throw error;
        ({room,players}=await load(code));
        const finished=await db.from("mafia_rooms").update({enabled_roles:{...room.enabled_roles,leader_election:{pending:false,winner}}}).eq("code",code);if(finished.error)throw finished.error;
      }
      await persist(db.from("mafia_rooms").update({ phase: "night" }).eq("code", code));
      ({ room, players } = await load(code));
      await botNightActions(room, players);
      ({ room, players } = await load(code));
      return out(publicView(room, players, undefined, true));
    
  }
}
