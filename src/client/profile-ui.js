function achievements(profile) {
  if (!profile) return [];
  return [
    { icon: '🎴', name: 'أول مباراة', on: profile.games >= 1 },
    { icon: '🏆', name: 'أول فوز', on: profile.wins >= 1 },
    { icon: '🔥', name: 'مخضرم', on: profile.games >= 10 },
    { icon: '👑', name: 'خمسة انتصارات', on: profile.wins >= 5 },
    { icon: '🏘️', name: 'بطل القرية', on: profile.village_wins >= 3 },
    { icon: '🔪', name: 'سيد المافيا', on: profile.mafia_wins >= 3 },
  ];
}
async function showProfile() {
  setRoomTag('🏅');
  const result = await withBusy('جاري تحميل الملف…', () => api({ action: 'profile', profileToken }));
  const p = result.profile;
  if (!p) { $('#app').innerHTML = `<div class="card hero"><div class="role-title">🏅 ملف اللاعب</div><p>العب أول مباراة حتى تبدأ إحصائياتك.</p><button class="btn" onclick="home()">رجوع</button></div>`; return; }
  const rate = p.games ? Math.round(p.wins / p.games * 100) : 0;
  $('#app').innerHTML = `<div class="card"><div class="toolbar"><div><div class="role-badge">ملف اللاعب</div><h1>${escapeHtml(p.nickname)}</h1></div><button class="btn" onclick="home()">رجوع</button></div><div class="stat-grid"><div><b>${p.games}</b><span>مباراة</span></div><div><b>${p.wins}</b><span>فوز</span></div><div><b>${rate}%</b><span>نسبة الفوز</span></div></div><div class="season-card"><b>الموسم ${escapeHtml(p.season||'')}</b><span>${p.season_wins||0} فوز من ${p.season_games||0} مباراة</span></div><div class="status wait">🔑 رمز نقل الحساب: <b>${escapeHtml(p.recovery_code||'—')}</b><br><small>احتفظ به لاسترجاع حسابك على جهاز آخر.</small></div><h2>الإنجازات</h2><div class="achievement-grid">${achievements(p).map((a) => `<div class="achievement ${a.on?'unlocked':'locked'}"><span>${a.icon}</span><b>${a.name}</b><small>${a.on?'مفتوح':'مغلق'}</small></div>`).join('')}</div></div>`;
}
async function showLeaderboard() {
  setRoomTag('🏆');
  const result = await withBusy('جاري تحميل الترتيب…', () => api({ action: 'leaderboard' }));
  const rows=(items)=>items.map((p,i)=>`<div class="leader-row"><b>${i+1}</b><span>${escapeHtml(p.nickname)}</span><strong>${p.wins} فوز</strong><small>${p.games} مباراة</small></div>`).join('')||'<p class="muted">لا توجد نتائج بعد.</p>';
  $('#app').innerHTML = `<div class="card"><div class="toolbar"><h1>🏆 الترتيب</h1><button class="btn" onclick="home()">رجوع</button></div><h2>الموسم ${escapeHtml(result.season||'')}</h2><div class="leaderboard">${rows(result.seasonLeaderboard||[])}</div><h2>الترتيب العام</h2><div class="leaderboard">${rows(result.leaderboard||[])}</div></div>`;
}
function showTrainingHelp() {
  setRoomTag('🤖');
  $('#app').innerHTML = `<div class="card hero"><div class="role-title">🤖 التدريب بالبوتات</div><p>أنشئ غرفة، ثم اختر العدد الذي تريده من 2 إلى 20 لاعبًا. تقدر تتدرب وحدك أو تكمل العدد الناقص بأصدقاء وبوتات.</p><button class="btn red" onclick="createRoom()">إنشاء غرفة تدريب</button><button class="btn" onclick="home()">رجوع</button></div>`;
}
