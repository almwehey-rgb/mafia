const CACHE = 'mafia-60533efc6707c06f';
// Warm only the entry point, not megabytes of unused artwork.
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add('/game.html')));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('mafia-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const image = url.pathname.startsWith('/assets/') && /\.(webp|png|jpe?g|svg)$/.test(url.pathname);
  const shell = request.mode === 'navigate' || /\.(css|js|webmanifest)$/.test(url.pathname);
  // Never cache API responses.
  if (!image && !shell) return;
  let finishCache;
  // Keep background writes alive without making rendering wait for disk I/O.
  event.waitUntil(new Promise(resolve => { finishCache = resolve; }));
  event.respondWith((async () => {
    const cache = await caches.open(CACHE).catch(() => null);
    const cached = await cache?.match(request).catch(() => undefined);
    if (image && cached) return cached;
    try {
      const response = await fetch(request);
      if (cache && response.ok && response.type === 'basic') {
        const copy = response.clone();
        const finish = finishCache;
        finishCache = () => {};
        Promise.resolve().then(() => cache.put(request, copy)).catch(() => {}).finally(finish);
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  })().finally(() => finishCache()));
});
