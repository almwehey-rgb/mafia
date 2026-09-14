(() => {
  let frame = 0;
  let lastRosterSize = 0;
  const rosterSize = () => innerHeight >= 850 ? 12 : innerHeight >= 680 ? 8 : 4;

  function fitLobby() {
    frame = 0;
    const lobby = document.querySelector('.host-lobby');
    const shell = document.querySelector('main.shell');
    if (!shell) return;
    const active = Boolean(lobby);
    const header = document.querySelector('.header');
    const bar = document.querySelector('.utility-bar');
    if (active && header && bar && bar.parentElement !== header) header.appendChild(bar);
    if (!active && bar && bar.parentElement !== document.body) document.body.prepend(bar);
    document.body.classList.toggle('screen-lobby', active);
    document.body.classList.remove('screen-fitted');
    document.documentElement.classList.remove('screen-fitted');
    shell.style.removeProperty('--screen-scale');
    if (!active) return;

    // Preserve readable text and touch targets; let the lobby scroll naturally.
  }

  function scheduleFit() {
    if (!frame) frame = requestAnimationFrame(fitLobby);
  }
  document.addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById('app');
    if (!app) return;
    lastRosterSize = rosterSize();
    // Lobby membership changes when the top-level view is replaced, not on timer ticks.
    new MutationObserver(scheduleFit).observe(app, { childList: true });
    new MutationObserver(() => {
      scheduleFit();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    app.addEventListener('load', scheduleFit, true);
    window.addEventListener('resize', () => {
      const size = rosterSize();
      if (size !== lastRosterSize && document.querySelector('.host-lobby')) renderHost();
      lastRosterSize = size;
      scheduleFit();
    });
    document.addEventListener('fullscreenchange', scheduleFit);
    document.fonts?.ready.then(scheduleFit);
    scheduleFit();
  });
})();
