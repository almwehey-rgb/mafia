const eliminationEffectSeen = new Set();
let eliminationEffectTimer;
const eliminationEffectStorageKey = 'mafia-elimination-effect-seen';
let victoryEffectTimer, victoryReturnFocus;
let victoryBackground=[];
function closeVictoryEffect(){
 clearTimeout(victoryEffectTimer);
 const effect=document.getElementById('victoryEffect');if(!effect)return;
 effect.remove();
 for(const [element,wasInert] of victoryBackground)if(!wasInert)element.removeAttribute('inert');
 victoryBackground=[];
 if(victoryReturnFocus?.isConnected)victoryReturnFocus.focus({preventScroll:true});
 victoryReturnFocus=null;
}
function showVictoryEffect(){
 if(game?.phase!=='finished'||!['mafia','village'].includes(game.winner)){closeVictoryEffect();return false;}
 const key=`victory:${game.code}:${game.matchId||game.lifecycleVersion}:${game.winner}`;
 if(hasSeenEliminationEffect(key))return true;
 closeEliminationEffect();closeVictoryEffect();
 const mafia=game.winner==='mafia';
 const title=discussionText(mafia?'فازت المافيا':'فازت القرية',mafia?'MAFIA WINS':'VILLAGE WINS');
 const emblem=mafia?'<path d="m16 30 17 15 17-27 17 27 17-15-9 46H25ZM27 86h46"/>':'<path d="M50 12 20 24v25c0 20 30 39 30 39s30-19 30-39V24Z"/><path d="m34 49 11 11 23-25"/>';
 const effect=document.createElement('div');effect.id='victoryEffect';effect.className=`elimination-effect victory-effect victory-${game.winner}`;
 effect.setAttribute('role','dialog');effect.setAttribute('aria-modal','true');effect.setAttribute('aria-label',title);
 effect.innerHTML=`<div class="exit-atmosphere" aria-hidden="true"><span class="exit-beam"></span><span class="exit-orbit"></span>${Array.from({length:24},(_,i)=>`<i style="--i:${i};--x:${(i*37)%100}%;--drift:${(i%2?1:-1)*(20+i*3)}px;--delay:${(i%6)*.12}s"></i>`).join('')}</div><span class="elimination-effect-ring" aria-hidden="true"></span><div class="exit-cinema-brand" aria-hidden="true">M A F I A ◆ N I G H T</div><div class="elimination-effect-scene"><p class="elimination-effect-kicker">${discussionText('حُسمت المباراة','THE MATCH IS DECIDED')}</p><div class="exit-sigil"><span class="elimination-effect-icon"><svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" aria-hidden="true">${emblem}</svg></span></div><h2>${title}</h2><div class="exit-cause-line" aria-hidden="true"><span></span>◆<span></span></div><p class="exit-afterword">${discussionText(mafia?'سيطرت المافيا على المدينة':'كشفت القرية الأسرار وحسمت المواجهة',mafia?'The Mafia controls the city':'The village uncovered the truth')}</p></div><footer class="exit-cinema-footer"><button type="button" class="btn elimination-effect-skip" onclick="closeVictoryEffect()">${discussionText('تجاوز وعرض النتائج','Skip to results')} ←</button><span class="elimination-effect-progress" aria-hidden="true"></span></footer>`;
 effect.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeVictoryEffect();}else if(event.key==='Tab'){event.preventDefault();effect.querySelector('button')?.focus();}});
 victoryReturnFocus=document.activeElement;
 victoryBackground=[...document.querySelectorAll('main.shell,.utility-bar,.game-sheet')].map(element=>[element,element.hasAttribute('inert')]);
 victoryBackground.forEach(([element])=>element.setAttribute('inert',''));
 document.body.appendChild(effect);rememberEliminationEffect(key);
 if(!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches&&document.visibilityState==='visible')navigator.vibrate?.([140,70,220,90,300]);
 victoryEffectTimer=setTimeout(closeVictoryEffect,5000);effect.querySelector('button')?.focus({preventScroll:true});
 return true;
}
function eliminationKind(reason) {
  return ({mafia_kill:'mafia',vote_eliminated:'vote',trial_guilty:'vote',serial_kill:'serial',witch_poison:'poison',jailer_executed:'execution',vigilante_kill:'shot',lovers_died:'lovers',host_expelled:'expelled'})[reason] || 'other';
}
function closeEliminationEffect() {
  clearTimeout(eliminationEffectTimer);
  document.getElementById('eliminationEffect')?.remove();
}
function visibleEliminations() {
  const now=Number(game?.serverTime)||Date.now();
  return (game?.eliminations||[]).filter(p=>{
    if(game.phase==='finished'||(game.phase==='day'&&p.round===game.round))return true;
    const at=Number(p.at);
    return at>0&&now>=at&&now-at<20000;
  });
}
function hasSeenEliminationEffect(key) {
  if(eliminationEffectSeen.has(key))return true;
  try {
    const saved=JSON.parse(localStorage.getItem(eliminationEffectStorageKey)||'[]');
    if(Array.isArray(saved)&&saved.includes(key)){eliminationEffectSeen.add(key);return true;}
  } catch {}
  return false;
}
function rememberEliminationEffect(key) {
  eliminationEffectSeen.add(key);
  try {
    const saved=JSON.parse(localStorage.getItem(eliminationEffectStorageKey)||'[]');
    const keys=Array.isArray(saved)?saved:[];
    localStorage.setItem(eliminationEffectStorageKey,JSON.stringify([...keys.filter(item=>item!==key),key].slice(-60)));
  } catch {}
}
function eliminationEmblem(kind) {
  const paths={
    mafia:'<path d="M62 13 48 58 37 70l-8-8 12-11Z"/><path d="m30 49 25 25M35 68 21 83m-5-5 10 10"/>',
    vote:'<path d="M50 18v64M28 84h44M22 32h56M50 18l-6 10h12Z"/><path d="m25 32-12 27h24ZM75 32 63 59h24Z"/><path d="M13 62q12 16 24 0m26 0q12 16 24 0"/>',
    serial:'<path d="M34 15 18 78l21-20M57 11 40 87l20-26M80 18 65 83l19-22"/>',
    poison:'<path d="M39 13h22m-18 0v24L23 72q-7 15 10 15h34q17 0 10-15L57 37V13M32 62h36"/><circle cx="46" cy="70" r="2"/><circle cx="58" cy="77" r="2"/><path d="m48 31 4-7m11 26 4-8"/>',
    execution:'<path d="M22 85V39a28 28 0 0 1 56 0v46ZM22 39h56M36 16v69M50 11v74M64 16v69M22 66h56"/>',
    shot:'<circle cx="50" cy="50" r="29"/><circle cx="50" cy="50" r="8"/><path d="M50 8v24m0 36v24M8 50h24m36 0h24"/>',
    lovers:'<path d="M45 27C17 5 2 40 22 59l24 25M56 26C80 7 99 38 78 59L56 83M52 23l-8 20 14 12-11 22"/>',
    expelled:'<path d="M54 19H22v64h32M53 50h35L74 36m14 14L74 64M34 25v52"/>',
    other:'<path d="m50 12 36 38-36 38L14 50ZM50 31v24m0 12v2"/>'
  };
  return `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind]||paths.other}</svg>`;
}
function showEliminationEffect() {
  if(game?.me?.alive!==false)return;
  const eliminations=visibleEliminations();
  const eliminated=eliminations.find(p=>p.id===game?.me?.id);
  if(!eliminated)return;
  const key=[game.code,game.matchId,eliminated.id,eliminated.at||'legacy'].join(':');
  if(hasSeenEliminationEffect(key))return;
  const kind=eliminationKind(eliminated.reason);
  const titles={mafia:['اغتيال في الظلام','Mafia assassination'],vote:['حسم التصويت','Vote decided'],serial:['ضربة القاتل المتسلسل','Serial killer strike'],poison:['سم الساحرة','Witch poison'],execution:['حكم السجّان','Jailer execution'],shot:['الطلقة الأخيرة','Final shot'],lovers:['مصير الحبيبين','Linked fate'],expelled:['استبعاد من المضيف','Host expulsion'],mixed:['أحداث الليلة','Night events'],other:['خرج لاعب من المباراة','A player left the game']};
  const names=escapeHtml(eliminated.name);
  closeEliminationEffect();
  const effect=document.createElement('div');
  effect.id='eliminationEffect';
  effect.className=`elimination-effect effect-${kind}`;
  effect.setAttribute('role','dialog');
  effect.setAttribute('aria-modal','true');
  effect.setAttribute('aria-label',discussionText(...titles[kind]));
  effect.innerHTML=`<div class="exit-atmosphere" aria-hidden="true"><span class="exit-beam"></span><span class="exit-orbit"></span>${Array.from({length:18},(_,i)=>`<i style="--i:${i};--x:${(i*37)%100}%;--drift:${(i%2?1:-1)*(20+i*3)}px;--delay:${(i%6)*.12}s"></i>`).join('')}</div><span class="exit-shutter exit-shutter-top" aria-hidden="true"></span><span class="exit-shutter exit-shutter-bottom" aria-hidden="true"></span><span class="elimination-effect-flash" aria-hidden="true"></span><span class="elimination-effect-ring" aria-hidden="true"></span><div class="exit-cinema-brand" aria-hidden="true">M A F I A <span>◆</span> N I G H T</div><div class="elimination-effect-scene"><p class="elimination-effect-kicker">${discussionText('انتهى دورك في هذه المباراة','YOUR PART IN THIS MATCH HAS ENDED')}</p><div class="exit-sigil"><span class="elimination-effect-icon">${eliminationEmblem(kind)}</span><span class="exit-sigil-mark" aria-hidden="true">◆</span></div><h2>${discussionText(...titles[kind])}</h2><p class="elimination-effect-names">${names}</p><div class="exit-cause-line" aria-hidden="true"><span></span>◆<span></span></div><p class="exit-afterword">${discussionText('تبقى الأسرار… وتستمر اللعبة','The secrets remain. The game continues.')}</p></div><footer class="exit-cinema-footer"><button type="button" class="btn elimination-effect-skip" onclick="closeEliminationEffect()">${discussionText('تجاوز المشهد','Skip scene')} <span aria-hidden="true">←</span></button><span class="elimination-effect-progress" aria-hidden="true"></span></footer>`;
  effect.innerHTML=bloodyExitLayer(kind)+effect.innerHTML;
  effect.addEventListener('keydown',event=>{if(event.key==='Escape')closeEliminationEffect();});
  document.body.appendChild(effect);
  rememberEliminationEffect(key);
  if(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches&&document.visibilityState==='visible')navigator.vibrate?.(({mafia:[180,70,260,80,180],vote:[100,80,180,80,250],serial:[240,90,260,80,150],poison:[160,110,190,90,120],execution:[250,100,230],shot:[90,50,290,80,180],lovers:[130,100,180,100,130],expelled:[180,90,220],mixed:[180,90,220],other:[140,80,180]})[kind]);
  eliminationEffectTimer=setTimeout(closeEliminationEffect,5000);
  effect.querySelector('button')?.focus({preventScroll:true});
}
function bloodyExitLayer(kind){
 const splashes=Array.from({length:22},(_,i)=>`<circle cx="${(i*43)%100}" cy="${(i*29)%100}" r="${2+i%7}"/>`).join('');
 return `<div class="blood-theatre blood-${kind}" aria-hidden="true"><svg class="blood-spray blood-spray-left" viewBox="0 0 100 100"><path d="M0 0h60L45 14l30 8-41 8 17 17-28-6 10 36-18-20-8 35L0 100Z"/>${splashes}</svg><svg class="blood-spray blood-spray-right" viewBox="0 0 100 100"><path d="M0 0h60L45 14l30 8-41 8 17 17-28-6 10 36-18-20-8 35L0 100Z"/>${splashes}</svg><div class="blood-cuts"><i></i><i></i><i></i></div><div class="blood-drips">${Array.from({length:7},(_,i)=>`<i style="--drop:${i};--drop-height:${12+(i*11)%29}vh"></i>`).join('')}</div><span class="exit-verdict-stamp">${kind==='vote'?'حُكم بالخروج':kind==='expelled'?'تم الاستبعاد':'انتهت نجاتك'}</span></div>`;
}
function eliminationNotice() {
  const causes = {
    mafia_kill:['اغتيال المافيا','Killed by Mafia'], vote_eliminated:['الاستبعاد بالتصويت','Voted out'], trial_guilty:['حكم التصويت بالإدانة','Voted guilty'],
    vigilante_kill:['طلقة القناص الأخيرة','Sniper final shot'], serial_kill:['اغتيال القاتل المتسلسل','Killed by Serial Killer'], witch_poison:['سم الساحرة','Witch poison'],
    jailer_executed:['إعدام السجّان','Jailer execution'], lovers_died:['الارتباط بلاعب مستبعد','Linked partner eliminated'], host_expelled:['استبعاد من المضيف','Expelled by host'], eliminated:['الاستبعاد','Eliminated']
  };
  const icons={vote:'⚖️',serial:'🩸',mafia:'🗡️',poison:'☠️',execution:'🔒',shot:'🎯',lovers:'💔',expelled:'⛔',other:'✦'};
  const rows=visibleEliminations().map(p=>{const label=causes[p.reason]||causes.eliminated;const kind=eliminationKind(p.reason);return `<article class="elimination-row elimination-${kind}"><span class="elimination-mark" aria-hidden="true">${icons[kind]}</span><div><strong class="eliminated-name">${escapeHtml(p.name)}</strong><p class="elimination-cause">${discussionText(...label)}</p>${p.detail?`<small>${escapeHtml(p.detail)}</small>`:''}</div></article>`;}).join('');
  return rows?`<section id="eliminationNotice" class="card elimination-notice elimination-card" role="status" data-no-translate><b>${discussionText('المستبعدون','Eliminated players')}</b>${rows}</section>`:'';
}
function renderPendingShot(controller=false) {
  const shot=game?.pendingShot;
  if(!shot || game.phase==='finished')return false;
  document.querySelector('.player-tools')?.remove();
  if(document.querySelector('.game-sheet'))closeSheet();
  if(shot.resolving){$('#app').innerHTML=`<section class="card" data-no-translate><p>${discussionText('جاري تنفيذ الطلقة الأخيرة…','Resolving the final shot…')}</p>${shot.target?`<button class="btn" onclick="takeLastShot(${jsArg(shot.target)})">${discussionText('إعادة المحاولة إذا تأخر التنفيذ','Retry if resolution stalls')}</button>`:''}</section>`;return true;}
  const canShoot=game.me?.id===shot.playerId || (controller&&game.players.find(p=>p.id===shot.playerId)?.isBot);
  $('#app').innerHTML=`<section class="card hero" data-no-translate><h2>${discussionText('🎯 طلقة القناص الأخيرة','🎯 Sniper final shot')}</h2><p>${escapeHtml(nameOf(shot.playerId))}</p>${canShoot?`<p>${discussionText('اختر لاعبًا حيًا لطلقتك الأخيرة، وبعدها تتابع فقط.','Choose a living player for your final shot, then spectate.')}</p>${choiceButtons(alivePlayers(),'takeLastShot',{icon:'🎯'})}`:`<p>${discussionText('بانتظار اختيار القناص قبل مواصلة اللعبة.','Waiting for the sniper before the game continues.')}</p>`}${canShoot||controller?`<button class="btn wide" onclick="takeLastShot('SKIP')">${discussionText('تخطي الطلقة ومواصلة اللعبة','Skip shot and continue')}</button>`:''}</section>`;
  return true;
}
async function takeLastShot(target) {
  const shotId=game?.pendingShot?.id;
  if(!shotId)return;
  const prompt=target==='SKIP'?discussionText('تخطي الطلقة نهائيًا؟','Permanently skip the shot?'):discussionText('تأكيد الطلقة الأخيرة على ','Confirm final shot at ')+nameOf(target)+'؟';
  if(!confirm(prompt))return;
  try {
    game=await withBusy(discussionText('جاري تثبيت الاختيار…','Saving choice…'),()=>api({action:'lastShot',code:game.code,id:playerId,playerToken,hostToken,shotId,target}));
    (hostToken||delegatedHostMode)?renderHost():renderPlayer();
  } catch { alert(discussionText('تعذّر تثبيت الاختيار. حدّث الحالة وحاول مجددًا.','Could not save the choice. Refresh and try again.')); }
}
async function electMafiaLeader(target){
  if(!game.me.leaderElection&&game.me.role==='mafia_boss'&&target!=='RESIGN'&&target!=='FINALIZE'){
    const nominee=(game.me.mafiaTeam||[]).find(player=>player.id===target&&player.alive!==false);
    if(!nominee)return;
    if(!confirm(`تسليم قيادة المافيا إلى ${nominee.name}؟`))return;
  }
  try{game=await api({action:'electMafiaLeader',code:game.code,id:playerId,playerToken,target});closeSheet();renderPlayer();}catch{alert(discussionText('تعذر تسجيل اختيار الزعيم، حاول مرة ثانية.','Could not record your leader vote.'));}
}
async function resignMafiaLeader(){
 const candidates=(game.me.mafiaTeam||[]).filter(player=>player.id!==game.me.id&&player.alive!==false);
 if(!candidates.length)return;
 openSheet('التنازل عن قيادة المافيا',`<p class="muted">اختر عضوًا من المافيا لتسليمه القيادة مباشرة.</p>${choiceButtons(candidates,'electMafiaLeader',{icon:'👑'})}`);
}
async function setBossDiscussionClaim(){
 if(game?.me?.role!=='mafia_boss'||game.me.discussionChoiceLocked)return;
 try{
  game=await withBusy(discussionText('جاري تسجيل قرارك…','Saving your choice…'),()=>api({action:'setDiscussionClaim',code:game.code,id:playerId,playerToken,claim:true}));
  renderPlayer();
 }catch{alert(discussionText('تعذّر تسجيل ادّعاء المحقق المزيف. حدّث الحالة وحاول مرة ثانية.','Could not save the fake detective claim. Refresh and try again.'));}
}
function leaderElectionCard(){
 if(!game?.me?.alive||!roleAcknowledged()||['lobby','finished','paused'].includes(game.phase))return '';
 if(!game.me.leaderElection){
  if(game.me.role!=='mafia_boss')return '';
  const canResign=(game.me.mafiaTeam||[]).some(p=>p.id!==game.me.id&&p.alive!==false);
  const canClaim=game.round===1&&['night','day'].includes(game.phase)&&game.enabledRoles?.discussion_mode==='turns'&&!game.me.discussionChoiceLocked;
  const claimStatus=game.me.discussionClaim?`<p>${discussionText('دخلت قرعة المتحدثين كمحقق مزيف.','You entered the speaker draw as a fake detective.')}</p>`:'';
  if(!canResign&&!canClaim&&!claimStatus)return '';
  return `<section id="leaderElectionCard" class="card" data-no-translate><h2>${discussionText(game.me.promotedBoss?'👑 صرت زعيم المافيا':'👑 زعيم المافيا',game.me.promotedBoss?'👑 You are now Mafia Boss':'👑 Mafia Boss')}</h2><div class="actions">${canResign?`<button class="btn" onclick="resignMafiaLeader()">${discussionText('تنازل عن الزعامة','Hand over leadership')}</button>`:''}${canClaim?`<button class="btn gold" onclick="setBossDiscussionClaim()">${discussionText('ادّعِ أنك محقق مزيف وادخل القرعة','Claim to be a fake detective and enter the draw')}</button>`:''}</div>${claimStatus}</section>`;
 }
 const ended=Date.now()+discussionClockOffset>=game.me.leaderDeadline;
 return `<section id="leaderElectionCard" class="card"><h2>اختيار زعيم المافيا الجديد</h2><p>تصويت سري بعد التنازل. الأكثر أصواتًا يصبح الزعيم، والتعادل بقرعة. تنتهي المهلة خلال 30 ثانية، وتبقى القيادة الحالية حتى حسم البديل.</p>${ended?'<button class="btn gold" onclick="electMafiaLeader(&quot;FINALIZE&quot;)">حسم التصويت وتحديث الكروت</button>':game.me.leaderVote?'<p>تم تسجيل صوتك. بانتظار بقية الفريق.</p>':choiceButtons((game.me.mafiaTeam||[]).filter(p=>p.id!==game.me.leaderFormer&&p.alive!==false),'electMafiaLeader',{icon:'👑'})}</section>`;
}
function voteCountRow(name,count,voters,key) {
  const heading=`<span class="vote-target-name">${escapeHtml(name)}</span><strong class="vote-count-badge">${escapeHtml(count)} ${discussionText('أصوات','votes')}</strong>`;
  if(!game?.enabledRoles?.public_voting || !Array.isArray(voters))return `<div class="vote-count-row">${heading}</div>`;
  return `<details class="vote-count-details" data-disclosure-key="${escapeHtml(key)}"><summary>${heading}<span class="vote-expand-mark" aria-hidden="true">⌄</span></summary><ul class="vote-voter-list">${voters.map(v=>`<li>${escapeHtml(v.name)}</li>`).join('')}</ul></details>`;
}
function voteSummaryCard(expanded=false) {
  if(['vote','nomination','verdict'].includes(game?.phase==='paused'?game.enabledRoles?.paused_phase:game?.phase))return '';
  const summary=game?.voteSummary;
  if(!summary)return '';
  if(!expanded)return `<section id="voteSummaryNotice" class="vote-summary-launch"><button class="btn wide" onclick="openSheet('نتائج التصويت',voteSummaryCard(true))">${discussionText('نتائج تصويت الجولة','Voting results, round')} ${escapeHtml(summary.round)} <span aria-hidden="true">⌄</span></button></section>`;
  const label=name=>summary.phase==='verdict'?(name==='GUILTY'?discussionText('مذنب','Guilty'):discussionText('بريء','Innocent')):name;
  return `<section id="voteSummaryNotice" class="card" data-no-translate><h3>${discussionText('نتائج التصويت — الجولة','Voting results — round')} ${escapeHtml(summary.round)}</h3>${summary.counts.map(item=>voteCountRow(label(item.name),item.count,item.voters,`result-${game.matchId}-${summary.round}-${summary.phase}-${item.id||item.name}`)).join('')}${voteCountRow(discussionText('امتناع / لم يصوّت','Abstained / did not vote'),summary.abstained,null,'')}</section>`;
}
let votePreviewTimer, voteFoldTimer, votePreviewKey='';
const votePreviewsSeen=new Set();
function queueVoteResultPreview(){
 const summary=game?.voteSummary;
 if(!summary||['vote','nomination','verdict','finished','lobby','paused'].includes(game.phase))return;
 const key=[game.code,game.matchId,summary.round,summary.phase].join(':');
 if(votePreviewsSeen.has(key)||votePreviewKey===key)return;
 votePreviewKey=key;clearTimeout(votePreviewTimer);
 const show=()=>{
  if(votePreviewKey!==key)return;
  if(!game?.voteSummary||[game.code,game.matchId,game.voteSummary.round,game.voteSummary.phase].join(':')!==key||['vote','nomination','verdict','finished','lobby'].includes(game.phase)){votePreviewKey='';return;}
  if(document.getElementById('eliminationEffect')||document.getElementById('victoryEffect')||document.querySelector('.game-sheet')){votePreviewTimer=setTimeout(show,600);return;}
  votePreviewsSeen.add(key);votePreviewKey='';
  openSheet('نتائج التصويت',voteSummaryCard(true));
  const sheet=document.querySelector('.game-sheet');
  clearTimeout(voteFoldTimer);voteFoldTimer=setTimeout(()=>{if(sheet?.isConnected)closeSheet();},6000);
  sheet?.addEventListener('pointerdown',()=>clearTimeout(voteFoldTimer),{once:true});
  sheet?.addEventListener('keydown',()=>clearTimeout(voteFoldTimer),{once:true});
 };
 votePreviewTimer=setTimeout(show,350);
}
function publicVotesCard() { return ''; }
function renderWithNotices(content,controller=false) {
  const app=$('#app'), focused=document.activeElement;
  const focusPhase=[game?.matchId,game?.phase,game?.round].join('|');
  const changedPhase=app?.dataset?.focusPhase&&app.dataset.focusPhase!==focusPhase;
  const keepFocus=app?.dataset?.focusPhase===focusPhase&&app.contains(focused)&&focused?.matches('button,[role="button"]');
  const focusAttributes=['id','onclick','data-target','aria-label'];
  const focusValues=keepFocus?focusAttributes.map(name=>focused.getAttribute(name)):null;
  const sameControl=element=>element.tagName===focused.tagName&&focusAttributes.every((name,index)=>element.getAttribute(name)===focusValues[index]);
  const focusIndex=keepFocus?[...app.querySelectorAll('button,[role="button"]')].filter(sameControl).indexOf(focused):-1;
  const disclosures = new Map([...app.querySelectorAll('details[data-disclosure-key]')].map(element => [element.dataset.disclosureKey, element.open]));
  try { if(!renderPendingShot(controller))content(); }
  finally {
    for (const element of app.querySelectorAll('details[data-disclosure-key]')) {
      if (disclosures.has(element.dataset.disclosureKey)) element.open = disclosures.get(element.dataset.disclosureKey);
    }
    if(game?.me?.isHost && !controller && !document.getElementById('controllerNotice'))$('#app').insertAdjacentHTML('afterbegin','<section id="controllerNotice" class="status"><p>👑 أنت تدير الغرفة الآن.</p><button class="btn" onclick="toggleDelegatedHost()">فتح تحكم المضيف</button></section>');
    if(!document.getElementById('leaderElectionCard'))$('#app').insertAdjacentHTML('afterbegin',leaderElectionCard());
    if(game?.me?.alive&&game.me.mafiaCountResult&&!document.getElementById('revealerResult')){const result=game.me.mafiaCountResult;$('#app').insertAdjacentHTML('afterbegin',`<section id="revealerResult" class="card" data-no-translate><h3>${discussionText('📡 نتيجة كشف الجولة','📡 Reveal result, round')} ${escapeHtml(result.round)}</h3><p>${discussionText('عدد المافيا الباقين عند إعلان الصباح','Mafia alive at dawn')}: <strong>${escapeHtml(result.count)}</strong></p></section>`);}
    if(!document.getElementById('voteSummaryNotice'))$('#app').insertAdjacentHTML('afterbegin',voteSummaryCard());
    if(!document.getElementById('publicVotesNotice'))$('#app').insertAdjacentHTML('beforeend',publicVotesCard());
    for(const element of app.querySelectorAll('.vote-count-details[data-disclosure-key]'))if(disclosures.has(element.dataset.disclosureKey))element.open=disclosures.get(element.dataset.disclosureKey);
    if(!document.getElementById('eliminationNotice'))$('#app').insertAdjacentHTML('afterbegin',eliminationNotice());
    if(!showVictoryEffect())showEliminationEffect();
    if(game?.enabledRoles?.automatic_game&&game.me?.alive&&['day','trial'].includes(game.phase)){
      const canReady=game.phase==='day'||game.me.id===game.accusedPlayer;
      if(canReady)app.insertAdjacentHTML('beforeend',`<section class="card auto-ready"><h3>${discussionText('المباراة تلقائية','Automatic game')}</h3><p>${game.enabledRoles.action_deadline===false?discussionText('ننتظر اختيار الجميع بدون مهلة.','Waiting for everyone without a deadline.'):discussionText('ننتقل بعد اختيار الجميع أو انتهاء المهلة.','Advances when everyone is ready or the timer ends.')}</p><button class="btn gold wide" ${game.me.phaseReady?'disabled':''} onclick="readyAutomaticPhase()">${game.me.phaseReady?discussionText('تم التأكيد — بانتظار البقية','Confirmed — waiting for others'):discussionText(game.phase==='trial'?'انتهيت من الدفاع':'انتهيت من النقاش','I am ready')}</button></section>`);
    }
    if(game?.me?.alive && game.me.warnings?.length && !controller && !document.getElementById('hostWarningNotice')){const warning=game.me.warnings.at(-1);$('#app').insertAdjacentHTML('afterbegin',`<section id="hostWarningNotice" class="status wait" role="alert" data-no-translate><b>${discussionText('⚠️ إنذار من المضيف','⚠️ Warning from the host')}</b><p>${escapeHtml(warning.reason)}</p></section>`);}
    if(keepFocus&&!focused.isConnected&&document.activeElement===document.body){
      const replacement=[...app.querySelectorAll('button,[role="button"]')].filter(sameControl)[focusIndex];
      if(replacement&&!replacement.disabled&&!replacement.closest('[inert]')&&replacement.getClientRects().length)replacement.focus({preventScroll:true});
    }
    if(app?.dataset)app.dataset.focusPhase=focusPhase;
    if(changedPhase && !controller && typeof window!=='undefined')window.scrollTo?.({top:0,left:0,behavior:'instant'});
  }
}
async function readyAutomaticPhase(){try{game=await api({action:'readyPhase',code:game.code,id:playerId,playerToken,hostToken});renderPlayer();}catch{alert('تعذر تأكيد الجاهزية، حاول مجددًا.');}}
function automaticGameSettings(){return `<section class="voting-setting"><h3>إدارة المباراة</h3><div class="voting-mode-options"><button class="btn" aria-pressed="${!enabledRoles.automatic_game}" onclick="setAutomaticGame(false)">يدوي بالمضيف</button><button class="btn" aria-pressed="${!!enabledRoles.automatic_game}" onclick="setAutomaticGame(true)">تلقائي بدون مضيف</button></div>${enabledRoles.automatic_game?`<p>بعد آخر اختيار تنتقل المرحلة تلقائيًا. بالنهار يؤكد الجميع انتهاء النقاش.</p><div class="voting-mode-options"><button class="btn" aria-pressed="${enabledRoles.action_deadline!==false}" onclick="setActionDeadline(true)">بمهلة</button><button class="btn" aria-pressed="${enabledRoles.action_deadline===false}" onclick="setActionDeadline(false)">انتظار الجميع</button></div>`:''}</section>`;}
let automaticSetupPending=false;
async function setAutomaticGame(value){
 if(automaticSetupPending)return;
 automaticSetupPending=true;
 try{
  if(value&&game?.phase==='lobby'&&!await joinHostSeat())return;
  enabledRoles.automatic_game=value;schedulePreferenceSave();renderHost();
 }finally{automaticSetupPending=false;}
}
function setActionDeadline(value){enabledRoles.action_deadline=value;schedulePreferenceSave();renderHost();}
function renderPlayer(){
  // Keep the private role reveal independent of post-reveal Mafia controls.
  // Those controls must never prevent a newly assigned boss from seeing the card.
  if(game?.me?.alive && !roleAcknowledged() && !['lobby','paused','finished'].includes(game.phase)){
    roleReveal();
    enhanceJourney(false);
    return;
  }
  renderWithNotices(renderPlayerContent);
  enhanceJourney(false);
  if(game?.me?.alive&&roleAcknowledged()&&!['lobby','finished'].includes(game.phase)&&!document.querySelector('.personal-role-card')){
    const bar=document.querySelector('#app .phase-bar');
    const reference=`<details class="role-reference"><summary>${discussionText('مراجعة دوري','Review my role')}: ${roleLabel(game.me.role)}</summary>${personalRoleCard(true)}</details>`;
    if(bar)bar.insertAdjacentHTML('afterend',reference);
    else $('#app').insertAdjacentHTML('afterbegin',reference);
  }
}
function playerStepStatus() {
  const me=game?.me;
  if(!me||!me.alive||['lobby','finished','paused'].includes(game.phase))return '';
  const privateRole=!roleAcknowledged();
  const title=privateRole?discussionText('لا تعرض دورك للآخرين.','Keep your role private.'):game.phase==='trial'?discussionText('التصويت على الحكم بعد الدفاع.','The verdict vote follows the defense.'):'';
  if(!title)return '';
  return `<section class="player-step-status wait" data-no-translate role="status"><span aria-hidden="true">${privateRole?'🔒':'○'}</span><div><strong>${escapeHtml(title)}</strong></div></section>`;
}
function setupSummary(roles, showCounts = true){
  const counts=[['mafia',roles.mafia],['doctor',roles.doctor],['detective',roles.detectives],['lawyer',roles.lawyer],['jailer',roles.jailer],['vigilante',roles.vigilante],['witch',roles.witch],['serial_killer',roles.serialKiller],['jester',roles.jester],['cupid',roles.cupid],['escort',roles.escort],['revealer',roles.revealer],['citizen',roles.citizens]];
  return `<section class="setup-summary"><h2 data-no-translate>${discussionText('ملخص المباراة','Game summary')}</h2><p data-no-translate>${discussionText('اللاعبون','Players')}: <b>${game.players.length}</b> · ${discussionText('مهلة المرحلة','Phase time')}: <b>${phaseDuration}</b> ${discussionText('ثانية','seconds')}</p>${showCounts ? `<ul>${counts.filter(([,count])=>count>0).map(([role,count])=>`<li>${roleLabel(role)} <b>× ${count}</b></li>`).join('')}</ul>` : ''}<p data-no-translate>${discussionText('يؤكد الجميع أدوارهم قبل البداية. الليلة الأولى للمحقق فقط.','Everyone confirms their role before starting. The first night is for detectives only.')}</p></section>`;
}
function showMatchTools(){
  openSheet(discussionText('إدارة المباراة','Game management'),`<div data-no-translate><button class="btn wide" onclick="showModeration()">${discussionText('اللاعبون والبلاغات','Players and reports')}</button><section class="danger-zone"><h3>${discussionText('إنهاء نهائي','End permanently')}</h3><p>${discussionText('للاستراحة استخدم الإيقاف المؤقت. الإنهاء ينهي المباراة الحالية.','Use Pause for a break. Ending closes the current match.')}</p><button class="btn danger wide" onclick="endGame()">${discussionText('إنهاء المباراة','End match')}</button></section></div>`);
}
function enhanceJourney(controller){
  if(!game)return;
  document.body.classList.toggle('player-day-focus',!controller&&game.phase==='day'&&!!game.me?.alive);
  if(typeof pendingActionConfirmation!=='undefined'&&pendingActionConfirmation&&pendingActionConfirmation.context!==actionContext())cancelSensitiveAction();
  if(!document.querySelector('#app .phase-bar'))$('#app').insertAdjacentHTML('afterbegin',phaseBar());
  const phaseBarElement=document.querySelector('#app .phase-bar');
  if(phaseBarElement)$('#app').prepend(phaseBarElement);
  const elimination=document.getElementById('eliminationNotice');
  if(elimination&&phaseBarElement)phaseBarElement.insertAdjacentElement('afterend',elimination);
  const voteSummary=document.getElementById('voteSummaryNotice');
  if(voteSummary)$('#app').append(voteSummary);
  if(!controller&&!document.getElementById('playerStepStatus')){
    const statusHtml=playerStepStatus();
    if(statusHtml){const holder=document.createElement('div');holder.innerHTML=statusHtml;const status=holder.firstElementChild;status.id='playerStepStatus';document.querySelector('#app .phase-bar').insertAdjacentElement('afterend',status);}
  }
  document.querySelectorAll('.setup-tabs button').forEach((button,index)=>{if(index+1===setupStep)button.setAttribute('aria-current','step');});
  paintActionFeedback();updatePhaseTimer();
  queueVoteResultPreview();
}
function syncMorningDetails(){
  const compact=window.matchMedia?.('(max-width:760px)').matches;
  document.querySelectorAll('details[data-collapse-mobile]').forEach(detail=>{
    if(compact)detail.removeAttribute('open');
    else detail.setAttribute('open','');
  });
}
function renderHost(){if(game?.enabledRoles?.automatic_game&&game.me&&!['lobby','finished'].includes(game.phase)){renderPlayer();return;}renderWithNotices(renderHostContent,true);enhanceJourney(true);mountHostProgress();syncMorningDetails();}
function renderSpectator(){renderWithNotices(renderSpectatorContent);}

function disciplineButtons(player) {
  return `<span class="discipline-actions" data-no-translate><button class="mini-action" aria-label="${discussionText('إنذار اللاعب','Warn player')}" onclick="openDiscipline(${jsArg(player.id)},'warnPlayer')">⚠️${player.warningCount||''}</button><button class="mini-action danger" aria-label="${discussionText('استبعاد اللاعب من القيم','Expel player from match')}" onclick="openDiscipline(${jsArg(player.id)},'expelPlayer')">⛔</button></span>`;
}
function openDiscipline(target,action) {
  const expel=action==='expelPlayer';
  openSheet(discussionText(expel?'⛔ استبعاد لاعب':'⚠️ إنذار لاعب',expel?'⛔ Expel player':'⚠️ Warn player'),`<div data-no-translate><p><b>${escapeHtml(nameOf(target))}</b></p><p>${discussionText(expel?'سيصبح متابعًا فقط. السبب يظهر للمشاركين.':'يظهر الإنذار لهذا اللاعب فقط.',expel?'They will become a spectator. The reason is shown to participants.':'Only this player sees the warning.')}</p><label for="disciplineReason">${discussionText('السبب','Reason')}</label><textarea id="disciplineReason" class="input" maxlength="160"></textarea><button class="btn ${expel?'danger':'gold'} wide" onclick="submitDiscipline(${jsArg(target)},'${action}')">${discussionText(expel?'تأكيد الاستبعاد':'إرسال الإنذار',expel?'Confirm expulsion':'Send warning')}</button><p id="disciplineError" role="status"></p></div>`);
}
async function submitDiscipline(target,action) {
  const reason=$('#disciplineReason')?.value.trim();
  if(!reason){$('#disciplineError').textContent=discussionText('اكتب السبب أولًا.','Enter a reason first.');return;}
  try {
    game=await withBusy(discussionText('جاري تنفيذ القرار…','Applying decision…'),()=>api({action,code:game.code,hostToken,id:playerId,playerToken,target,reason}));
    closeSheet();
    if(!hostToken&&!game.me?.isHost)delegatedHostMode=false;
    (hostToken||delegatedHostMode)?renderHost():renderPlayer();
  } catch { const error=$('#disciplineError');if(error)error.textContent=discussionText('تعذّر تنفيذ القرار؛ قد تكون حالة اللاعب تغيّرت. حاول مجددًا.','Could not apply the decision; the player state may have changed. Please retry.'); }
}

let hostProgressObserver;
function mountHostProgress() {
  hostProgressObserver?.disconnect();
  const app = document.querySelector('#app');
  const lobby = game?.phase === 'lobby';
  const actions = {reveal:'beginNight',night:'resolveNight',day:'startVote',nomination:'resolveVote',trial:'advanceVerdict',verdict:'resolveVote',vote:'resolveVote',paused:'togglePause'};
  const handler = lobby ? (setupStep < 3 ? 'setSetupStep(' + (setupStep + 1) + ')' : 'startGame()') : actions[game?.phase] ? "hostAction('" + actions[game.phase] + "')" : '';
  const scope = app.querySelector(lobby ? '.setup-card' : '.hero');
  const primary = [...(scope?.querySelectorAll('button') || [])].find(button => !button.closest('.setup-tabs') && button.getAttribute('onclick') === handler);
  if (!primary) return;
  const dock = document.createElement('nav');
  dock.className = 'host-progress';
  dock.setAttribute('aria-label', discussionText('متابعة إعداد ومراحل المباراة','Game setup and phase controls'));
  dock.innerHTML = '<div class="host-progress-info" data-no-translate><strong id="hostProgressTitle"></strong><span id="hostProgressStatus" role="status"></span></div><div class="host-progress-actions"></div>';
  const controls = dock.querySelector('.host-progress-actions');
  if (lobby && setupStep > 1) {
    const back = document.createElement('button');
    back.type = 'button';back.className = 'btn host-progress-back';
    back.textContent = discussionText('رجوع','Back');
    back.setAttribute('data-no-translate','');
    back.setAttribute('onclick', 'setSetupStep(' + (setupStep - 1) + ')');
    controls.append(back);
    // The dock is the single place for setup navigation.
    for (const button of scope.querySelectorAll('button')) {
      if (button !== primary && !button.closest('.setup-tabs') && button.getAttribute('onclick') === 'setSetupStep(' + (setupStep - 1) + ')') button.remove();
    }
  }
  primary.dataset.progressPrimary = '';
  primary.setAttribute('aria-describedby','hostProgressStatus');
  controls.append(primary);
  (app.querySelector('.morning-footer') || app).append(dock);
  const measure = () => document.documentElement.style.setProperty('--host-progress-height', Math.ceil(dock.getBoundingClientRect().height) + 'px');
  hostProgressObserver = new ResizeObserver(measure);hostProgressObserver.observe(dock);
  updateHostProgress();measure();
}
function updateHostProgress() {
  const dock = document.querySelector('.host-progress');
  if (!dock || !game) return;
  const button = dock.querySelector('[data-progress-primary]');
  let title = phaseName(), status = '';
  if (game.phase === 'lobby') {
    title = discussionText(['','١ من ٣ · إعداد المباراة','٢ من ٣ · اختيار الأدوار','٣ من ٣ · جاهزية المباراة'][setupStep],['','1 of 3 · Game setup','2 of 3 · Select roles','3 of 3 · Ready to play'][setupStep]);
    const roles = roleDistribution();
    status = game.players.length < 2 ? discussionText('بانتظار لاعبين — ' + game.players.length + ' من ٢', 'Waiting for players — ' + game.players.length + ' of 2') : !roles.valid ? discussionText('الأدوار أكثر من اللاعبين؛ قلّل الأدوار.','Too many roles; reduce the selection.') : discussionText(game.players.length + ' لاعبين · جاهزين لإعداد المباراة',game.players.length + ' players · Ready for setup');
  } else if (game.phase === 'reveal') {
    status = discussionText('أكد دوره ' + (game.roleReadyCount || 0) + ' من ' + game.players.length,(game.roleReadyCount || 0) + ' of ' + game.players.length + ' roles confirmed');
  } else if (game.phase === 'paused') {
    status = discussionText('استكمل من المرحلة نفسها.','Resume from the same phase.');
  } else if (!button.disabled) {
    status = discussionText('جاهز للمتابعة','Ready to continue');
  } else if (game.phase === 'night') {
    status = firstNightWithoutDetective()?discussionText('لا توجد اختيارات؛ أعلن الصباح الآن.','No choices are needed; announce morning now.'):discussionText('بانتظار اختيارات الليل أو انتهاء المهلة.','Waiting for night choices or the timer.');
  } else if (game.phase === 'day') {
    status = !clientDiscussion().complete ? discussionText('بانتظار انتهاء النقاش.','Waiting for discussion to finish.') : discussionText('بانتظار قدرات النهار أو انتهاء المهلة.','Waiting for day abilities or the timer.');
  } else {
    const total = Math.max(0, alivePlayers().length - (game.phase === 'verdict' ? 1 : 0));
    status = discussionText('صوّت ' + (game.voteCount || 0) + ' من ' + total + ' · بانتظار البقية أو المهلة',(game.voteCount || 0) + ' of ' + total + ' voted · Waiting for votes or timer');
  }
  for (const [selector,value] of [['#hostProgressTitle',title],['#hostProgressStatus',status]]) {
    const element = dock.querySelector(selector);
    if (element.textContent !== value) element.textContent = value;
  }
}
