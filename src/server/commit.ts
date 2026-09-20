async function reconcileDeparture(room:any,players:any[]) {
  if(!room.enabled_roles?.departure_pending)return false;
  requestDatabase.getStore()!.plan=new TransitionPlan(room,players);
  const settings={...room.enabled_roles};delete settings.departure_pending;
  await persist(db.from('mafia_rooms').update({enabled_roles:settings}).eq('code',room.code));
  if(!['lobby','finished'].includes(room.phase)){
    await promoteMafia(room.code);await checkWin(room.code);
  }
  return true;
}
async function commitRequest(request:Request) {
  try {
  const response=await handleRequest(request);
  const plan=requestDatabase.getStore()!.plan;
  if(!plan || !response.ok)return response;
  const {data,error}=await currentDatabase().rpc('mafia_commit_transition',{
    p_before_room:plan.beforeRoom,p_before_players:plan.beforePlayers,
    p_room:plan.room,p_players:plan.players,p_snapshots:plan.snapshots,p_audits:plan.audits,p_stats:plan.stats,
  });
  if(error || data?.error || data?.ok!==true)return out({error:data?.error || (error?.message==='STALE_GAME'?'STALE_GAME':'SERVER_ERROR')},data?.error==='STALE_GAME'||error?.message==='STALE_GAME'?409:500);
  const body=await response.json();body.lifecycleVersion=data.lifecycleVersion;
  // SQL phase triggers run at commit time. Never return the pre-commit clock.
  if (body.phaseClock) {
    const saved = await currentDatabase().from('mafia_rooms').select('phase_started_at,phase_paused_at,lifecycle_version').eq('code',plan.room.code).single();
    if (saved.error || !saved.data) return out({error:'SERVER_ERROR'},500);
    if (saved.data.lifecycle_version !== data.lifecycleVersion) return out({error:'STALE_GAME'},409);
    body.phaseClock.startedAt = new Date(saved.data.phase_started_at).getTime();
    body.phaseClock.pausedAt = plan.room.enabled_roles?.pending_shot && plan.room.phase !== 'finished'
      ? (plan.room.enabled_roles.pending_shot.startedAt || body.phaseClock.startedAt)
      : saved.data.phase_paused_at ? new Date(saved.data.phase_paused_at).getTime() : null;
    body.serverTime = Date.now();
  }
  return out(body);
  } catch { return out({error:'SERVER_ERROR'},500); }
}
Deno.serve(async (request) => requestDatabase.run({headers:{},requestId:crypto.randomUUID(),started:Date.now()}, async () => recordResponse(await commitRequest(request))));
