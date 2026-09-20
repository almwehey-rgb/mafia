// Pure alert rules: consecutive failures, slow requests, stale active phases,
// recovery events and cooldown. No credentials or player data are accepted.
export class MonitorRules {
 constructor({consecutive=3,slowMs=1000,staleMs=15*60_000,cooldownMs=15*60_000}={}){
  Object.assign(this,{consecutive,slowMs,staleMs,cooldownMs});this.conditions=new Map();
 }
 update(key,bad,now,detail){
  const state=this.conditions.get(key)||{count:0,open:false,last:0};const events=[];
  if(bad){state.count++;if(state.count>=this.consecutive&&(!state.open||now-state.last>=this.cooldownMs)){events.push({event:'mafia.alert',key,at:now,...detail});state.open=true;state.last=now;}}
  else {if(state.open)events.push({event:'mafia.recovered',key,at:now});state.count=0;state.open=false;}
  this.conditions.set(key,state);return events;
 }
 inspect({ok,durationMs,rooms=[]},now=Date.now()){
  const alerts=[...this.update('requests.failed',!ok,now,{}),...this.update('requests.slow',ok&&durationMs>this.slowMs,now,{durationMs})];
  const seen=new Set();
  for(const room of rooms){const key='room.stalled.'+room.code;seen.add(key);const eligible=!['lobby','finished','paused'].includes(room.phase);const ageMs=now-Date.parse(room.phase_started_at);
   alerts.push(...this.update(key,eligible&&Number.isFinite(ageMs)&&ageMs>this.staleMs,now,{room:room.code,phase:room.phase,ageMs}));
  }
  // Only treat a missing room as recovered when the complete request succeeded.
  if(ok)for(const key of this.conditions.keys())if(key.startsWith('room.stalled.')&&!seen.has(key))alerts.push(...this.update(key,false,now,{}));
  return alerts;
 }
}
