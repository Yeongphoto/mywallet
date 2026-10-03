const CACHE_NAME = 'memoney-v2';
const APP_SHELL = [
  '/',
  '/memoney-v1.webmanifest',
  '/memoney-mark-v1.svg',
  '/logo.png',
  '/mewallet-loading-v1.png',
  '/mewallet-loading-v2.js',
  '/mewallet-v1-favicon.ico',
  '/mewallet-v1-apple-touch-icon.png',
  '/mewallet-v1-192.png',
  '/mewallet-v1-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  const isInstallMetadata = requestUrl.origin === self.location.origin && (
    requestUrl.pathname.endsWith('.webmanifest') ||
    requestUrl.pathname.startsWith('/mewallet-v') ||
    requestUrl.pathname === '/favicon.ico' ||
    requestUrl.pathname === '/apple-touch-icon.png'
  );

  // API calls are strictly network-only
  if (requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-First strategy for all assets & navigation to guarantee instant updates
  event.respondWith(
    fetch(event.request, isInstallMetadata ? { cache: 'no-store' } : undefined)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
