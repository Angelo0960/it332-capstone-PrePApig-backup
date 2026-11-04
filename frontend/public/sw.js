const CACHE_NAME = 'prepapig-shell-v5';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/pwa-install.js', '/prepapig-logo.png', '/prepapig-logo-192.png', '/prepapig-logo-512.png', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('prepapig-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag !== 'prepapig-offline-sync') return;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => client.postMessage({ type: 'PREPAPIG_SYNC_OFFLINE_QUEUE' }));
  }));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  const apiPaths = ['/api', '/pigs', '/feeds', '/vaccinations', '/expenses', '/sales', '/reports', '/management', '/notifications', '/market-prices', '/auth'];
  const isApiPath = apiPaths.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`));

  if (request.method !== 'GET' || url.origin !== self.location.origin || request.mode !== 'navigate' && isApiPath) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
      return cached || network.catch(() => new Response('', {
        status: 503,
        statusText: 'Offline',
      }));
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
