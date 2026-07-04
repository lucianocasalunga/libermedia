// Blacklist de pubkeys (bots/spam) — espelha o MPA: sync incremental via
// GET /api/blacklist?since=TS&limit=N → {pubkeys, latest_ts, has_more}, com
// cache em localStorage. Carrega 1x e expõe checker síncrono + hook reativo.
// Posts de pubkeys bloqueadas somem do feed (useFeedSource) e do PostCard.
import { useSyncExternalStore } from 'react'
import { api } from './api'

const CACHE_KEY = 'libermedia_blacklist_v2'
const TS_KEY = 'libermedia_blacklist_ts'
// Auto-cura: o sync incremental SÓ adiciona (nunca remove) → uma pubkey banida por
// engano e depois liberada no servidor ficava filtrada PARA SEMPRE no device (perfil
// vazio). Periodicamente (e ao subir FULL_VERSION) refazemos um sync COMPLETO que
// SUBSTITUI o conjunto pela lista autoritativa atual, podando os removidos.
const FULL_KEY = 'libermedia_blacklist_full_ts'
const FULL_VER_KEY = 'libermedia_blacklist_full_ver'
const FULL_VERSION = '2' // bump → força um resync completo (heal) em todos os clientes
const FULL_TTL = 24 * 60 * 60 * 1000 // re-sincroniza tudo a cada 24h

interface BlacklistResp {
  pubkeys?: string[]
  latest_ts?: number
  has_more?: boolean
}

let blocked = new Set<string>()
let loaded = false
let loading: Promise<void> | null = null
const subs = new Set<() => void>()
const notify = () => subs.forEach((c) => c())

export function isBlacklisted(hex: string): boolean {
  return blocked.has(hex)
}

export function ensureBlacklist(): Promise<void> {
  if (loaded) return Promise.resolve()
  if (loading) return loading
  loading = (async () => {
    // 1. cache local (instantâneo) — proteção imediata enquanto sincroniza.
    //    EXCEÇÃO: na MIGRAÇÃO (FULL_VERSION novo) o cache pode estar inflado com
    //    pubkeys já liberadas no servidor → carregá-lo filtraria usuários legítimos
    //    ANTES de o resync podar (perfil vazio por 1 load). Na migração começamos
    //    limpo e deixamos o resync completo montar o conjunto autoritativo.
    const ver = localStorage.getItem(FULL_VER_KEY)
    const isMigration = ver !== FULL_VERSION
    let cached: string[] = []
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
      if (Array.isArray(c)) cached = c
    } catch {
      /* json inválido */
    }
    if (cached.length && !isMigration) {
      blocked = new Set(cached)
      notify()
    }

    // 2. decide: resync COMPLETO (autoritativo, poda removidos) ou incremental
    const lastFull = parseInt(localStorage.getItem(FULL_KEY) || '0', 10)
    const needFull = isMigration || Date.now() - lastFull > FULL_TTL || cached.length === 0

    if (needFull) {
      // baixa a lista INTEIRA e SUBSTITUI o conjunto (= remove quem saiu do servidor)
      const fresh = new Set<string>()
      let since = 0
      let ok = true
      for (let i = 0; i < 60; i++) {
        let data: BlacklistResp
        try {
          data = await api.get<BlacklistResp>(`/api/blacklist?since=${since}&limit=5000`)
        } catch {
          ok = false
          break
        }
        const novas = data.pubkeys ?? []
        novas.forEach((pk) => fresh.add(pk))
        since = data.latest_ts ?? since
        if (!data.has_more || !novas.length) break
      }
      // Só substitui se o resync COMPLETOU (senão mantém o cache → não desprotege)
      if (ok) {
        blocked = fresh
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify([...fresh]))
          localStorage.setItem(TS_KEY, String(since))
          localStorage.setItem(FULL_KEY, String(Date.now()))
          localStorage.setItem(FULL_VER_KEY, FULL_VERSION)
        } catch {
          /* quota */
        }
        notify()
      }
    } else {
      // 3. sync incremental — só adiciona desde o último TS (rápido, dia a dia)
      let since = parseInt(localStorage.getItem(TS_KEY) || '0', 10)
      for (let i = 0; i < 60; i++) {
        let data: BlacklistResp
        try {
          data = await api.get<BlacklistResp>(`/api/blacklist?since=${since}&limit=5000`)
        } catch {
          break
        }
        const novas = data.pubkeys ?? []
        novas.forEach((pk) => blocked.add(pk))
        since = data.latest_ts ?? since
        if (novas.length) {
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify([...blocked]))
            localStorage.setItem(TS_KEY, String(since))
          } catch {
            /* quota */
          }
          notify()
        }
        if (!data.has_more || !novas.length) break
      }
    }
    loaded = true
  })()
  return loading
}

export function useIsBlacklisted(hex: string): boolean {
  return useSyncExternalStore(
    (c) => {
      subs.add(c)
      return () => subs.delete(c)
    },
    () => blocked.has(hex),
    () => false,
  )
}
