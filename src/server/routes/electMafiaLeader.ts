async function routeElectMafiaLeader(context:RoomRouteContext) {
 if(context.room.enabled_roles?.leader_election?.pending&&!context.room.enabled_roles.leader_election.former)return routeInitialMafiaLeader(context);
 const {body,code,now}=context;
 let {room,players,me}=context;
 if(!me?.alive||!mafiaRole(me.role)||['lobby','finished','paused'].includes(room.phase))return out({error:'UNAUTHORIZED'},403);
 let election=room.enabled_roles?.leader_election;
 if(!election?.pending&&body.target!=='RESIGN'&&body.target!=='FINALIZE'){
  if(me.role!=='mafia_boss')return out({error:'UNAUTHORIZED'},403);
  const nominee=players.find(p=>p.id===body.target&&p.alive&&p.role==='mafia');
  if(!nominee)return out({error:'INVALID_ACTION'},400);
  const {data:resigned,error:resignError}=await db.from('mafia_players').update({role:'mafia'}).eq('room_code',code).eq('id',me.id).eq('role','mafia_boss').eq('session_token',body.playerToken).select('id');
  if(resignError)throw resignError;
  if(!resigned?.length)return out({error:'STALE_ACTION'},409);
  const {data:promoted,error:promoteError}=await db.from('mafia_players').update({role:'mafia_boss',role_state:{...roleState(nominee),promotedBoss:true}}).eq('room_code',code).eq('id',nominee.id).eq('role','mafia').eq('alive',true).select('id');
  if(promoteError||!promoted?.length){
   await db.from('mafia_players').update({role:'mafia_boss'}).eq('room_code',code).eq('id',me.id).eq('role','mafia');
   if(promoteError)throw promoteError;
   return out({error:'STALE_ACTION'},409);
  }
  ({room,players}=await load(code));return out(publicView(room,players,me.id));
 }
 if(body.target==='RESIGN'){
  if(me.role!=='mafia_boss'||election?.pending)return out({error:'INVALID_ACTION'},409);
  if(!players.some(p=>p.alive&&p.role==='mafia'&&p.id!==me.id))return out({error:'NO_CANDIDATES'},409);
  election={pending:true,former:me.id,deadline:now+30000,votes:{}};
 }else{
  if(!election?.pending||!election.former)return out({error:'INVALID_ACTION'},409);
  election={...election,votes:{...election.votes}};
  if(body.target!=='FINALIZE'){
   if(now>=election.deadline||election.votes[me.id])return out({error:'INVALID_ACTION'},409);
   const target=players.find(p=>p.id===body.target&&p.alive&&mafiaRole(p.role)&&p.id!==election.former);
   if(!target)return out({error:'INVALID_ACTION'},400);
   election.votes[me.id]=target.id;
  }else if(now<election.deadline)return out({error:'WAITING_LEADER_VOTES'},409);
 }
 const team=players.filter(p=>p.alive&&mafiaRole(p.role));
 const candidates=team.filter(p=>p.id!==election.former);
 for(const bot of team.filter(p=>p.is_bot&&!election.votes[p.id]))if(candidates.length)election.votes[bot.id]=randomItem(candidates).id;
 const finished=now>=election.deadline||team.every(p=>election.votes[p.id])||!candidates.length;
 if(finished){
  if(candidates.length){
   const counts=new Map(candidates.map(p=>[p.id,0]));
   for(const voter of team){const target=election.votes[voter.id];if(counts.has(target))counts.set(target,counts.get(target)!+1);}
   const max=Math.max(...counts.values());const winner=randomItem(candidates.filter(p=>counts.get(p.id)===max))!.id;
   for(const player of players.filter(p=>mafiaRole(p.role))){await persist(db.from('mafia_players').update({role:player.id===winner?'mafia_boss':'mafia'}).eq('room_code',code).eq('id',player.id));}
   election={pending:false,winner};
  }else election={pending:false};
 }
 await persist(db.from('mafia_rooms').update({enabled_roles:{...room.enabled_roles,leader_election:election}}).eq('code',code));
 ({room,players}=await load(code));return out(publicView(room,players,me.id));
}
async function routeInitialMafiaLeader(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if(room.phase!=="reveal" || !room.enabled_roles?.leader_election?.pending || room.enabled_roles.leader_election.winner || !me?.alive || !mafiaRole(me.role))return out({error:"UNAUTHORIZED"},403);
      const target=players.find(p=>p.id===body.target&&p.alive&&mafiaRole(p.role));
      if(!target||roleState(me).leaderVote)return out({error:"INVALID_ACTION"},400);
      let query=db.from("mafia_players").update({role_state:{...roleState(me),leaderVote:target.id}}).eq("room_code",code).eq("id",me.id);
      query=me.role_state==null?query.is("role_state",null):query.eq("role_state",JSON.stringify(me.role_state));
      const {data,error}=await query.select("id");if(error)throw error;
      if(!data?.length)return out({error:"STALE_ACTION"},409);
      ({room,players}=await load(code));return out(publicView(room,players,me.id));
    
  }
}
