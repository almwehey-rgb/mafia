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
    doctor_no_repeat: value.doctor_no_repeat !== false,
    reveal_dead_roles: value.reveal_dead_roles === true,
    allow_no_vote: value.allow_no_vote !== false,
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
