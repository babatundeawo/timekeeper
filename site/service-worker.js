// Timekeeper service worker. The deploy workflow replaces __BUILD__ with the commit id,
// so every release gets a fresh cache automatically.
const CACHE = 'timekeeper-__BUILD__';
const ASSETS = [
  './', './index.html', './offline.html', './404.html',
  './css/style.css', './js/app.js', './js/theme-init.js',
  './manifest.json', './icons/favicon.svg', './icons/icon-180.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-512-maskable.png',
  './fonts/geist.woff2', './fonts/geist-mono.woff2',
];

// Fonts are fetched in the build and may be absent; never let one miss block installation.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) =>
    Promise.all(ASSETS.map((url) => cache.add(url).catch(() => {})))));
});

// A waiting worker only takes over when the visitor taps "Refresh" in the update toast.
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Network first so a new release shows up quickly; cached shell, then the offline page, when offline.
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request, { ignoreSearch: true })
          .then((hit) => hit || caches.match('./index.html'))
          .then((hit) => hit || caches.match('./offline.html')))
    );
    return;
  }

  // Static files: cache first, refreshed in the background.
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
