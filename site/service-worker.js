// Timekeeper service worker. The deploy workflow replaces __BUILD__ with the commit id,
// so every release gets a fresh cache automatically.
const CACHE = 'timekeeper-__BUILD__';
const ASSETS = [
  './', './index.html', './offline.html', './404.html',
  './css/style.css',
  './js/theme-init.js', './js/main.js', './js/core.js', './js/audio.js', './js/stage.js', './js/theme.js',
  './js/clock.js', './js/countdown.js', './js/stopwatch.js', './js/focus.js', './js/stats.js',
  './js/alarms.js', './js/pwa.js', './js/settings-ui.js',
  './manifest.json', './icons/favicon.svg', './icons/icon-180.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-512-maskable.png',
  './fonts/geist.woff2', './fonts/geist-mono.woff2',
];
// Fonts are fetched during the build and may be absent; every other file must be cached.
const OPTIONAL = new Set(['./fonts/geist.woff2', './fonts/geist-mono.woff2']);
const NAVIGATION_TIMEOUT_MS = 3500;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) =>
    Promise.all(ASSETS.map((url) =>
      cache.add(url).catch((error) => { if (!OPTIONAL.has(url)) throw error; })))));
});

// A waiting worker only takes over when the visitor taps "Refresh" in the update bar.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    for (const client of windows) if ('focus' in client) return client.focus();
    return self.clients.openWindow('./');
  }));
});

function networkWithTimeout(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NAVIGATION_TIMEOUT_MS);
    fetch(request).then((response) => { clearTimeout(timer); resolve(response); },
      (error) => { clearTimeout(timer); reject(error); });
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Network first so a new release shows up quickly. On a slow or missing connection the
    // saved page opens instead, and the offline page is the last resort.
    event.respondWith(
      networkWithTimeout(request).catch(() =>
        caches.match(request, { ignoreSearch: true })
          .then((hit) => hit || caches.match('./index.html'))
          .then((hit) => hit || caches.match('./offline.html')))
    );
    return;
  }

  // Static files: saved copy first, refreshed in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const fresh = fetch(request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
