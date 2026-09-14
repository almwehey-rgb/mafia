const CACHE = 'mafia-e14ux58';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => Promise.all(['/','/index.html','/game.html'].map(path => cache.add(path).catch(() => {})))));
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
  const page = request.mode === 'navigate' || /\.html$/.test(url.pathname) || url.pathname === '/';
  if (!image && !page) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE).catch(() => null);
    if (page) {
      try {
        const response = await fetch(request);
        if (cache && response.ok && response.type === 'basic') {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch (error) {
        const cached = await cache?.match(request).catch(() => undefined);
        if (cached) return cached;
        throw error;
      }
    }
    const cached = await cache?.match(request).catch(() => undefined);
    if (image && cached) return cached;
    try {
      const response = await fetch(request);
      if (cache && response.ok && response.type === 'basic') {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  })());
});
