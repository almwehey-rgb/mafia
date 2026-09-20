const roleNames = {
  mafia_boss: '👑 العرّاب (زعيم المافيا) / Godfather',
  mafia: '🔪 فرد المافيا / Mafioso',
  doctor: '🩺 الطبيب / Doctor',
  detective: '🕵️ المحقق / Detective',
  jailer: '🔐 السجّان / Jailer',
  lawyer: '⚖️ المحامي / Lawyer',
  vigilante: '🎯 القناص / Vigilante',
  witch: '🧪 الساحرة / Witch',
  serial_killer: '🩸 القاتل المتسلسل / Serial Killer',
  jester: '🃏 المهرج / Jester',
  revealer: '📡 الكاشف / Revealer',
  cupid: '💘 كيوبيد / Cupid',
  escort: '🚫 المعطّل / Escort',
  citizen: '🏘️ المواطن / Citizen',
};
const eventText = {
  game_started: 'بدأ القيم / Game started',
  mafia_locked: '🔒 تعطّل اغتيال المافيا لأن أحد أفرادها كان مسجونًا.',
  mafia_skipped: '🌙 قررت المافيا تخطي الاغتيال هذه الليلة.',
  mafia_disabled: '🌙 قرر المضيف أن تكون هذه الليلة بدون اغتيال مافيا.',
  mafia_delayed: '🌙 الليلة الأولى بدون اغتيال. يبدأ اغتيال المافيا من الليلة الثانية.',
  doctor_saved: '🩺 أنقذ الطبيب هدف المافيا.',
  jail_saved: '🔐 كان هدف المافيا داخل السجن ونجا.',
  mafia_kill: '🔪 نفذت المافيا اغتيالها.',
  jailer_executed: '⚖️ نفّذ السجّان حكم الإعدام.',
  lawyer_saved: '⚖️ أنقذ المحامي اللاعب من نتيجة التصويت.',
  vote_eliminated: '🗳️ تم استبعاد اللاعب صاحب أعلى تصويت.',
  vote_tie: '🤝 تعادل التصويت ولم يُستبعد أحد.',
  serial_kill: '🩸 نفّذ القاتل المتسلسل جريمته.',
  vigilante_kill: '🎯 أطلق القناص طلقته الأخيرة. / The sniper took their final shot.',
  vigilante_skipped: '🎯 تم تخطي طلقة القناص. / The final shot was skipped.',
  witch_poison: '☠️ استخدمت الساحرة جرعة السم.',
  witch_saved: '🧪 أنقذت الساحرة لاعباً بجرعة الحياة.',
  escort_blocked: '🚫 عطّل المعطّل قدرة لاعب هذه الليلة.',
  lovers_died: '💔 مات الحبيبان معاً.',
  jester_won: '🃏 نجح المهرج في خداع الجميع.',
  player_accused: '⚖️ تم اختيار متهم للمحاكمة.',
  nomination_tie: '🤝 لم يتفق اللاعبون على متهم.',
  trial_guilty: '🔨 صدر الحكم بالإدانة.',
  trial_innocent: '🕊️ صدر الحكم بالبراءة.',
  host_ended: '⛔ أنهى المضيف المباراة.',
  host_expelled: '⛔ استبعد المضيف لاعبًا. / The host expelled a player.',
  detective_only_night: '🔎 الليلة الأولى للمحقق فقط؛ لا اغتيال ولا قدرات أخرى. / First night: detective only. No kills or other role actions.',
};
const discussionText=(ar,en)=>ar;
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const API='https://unsxzbrpqvppecjnirqx.supabase.co/functions/v1/mafia-room?forceFunctionRegion=ap-southeast-1';
document.addEventListener('DOMContentLoaded',async()=>{
 const el=id=>document.getElementById(id);
 const params=new URLSearchParams(location.hash.slice(1));
 let code=params.get('code'),adminToken='',hidden=false,stopped=false,polling=false,oldestCursor=null;
 const chatMessages=new Map();
 const saved=JSON.parse(sessionStorage.getItem('mafia-admin-session')||'null');
 if(!code&&saved){code=saved.code;adminToken=saved.adminToken;}
 async function request(action,extra={}){
  const res=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({action,code,adminToken,...extra}),signal:AbortSignal.timeout(20000)});
  const data=await res.json();if(!res.ok){const error=new Error(data.error||'ERROR');error.status=res.status;throw error;}return data;
 }
 function clearSecrets(){chatMessages.clear();oldestCursor=null;el('olderMessages').hidden=true;el('cards').innerHTML='';el('messages').innerHTML='';el('history').innerHTML='';el('roomDetails').textContent='';}
 function logout(){stopped=true;adminToken='';clearSecrets();sessionStorage.removeItem('mafia-admin-session');el('status').textContent='تم تسجيل الخروج. امسح باركودًا جديدًا للدخول.';}
 el('exit').onclick=logout;
 el('hide').onclick=()=>{hidden=!hidden;clearSecrets();el('status').textContent=hidden?'الأسرار مخفية':'جاري التحديث…';if(!hidden)poll();};
 document.addEventListener('visibilitychange',()=>{if(document.hidden){hidden=true;clearSecrets();el('status').textContent='الأسرار مخفية — اضغط إظهار للمتابعة';}});
 el('historyButton').onclick=async()=>{
  if(hidden||stopped)return;
  try{const data=await request('adminState',{history:true});if(hidden||stopped)return;
   el('history').innerHTML=data.history.map(s=>'<details class="card"><summary>الجولة '+escapeHtml(s.round)+' · '+escapeHtml(s.phase)+' · '+escapeHtml(new Date(s.at).toLocaleString())+'</summary>'+adminCards(s.players)+'</details>').join('')||'لا توجد حالات محفوظة';
  }catch{el('status').textContent='تعذر تحميل السجل';}
 };
 function mergeMessages(data,older=false){
  const initial=chatMessages.size===0;
  data.messages.forEach(m=>chatMessages.set(m.id,m));if(initial||older)oldestCursor=data.nextCursor;
  el('messages').innerHTML=[...chatMessages.values()].sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1).map(m=>'<p class="card"><b>'+escapeHtml(m.channel==='jail'?'السجّان':'المافيا')+' — '+escapeHtml(m.name)+'</b><br>'+escapeHtml(m.text)+'<br><small>'+escapeHtml(new Date(m.at).toLocaleTimeString())+'</small></p>').join('')||'لا توجد رسائل';
  if(initial||older)el('olderMessages').hidden=!data.hasMore;
 }
 el('olderMessages').onclick=async()=>{if(hidden||stopped||!oldestCursor)return;try{const data=await request('adminState',{chat:true,beforeId:oldestCursor});if(hidden||stopped)return;mergeMessages(data,true);}catch{el('status').textContent='تعذر تحميل الرسائل القديمة';}};
 async function poll(){
  if(stopped||hidden||polling||!adminToken)return;polling=true;
  try{
   const data=await request('adminState',{chat:true});if(stopped||hidden)return;
   const name=id=>data.players.find(p=>p.id===id)?.name||'لا أحد';
   el('status').textContent='الغرفة '+code+' — الجولة '+data.round+' — '+new Date().toLocaleTimeString();
   el('roomDetails').textContent='السجين: '+name(data.jailed)+' | آخر حماية طبيب: '+name(data.doctorLastTarget)+' | المرتبطون: '+data.linked.map(name).join('، ')+' | إعدامات السجّان: '+(data.executions??0)+(data.pendingShot?' | طلقة القناص: '+name(data.pendingShot.playerId)+' ← '+name(data.pendingShot.target):'');
   el('cards').innerHTML=adminCards(data.players);
   mergeMessages(data);
  }catch(error){clearSecrets();if(error.status===403){logout();el('status').textContent='انتهى أو أُلغي دخول الأدمن. اطلب باركودًا جديدًا.';}else el('status').textContent='انقطع الاتصال؛ جارٍ إعادة المحاولة…';}
  finally{polling=false;if(!stopped&&!hidden)setTimeout(poll,2000);}
 }
 try{
  if(params.get('invite')){const data=await request('redeemAdminInvite',{inviteToken:params.get('invite')});adminToken=data.adminToken;sessionStorage.setItem('mafia-admin-session',JSON.stringify({code,adminToken}));history.replaceState(null,'',location.pathname);}
  if(!adminToken)throw new Error('NO_SESSION');
  poll();
 }catch{clearSecrets();el('status').textContent='الباركود منتهي أو مستخدم. اطلب باركودًا جديدًا من المضيف.';}
});
