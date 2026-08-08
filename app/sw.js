/* ============================================================
   VESTRA · Service worker
   App shell is cached for offline use. API calls are never cached.
   ============================================================ */

const VERSION = 'vestra-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/animations.css',
  './css/components.css',
  './js/app.js',
  './js/i18n.js',
  './js/state.js',
  './js/store.js',
  './js/taxonomy.js',
  './js/ui.js',
  './js/ai.js',
  './js/stylist.js',
  './js/makeup.js',
  './js/tryon.js',
  './js/views/home.js',
  './js/views/wardrobe.js',
  './js/views/capture.js',
  './js/views/studio.js',
  './js/views/closet.js',
  './js/views/beauty.js',
  './js/views/profile.js',
  './js/views/lookcard.js',
  './assets/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // addAll fails the whole install if any single file 404s — be forgiving
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never touch the Anthropic API, and never cache cross-origin POSTs.
  if (url.hostname.endsWith('anthropic.com')) return;

  // Navigations: network first, fall back to the cached shell.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // Everything else: cache first, refresh in the background.
  e.respondWith(
    caches.match(request).then(hit => {
      const net = fetch(request)
        .then(res => {
          if (res.ok && (url.origin === location.origin || url.hostname.includes('fonts.'))) {
            const copy = res.clone();
            caches.open(VERSION).then(c => c.put(request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
