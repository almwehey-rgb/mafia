async function routeCreate(context:RouteContext) {
  let {body, action, ip, now, started}=context;
  {
      if (!await validHostAccess(body.hostAccessToken)) return out({ error: "UNAUTHORIZED" }, 403);
      let code: string;
      do { code = String(Math.floor(1000 + Math.random() * 9000)); }
      while ((await db.from("mafia_rooms").select("code").eq("code", code)).data?.length);
      const hostToken = crypto.randomUUID();
      const { data: room, error } = await db.from("mafia_rooms").insert({
        code, host_token: hostToken, host_session_hash: await sha256(body.hostAccessToken),
        mafia_count: Math.max(1, Math.min(8, Number(body.mafiaCount) || 2)),
        detective_count: Math.max(0, Math.min(8, Number.isFinite(+body.detectiveCount) ? +body.detectiveCount : 1)),
        detective_questions: detectiveQuestionCount(body.detectiveQuestions),
        enabled_roles: enabledRoles(body.enabledRoles || defaultEnabledRoles),
      }).select("*").single();
      if (error || !room) throw error || new Error("CREATE_FAILED");
      return out({ ...publicView(room, [], undefined, true), hostToken });
    
  }
}
