// sw.js — Workout Prep Timer service worker
// Network-first for navigations, cache-first for everything else.

const CACHE = 'prep-timer-v1';
const PRECACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/timerModel.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Cross-origin: pass through.
  if (url.origin !== self.location.origin) return;

  const isNavigation =
    req.mode === 'navigate' ||
    (req.method === 'GET' &&
      req.headers.get('accept')?.includes('text/html'));

  if (isNavigation) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('/index.html', res.clone()).catch(() => {});
        return res;
      } catch (_e) {
        const cached = await caches.match('/index.html');
        if (cached) return cached;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Cache-first for other same-origin requests.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok && req.method === 'GET') {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch (e) {
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
