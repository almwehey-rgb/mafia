async function routeCreateAdminInvite(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!body.hostToken || body.hostToken !== room.host_token) return out({ error:"UNAUTHORIZED" },403);
      const inviteToken=crypto.randomUUID()+crypto.randomUUID();
      const access=action === "revokeAdminAccess" ? null : { inviteHash:await sha256(inviteToken), inviteExpires:Date.now()+120000, hostHash:await sha256(room.host_token) };
      const {error}=await db.from("mafia_rooms").update({enabled_roles:{...room.enabled_roles,admin_access:access}}).eq("code",code);
      if(error)throw error;
      return out(action === "revokeAdminAccess" ? {revoked:true} : {inviteToken,expiresAt:access.inviteExpires});
    
  }
}
