async function routeRecoverProfile(context:RouteContext) {
  let {body, action, ip, now, started}=context;
  {
      const recoveryCode = cleanText(body.recoveryCode, 16).toUpperCase();
      const { data } = await db.from("mafia_profiles").select("profile_token,nickname").eq("recovery_code", recoveryCode).maybeSingle();
      if (!data) return out({ error: "RECOVERY_NOT_FOUND" }, 404);
      await audit(null, action, "ok", started);
      return out({ profileToken: data.profile_token, nickname: data.nickname });
    
  }
}
