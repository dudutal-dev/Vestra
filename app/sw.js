/* ============================================================
   VESTRA · Service worker

   The app shell is cached so it opens without a network. API calls are never
   cached.

   The app's own code is fetched network-first and only falls back to the cache
   when there is no network. Cache-first is the usual advice and it was wrong
   here: this app ships as plain files with unhashed names, so a cached
   `makeup.js` is indistinguishable from the current one, and a fix pushed to
   Pages stayed invisible on any device that had opened the app before. An app
   under active development that shows you last week's build is worse than one
   that takes an extra moment to start.

   Assets that never change under the same name — fonts, icons — stay
   cache-first, which is where the offline speed actually comes from.
   ============================================================ */

const VERSION = 'vestra-v3';
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
  './js/vision.js',
  './js/stylist.js',
  './js/makeup.js',
  './js/tryon.js',
  './js/prompt.js',
  './js/demo.js',
  './js/views/home.js',
  './js/views/wardrobe.js',
  './js/views/capture.js',
  './js/views/studio.js',
  './js/views/closet.js',
  './js/views/beauty.js',
  './js/views/profile.js',
  './js/views/lookcard.js',
  './js/views/brief.js',
  './assets/icon.svg',
];

/** Our own code — the files a deploy changes without changing their names. */
const isAppCode = (url) => url.origin === location.origin
  && /\.(?:js|css|html|webmanifest)$/.test(url.pathname);

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

  const keep = (res) => {
    if (res.ok && (url.origin === location.origin || url.hostname.includes('fonts.'))) {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(request, copy));
    }
    return res;
  };

  // Our own code: network first. The cache is the offline fallback, not the
  // source of truth — otherwise a shipped fix never reaches a returning device.
  if (isAppCode(url)) {
    e.respondWith(fetch(request).then(keep).catch(() => caches.match(request)));
    return;
  }

  // Everything else — fonts, icons, images: cache first, refresh behind it.
  e.respondWith(
    caches.match(request).then(hit => {
      const net = fetch(request).then(keep).catch(() => hit);
      return hit || net;
    }),
  );
});
