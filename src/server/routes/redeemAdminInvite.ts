async function routeRedeemAdminInvite(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      const access=room.enabled_roles?.admin_access;
      if(typeof body.inviteToken!=="string" || !access?.inviteHash || access.inviteExpires<Date.now() || access.hostHash!==await sha256(room.host_token) || await sha256(body.inviteToken)!==access.inviteHash) return out({error:"INVITE_EXPIRED"},403);
      const adminToken=crypto.randomUUID()+crypto.randomUUID();
      const expiresAt=Date.now()+12*60*60*1000;
      const {data,error}=await db.from("mafia_rooms").update({enabled_roles:{...room.enabled_roles,admin_access:{hostHash:access.hostHash,sessionHash:await sha256(adminToken),expiresAt}}}).eq("code",code).eq("enabled_roles",JSON.stringify(room.enabled_roles)).select("code");
      if(error)throw error;
      if(!data?.length)return out({error:"INVITE_USED"},409);
      return out({adminToken,expiresAt});
    
  }
}
