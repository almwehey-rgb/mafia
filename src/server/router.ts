async function handleRequest(request:Request) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if(!['GET','POST'].includes(request.method))return out({error:'METHOD_NOT_ALLOWED'},405);
  try {
    const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    const now = Date.now(), bucket = rateBuckets.get(ip);
    if (!bucket || bucket.reset < now) rateBuckets.set(ip, { count: 1, reset: now + 60_000 });
    else if (++bucket.count > 6000) return out({ error: "RATE_LIMITED" }, 429);
    const url = new URL(request.url);
    let body;
    try{body=request.method === "POST" ? await request.json() : Object.fromEntries(url.searchParams);}
    catch{return out({error:'BAD_REQUEST'},400);}
    if(!body||typeof body!=='object'||Array.isArray(body))return out({error:'BAD_REQUEST'},400);
    const action = body.action || "state";
    requestDatabase.getStore()!.action=REQUEST_ACTIONS.includes(action)?action:'unknown';
    if(action==='operationsStatus')return await operationsStatus(body);
    if (!["state","spectatorState"].includes(action) && /^\d{4}$/.test(String(body.code||'')) && Number.isSafeInteger(body.lifecycleVersion)) {
      requestDatabase.getStore()!.headers = {'x-mafia-room':String(body.code),'x-mafia-generation':String(body.lifecycleVersion)};
    }
    const started = Date.now();
    if (action === "health") return out({ status: "ok", version: 20, time: new Date().toISOString() });
    if (action === "hostLogin") return await routeHostLogin({body, action, ip, now, started});
    if (action === "hostPreferences") return await routeHostPreferences({body, action, ip, now, started});
    if (action === "hostLogout") return await routeHostLogout({body, action, ip, now, started});
    if (action === "recoverProfile") return await routeRecoverProfile({body, action, ip, now, started});
    if (action === "create") return await routeCreate({body, action, ip, now, started});
    if (action === "profile") return await routeProfile({body, action, ip, now, started});
    if (action === "leaderboard") return await routeLeaderboard({body, action, ip, now, started});
    const code = String(body.code || "").trim();
    if (!/^\d{4}$/.test(code)) return out({ error: "ROOM_NOT_FOUND" }, 404);
    // Presence validates the credentials under the room lock. Read its committed
    // result once, instead of loading the same room both before and after it.
    if (action === 'state') return await readCurrentState(code, body, now);
    let { room, players } = await load(code);
    if (!room) return out({ error: "ROOM_NOT_FOUND" }, 404);
    let me = authenticatedPlayer(players, body);
    let host = body.hostToken === room.host_token || Boolean(me && room.host_player_id === me.id && (me.alive || room.enabled_roles?.controller_spectator === true));
    // Fence requests sent from a previous match. Transactional transition RPCs
    // additionally check this value again under the database room lock.
    const generationFree = ["state","adminState","messages","spectatorState","join","joinSpectator","claimSeat","redeemAdminInvite","moderationLog","listSnapshots","systemStatus","leave"];
    if (!generationFree.includes(action) && (!Number.isSafeInteger(body.lifecycleVersion) || body.lifecycleVersion !== (room.lifecycle_version || 0))) return out({error:"STALE_GAME"},409);
    if(['resolveNight','resolveVote','beginNight','startVote','advanceVerdict','lastShot','expelPlayer','endGame','transferHost','electMafiaLeader'].includes(action)) {
      requestDatabase.getStore()!.plan=new TransitionPlan(room,players);
    }
    let authenticatedSpectator:any=null;
    if(action === "spectatorState") {
      const result=await db.from("mafia_spectators").select("id,name,session_token").eq("room_code",code).eq("id",cleanText(body.id,80)).maybeSingle();
      if(result.error)throw result.error;
      if(!result.data || result.data.session_token!==body.spectatorToken)return out({error:"UNAUTHORIZED"},403);
      authenticatedSpectator=result.data;
    }
    const actorKey = authenticatedSpectator ? `spectator:${code}:${authenticatedSpectator.id}` : me ? `player:${code}:${me.id}` : host ? `host:${code}` : `guest:${ip}`;
    if(actorRateLimited(actorKey,now))return out({error:'RATE_LIMITED'},429);

    if (["createAdminInvite", "revokeAdminAccess"].includes(action)) return await routeCreateAdminInvite({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "redeemAdminInvite") return await routeRedeemAdminInvite({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "adminState") return await routeAdminState({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (room.enabled_roles?.pending_shot && room.phase !== "finished" && ["act","vote","resolveVote","resolveNight","startVote","startDiscussion","passDiscussion","finishDiscussion","advanceVerdict","togglePause","jail","lawyerProtect"].includes(action)) return out({ error: "WAITING_LAST_SHOT" }, 409);
    if (action === "lastShot") return await routeLastShot({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "joinSpectator") return await routeJoinSpectator({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "spectatorState") return await routeSpectatorState({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "claimSeat") return await routeClaimSeat({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "join") return await routeJoin({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "leave") return await routeLeave({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "returnToLobby") return await routeReturnToLobby({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "start" || action === "restart") return await routeStart({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "kick") return await routeKick({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "warnPlayer" || action === "expelPlayer") return await routeWarnPlayer({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "addBot") return await routeAddBot({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "mute") return await routeMute({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "endGame") return await routeEndGame({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "saveWill") return await routeSaveWill({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "report") return await routeReport({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "moderationLog") return await routeModerationLog({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "transferHost") return await routeTransferHost({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "createReplacement") return await routeCreateReplacement({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "listSnapshots") return await routeListSnapshots({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "restoreSnapshot") return await routeRestoreSnapshot({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "systemStatus") return await routeSystemStatus({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "messages" || action === "sendMessage") return await routeMessages({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});


    if (action === "togglePause") return await routeTogglePause({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "electMafiaLeader") return await routeElectMafiaLeader({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "acknowledgeRole") return await routeAcknowledgeRole({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "beginNight") return await routeBeginNight({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "jail") return await routeJail({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "lawyerProtect") return await routeLawyerProtect({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "act") return await routeAct({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "resolveNight") return await routeResolveNight({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});

    if (action === "setDiscussionClaim") return await routeSetDiscussionClaim({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "startDiscussion") return await routeStartDiscussion({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "controlDiscussion") return await routeControlDiscussion({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "passDiscussion" || action === "finishDiscussion") return await routePassDiscussion({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "startVote") return await routeStartVote({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "advanceVerdict") return await routeAdvanceVerdict({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "vote") return await routeVote({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    if (action === "resolveVote") return await routeResolveVote({body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator});
    return out({ error: "BAD_ACTION" }, 400);
  } catch (error) {
    if (["STALE_GAME", "STALE_ACTION"].includes(error?.message)) return out({ error: error.message }, 409);
    if (error?.code === "P0001" && ["STALE_GAME", "GAME_STARTED", "ROOM_FULL", "NAME_TAKEN", "ROOM_NOT_FOUND"].includes(error.message)) {
      return out({ error: error.message }, error.message === "ROOM_NOT_FOUND" ? 404 : 409);
    }
    return out({ error: "SERVER_ERROR" }, 500);
  }
}
