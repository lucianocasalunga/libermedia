/* Service Worker da LiberMedia SPA — PORTÁVEL (funciona em /v2.5/ agora e na raiz depois;
 * usa self.registration.scope, sem caminhos fixos). Convive com o SW do MPA (escopo /),
 * que pula /v2.5. Estratégia: HTML network-first (fallback shell offline); assets do escopo
 * cache-first + revalida; /api e outras origens passam direto. Base p/ Web Push (push/click). */
const CACHE = 'libermedia-root-v104'
const SCOPE = self.registration.scope
const SCOPE_PATH = new URL(SCOPE).pathname
// Caches que NÃO devem ser apagados no activate: o nosso + o do /v2.5 (transição).
// Tudo o mais (incl. caches antigos da MPA 'libermedia-app-v228'/'libermedia-images-v2')
// é purgado p/ a SPA assumir a raiz sem servir conteúdo velho.
const KEEP_CACHES = [CACHE, 'libermedia-spa-v2']

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    // Pré-cacheia o app shell (index da raiz) já na instalação → o fallback offline existe
    // desde o 1º segundo de CADA versão. Fecha o buraco pós-deploy: o activate purga o cache
    // antigo, e sem isto o fallback do navigate ficava vazio (Response.error = tela branca).
    try {
      const c = await caches.open(CACHE)
      await c.add(new Request(SCOPE, { cache: 'reload' })) // 'reload' ignora o HTTP cache do browser
    } catch { /* rede indisponível no install: o 1º navigate popula o shell */ }
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Navigation Preload: o browser dispara a requisição de navegação EM PARALELO ao arranque
    // do SW. Mata o race do cold start no iOS — onde o fetch() disparado de DENTRO do SW pendura
    // sem rejeitar (o catch nunca roda) e o respondWith espera pra sempre = tela branca.
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable() } catch { /* noop */ }
    }
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => !KEEP_CACHES.includes(k)).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return       // mídia/relays/cross-origin: passa direto
  if (url.pathname.startsWith('/api/')) return            // API: nunca cachear (auth/dados)
  // Apps servidas em paths próprios (MPA congelada /v2.0, SPA antiga /v2.5): NÃO interferir
  // — o SW da raiz controla '/', mas essas têm o seu próprio HTML/SW. Deixa passar direto.
  if (url.pathname === '/v2.0' || url.pathname.startsWith('/v2.0/') ||
      url.pathname === '/v2.5' || url.pathname.startsWith('/v2.5/')) return

  // Navegação (HTML) → preload/network-first COM TIMEOUT; lento/offline → app shell cacheado.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(CACHE)
      const saveShell = (res) => { if (url.pathname === SCOPE_PATH) c.put(SCOPE, res.clone()).catch(() => {}) }
      const serveShell = async () => (await c.match(SCOPE)) || (await c.match(req)) || Response.error()
      try {
        // 1) Navigation Preload: resposta que o browser já disparou em paralelo ao SW acordar.
        const preload = await e.preloadResponse
        if (preload) { saveShell(preload); return preload }
        // 2) network-first COM timeout — no cold start do iOS o fetch do SW pode PENDURAR sem
        //    rejeitar; a corrida garante cair no shell cacheado em ~4s, nunca em branco eterno.
        const res = await Promise.race([
          fetch(req),
          new Promise((_, rej) => setTimeout(() => rej(new Error('sw-nav-timeout')), 4000)),
        ])
        saveShell(res)
        return res
      } catch {
        return serveShell()
      }
    })())
    return
  }

  // Assets hashados/imutáveis do Vite (SCOPE/assets/) → cache-first + revalida.
  // IMPORTANTE: na raiz (SCOPE_PATH='/') NÃO usar startsWith(SCOPE_PATH), senão
  // cachearia mídia (/f,/s,/thumb), blobs (/<sha256>) e /static. Restrito a assets/.
  if (url.pathname.startsWith(SCOPE_PATH + 'assets/')) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE)
      const hit = await c.match(req)
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res }).catch(() => hit)
      return hit || net
    })())
  }
})

// ── Base para Web Push (ativar com VAPID no backend depois) ──────────────────
self.addEventListener('push', (e) => {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch { data = { body: e.data && e.data.text() } }
  const title = data.title || 'LiberMedia'
  const url = data.url || (data.type === 'dm' ? SCOPE_PATH + 'mensagens' : SCOPE)
  e.waitUntil((async () => {
    // Acorda clients abertos p/ puxar a DM na hora (não esperar o poll de 8s).
    try {
      const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of cs) c.postMessage({ type: 'lm-dm-sync' })
    } catch { /* noop */ }
    await self.registration.showNotification(title, {
      body: data.body || '',
      icon: SCOPE_PATH + 'icon-192.png',
      badge: SCOPE_PATH + 'icon-192.png',
      tag: data.type === 'dm' ? 'lm-dm' : undefined,
      data: url,
    })
  })())
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const target = e.notification.data || SCOPE
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of cs) { if ('focus' in c) { c.navigate?.(target); return c.focus() } }
    return self.clients.openWindow(target)
  })())
})
