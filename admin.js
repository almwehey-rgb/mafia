let adminSession = 0;
function adminLabel(value) {
  const parts=String(value||'—').split(' / ');
  return discussionText(parts[0],parts[1]||parts[0]);
}
function closeAdminView() {
  adminSession++;
  document.getElementById('secretAdmin')?.remove();
}
function adminCards(players) {
  const names = new Map(players.map(p => [p.id,p.name]));
  const target = value => {
    if (!value) return discussionText('لم يختر','Not selected');
    const labels = {SKIP:'تخطي / Skip',SPARE:'إطلاق / Spare',EXECUTE:'إعدام / Execute',GUILTY:'مذنب / Guilty',INNOCENT:'بريء / Innocent',SAVE:'حماية / Protect',POISON:'سم / Poison'};
    return String(value).split(/[:,]/).map(v=>names.get(v)||(labels[v]?discussionText(...labels[v].split(' / ')):v)).join(' ← ');
  };
  const row = (a,b,value) => `<p><b>${discussionText(a,b)}:</b> ${escapeHtml(value)}</p>`;
  return players.map(p=>`<article class="card">
    <h3>${escapeHtml(p.name)} — ${escapeHtml(adminLabel(roleNames[p.role]||p.role))}</h3>
    ${row('الحالة','Status',p.alive?discussionText('حي','Alive'):discussionText('مستبعد / ميت','Eliminated'))}
    ${row('التصويت','Vote',target(p.vote))}${row('اختيار القدرة','Role action',target(p.action))}
    ${p.leaderVote?row('تصويت زعيم المافيا','Mafia leader vote',target(p.leaderVote)):''}
    ${p.role==='witch'?row('جرعات الحماية / السم','Save / poison potions',`${p.life===false?'0':'1'} / ${p.poison===false?'0':'1'}`):''}
    ${p.role==='vigilante'?row('طلقات القناص','Sniper shots',p.bullets??1):''}
    ${p.role==='mafia_boss'?row('الظهور بالنقاش','Discussion claim',p.claim===true?discussionText('طلب الظهور','Opted in'):discussionText('متخفّي','Undercover')):''}
    ${(p.investigations||[]).map(r=>row(`${discussionText('تحقيق الجولة','Investigation round')} ${r.round}`,'Investigation '+r.round,`${r.name}: ${r.result}`)).join('')}
    ${p.elimination?row('سبب الخروج','Elimination',p.elimination.detail||adminLabel(eventText[p.elimination.reason]||discussionText('خرج من اللعب','Eliminated'))):''}
    ${(p.warnings||[]).map(w=>row('إنذار','Warning',w.reason)).join('')}
    ${p.mafiaCountResult?row('نتيجة الكاشف — الجولة '+p.mafiaCountResult.round,'Revealer result — round '+p.mafiaCountResult.round,p.mafiaCountResult.count):''}
    ${p.will?row('الوصية','Will',p.will):''}
  </article>`).join('');
}
async function openAdminView() {
  if (!hostToken || !game) return;
  if (!confirm(discussionText('هذه الشاشة تكشف أسرار اللعبة. افتحها على جهازك الخاص فقط، وليس على التلفزيون المشترك.','This screen reveals game secrets. Open it only on your private device, not the shared TV.'))) return;
  closeAdminView();
  const session = adminSession, code = game.code, token = hostToken;
  const dialog = document.createElement('dialog');
  dialog.id='secretAdmin';dialog.setAttribute('data-no-translate','');
  dialog.style.cssText='width:min(1100px,95vw);max-height:92dvh;overflow:auto;background:#12151e;color:#fff;border:1px solid #555;border-radius:20px;padding:20px';
  dialog.innerHTML=`<div style="position:sticky;top:0;background:#12151e;z-index:1;padding:8px"><button class="btn" id="closeSecretAdmin">${discussionText('إغلاق وإخفاء الأسرار','Close and hide secrets')}</button><h2>${discussionText('🛡️ وضع الأدمن الخاص','🛡️ Private admin mode')}</h2><p id="adminStatus"></p></div><div id="adminLive"></div><details><summary>${discussionText('سجل آخر ٢٠ حالة محفوظة','Last 20 saved states')}</summary><button class="btn" id="adminHistoryButton">${discussionText('تحميل / تحديث السجل','Load / refresh history')}</button><div id="adminHistory"></div></details>`;
  document.body.append(dialog);dialog.showModal();
  dialog.querySelector('#closeSecretAdmin').onclick=closeAdminView;
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeAdminView();});
  const active=()=>session===adminSession&&dialog.isConnected&&game?.code===code&&hostToken===token;
  const fetchView=()=>api({action:'adminState',code,hostToken:token});
  const poll=async()=>{
    if(!active()){if(dialog.isConnected)closeAdminView();return;}
    try {
      const data=await fetchView();if(!active())return;
      dialog.querySelector('#adminStatus').textContent=discussionText('الجولة ','Round ')+data.round+' · '+new Date().toLocaleTimeString();
      const name=id=>data.players.find(p=>p.id===id)?.name||discussionText('لا أحد','Nobody');
      dialog.querySelector('#adminLive').innerHTML=`<p>${discussionText('السجين','Prisoner')}: ${escapeHtml(name(data.jailed))} · ${discussionText('آخر حماية طبيب','Last doctor protection')}: ${escapeHtml(name(data.doctorLastTarget))}</p><p>${discussionText('المرتبطون','Linked players')}: ${escapeHtml(data.linked.map(name).join('، ')||'—')} · ${discussionText('إعدامات السجّان المتبقية','Jailer executions left')}: ${escapeHtml(data.executions??0)}</p>${data.pendingShot?`<p>${discussionText('طلقة القناص المعلقة','Pending sniper shot')}: ${escapeHtml(name(data.pendingShot.playerId))} ← ${escapeHtml(data.pendingShot.target==='SKIP'?discussionText('تخطي','Skip'):name(data.pendingShot.target))}</p>`:''}<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">${adminCards(data.players)}</div>`;
    }catch{if(active()){dialog.querySelector('#adminLive').innerHTML='';dialog.querySelector('#adminStatus').textContent=discussionText('تعذر التحديث؛ جارٍ إعادة المحاولة','Update failed; retrying');}}
    if(active())setTimeout(poll,2000);
  };
  dialog.querySelector('#adminHistoryButton').onclick=async()=>{
    const button=dialog.querySelector('#adminHistoryButton');button.disabled=true;
    try{const data=await api({action:'adminState',code,hostToken:token,history:true});if(!active())return;
      dialog.querySelector('#adminHistory').innerHTML=data.history.map(s=>`<details><summary>${discussionText('الجولة','Round')} ${escapeHtml(s.round)} · ${escapeHtml(discussionText(phaseName(s.phase),s.phase))} · ${escapeHtml(new Date(s.at).toLocaleString())}</summary>${adminCards(s.players)}</details>`).join('')||discussionText('لا توجد حالات محفوظة بعد','No saved states yet');
    }catch{if(active())dialog.querySelector('#adminHistory').textContent=discussionText('تعذر تحميل السجل','Could not load history');}finally{button.disabled=false;}
  };
  poll();
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)closeAdminView();});
