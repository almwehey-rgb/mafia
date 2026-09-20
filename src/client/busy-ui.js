function setBusy(active, message = 'جاري التحميل… / Loading…') {
  busyCount = Math.max(0, busyCount + (active ? 1 : -1));
  let overlay = document.getElementById('busyOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'busyOverlay';
    overlay.className = 'busy-overlay';
    overlay.innerHTML = '<div class="busy-box" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span><strong></strong><small>لا تغلق الصفحة / Keep this page open</small></div>';
    document.body.appendChild(overlay);
  }
  overlay.querySelector('strong').textContent = message;
  overlay.classList.toggle('show', busyCount > 0);
}

async function withBusy(message, task) {
  setBusy(true, message);
  try { return await task(); }
  finally { setBusy(false); }
}
