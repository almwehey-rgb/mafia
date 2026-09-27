async function routeHostLogin(context:RouteContext) {
  let {body, action, ip, now, started}=context;
  {
      const loginBucket = loginBuckets.get(ip);
      if (!loginBucket || loginBucket.reset < now) loginBuckets.set(ip, { count: 1, reset: now + 15 * 60_000 });
      else if (++loginBucket.count > 5) return out({ error: "LOGIN_RATE_LIMITED" }, 429);
      if (body.accessCode) {
        const accessCode=cleanText(body.accessCode,32).toUpperCase().replace(/[-\s]/g,'');
        const account=cleanText(body.profileToken,80);
        if(!/^[A-HJ-NP-Z2-9]{16}$/.test(accessCode)||account.length<20)return out({error:'INVALID_ACCESS_CODE'},403);
        const hostAccessToken=`${crypto.randomUUID()}.${crypto.randomUUID()}`;
        const {data:result,error}=await db.rpc('mafia_redeem_host_code',{p_code:accessCode,p_profile:account,p_session_hash:await sha256(hostAccessToken)});
        if(error)throw error;
        if(!result?.ok)return out({error:result?.error||'INVALID_ACCESS_CODE'},403);
        loginBuckets.delete(ip);
        return out({hostAccessToken,preferences:cleanPreferences(result.preferences||{}),hostAccess:{isOwner:false,remaining:result.remaining,label:result.label}});
      }
      const pinHash = await sha256(cleanText(body.pin, 32));
      const { data: auth } = await db.from("mafia_host_auth").select("pin_hash").eq("id", "default").maybeSingle();
      if (!auth || auth.pin_hash !== pinHash) {
        await audit(null, action, "denied", started);
        return out({ error: "INVALID_PIN" }, 403);
      }
      loginBuckets.delete(ip);
      const hostAccessToken = `${crypto.randomUUID()}.${crypto.randomUUID()}`;
      await persist(db.from("mafia_host_sessions").delete().lt("expires_at", new Date().toISOString()));
      await persist(db.from("mafia_host_sessions").insert({ token_hash: await sha256(hostAccessToken), expires_at: new Date(Date.now() + 90 * 24 * 60 * 60_000).toISOString() }));
      const { data: prefs } = await db.from("mafia_host_preferences").select("settings").eq("id", "default").maybeSingle();
      await audit(null, action, "ok", started);
      return out({ hostAccessToken, preferences: cleanPreferences(prefs?.settings || {}),hostAccess:{isOwner:true,remaining:null} });
    
  }
}
async function routeHostCodes(context:RouteContext) {
  const {body}=context;
  const access=await getHostAccess(body.hostAccessToken);
  if(!access||!access.isOwner)return out({error:'UNAUTHORIZED'},403);
  if(body.operation==='create') {
    if(!Number.isSafeInteger(body.games)||body.games<1||body.games>10000)return out({error:'INVALID_SETTINGS'},400);
    const {data,error}=await db.from('mafia_host_codes').insert({code:shortCode(16),label:cleanText(body.label,80),remaining:body.games}).select('id,code,label,remaining,used,active,claimed_at,created_at').single();
    if(error)throw error;
    return out({code:data});
  }
  if(body.operation==='update') {
    if(!/^[0-9a-f-]{36}$/i.test(body.codeId||'')||!Number.isSafeInteger(body.addGames)||body.addGames<0||body.addGames>10000||(body.active!==undefined&&typeof body.active!=='boolean'))return out({error:'INVALID_SETTINGS'},400);
    const {data,error}=await db.rpc('mafia_update_host_code',{p_id:body.codeId,p_add:body.addGames,p_active:body.active??null});
    if(error)throw error;
    if(!data?.ok)return out({error:data?.error||'INVALID_SETTINGS'},400);
    return out({ok:true});
  }
  if(body.operation&&body.operation!=='list')return out({error:'INVALID_ACTION'},400);
  const {data,error}=await db.from('mafia_host_codes').select('id,code,label,remaining,used,active,claimed_at,created_at').order('created_at',{ascending:false}).limit(200);
  if(error)throw error;
  return out({codes:data||[]});
}
