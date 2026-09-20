let discussionClockOffset = 0;
let discussionRequestPending = false;
let roundDurationDraft = { key: '', seconds: 30 };
function roundDurationControl(view) {
  const key = `${game.code}:${game.round}:${view.mode}`;
  const choices = view.mode === 'turns' ? [15,30,45,60,90,120] : [30,60,120,180,300,600,900,1800,3600];
  if (roundDurationDraft.key !== key) roundDurationDraft = { key, seconds: view.mode === 'turns' ? game.enabledRoles.speaker_seconds : game.enabledRoles.discussion_seconds };
  if (!choices.includes(roundDurationDraft.seconds)) roundDurationDraft.seconds = choices[0];
  return `<label>${discussionText('مدة الكلام لهذه الجولة','Speaking time for this round')}<select class="input" aria-label="${discussionText('مدة الكلام لهذه الجولة','Speaking time for this round')}" onchange="roundDurationDraft.seconds=Number(this.value)">${choices.map(n=>`<option value="${n}" ${n===roundDurationDraft.seconds?'selected':''}>${n} ${discussionText('ثانية','seconds')}</option>`).join('')}</select></label>`;
}
const discussionText = (ar, en) => (localStorage.getItem('mafia-lang') || 'ar') === 'en' ? en : ar;

function clientDiscussion(now = Date.now() + discussionClockOffset) {
  const saved = game?.discussion;
  if (!saved) return { status: 'off', complete: true };
  if (!saved.id) return saved;
  const at = saved.pausedAt || now;
  const index = saved.cursor + (saved.mode === 'turns' ? Math.max(0, Math.floor((at - saved.turnStartedAt) / (saved.seconds * 1000))) : 0);
  const complete = saved.finished || (saved.mode === 'group' ? at >= saved.endsAt : index >= saved.order.length);
  const deadline = saved.mode === 'group' ? saved.endsAt : saved.turnStartedAt + (index - saved.cursor + 1) * saved.seconds * 1000;
  return { ...saved, index, complete: Boolean(complete), status: complete ? 'done' : saved.pausedAt ? 'paused' : 'active', speakerId: !complete && saved.mode === 'turns' ? saved.order[index] : null, remainingMs: complete ? 0 : Math.max(0, deadline - at) };
}
function discussionSettings() {
  const mode = enabledRoles.discussion_mode || 'turns';
  const seconds = mode === 'turns' ? enabledRoles.speaker_seconds || 30 : enabledRoles.discussion_seconds || 180;
  const choices = mode === 'turns' ? [15,30,45,60,90,120] : [30,60,120,180,300,600,900,1800,3600];
  return `<div class="discussion-settings" data-no-translate><label>${discussionText('🗣️ نظام النقاش','🗣️ Discussion')}<select aria-label="${discussionText('نظام النقاش','Discussion mode')}" onchange="changeDiscussionSetting('discussion_mode',this.value)">${[['turns',discussionText('بالدور لكل لاعب','Player turns')],['group',discussionText('نقاش جماعي','Group discussion')],['off',discussionText('بدون مؤقت نقاش','No discussion timer')]].map(([value,label])=>`<option value="${value}" ${mode===value?'selected':''}>${label}</option>`).join('')}</select></label>${mode==='off'?'':`<label>${mode==='turns'?discussionText('وقت كل لاعب','Time per player'):discussionText('مدة النقاش','Discussion duration')}<select aria-label="${discussionText('مدة النقاش','Discussion duration')}" onchange="changeDiscussionSetting('${mode==='turns'?'speaker_seconds':'discussion_seconds'}',Number(this.value))">${choices.map(value=>`<option value="${value}" ${seconds===value?'selected':''}>${value>=60&&value%60===0?`${value/60} ${discussionText('دقيقة','min')}`:`${value} ${discussionText('ثانية','sec')}`}</option>`).join('')}</select></label>`}</div>`;
}
function changeDiscussionSetting(key, value) {
  const allowed = { discussion_mode: ['off','group','turns'], discussion_seconds: [30,60,120,180,300,600,900,1800,3600], speaker_seconds: [15,30,45,60,90,120] };
  if (!allowed[key]?.includes(value)) return;
  enabledRoles[key] = value;
  schedulePreferenceSave();
  renderHost();
}
function openingDrawDuration(view){return Number(view?.roulette?.duration)||6000;}
function openingDrawElapsed(view){return Math.max(0,(view.pausedAt||Date.now()+discussionClockOffset)-(view.roulette?.at||0));}
function openingDrawActive(view){return view.mode==='turns'&&!view.complete&&view.index===0&&view.roulette&&openingDrawElapsed(view)<openingDrawDuration(view);}
function discussionRoulette(view) {
  if(!view.roulette || view.mode!=='turns' || view.complete)return '';
  const candidates = view.roulette.candidates || [];
  const winner = view.roulette.winner;
  if (!candidates.length || !candidates.includes(winner)) return '';
  const elapsed = openingDrawElapsed(view);
  const order = view.order.filter(id=>candidates.includes(id));
  const duration = openingDrawDuration(view);
  const stops = [0,90,180,280,390,510,650,800,970,1160,1370,1600,1860,2150,2470,2830,3230,3680,4180,4730,5330,6000].map(n=>n*duration/6000);
  const frames = stops.slice(0,-1).map((start,i)=>`<bdi class="draw-name-frame" style="animation-duration:${stops[i+1]-start}ms;animation-delay:${start-elapsed}ms" aria-hidden="true">${escapeHtml(nameOf(candidates[i%candidates.length]))}</bdi>`).join('');
  return `<details class="opening-roulette clear-draw animated-draw" style="--draw-duration:${duration}ms;--draw-delay:-${Math.min(elapsed,duration)}ms;--draw-play:${view.pausedAt?'paused':'running'}" ${view.index===0?'open':''} data-no-translate><summary><span>${discussionText('قرعة بداية النقاش','Opening draw')}</span><bdi class="draw-after">${escapeHtml(nameOf(winner))}</bdi><span class="draw-chevron" aria-hidden="true">⌄</span></summary><div class="draw-content"><div class="draw-heading"><span class="draw-emblem" aria-hidden="true">✦</span><div><h3>${discussionText('من يبدأ النقاش؟','Who speaks first?')}</h3><p>${discussionText('من يفتتح المواجهة؟ القرعة تحسمها…','Who opens the showdown? Let the draw decide…')}</p></div></div><div class="draw-contenders">${candidates.map(id=>`<span><i aria-hidden="true">✦</i><bdi>${escapeHtml(nameOf(id))}</bdi></span>`).join('')}</div><div class="draw-suspense-track" aria-hidden="true"><i></i></div><div class="draw-selected" style="animation-delay:-${Math.min(elapsed,500)}ms"><span class="draw-label">${discussionText('المتحدث الأول','FIRST SPEAKER')}</span><strong class="draw-name-stage">${frames}<bdi class="draw-after draw-final">${escapeHtml(nameOf(winner))}</bdi></strong><span class="draw-selected-note draw-after">${discussionText('اختارته القرعة لافتتاح النقاش','Selected by the draw to open the discussion')}</span></div><div class="draw-order-heading draw-after">${discussionText('ترتيب المشاركين في القرعة','Draw participants in speaking order')}<span>${order.length}</span></div><ol class="draw-order draw-after">${order.map((id,i)=>`<li class="${id===winner?'draw-first':''}"><span class="draw-position">${i+1}</span><bdi>${escapeHtml(nameOf(id))}</bdi><small>${i===0?discussionText('الأول','First'):i===1?discussionText('الثاني','Second'):discussionText('بالترتيب','In order')}</small></li>`).join('')}</ol></div></details>`;
}
function discussionQueue(view) {
  if(view.mode!=='turns'||!view.order?.length)return '';
  const cursor = view.complete ? view.order.length : view.index;
  const row = (id,i) => {
    const state = i<cursor?'done':i===cursor?'current':'upcoming';
    const label = state==='done'?discussionText('انتهى','Done'):state==='current'?discussionText(view.status==='paused'?'متوقف مؤقتًا':'يتحدث الآن',view.status==='paused'?'Paused':'Speaking now'):i===cursor+1?discussionText('التالي','Up next'):discussionText('بانتظار دوره','Waiting');
    return `<li class="speaker-row ${state}" ${state==='current'?'aria-current="step"':''}><span class="speaker-position">${i+1}</span><bdi class="speaker-name">${escapeHtml(nameOf(id))}</bdi><span class="speaker-state">${label}</span></li>`;
  };
  return `<div class="speaker-queue"><h3>${discussionText('ترتيب المتحدثين','Speaking order')}</h3><ol class="speaker-list">${view.order.slice(cursor).map((id,i)=>row(id,i+cursor)).join('')}</ol>${cursor>0?`<details class="speakers-finished"><summary>${discussionText('أنهوا دورهم','Completed turns')} (${cursor})</summary><ol class="speaker-list">${view.order.slice(0,cursor).map(row).join('')}</ol></details>`:''}</div>`;
}
function discussionPanel(controller) {
  const view = clientDiscussion();
  if (view.status === 'off') return '';
  if(openingDrawActive(view))return `<section class="discussion-panel draw-in-progress" data-no-translate data-controller="${controller}">${discussionRoulette(view)}<p class="draw-wait-note">${discussionText('لحظات وينحسم الدور… وقت الكلام يبدأ بعد القرعة.','The opening speaker is about to be chosen. Speaking time starts after the draw.')}</p></section>`;
  const active = view.status === 'active';
  const canPass = active && view.mode === 'turns' && (controller || (game.me?.alive && playerId === view.speakerId));
  const botLines = (view.botLines || []).map(line => `<div class="bot-discussion-line"><b>🤖 ${escapeHtml(line.name)}</b><span>${escapeHtml(line.text)}</span></div>`).join('');
  const title = (view.status === 'waiting' ? discussionText('🗣️ وقت النقاش','🗣️ Discussion time') : view.complete ? discussionText('✅ انتهى النقاش','✅ Discussion complete') : view.mode === 'group' ? discussionText('🗣️ نقاش جماعي','🗣️ Group discussion') : discussionText('🎙️ الدور على','🎙️ Now speaking')) + (botLines ? `<div class="bot-discussion-feed"><h3>${discussionText('مداخلات البوتات','Bot reactions')}</h3>${botLines}</div>` : '');
  return `<section class="discussion-panel" data-no-translate data-controller="${controller}">${discussionRoulette(view)}<h2>${title}</h2>${active||view.status==='paused'?`<strong class="discussion-speaker">${view.mode==='turns'?escapeHtml(nameOf(view.speakerId)):discussionText('الجميع يشارك','Everyone can speak')}</strong><div class="discussion-clock" role="timer" aria-label="${discussionText('الوقت المتبقي','Time remaining')}">${formatDiscussionTime(view.remainingMs)}</div>${view.mode==='turns'?`<p class="discussion-order">${Math.min(view.index+1,view.order.length)} / ${view.order.length}</p>${discussionQueue(view)}`:''}`:`<p>${view.complete?discussionText('جاهزين للتصويت بعد اكتمال اختيارات الأدوار.','Ready to vote once role actions are complete.'):controller?discussionText('ابدأ النقاش قبل التصويت. البوتات لا تأخذ أدوار كلام.','Start discussion before voting. Bots do not take speaking turns.'):discussionText('انتظر المضيف لبدء النقاش.','Wait for the host to start discussion.')}</p>`}${controller&&view.status==='waiting'?roundDurationControl(view):''}<div class="actions center">${controller&&view.status==='waiting'?`<button class="btn green" onclick="discussionAction('startDiscussion')">${discussionText('بدء النقاش','Start discussion')}</button>`:''}${canPass?`<button class="btn" onclick="discussionAction('passDiscussion')">${discussionText('تخطي','PASS')}</button>`:''}${controller&&(active||view.status==='paused')?`<button class="btn" onclick="discussionAction('controlDiscussion','${active?'pause':'resume'}')">${active?discussionText('⏸️ إيقاف وقت الكلام','⏸️ Pause speaking timer'):discussionText('▶️ استكمال وقت الكلام','▶️ Resume speaking timer')}</button><button class="btn" onclick="discussionAction('controlDiscussion','reset')">${discussionText('↻ إعادة وقت المتحدث','↻ Restart current timer')}</button>`:''}${controller&&active?`<button class="btn" onclick="finishDiscussionEarly()">${discussionText('إنهاء النقاش','End discussion')}</button>`:''}</div></section>`;
}
function formatDiscussionTime(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
function updateDiscussionClocks() {
  const panel = document.querySelector('.discussion-panel');
  if (!panel || !game) return;
  const view = clientDiscussion();
  const signature = `${view.id}:${view.status}:${view.speakerId}:${view.order?.join(',')}:${Boolean(openingDrawActive(view))}:${localStorage.getItem('mafia-lang')}`;
  if (panel.dataset.signature !== signature) {
    const controller = panel.dataset.controller === 'true';
    panel.outerHTML = discussionPanel(controller);
    const updated = document.querySelector('.discussion-panel');
    if (updated) updated.dataset.signature = signature;
  }
  const clock = document.querySelector('.discussion-clock');
  if (clock) { clock.textContent = formatDiscussionTime(view.remainingMs); clock.classList.toggle('urgent',view.remainingMs<=10000); }
  const vote = document.querySelector('[data-discussion-vote]');
  if (vote) vote.disabled = !(view.complete && ((game.lawyerReady && game.jailerReady) || phaseTimeExpired()));
}
async function discussionAction(action, operation) {
  if (discussionRequestPending) return;
  discussionRequestPending = true;
  const view = clientDiscussion();
  try {
    game = await api({ action, code: game.code, hostToken, id: playerId, playerToken, discussionId: view.id, speakerId: view.speakerId, version: view.version, operation, ...(action==='startDiscussion'?{seconds:roundDurationDraft.seconds}:{}) });
    (hostToken || delegatedHostMode) ? renderHost() : renderPlayer();
  } catch (error) {
    alert(error.code==='STALE_TURN'?discussionText('انتقل الدور بالفعل، انتظر تحديث الشاشة.','The turn already changed. Wait for the screen to update.'):discussionText('تعذر تنفيذ الطلب، حاول مجددًا.','Could not complete the request. Please retry.'));
  } finally { discussionRequestPending = false; }
}
function finishDiscussionEarly() {
  if (confirm(discussionText('إنهاء وقت النقاش الآن؟','End the discussion now?'))) discussionAction('finishDiscussion');
}

function bossDiscussionChoice() {
  if (game.me?.role !== 'mafia_boss' || !game.me.alive || !['night','day'].includes(game.phase) || game.enabledRoles?.discussion_mode !== 'turns' || (game.discussion?.id && game.discussion.round === game.round)) return '';
  const claim = game.me.discussionClaim === true;
  if(game.me.discussionChoiceLocked)return `<section class="card" data-no-translate><p>${discussionText(claim?'اختيارك ثابت لنهاية القيم: المشاركة كشرطي مزيف.':'اختيارك ثابت لنهاية القيم: البقاء متخفّيًا.',claim?'Your choice for this game: participate as a fake detective.':'Your choice for this game: stay undercover.')}</p></section>`;
  return `<section class="card" data-no-translate><h2>${discussionText('اختيارك السري للنقاش','Your private discussion choice')}</h2><p>${discussionText('تقدر تبقى متخفّي وتتكلم بدورك العادي، أو تبدأ النقاش وتدّعي بنفسك إنك شرطي. اختيارك مرة واحدة ويثبت لنهاية القيم. إذا ما اخترت قبل أول نقاش، تبقى متخفّيًا.','Stay undercover and speak on your normal turn, or open discussion and claim to be a detective yourself. Choose once for the entire game. If you do not choose before the first discussion, you stay undercover.')}</p><div class="actions"><button class="btn ${!claim?'green':''}" aria-pressed="${!claim}" onclick="setBossDiscussionClaim(false)">${discussionText('أبقى متخفّي','Stay undercover')}</button><button class="btn ${claim?'green':''}" aria-pressed="${claim}" onclick="setBossDiscussionClaim(true)">${discussionText('أبدأ كشرطي مزيف','Open as a fake detective')}</button></div></section>`;
}
async function setBossDiscussionClaim(claim) {
  if (discussionRequestPending) return;
  if(!confirm(discussionText('تأكيد الاختيار؟ يثبت لنهاية القيم ولا يمكن تغييره.','Confirm your choice? It stays fixed until this game ends.')))return;
  discussionRequestPending = true;
  try { game = await api({action:'setDiscussionClaim',code:game.code,id:playerId,playerToken,claim}); renderPlayer(); }
  catch { alert(discussionText('تعذر تغيير الاختيار؛ يمكن النقاش بدأ.','Could not change your choice; discussion may have started.')); }
  finally { discussionRequestPending = false; }
}
