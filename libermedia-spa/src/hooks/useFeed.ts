// useFeed — orquestra o feed completo (Fase 1, incremento 2):
//  • carga inicial via /api/feed/bundle (rápido, perfis embutidos)
//  • scroll infinito buscando posts antigos nos relays (until=)
//  • tempo real: novos posts chegam via subscription e ficam num buffer (pílula)
//  • perfis dos posts vindos dos relays resolvidos via /api/profiles/batch
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import { relayManager } from '../services/relay-manager'
import { fetchStats, type PostStats } from '../services/stats'
import { feedBus } from '../lib/feed-bus'
import { readRelays } from '../services/relays'
import type { FeedBundleResponse } from '../types/api'
import type { FeedEvent, ProfileMap } from '../types/nostr'

const FEED_KINDS = [1]
const PAGE_SIZE = 40

function sortDesc(a: FeedEvent, b: FeedEvent) {
  return b.created_at - a.created_at
}

export function useFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [profiles, setProfiles] = useState<ProfileMap>({})
  const [stats, setStats] = useState<Record<string, PostStats>>({})
  const [pending, setPending] = useState<FeedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [nonce, setNonce] = useState(0)

  // Refs para guardas estáveis (evita closures velhas no IntersectionObserver).
  const ids = useRef(new Set<string>())
  const haveProfiles = useRef(new Set<string>())
  const oldest = useRef(0)
  const newest = useRef(0)
  const loadingMoreRef = useRef(false)
  const exhaustedRef = useRef(false)

  // Busca contadores (Primal cache) para um lote de posts e mescla no estado.
  const fetchStatsFor = useCallback(async (eventIds: string[]) => {
    if (eventIds.length === 0) return
    const res = await fetchStats(eventIds)
    if (Object.keys(res).length) setStats((prev) => ({ ...prev, ...res }))
  }, [])

  // Busca perfis ausentes em lote e mescla no estado.
  const fetchProfiles = useCallback(async (pubkeys: string[]) => {
    const missing = [...new Set(pubkeys)].filter((pk) => !haveProfiles.current.has(pk))
    if (missing.length === 0) return
    missing.forEach((pk) => haveProfiles.current.add(pk)) // otimista: não re-buscar
    try {
      const res = await api.post<{ ok: boolean; profiles: ProfileMap }>(
        '/api/profiles/batch',
        { pubkeys: missing.slice(0, 100) },
      )
      if (res.profiles) setProfiles((prev) => ({ ...prev, ...res.profiles }))
    } catch {
      /* perfis são best-effort; PostCard cai no npub curto */
    }
  }, [])

  // Carga inicial (bundle) + reset em reload.
  useEffect(() => {
    let alive = true
    ids.current = new Set()
    haveProfiles.current = new Set()
    oldest.current = 0
    newest.current = 0
    exhaustedRef.current = false
    // Reset síncrono ao (re)carregar — render barato e intencional.
    /* eslint-disable react-hooks/set-state-in-effect */
    setExhausted(false)
    setPending([])
    setReady(false)
    setLoading(true)
    setError(null)
    /* eslint-enable react-hooks/set-state-in-effect */

    api
      .get<FeedBundleResponse>('/api/feed/bundle')
      .then((res) => {
        if (!alive) return
        const evs = (res.events ?? []).filter((e) => !ids.current.has(e.id))
        evs.forEach((e) => ids.current.add(e.id))
        Object.keys(res.profiles ?? {}).forEach((k) => haveProfiles.current.add(k))
        const sorted = [...evs].sort(sortDesc)
        setEvents(sorted)
        setProfiles(res.profiles ?? {})
        if (sorted.length) {
          newest.current = sorted[0].created_at
          oldest.current = sorted[sorted.length - 1].created_at
          void fetchStatsFor(sorted.map((e) => e.id))
        }
        setLoading(false)
        setReady(true)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Falha ao carregar o feed')
        setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [nonce, fetchStatsFor])

  // Tempo real: assina posts mais novos que o topo atual; buffer na pílula.
  useEffect(() => {
    if (!ready) return
    const since = newest.current + 1
    const closer = relayManager.subscribe(
      [{ kinds: FEED_KINDS, since }],
      (ev) => {
        const e = ev as FeedEvent
        if (e.kind !== 1 || ids.current.has(e.id)) return
        ids.current.add(e.id)
        setPending((prev) => [e, ...prev].sort(sortDesc))
        void fetchProfiles([e.pubkey])
      },
    )
    return () => closer.close()
  }, [ready, nonce, fetchProfiles])

  // Posts criados localmente (ComposeModal) entram no topo na hora.
  useEffect(() => {
    return feedBus.subscribe((post) => {
      if (post.kind !== 1 || ids.current.has(post.id)) return
      ids.current.add(post.id)
      if (post.created_at > newest.current) newest.current = post.created_at
      setEvents((prev) => [post, ...prev].sort(sortDesc))
      void fetchProfiles([post.pubkey])
    })
  }, [fetchProfiles])

  // Scroll infinito: busca posts antigos nos relays.
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || exhaustedRef.current || oldest.current === 0) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      // Relays amplos: nexus+pool têm histórico raso e esgotam cedo. Damus/
      // primal/nos.lol/libernet têm fundo de quintal profundo → scroll "infinito".
      const older = (await relayManager.query(
        [{ kinds: FEED_KINDS, until: oldest.current - 1, limit: PAGE_SIZE }],
        { relays: readRelays(), maxWait: 4500 },
      )) as FeedEvent[]
      const fresh = older.filter((e) => e.kind === 1 && !ids.current.has(e.id))
      if (fresh.length === 0) {
        exhaustedRef.current = true
        setExhausted(true)
      } else {
        fresh.forEach((e) => ids.current.add(e.id))
        oldest.current = Math.min(oldest.current, ...fresh.map((e) => e.created_at))
        setEvents((prev) => [...prev, ...fresh].sort(sortDesc))
        void fetchProfiles(fresh.map((e) => e.pubkey))
        void fetchStatsFor(fresh.map((e) => e.id))
      }
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [fetchProfiles, fetchStatsFor])

  // Mostra os posts em buffer no topo.
  const showNew = useCallback(() => {
    setPending((buffered) => {
      if (buffered.length) {
        newest.current = buffered[0].created_at
        setEvents((prev) => [...buffered, ...prev].sort(sortDesc))
        void fetchStatsFor(buffered.map((e) => e.id))
      }
      return []
    })
  }, [fetchStatsFor])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return {
    events,
    profiles,
    stats,
    loading,
    loadingMore,
    exhausted,
    error,
    newCount: pending.length,
    loadMore,
    showNew,
    reload,
  }
}
