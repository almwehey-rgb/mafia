function normalizeEnabledRoles(value = {}) {
  const legacyRound = value.mafia_kill_mode === 'disabled' || value.mafia_kill_enabled === false ? 0 : value.mafia_kill_mode === 'after_first' ? 2 : 1;
  let killStartRound = Number.isFinite(+value.mafia_kill_start_round) ? Math.max(0, Math.min(10, Math.round(+value.mafia_kill_start_round))) : legacyRound;
  if (killStartRound === 1) killStartRound = 2;
  return {
    doctor: value.doctor !== false,
    detective: value.detective !== false,
    lawyer: value.lawyer !== false,
    jailer: value.jailer !== false,
    vigilante: value.vigilante === true,
    witch: value.witch === true,
    serial_killer: value.serial_killer === true,
    jester: value.jester === true,
    cupid: value.cupid === true,
    revealer: value.revealer === true,
    escort: value.escort === true,
    godfather_innocent: value.godfather_innocent !== false,
    mafia_kill_start_round: killStartRound,
    mafia_kill_mode: killStartRound === 0 ? 'disabled' : killStartRound === 1 ? 'always' : killStartRound === 2 ? 'after_first' : 'scheduled',
    mafia_kill_enabled: killStartRound > 0,
    mafia_no_repeat: value.mafia_no_repeat === true,
    mafia_recruitment: value.mafia_recruitment === true && value.kids_mode !== true,
    doctor_no_repeat: value.doctor_no_repeat !== false,
    reveal_dead_roles: value.reveal_dead_roles === true,
    allow_no_vote: value.allow_no_vote !== false,
    public_voting: value.public_voting === true,
    automatic_game: value.automatic_game === true,
    action_deadline: value.action_deadline !== false,
    full_trial: value.full_trial !== false,
    kids_mode: value.kids_mode === true,
    phase_seconds: [30,60,90].includes(+value.phase_seconds) ? +value.phase_seconds : 60,
    discussion_mode: ['off', 'group', 'turns'].includes(value.discussion_mode) ? value.discussion_mode : 'turns',
    discussion_seconds: [30, 60, 120, 180, 300, 600, 900, 1800, 3600].includes(+value.discussion_seconds) ? +value.discussion_seconds : 180,
    speaker_seconds: [15, 30, 45, 60, 90, 120].includes(+value.speaker_seconds) ? +value.speaker_seconds : 30,
    paused_phase: value.paused_phase || null,
  };
}

function currentPreferences() {
  return { mafiaCount, detectiveCount, detectiveQuestions, enabledRoles: normalizeEnabledRoles(enabledRoles), phaseDuration, soundEnabled };
}
function applyHostPreferences(value = {}) {
  mafiaCount = Math.max(1, Math.min(8, Math.round(Number(value.mafiaCount) || mafiaCount)));
  detectiveCount = Math.max(0, Math.min(8, Math.round(Number.isFinite(+value.detectiveCount) ? +value.detectiveCount : detectiveCount)));
  detectiveQuestions = detectiveQuestionCount(value.detectiveQuestions);
  enabledRoles = normalizeEnabledRoles(value.enabledRoles || enabledRoles);
  phaseDuration = [30, 60, 90].includes(+value.phaseDuration) ? +value.phaseDuration : phaseDuration;
  soundEnabled = value.soundEnabled !== false;
  localStorage.setItem('mafia-phase-seconds', String(phaseDuration));
  localStorage.setItem('mafia-sound', soundEnabled ? 'on' : 'off');
  localStorage.setItem('mafia-host-preferences', JSON.stringify(currentPreferences()));
}
function schedulePreferenceSave() {
  const settings = currentPreferences();
  localStorage.setItem('mafia-host-preferences', JSON.stringify(settings));
  clearTimeout(preferenceSaveTimer);
  preferenceSaveTimer = setTimeout(async () => {
    if (!hostAccessToken) return;
    const status = $('#prefsStatus');
    if (status) status.textContent = 'جاري الحفظ…';
    try {
      await api({ action: 'hostPreferences', hostAccessToken, settings });
      if ($('#prefsStatus')) $('#prefsStatus').textContent = 'تم حفظ الإعدادات تلقائيًا ✓';
    } catch {
      if ($('#prefsStatus')) $('#prefsStatus').textContent = 'تعذر الحفظ — سيُعاد عند التغيير';
    }
  }, 450);
}
let hostAccessInfo=null;
function renderPublicEntry() {
 setRoomTag();$('#app').removeAttribute('data-login-shell');
 $('#app').innerHTML = `<section class="public-entry"><header><p class="resume-eyebrow">MAFIA NIGHT</p><h1>ليلتك تبدأ هنا</h1><p class="muted">ادخل برمز الاستضافة أو انضم إلى غرفة أصحابك</p></header><div class="card"><label for="hostPassCode">رمز الاستضافة</label><input class="input" id="hostPassCode" maxlength="24" dir="ltr" autocomplete="off" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX-XXXX"><button class="btn gold wide" onclick="loginHostPass()">دخول برمز الاستضافة</button><div class="entry-divider">أو</div><button class="btn wide" onclick="joinForm()">دخول برقم الغرفة</button><p class="muted">عند مسح باركود الغرفة بكاميرا جوالك، تفتح صفحة الدخول مباشرة.</p><button class="btn wide" onclick="recoveryForm()">استرجاع حسابي</button></div>${homeCharacters()}</section>`;
 $('#hostPassCode').addEventListener('keydown',event=>{if(event.key==='Enter')loginHostPass();});
 const joinButton=document.querySelector('.public-entry button[onclick="joinForm()"]');joinButton.outerHTML=`<div class="room-entry-actions">${joinButton.outerHTML}${cameraJoinButton()}</div>`;
}
function hostCodeError(error) {
 return ({ACCESS_CODE_EXHAUSTED:'انتهى رصيد المباريات. تواصل مع صاحب اللعبة لزيادته.',ACCESS_CODE_DISABLED:'تم إيقاف رمز الاستضافة. تواصل مع صاحب اللعبة.',ACCESS_CODE_BOUND:'هذا الرمز مرتبط بحساب آخر. استخدم نفس الجهاز أو استرجع حسابك أولًا.',INVALID_ACCESS_CODE:'رمز الاستضافة غير صحيح أو موقوف.',LOGIN_RATE_LIMITED:'محاولات كثيرة. انتظر 15 دقيقة.'})[error?.code];
}
