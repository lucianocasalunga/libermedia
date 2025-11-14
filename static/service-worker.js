/**
 * LiberMedia Service Worker - Otimizado para Thumbnails
 * Versão 2.0 com cache inteligente de imagens
 */

const CACHE_VERSION = 'libermedia-v2-thumbs';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_THUMBS = `${CACHE_VERSION}-thumbs`;
const CACHE_IMAGES = `${CACHE_VERSION}-images`;

// Arquivos estáticos para cache inicial
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/static/css/style.css',
  '/static/js/dashboard.js',
  '/static/js/libermedia-thumbs.js',
  '/static/img/logo.jpg',
  '/static/img/icon-192.png',
  '/static/img/icon-512.png'
];

// Limites de cache
const MAX_THUMB_CACHE_SIZE = 200; // 200 thumbnails
const MAX_IMAGE_CACHE_SIZE = 50;  // 50 imagens originais

/**
 * Install - cachear assets estáticos
 */
self.addEventListener('install', event => {
  console.log('[SW] Instalando Service Worker v2.0...');

  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => {
        console.log('[SW] Cacheando assets estáticos');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

/**
 * Activate - limpar caches antigos
 */
self.addEventListener('activate', event => {
  console.log('[SW] Ativando Service Worker v2.0...');

  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            // Remover caches de versões antigas
            if (cacheName !== CACHE_STATIC &&
                cacheName !== CACHE_THUMBS &&
                cacheName !== CACHE_IMAGES &&
                cacheName.startsWith('libermedia-')) {
              console.log('[SW] Removendo cache antigo:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

/**
 * Verifica se a URL é um thumbnail
 */
function isThumbnail(url) {
  return url.includes('/uploads/') &&
         (url.includes('size=320') || url.includes('size=960') || url.includes('size=1600'));
}

/**
 * Verifica se a URL é uma imagem original
 */
function isOriginalImage(url) {
  return url.includes('/uploads/') && !isThumbnail(url);
}

/**
 * Limita o tamanho do cache removendo itens antigos
 */
async function limitCacheSize(cacheName, maxSize) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  if (keys.length > maxSize) {
    // Remover os mais antigos (primeiros do array)
    const toDelete = keys.slice(0, keys.length - maxSize);
    await Promise.all(toDelete.map(key => cache.delete(key)));
    console.log(`[SW] Cache ${cacheName} limitado: removidos ${toDelete.length} itens`);
  }
}

/**
 * Estratégia: Cache First para thumbnails
 * Thumbnails são cacheados agressivamente
 */
async function cacheFirstThumbnail(request) {
  const cache = await caches.open(CACHE_THUMBS);
  const cached = await cache.match(request);

  if (cached) {
    console.log('[SW] Thumbnail do cache:', request.url);
    return cached;
  }

  try {
    const response = await fetch(request);

    if (response.ok) {
      console.log('[SW] Cacheando thumbnail:', request.url);
      cache.put(request, response.clone());
      limitCacheSize(CACHE_THUMBS, MAX_THUMB_CACHE_SIZE);
    }

    return response;
  } catch (error) {
    console.error('[SW] Erro ao buscar thumbnail:', error);
    throw error;
  }
}

/**
 * Estratégia: Network First para imagens originais
 * Originais são cacheados sob demanda, mas priorizamos rede
 */
async function networkFirstImage(request) {
  const cache = await caches.open(CACHE_IMAGES);

  try {
    const response = await fetch(request);

    if (response.ok) {
      console.log('[SW] Cacheando imagem original:', request.url);
      cache.put(request, response.clone());
      limitCacheSize(CACHE_IMAGES, MAX_IMAGE_CACHE_SIZE);
    }

    return response;
  } catch (error) {
    console.log('[SW] Rede falhou, tentando cache:', request.url);
    const cached = await cache.match(request);

    if (cached) {
      return cached;
    }

    throw error;
  }
}

/**
 * Estratégia: Cache First para assets estáticos
 */
async function cacheFirstStatic(request) {
  const cache = await caches.open(CACHE_STATIC);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    throw error;
  }
}

/**
 * Fetch - roteamento inteligente
 */
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Ignorar non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Thumbnails: Cache First (máxima performance)
  if (isThumbnail(url)) {
    event.respondWith(cacheFirstThumbnail(event.request));
    return;
  }

  // Imagens originais: Network First (sempre atualizadas)
  if (isOriginalImage(url)) {
    event.respondWith(networkFirstImage(event.request));
    return;
  }

  // Assets estáticos: Cache First
  if (url.includes('/static/')) {
    event.respondWith(cacheFirstStatic(event.request));
    return;
  }

  // Outros requests: Network First com fallback
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  );
});

/**
 * Message handler - permitir limpeza manual de cache
 */
self.addEventListener('message', event => {
  if (event.data.action === 'clearCache') {
    event.waitUntil(
      Promise.all([
        caches.delete(CACHE_THUMBS),
        caches.delete(CACHE_IMAGES)
      ]).then(() => {
        console.log('[SW] Caches de imagens limpos');
        event.ports[0].postMessage({success: true});
      })
    );
  }

  if (event.data.action === 'getCacheStats') {
    event.waitUntil(
      Promise.all([
        caches.open(CACHE_THUMBS).then(c => c.keys()),
        caches.open(CACHE_IMAGES).then(c => c.keys()),
        caches.open(CACHE_STATIC).then(c => c.keys())
      ]).then(([thumbs, images, statics]) => {
        event.ports[0].postMessage({
          thumbs: thumbs.length,
          images: images.length,
          statics: statics.length
        });
      })
    );
  }
});

console.log('[SW] Service Worker carregado - v2.0 Thumbnails');
