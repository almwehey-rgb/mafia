let unreadChat=false,chatNoticeAt=0,chatNoticePending=false;
function chatReadKey(){return `mafia-chat-read-${game?.code}-${playerId}-${game?.round}-${game?.phase==='day'?'public':(game?.me?.jailed||game?.me?.role==='jailer'?'jail':'mafia')}`;}
function chatHasUnread(){return unreadChat&&chatAllowed();}
function markChatRead(messages){const latest=messages?.at(-1);if(latest)localStorage.setItem(chatReadKey(),String(latest.id));unreadChat=false;document.querySelector('[data-chat-button]')?.replaceChildren(document.createTextNode('💬 محادثة / Chat'));}
async function pollChatNotification(){
 if(!chatAllowed()||document.querySelector('.chat-list')||chatNoticePending||Date.now()-chatNoticeAt<5000)return;
 chatNoticeAt=Date.now();chatNoticePending=true;const key=chatReadKey(),epoch=pollingEpoch;
 try{const result=await api({action:'messages',code:game.code,id:playerId,playerToken});
  if(epoch!==pollingEpoch||key!==chatReadKey()||!chatAllowed())return;
  const seen=Number(localStorage.getItem(key)||0);
  unreadChat=(result.messages||[]).some(m=>Number(m.id)>seen&&m.author_id!==playerId);
  const button=document.querySelector('[data-chat-button]');if(button)button.textContent=unreadChat?'💬 محادثة / Chat •':'💬 محادثة / Chat';
 }catch{}finally{chatNoticePending=false;}
}
let chatCache=[],chatOlderCursor=null,chatHasOlder=false,chatLoadingOlder=false;
let chatTimer;
let chatEpoch = 0;
let chatSending = false;
let chatRevision = 0;
function stopChatPolling(){clearTimeout(chatTimer);chatEpoch++;}
function chatAllowed(){return game?.me?.alive && (game.phase==='day' || game.me.jailed||['mafia','mafia_boss','jailer'].includes(game.me.role)) && (game.phase==='day' || game.phase==='night' || (game.phase==='paused' && game.enabledRoles?.paused_phase==='night'));}
function chatMessageHtml(messages){return messages.map(m=>`<div class="chat-message"><b data-no-translate>${escapeHtml(m.author_name)}</b><span data-no-translate>${escapeHtml(m.content)}</span></div>`).join('')||`<p>${discussionText('ابدأ المحادثة.','Start the conversation.')}</p>`;}
function updateChatMessages(result,older=false){
 const list=document.querySelector('.chat-list');if(!list)return;
 const merged=new Map(chatCache.map(m=>[String(m.id),m]));
 for(const message of result.messages||[])merged.set(String(message.id),message);
 chatCache=[...merged.values()].sort((a,b)=>Number(a.id)-Number(b.id));
 if(older||chatOlderCursor===null){chatOlderCursor=result.nextCursor;chatHasOlder=result.hasMore===true;}
 const more=document.querySelector('[data-chat-older]');if(more)more.hidden=!chatHasOlder;
 if(!older)markChatRead(result.messages);
 const signature=JSON.stringify(chatCache);if(list.dataset.messages===signature)return;
 const atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<60;
 list.innerHTML=chatMessageHtml(chatCache);list.dataset.messages=signature;
 if(atBottom)list.scrollTop=list.scrollHeight;
}
function startChatPolling(){
 const epoch=chatEpoch;
 const tick=async()=>{
  if(epoch!==chatEpoch||!document.querySelector('.chat-list'))return;
  if(!chatAllowed()){closeSheet();return;}
  const revision=chatRevision;
  try{
   if(!chatSending){
    const result=await api({action:'messages',code:game.code,id:playerId,playerToken});
    if(epoch!==chatEpoch||revision!==chatRevision)return;
    updateChatMessages(result);
    const status=document.querySelector('.chat-status');if(status)status.textContent='';
   }
  }catch(error){
   if(epoch!==chatEpoch)return;
   if(['UNAUTHORIZED','INVALID_ACTION'].includes(error.code)){closeSheet();return;}
   const status=document.querySelector('.chat-status');if(status)status.textContent=discussionText('انقطع الاتصال، نحاول نرجع…','Reconnecting…');
  }finally{if(epoch===chatEpoch&&document.querySelector('.chat-list'))chatTimer=setTimeout(tick,1000);}
 };
 chatTimer=setTimeout(tick,1000);
}
async function openChat(){
 stopChatPolling();const epoch=chatEpoch;
 try{const result=await api({action:'messages',code:game.code,id:playerId,playerToken});if(epoch===chatEpoch&&chatAllowed())renderChatSheet(result)}catch{alert(discussionText('المحادثة غير متاحة الآن','Chat is unavailable right now'))}
}
function renderChatSheet(result){
 chatCache=[];chatOlderCursor=null;chatHasOlder=false;
 const label=result.channel==='public'?discussionText('☀️ النقاش العام','☀️ Public discussion'):result.channel==='mafia'?discussionText('🔪 محادثة المافيا','🔪 Mafia chat'):discussionText('🔐 محادثة السجن','🔐 Jail chat');
 openSheet(label,`<button class="btn" data-chat-older data-no-translate onclick="loadOlderChat()">${discussionText('رسائل أقدم','Older messages')}</button><div class="chat-list" tabindex="0" role="region" aria-label="${discussionText('رسائل المحادثة','Chat messages')}" aria-live="polite"></div><p class="chat-status" data-no-translate role="status"></p>${game.me.muted?`<div class="status wait">${discussionText('تم كتمك بواسطة المضيف','You were muted by the host')}</div>`:`<div class="chat-compose"><input class="input" id="chatText" maxlength="240" placeholder="${discussionText('اكتب رسالة','Write a message')}"><button class="btn red" id="chatSend" onclick="sendChat()">${discussionText('إرسال','Send')}</button></div>`}`);
 updateChatMessages(result);const list=document.querySelector('.chat-list');list.scrollTop=list.scrollHeight;
 document.querySelector('#chatText')?.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();sendChat();}});
 startChatPolling();
}
async function loadOlderChat(){
 if(chatLoadingOlder||!chatHasOlder||!chatOlderCursor)return;
 chatLoadingOlder=true;const epoch=chatEpoch;const button=document.querySelector('[data-chat-older]');if(button)button.disabled=true;
 try{const result=await api({action:'messages',code:game.code,id:playerId,playerToken,beforeId:chatOlderCursor});
 if(epoch!==chatEpoch)return;const list=document.querySelector('.chat-list');const height=list?.scrollHeight||0,top=list?.scrollTop||0;
 updateChatMessages(result,true);if(list)list.scrollTop=top+list.scrollHeight-height;
 }catch{if(epoch===chatEpoch)alert(discussionText('تعذر تحميل الرسائل القديمة.','Could not load older messages.'));}
 finally{chatLoadingOlder=false;if(button)button.disabled=false;}
}
async function sendChat(){
 const input=$('#chatText'),text=input?.value.trim();if(!text||chatSending)return;
 chatSending=true;chatRevision++;const epoch=chatEpoch;const button=$('#chatSend');if(button)button.disabled=true;
 try{
  const result=await api({action:'sendMessage',code:game.code,id:playerId,playerToken,text});
  if(epoch!==chatEpoch)return;
  chatRevision++;updateChatMessages(result);if(input.value.trim()===text)input.value='';
  const list=document.querySelector('.chat-list');if(list)list.scrollTop=list.scrollHeight;
 }catch(error){if(epoch===chatEpoch)alert(error.code==='MUTED'?discussionText('تم كتمك بواسطة المضيف','You were muted by the host'):error.code==='RATE_LIMITED'?discussionText('انتظر لحظة وأعد الإرسال','Wait a moment and send again'):discussionText('تعذر إرسال الرسالة','Could not send the message'))}
 finally{chatSending=false;if(button)button.disabled=false;}
}
function openReport(){const targets=game.players.filter((p)=>p.id!==playerId);openSheet('🚩 إبلاغ المضيف',`<label for="reportTarget">${discussionText('اللاعب المعني','Player concerned')}</label><select class="input" id="reportTarget"><option value="">بلاغ عام</option>${targets.map((p)=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}</select><label for="reportReason">${discussionText('سبب البلاغ','Report reason')}</label><textarea class="input" id="reportReason" maxlength="160" placeholder="اكتب سبب البلاغ"></textarea><button class="btn danger wide" onclick="sendReport()">إرسال البلاغ</button>`)}
async function sendReport(){try{await api({action:'report',code:game.code,id:playerId,playerToken,target:$('#reportTarget').value,reason:$('#reportReason').value});closeSheet();alert('تم إرسال البلاغ للمضيف')}catch{alert('اكتب سببًا واضحًا للبلاغ')}}

function renderTrialPlayer(){
  const accused=game.accusedPlayer===playerId;
  $('#app').innerHTML=`${phaseBar()}<div class="card hero trial-stage"><div class="role-title">⚖️ المحاكمة</div><div class="accused-name">${escapeHtml(nameOf(game.accusedPlayer))}</div><p>${accused?'أنت المتهم. دافع عن نفسك الآن.':'استمع إلى دفاع المتهم ثم قرر حكمك.'}</p></div>`;
}
function renderVerdict(){
  const accused=game.accusedPlayer===playerId;
  const options=`<div class="verdict-grid"><button class="pick execute" data-target="GUILTY" aria-pressed="false" onclick="castVote('GUILTY')">🔨 مذنب</button><button class="pick innocent" data-target="INNOCENT" aria-pressed="false" onclick="castVote('INNOCENT')">🕊️ بريء</button></div>`;
  $('#app').innerHTML=`${phaseBar()}<div class="card hero"><div class="role-title">🔨 الحكم</div><h1>${escapeHtml(nameOf(game.accusedPlayer))}</h1>${accused?'<div class="status wait">أنت المتهم ولا تصوّت على حكمك.</div>':(game.me.voted?'<div class="status">تم تسجيل حكمك ويمكنك تغييره.</div>':'')+options}</div>`;
}

function renderNight() {
  const me = game.me;
  if (game.round === 1 && me.role !== 'detective') {
    $('#app').innerHTML = `<div class="card" data-no-translate><h2>${discussionText('🔎 الليلة الأولى للمحقق فقط','🔎 First night: detective only')}</h2><p>${discussionText('لا اغتيال ولا حماية ولا قدرات أخرى هذه الليلة. انتظر الصباح.','No kills, protection, or other role actions tonight. Wait for morning.')}</p></div>`;
    return;
  }
  if (me.jailed) {
    $('#app').innerHTML = `<div class="card hero"><div class="role-title">🔒 أنت مسجون</div><p>قدرتك الليلية متوقفة. السجّان يقرر مصيرك هذه الليلة.</p></div>`;
    return;
  }
  if ((me.role === 'mafia' || me.role === 'mafia_boss') && me.mafiaLocked) {
    $('#app').innerHTML = `<div class="card hero"><div class="role-title">🔐 المافيا متوقفة</div><p>أحد أفراد المافيا مسجون، لذلك لا يوجد اغتيال هذه الليلة.</p></div>`;
    return;
  }
  if ((me.role === 'mafia' || me.role === 'mafia_boss') && game.enabledRoles?.mafia_kill_enabled === false) {
    const start=Number(game.enabledRoles?.mafia_kill_start_round)||0, delayed=start>game.round;
    $('#app').innerHTML = `<div class="card hero"><div class="role-title">🌙 ${delayed?'ليلة هادئة':'بدون اغتيال'}</div><p>${delayed?`يبدأ اغتيال المافيا من الليلة ${start}.`:'قرر المضيف أن هذه اللعبة لا تحتوي على اغتيال للمافيا.'}</p></div>`;
    return;
  }
  if (me.role === 'mafia' || me.role === 'mafia_boss') {
    const teamIds = new Set((me.mafiaTeam || []).map((x) => x.id));
    const targets = alivePlayers().filter((player) => !teamIds.has(player.id));
    $('#app').innerHTML = `<div class="card"><div class="role-title">${roleNames[me.role]}</div><div class="status wait">فريقك: ${(me.mafiaTeam || []).map((x) => escapeHtml(x.name)).join('، ')}</div>${me.acted ? '<h2 class="ok">تم تسجيل اختيارك ✅</h2>' : `<h2>اختر هدف الاغتيال</h2>${choiceButtons(targets, 'confirmNightTarget', { icon: '🔪' })}<button class="pick skip" onclick="nightAction('SKIP')">⏭️ تخطي الاغتيال / Skip kill</button>`}<p class="muted">اختيار زعيم المافيا هو النهائي عند الاختلاف.</p></div>`;
    return;
  }
  if (me.role === 'doctor') {
    if (!me.doctorAvailable) {
    $('#app').innerHTML = `<div class="card" data-no-translate><h2>${discussionText('🩺 الطبيب','🩺 Doctor')}</h2><p>${discussionText('تبدأ الحماية من الليلة الثانية وتستمر حتى نهاية القيم.','Protection starts on night two and continues until the game ends.')}</p></div>`;
      return;
    }
    const targets = alivePlayers().filter((player) => player.id !== me.doctorLastTarget);
    $('#app').innerHTML = `<div class="card"><div class="role-title">${roleNames.doctor}</div>${me.acted ? '<h2 class="ok">تم تسجيل الحماية ✅</h2>' : `<h2>من ستحمي الليلة؟</h2>${choiceButtons(targets, 'nightAction', { icon: '🩺' })}`}<p class="muted">تقدر تحمي نفسك، ولا تقدر تكرر نفس اللاعب ليلتين.</p></div>`;
    return;
  }
  if (me.role === 'revealer') {
    $('#app').innerHTML = `<div class="card" data-no-translate><h2>${discussionText('📡 الكاشف','📡 Revealer')}</h2><p>${discussionText('كشف واحد بالقيم، بدون أسماء. اختر متى تستخدمه؛ النتيجة بالصباح.','One reveal per game, without names. Choose when to use it; result arrives in the morning.')}</p>${me.mafiaCountResult?`<p>${discussionText('استخدمت كشفك الوحيد. تقدر تواصل النقاش والتصويت.','Your reveal has been used. You can still discuss and vote.')}</p>`:me.acted?`<p>${discussionText('تم تسجيل قرارك ✅','Decision recorded ✅')}</p>`:`<button class="btn" onclick="nightAction('COUNT')">${discussionText('استخدام الكشف الوحيد','Use my one reveal')}</button> <button class="btn" onclick="nightAction('SKIP')">${discussionText('احتفظ بالكشف لليلة ثانية','Save for another night')}</button>`}</div>`;
    return;
  }
  if (me.role === 'detective') {
    const targets = alivePlayers().filter((player) => player.id !== playerId && !(me.selectedIds || []).includes(player.id));
    const finished = game.round > detectiveQuestionCount(game.detectiveQuestions);
    $('#app').innerHTML = `<div class="card" data-no-translate><div class="role-title">${discussionText('🕵️ المحقق','🕵️ Detective')}</div><p>${discussionText(`سؤال واحد كل جولة. إجمالي فرص التحقيق: ${detectiveQuestionCount(game.detectiveQuestions)}.`,`One question per round. Total investigation opportunities: ${detectiveQuestionCount(game.detectiveQuestions)}.`)}</p>${finished ? `<h2>${discussionText('انتهت فرص التحقيق المحددة. تقدر تواصل النقاش والتصويت.','Your investigation rounds are over. You can still discuss and vote.')}</h2>` : `<h2>${discussionText('سؤال الجولة','Round question')}: ${me.questionsUsed} / ${me.questionLimit}</h2>${me.acted ? `<p class="ok">${discussionText('تم تسجيل سؤالك. النتيجة بعد إعلان الصباح ✅','Question recorded. The result appears in the morning ✅')}</p>` : choiceButtons(targets, 'nightAction', { icon: '🔎' })}`}</div>`;
    return;
  }
  if (me.role === 'vigilante') {
    $('#app').innerHTML = `<div class="card" data-no-translate><div class="role-title">${discussionText('🎯 القناص','🎯 Sniper')}</div><p>${discussionText('لا توجد لك حركة ليلية. تتفعّل طلقتك الأخيرة إذا خرجت بالتصويت أو اغتالتك المافيا.','You have no night action. Your final shot activates if you are voted out or killed by Mafia.')}</p></div>`;
    return;
  }
  if (me.role === 'witch') {
    const targets = alivePlayers();
    $('#app').innerHTML = `<div class="card"><div class="role-title">${roleNames.witch}</div><p>🧪 الحياة: ${me.charges?.life ? 'متوفرة' : 'استُخدمت'} · ☠️ السم: ${me.charges?.poison ? 'متوفرة' : 'استُخدمت'}</p>${me.acted ? '<h2 class="ok">تم تسجيل الجرعة ✅</h2>' : `${me.charges?.life ? `<h2>جرعة الحياة</h2>${choiceButtons(targets, 'confirmLife', { icon: '💚' })}` : ''}${me.charges?.poison ? `<h2>جرعة السم</h2>${choiceButtons(targets.filter((p) => p.id !== playerId), 'confirmPoison', { icon: '☠️' })}` : ''}`}</div>`;
    return;
  }
  if (me.role === 'serial_killer') {
    const targets = alivePlayers().filter((player) => player.id !== playerId);
    $('#app').innerHTML = `<div class="card"><div class="role-title">${roleNames.serial_killer}</div>${me.acted ? '<h2 class="ok">تم اختيار الضحية ✅</h2>' : `<h2>من ستقتل الليلة؟</h2>${choiceButtons(targets, 'confirmNightTarget', { icon: '🩸' })}`}</div>`;
    return;
  }
  if (me.role === 'cupid') {
    if (game.round !== 2) {
      $('#app').innerHTML = `<div class="card hero"><div class="role-title">${roleNames.cupid}</div><p>قدرتك متاحة في الليلة الثانية فقط. انتظر الصباح.</p></div>`;
      return;
    }
    const targets = alivePlayers().filter((player) => player.id !== playerId && !(me.selectedIds || []).includes(player.id));
    $('#app').innerHTML = `<div class="card"><div class="role-title">${roleNames.cupid}</div><h2>اختر حبيبين: ${(me.selectedIds || []).length} / 2</h2>${me.acted ? '<h2 class="ok">تم ربط مصيرهما 💘</h2>' : choiceButtons(targets, 'nightAction', { icon: '💘' })}</div>`;
    return;
  }
  if (me.role === 'escort') {
    const targets = alivePlayers().filter((player) => player.id !== playerId);
    $('#app').innerHTML = `<div class="card"><div class="role-title">${roleNames.escort}</div>${me.acted ? '<h2 class="ok">تم تسجيل التعطيل ✅</h2>' : `<h2>من ستعطّل الليلة؟</h2>${choiceButtons(targets, 'nightAction', { icon: '🚫' })}`}</div>`;
    return;
  }
  if (me.role === 'jailer') {
    if (!me.jailedPlayer || me.executionsLeft <= 0) {
      $('#app').innerHTML = `<div class="card hero"><div class="role-title">${roleNames.jailer}</div><p>${me.executionsLeft <= 0 ? 'انتهت إعداماتك.' : 'لم تختر سجينًا لهذه الليلة.'}</p><p class="muted">الإعدامات المتبقية: ${me.executionsLeft}</p></div>`;
    } else {
      $('#app').innerHTML = `<div class="card hero"><div class="role-title">${roleNames.jailer}</div><h2>السجين: ${escapeHtml(me.jailedPlayer)}</h2><p>الإعدامات المتبقية: ${me.executionsLeft}</p>${me.acted ? '<h2 class="ok">تم تسجيل قرارك ✅</h2>' : '<div class="actions" style="justify-content:center"><button class="btn green" onclick="nightAction(\'SPARE\')">إطلاقه / Spare</button><button class="btn danger" onclick="confirmExecute()">إعدامه / Execute</button></div>'}</div>`;
    }
    return;
  }
  $('#app').innerHTML = `<div class="card hero"><div class="role-title">${roleNames[me.role]}</div><p>أغمض عينك وانتظر الصباح.</p></div>`;
}

function investigationPanel() {
  const results=(game.me?.investigationResults||[]).filter(r=>r.round===game.round);
  return `<section class="card" data-no-translate><h2>${discussionText('نتائج التحقيق','Investigation results')}</h2>${results.map(r=>`<p><b>${escapeHtml(r.name)}</b>: ${discussionText(r.result,r.result==='مافيا'?'Mafia':'Innocent')}</p>`).join('')||`<p>${(game.round>detectiveQuestionCount(game.detectiveQuestions)?discussionText('انتهت فرص التحقيق المحددة.','Your investigation rounds are over.'):discussionText('لا توجد نتيجة هذه الليلة؛ قد تكون القدرة معطّلة أو لم يُسجّل اختيار.','No result tonight; your ability may have been blocked or no choice was recorded.'))}</p>`}</section>`;
}
function renderDay() {
  const me = game.me;
  if (me.role === 'jailer') {
    const targets = alivePlayers().filter((player) => player.id !== playerId);
    $('#app').innerHTML = `<div class="card"><div class="role-title">${roleNames.jailer}</div>${me.jailerSelected ? `<h2 class="ok">السجين الليلة: ${escapeHtml(nameOf(me.jailerSelected))} ✅</h2>` : `<h2>من ستسجن الليلة؟</h2>${choiceButtons(targets, 'jailPlayer', { icon: '🔐' })}`}<p class="muted">المسجون لا يستخدم قدرته. إذا كان من المافيا يتوقف اغتيال الفريق.</p></div>`;
    return;
  }
  if (me.role === 'lawyer') {
    $('#app').innerHTML = `<div class="card"><div class="role-title">${roleNames.lawyer}</div>${me.acted ? '<h2 class="ok">تم تسجيل الحماية ✅</h2>' : `<h2>من ستحمي من التصويت؟</h2>${choiceButtons(alivePlayers(), 'lawyerProtect', { icon: '⚖️' })}`}</div>`;
    return;
  }
  $('#app').innerHTML = `<div class="card hero"><div class="role-title">☀️ الصباح</div>${eventCards()}<p>انتظر المضيف لبدء التصويت.</p></div>`;
}
function renderVote() {
  const me = game.me;
  const targets = alivePlayers().filter((player) => player.id !== playerId);
  const nomination=game.phase==='nomination';
  $('#app').innerHTML = `${phaseBar()}<div class="card"><div class="role-title">${nomination?'☝️ ترشيح متهم':'🗳️ التصويت السري'}</div>${me.voted?`<div class="status">✅ تم تسجيل صوتك ويمكنك تغييره حتى كشف النتيجة.</div>`:`<h2>${nomination?'من تريد محاكمته؟':'اختر لاعبًا للاستبعاد'}</h2>`}${choiceButtons(targets,'castVote')}${game.enabledRoles?.allow_no_vote?'<button class="pick skip" onclick="castVote(\'SKIP\')">✋ لا أريد اختيار أحد</button>':''}</div>`;
}

let actionFeedback = null;
let playerActionPending = false;
function actionContext(){return [game?.code,game?.matchId,game?.round,game?.phase,playerId].join(':');}
function paintActionFeedback(){
  document.getElementById('actionFeedback')?.remove();
  if(!actionFeedback || actionFeedback.context!==actionContext())return;
  const {state,target}=actionFeedback;
  const displayTarget=target.replace(/^(SAVE|POISON):/,'');
  const label=game.players.find(p=>p.id===displayTarget)?.name || ({SKIP:discussionText('تخطي','Skip'),GUILTY:discussionText('مذنب','Guilty'),INNOCENT:discussionText('بريء','Innocent')})[target] || '';
  const message=state==='pending'?discussionText('جاري إرسال الاختيار…','Sending choice…'):state==='success'?discussionText('✓ تم تسجيل اختيارك','✓ Choice recorded'):discussionText('تعذر تأكيد الإرسال. تحقق من الاتصال والحالة قبل المحاولة مجددًا.','Could not confirm delivery. Check your connection and current state before trying again.');
  const card=document.createElement('p');card.id='actionFeedback';card.className='status action-feedback '+state;card.setAttribute('role',state==='error'?'alert':'status');card.setAttribute('data-no-translate','');card.textContent=message+(label?' — '+label:'');
  document.querySelector('#app .phase-bar')?.insertAdjacentElement('afterend',card) || document.getElementById('app').prepend(card);
  for(const button of document.querySelectorAll('#app .pick')){
    button.disabled=state==='pending';
    if(button.dataset.target)button.setAttribute('aria-pressed',String(button.dataset.target===displayTarget));
  }
}
