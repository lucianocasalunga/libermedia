const CACHE_NAME = 'libermedia-v1';
const urlsToCache = [
  '/',
  '/dashboard',
  '/static/css/style.css',
  '/static/js/dashboard.js',
  '/static/img/logo.jpg',
  '/static/img/icon-192.png',
  '/static/img/icon-512.png'
];

// Instalar Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Ativar Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch - estratégia Network First (online primeiro)
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  );
});
