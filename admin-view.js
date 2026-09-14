const API = 'https://unsxzbrpqvppecjnirqx.supabase.co/functions/v1/mafia-room?forceFunctionRegion=ap-southeast-1';
const discussionText = (ar, en) => (localStorage.getItem('mafia-lang') || 'ar') === 'en' ? en : ar;
const params = new URLSearchParams(location.hash.replace(/^#/, ''));
const code = String(params.get('code') || '').trim();
const inviteToken = String(params.get('invite') || '').trim();
const sessionKey = `mafia-admin-${code}`;
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
  mafia_kill: 'اغتيال المافيا / Mafia kill',
  vote_eliminated: 'إقصاء بالتصويت / Voted out',
  trial_guilty: 'إدانة / Guilty',
  jailer_execute: 'إعدام السجّان / Jailer execution',
  host_expelled: 'استبعاد المضيف / Host expelled',
};
const phaseName = (phase) => ({
  lobby: discussionText('الانتظار', 'Lobby'),
  reveal: discussionText('كشف الأدوار', 'Role reveal'),
  night: discussionText('الليل', 'Night'),
  day: discussionText('الصباح', 'Morning'),
  nomination: discussionText('الترشيح', 'Nomination'),
  trial: discussionText('المحاكمة', 'Trial'),
  verdict: discussionText('الحكم', 'Verdict'),
  vote: discussionText('التصويت', 'Voting'),
  paused: discussionText('متوقفة مؤقتًا', 'Paused'),
  finished: discussionText('النهاية', 'Results'),
})[phase] || phase || '';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
function adminLabel(value) {
  const parts = String(value || '—').split(' / ');
  return discussionText(parts[0], parts[1] || parts[0]);
}
async function api(payload) {
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'REQUEST_FAILED'), { code: data.error });
  return data;
}
function adminCards(players) {
  const names = new Map(players.map((p) => [p.id, p.name]));
  const target = (value) => {
    if (!value) return discussionText('لم يختر', 'Not selected');
    const labels = { SKIP: 'تخطي / Skip', SPARE: 'إطلاق / Spare', EXECUTE: 'إعدام / Execute', GUILTY: 'مذنب / Guilty', INNOCENT: 'بريء / Innocent', SAVE: 'حماية / Protect', POISON: 'سم / Poison' };
    return String(value).split(/[:,]/).map((v) => names.get(v) || (labels[v] ? discussionText(...labels[v].split(' / ')) : v)).join(' ← ');
  };
  const row = (a, b, value) => `<p><b>${discussionText(a, b)}:</b> ${escapeHtml(value)}</p>`;
  return players.map((p) => `<article class="card">
    <h3>${escapeHtml(p.name)} — ${escapeHtml(adminLabel(roleNames[p.role] || p.role))}</h3>
    ${row('الحالة', 'Status', p.alive ? discussionText('حي', 'Alive') : discussionText('مستبعد / ميت', 'Eliminated'))}
    ${row('التصويت', 'Vote', target(p.vote))}${row('اختيار القدرة', 'Role action', target(p.action))}
    ${p.leaderVote ? row('تصويت زعيم المافيا', 'Mafia leader vote', target(p.leaderVote)) : ''}
    ${p.role === 'witch' ? row('جرعات الحماية / السم', 'Save / poison potions', `${p.life === false ? '0' : '1'} / ${p.poison === false ? '0' : '1'}`) : ''}
    ${p.role === 'vigilante' ? row('طلقات القناص', 'Sniper shots', p.bullets ?? 1) : ''}
    ${p.role === 'mafia_boss' ? row('الظهور بالنقاش', 'Discussion claim', p.claim === true ? discussionText('طلب الظهور', 'Opted in') : discussionText('متخفّي', 'Undercover')) : ''}
    ${(p.investigations || []).map((r) => row(`${discussionText('تحقيق الجولة', 'Investigation round')} ${r.round}`, 'Investigation ' + r.round, `${r.name}: ${r.result}`)).join('')}
    ${p.elimination ? row('سبب الخروج', 'Elimination', p.elimination.detail || adminLabel(eventText[p.elimination.reason] || discussionText('خرج من اللعب', 'Eliminated'))) : ''}
    ${(p.warnings || []).map((w) => row('إنذار', 'Warning', w.reason)).join('')}
    ${p.mafiaCountResult ? row('نتيجة الكاشف — الجولة ' + p.mafiaCountResult.round, 'Revealer result — round ' + p.mafiaCountResult.round, p.mafiaCountResult.count) : ''}
    ${p.will ? row('الوصية', 'Will', p.will) : ''}
  </article>`).join('');
}

async function boot() {
  const status = document.getElementById('adminStatus');
  const live = document.getElementById('adminLive');
  const tag = document.getElementById('roomTag');
  if (!/^\d{4}$/.test(code) || !inviteToken) {
    status.textContent = discussionText('رابط الأدمن غير صالح. اطلب باركودًا جديدًا من المضيف.', 'Invalid admin link. Ask the host for a new QR code.');
    return;
  }
  tag.textContent = code;
  let adminToken = sessionStorage.getItem(sessionKey) || '';
  try {
    if (!adminToken) {
      const redeemed = await api({ action: 'redeemAdminInvite', code, inviteToken });
      adminToken = redeemed.adminToken;
      sessionStorage.setItem(sessionKey, adminToken);
    }
  } catch {
    status.textContent = discussionText('انتهت صلاحية الدعوة أو استُخدمت مسبقًا.', 'This invite expired or was already used.');
    return;
  }
  const render = async () => {
    try {
      const data = await api({ action: 'adminState', code, adminToken });
      status.textContent = discussionText('الجولة ', 'Round ') + data.round + ' · ' + phaseName(data.phase) + ' · ' + new Date().toLocaleTimeString();
      const name = (id) => data.players.find((p) => p.id === id)?.name || discussionText('لا أحد', 'Nobody');
      live.innerHTML = `<p>${discussionText('السجين', 'Prisoner')}: ${escapeHtml(name(data.jailed))} · ${discussionText('آخر حماية طبيب', 'Last doctor protection')}: ${escapeHtml(name(data.doctorLastTarget))}</p>
        <p>${discussionText('المرتبطون', 'Linked players')}: ${escapeHtml((data.linked || []).map(name).join('، ') || '—')} · ${discussionText('إعدامات السجّان المتبقية', 'Jailer executions left')}: ${escapeHtml(data.executions ?? 0)}</p>
        ${data.pendingShot ? `<p>${discussionText('طلقة القناص المعلقة', 'Pending sniper shot')}: ${escapeHtml(name(data.pendingShot.playerId))} ← ${escapeHtml(data.pendingShot.target === 'SKIP' ? discussionText('تخطي', 'Skip') : name(data.pendingShot.target))}</p>` : ''}
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">${adminCards(data.players)}</div>`;
    } catch {
      status.textContent = discussionText('تعذر التحديث؛ جارٍ إعادة المحاولة', 'Update failed; retrying');
    }
    setTimeout(render, 2000);
  };
  render();
}
boot();
