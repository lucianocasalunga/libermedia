// useFeedSource — MOTOR ÚNICO de feed (Fase 1 da unificação). Toda a regra mora
// aqui (dedup, scroll infinito, tempo real/pílula, perfis, stats, feedBus); o
// `spec` só diz a FONTE e as políticas. Corrige aqui → vale em todos os feeds.
//
// Fonte da verdade desta sessão: generaliza o antigo useFeed (home) 1:1 + deixa
// pronto author/hashtag/search (Fase 2). Thread/reels = apresentação própria depois.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Filter } from 'nostr-tools'
import { api } from '../services/api'
import { relayManager } from '../services/relay-manager'
import { fetchStats, type PostStats } from '../services/stats'
import { feedBus } from '../lib/feed-bus'
import { readRelays } from '../services/relays'
import { FALLBACK_RELAYS } from '../constants'
import { VIDEO_KINDS } from '../lib/content-parser'
import { POLL_KIND } from '../services/poll'
import { primeProfiles } from '../services/profiles'
import type { FeedBundleResponse } from '../types/api'
import type { FeedEvent, ProfileMap } from '../types/nostr'
import { isBlacklisted } from '../services/blacklist'
import { isSpamEvent } from '../services/spam'
// FONTE ÚNICA dos relays NIP-50 — não duplicar a lista aqui. Era um 2º lugar com
// a lista quebrada (nostr.band+primal); manter em 1 só evita o bug recorrente de
// consertar um e esquecer o outro. (vale p/ kind:0 perfis E kind:1 notas/hashtag)
import { SEARCH_RELAYS } from '../services/search'

const PAGE_SIZE = 40
// Tipos que o feed renderiza como "post": nota (1) + enquete (1068, NIP-88).
const POST_KINDS = [1, POLL_KIND]

export type FeedSpec =
  | { source: 'home' } // bundle + tempo real (feed principal)
  | { source: 'author'; pubkey: string } // perfil
  | { source: 'following'; authors: string[] } // feed "Seguindo" — só de quem o usuário segue (kind:3)
  | { source: 'hashtag'; tag: string; relays?: string[] }
  | { source: 'search'; query: string; relays?: string[] }
  | { source: 'bookmarks'; ids: string[] } // favoritos (NIP-51) — busca por ids
  | { source: 'idle' } // sem feed (ex.: busca vazia ou redirect) — não busca nada

function sortDesc(a: FeedEvent, b: FeedEvent) {
  return b.created_at - a.created_at
}

function specKeyOf(spec: FeedSpec): string {
  switch (spec.source) {
    case 'author':
      return `author:${spec.pubkey}`
    case 'following':
      // muda quando a lista de follows carrega/muda → reseta o feed
      return `following:${spec.authors.length}:${[...spec.authors].sort().slice(0, 3).join(',')}`
    case 'hashtag':
      return `hashtag:${spec.tag.toLowerCase()}`
    case 'search':
      return `search:${spec.query}`
    case 'bookmarks':
      return `bookmarks:${[...spec.ids].sort().join(',')}`
    case 'idle':
      return 'idle'
    default:
      return 'home'
  }
}

// Configuração normalizada que a máquina genérica consome.
interface Resolved {
  relays: string[]
  loadInitial: () => Promise<{ events: FeedEvent[]; profiles?: ProfileMap }>
  olderFilter: ((until: number) => Filter) | null // null = sem scroll infinito
  realtimeFilter: ((since: number) => Filter) | null // null = sem tempo real
  stats: boolean
  useFeedBus: boolean
  accept: (e: FeedEvent) => boolean
}

function resolve(spec: FeedSpec): Resolved {
  if (spec.source === 'idle') {
    return {
      relays: [],
      loadInitial: async () => ({ events: [] }),
      olderFilter: null,
      realtimeFilter: null,
      stats: false,
      useFeedBus: false,
      accept: () => false,
    }
  }
  if (spec.source === 'author') {
    const base = (until?: number): Filter => ({
      kinds: [1, 6, POLL_KIND, ...VIDEO_KINDS], // inclui reels (vídeo NIP-71) do próprio autor
      authors: [spec.pubkey],
      limit: PAGE_SIZE,
      ...(until ? { until } : {}),
    })
    const relays = readRelays()
    return {
      relays,
      loadInitial: async () => ({
        events: (await relayManager.query([base()], { relays, maxWait: 5000 })) as FeedEvent[],
      }),
      olderFilter: base,
      realtimeFilter: null,
      stats: true,
      useFeedBus: false,
      accept: (e) => e.kind === 1 || e.kind === 6 || e.kind === POLL_KIND || VIDEO_KINDS.includes(e.kind),
    }
  }
  if (spec.source === 'following') {
    // Feed "Seguindo": posts/reposts dos autores que o usuário segue (kind:3). Sem follows
    // (carregando ainda OU conta nova) → vazio, NÃO busca o mundo todo. Tempo real ligado
    // (pílula de novos posts) igual ao feed principal.
    if (!spec.authors.length) {
      return {
        relays: [],
        loadInitial: async () => ({ events: [] }),
        olderFilter: null,
        realtimeFilter: null,
        stats: false,
        useFeedBus: false,
        accept: () => false,
      }
    }
    const base = (until?: number): Filter => ({
      kinds: [1, 6, POLL_KIND],
      authors: spec.authors,
      limit: PAGE_SIZE,
      ...(until ? { until } : {}),
    })
    const relays = readRelays()
    return {
      relays,
      loadInitial: async () => ({
        events: (await relayManager.query([base()], { relays, maxWait: 5000 })) as FeedEvent[],
      }),
      olderFilter: base,
      realtimeFilter: (since) => ({ kinds: [1, 6, POLL_KIND], authors: spec.authors, since }),
      stats: true,
      useFeedBus: false,
      accept: (e) => e.kind === 1 || e.kind === 6 || e.kind === POLL_KIND,
    }
  }
  if (spec.source === 'hashtag') {
    const tag = spec.tag.toLowerCase()
    const base = (until?: number): Filter => ({
      kinds: POST_KINDS,
      '#t': [tag],
      limit: PAGE_SIZE,
      ...(until ? { until } : {}),
    })
    const relays = spec.relays ?? readRelays()
    return {
      relays,
      loadInitial: async () => ({
        events: (await relayManager.query([base()], { relays, maxWait: 5000 })) as FeedEvent[],
      }),
      olderFilter: base,
      realtimeFilter: null,
      stats: true,
      useFeedBus: false,
      accept: (e) => POST_KINDS.includes(e.kind),
    }
  }
  if (spec.source === 'search') {
    const relays = spec.relays ?? SEARCH_RELAYS
    return {
      relays,
      loadInitial: async () => ({
        events: (await relayManager.query(
          [{ kinds: [1], search: spec.query, limit: PAGE_SIZE } as Filter],
          { relays, maxWait: 5000 },
        )) as FeedEvent[],
      }),
      olderFilter: null, // NIP-50 não pagina de forma confiável
      realtimeFilter: null,
      stats: true,
      useFeedBus: false,
      accept: (e) => e.kind === 1,
    }
  }
  if (spec.source === 'bookmarks') {
    // Busca por ID de posts FAVORITADOS — eles podem ter sido salvos de qualquer lugar
    // (reels/feed de autor externo), então um post favoritado pode viver SÓ num relay
    // externo. Usar só readRelays() perdia esses (favoritos "sumiam" da página). Como é
    // busca por id exato (não floода), ampliar p/ nossos + grandes públicos resolve.
    // Inclui agregadores grandes (nostr.band/wine/purplepag) além dos nossos: posts/reels
    // favoritados vivem em relays diversos; busca por id exato → ampliar maximiza resolução.
    const relays = [
      ...new Set([
        ...readRelays(),
        ...FALLBACK_RELAYS,
        'wss://relay.nostr.band',
        'wss://nostr.wine',
        'wss://purplepag.es',
      ]),
    ]
    const idlist = spec.ids.slice(0, 200) // v1: até 200 (paginação por chunk depois)
    return {
      relays,
      loadInitial: async () => ({
        events: idlist.length
          ? ((await relayManager.query([{ ids: idlist }], { relays, maxWait: 5000 })) as FeedEvent[])
          : [],
      }),
      olderFilter: null, // sem scroll infinito (lista finita de ids)
      realtimeFilter: null,
      stats: true,
      useFeedBus: false,
      accept: (e) => POST_KINDS.includes(e.kind) || VIDEO_KINDS.includes(e.kind), // reels favoritados (vídeo NIP-71)
    }
  }
  // home — bundle + tempo real (igual ao antigo useFeed)
  const relays = readRelays()
  return {
    relays,
    loadInitial: async () => {
      const res = await api.get<FeedBundleResponse>('/api/feed/bundle')
      return { events: (res.events ?? []) as FeedEvent[], profiles: res.profiles ?? {} }
    },
    // Inclui REPOSTS (kind:6) na feed principal — estilo X: "🔁 Fulano repostou".
    // unwrapRepost (no motor) desembrulha p/ o post original com repostedBy; o PostCard
    // já renderiza o cabeçalho. (O lote inicial vem do bundle, que é kind:1; os reposts
    // entram via scroll/tempo real — inclusive o seu repost recém-feito, pela pílula.)
    olderFilter: (until) => ({ kinds: [...POST_KINDS, 6], until, limit: PAGE_SIZE }),
    realtimeFilter: (since) => ({ kinds: [...POST_KINDS, 6], since }),
    stats: true,
    useFeedBus: true,
    accept: (e) => POST_KINDS.includes(e.kind) || e.kind === 6 || VIDEO_KINDS.includes(e.kind),
  }
}

// Teto do buffer de "novos posts" em tempo real — sem isso ele cresce pra sempre
// enquanto a página fica viva (Layout não desmonta), entupindo memória/DOM.
const MAX_PENDING = 80

// NIP-18: desembrulha um repost (kind:6). content = JSON do evento original.
// Retorna o ORIGINAL com repostedBy = quem repostou, pra renderizar uma vez só com
// cabeçalho "🔁 repostou". Se o content não for um evento válido, devolve como veio.
function unwrapRepost(e: FeedEvent): FeedEvent {
  if (e.kind !== 6) return e
  try {
    const orig = JSON.parse(e.content) as Partial<FeedEvent>
    if (orig && typeof orig.id === 'string' && typeof orig.content === 'string' && typeof orig.pubkey === 'string') {
      // created_at = momento do REPOST (não do original) → o repost sobe pro TOPO do feed
      // quando feito (estilo X), em vez de afundar na data antiga do original / ser dedupado.
      // Mantém id/conteúdo/autor do original p/ render do card + dedup.
      return { ...(orig as FeedEvent), created_at: e.created_at, repostedBy: e.pubkey }
    }
  } catch {
    /* content não é um evento serializável — cai no fallback */
  }
  return e
}

// `active`: true só quando a página é a rota ATIVA. Como o Layout mantém todas as
// páginas montadas (display:none), sem isso cada feed escondido manteria uma assinatura
// de relay ao vivo empilhando eventos pra sempre. Inativo → fecha a assinatura.
export function useFeedSource(spec: FeedSpec, active = true) {
  const key = specKeyOf(spec)
  // Resolve só quando a chave muda (evita re-fetch por identidade de objeto).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const r = useMemo(() => resolve(spec), [key])

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

  const ids = useRef(new Set<string>())
  const haveProfiles = useRef(new Set<string>())
  const oldest = useRef(0)
  const newest = useRef(0)
  const loadingMoreRef = useRef(false)
  const exhaustedRef = useRef(false)
  const emptyStreak = useRef(0) // janelas consecutivas SEM nada do relay → só esgota após 3

  const fetchStatsFor = useCallback(
    async (eventIds: string[]) => {
      if (!r.stats || eventIds.length === 0) return
      const res = await fetchStats(eventIds)
      if (Object.keys(res).length) setStats((prev) => ({ ...prev, ...res }))
    },
    [r],
  )

  const fetchProfiles = useCallback(async (pubkeys: string[]) => {
    const missing = [...new Set(pubkeys)].filter((pk) => !haveProfiles.current.has(pk))
    if (missing.length === 0) return
    missing.forEach((pk) => haveProfiles.current.add(pk))
    try {
      const res = await api.post<{ ok: boolean; profiles: ProfileMap }>('/api/profiles/batch', {
        pubkeys: missing.slice(0, 100),
      })
      if (res.profiles) {
        setProfiles((prev) => ({ ...prev, ...res.profiles }))
        primeProfiles(res.profiles) // alimenta o cache global (UserName/Mention)
      }
    } catch {
      /* perfis best-effort → PostCard cai no npub curto */
    }
  }, [])

  // Carga inicial + reset (em troca de spec ou reload).
  useEffect(() => {
    let alive = true
    ids.current = new Set()
    haveProfiles.current = new Set()
    oldest.current = 0
    newest.current = 0
    exhaustedRef.current = false
    emptyStreak.current = 0
    /* eslint-disable react-hooks/set-state-in-effect */
    setEvents([])
    setProfiles({})
    setStats({})
    setExhausted(false)
    setPending([])
    setReady(false)
    setLoading(true)
    setError(null)
    /* eslint-enable react-hooks/set-state-in-effect */

    r.loadInitial()
      .then((res) => {
        if (!alive) return
        const evs = (res.events ?? []).map(unwrapRepost).filter(
          (e) => r.accept(e) && !ids.current.has(e.id) && !isBlacklisted(e.pubkey) && !isSpamEvent(e),
        )
        evs.forEach((e) => ids.current.add(e.id))
        Object.keys(res.profiles ?? {}).forEach((k) => haveProfiles.current.add(k))
        const sorted = [...evs].sort(sortDesc)
        setEvents(sorted)
        if (res.profiles) {
          setProfiles(res.profiles)
          primeProfiles(res.profiles)
        }
        if (sorted.length) {
          newest.current = sorted[0].created_at
          oldest.current = sorted[sorted.length - 1].created_at
          void fetchStatsFor(sorted.map((e) => e.id))
          // Quando a carga inicial não traz perfis (query de relay), resolve em lote.
          if (!res.profiles) void fetchProfiles(sorted.map((e) => e.pubkey))
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
  }, [key, nonce, r, fetchStatsFor, fetchProfiles])

  // Tempo real (só fontes com realtimeFilter — ex.: home). REABRE ao voltar o foco:
  // em mobile o WebSocket cai quando o app vai pra background e a subscription morre
  // sem reconectar → feed congelava no que tinha carregado. Ao ficar visível de novo,
  // fechamos e reabrimos a partir de `newest` → os posts perdidos caem na pílula
  // "novos posts" (sem resetar o scroll). dedup por ids.current evita repetidos.
  const realtimeFilter = r.realtimeFilter
  useEffect(() => {
    if (!ready || !realtimeFilter || !active) return
    let closer: { close: () => void } | null = null
    const open = () => {
      closer?.close()
      const since = newest.current + 1
      closer = relayManager.subscribe([realtimeFilter(since)], (ev) => {
        const e = unwrapRepost(ev as FeedEvent)
        if (!r.accept(e) || ids.current.has(e.id) || isBlacklisted(e.pubkey) || isSpamEvent(e)) return
        ids.current.add(e.id)
        setPending((prev) => [e, ...prev].sort(sortDesc).slice(0, MAX_PENDING))
        void fetchProfiles([e.pubkey])
      })
    }
    open()
    const onVis = () => {
      if (!document.hidden) open()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => {
      closer?.close()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
    }
  }, [ready, nonce, r, realtimeFilter, fetchProfiles, active])

  // Posts criados localmente (ComposeModal) — só fontes com feedBus (home).
  useEffect(() => {
    if (!r.useFeedBus) return
    return feedBus.subscribe((post) => {
      if (!r.accept(post) || ids.current.has(post.id)) return
      ids.current.add(post.id)
      if (post.created_at > newest.current) newest.current = post.created_at
      setEvents((prev) => [post, ...prev].sort(sortDesc))
      void fetchProfiles([post.pubkey])
    })
  }, [r, fetchProfiles])

  // Scroll infinito (só fontes com olderFilter). ROBUSTO: uma janela vazia NÃO esgota
  // o feed (o relay "tem post pra caramba"). Causas de página vazia que NÃO são fim:
  //  • maxWait estourou (relay lento) → tenta de novo na próxima rolagem;
  //  • janela trouxe só posts já-vistos/filtrados (spam/blacklist/tipo) → AVANÇA o cursor
  //    pelo evento cru mais antigo e segue puxando (loop interno até achar algo visível).
  // Só marca "esgotado" após 3 janelas consecutivas em que o relay não devolveu NADA novo.
  const loadMore = useCallback(async () => {
    if (!r.olderFilter || loadingMoreRef.current || exhaustedRef.current || oldest.current === 0)
      return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      // Pula até 5 janelas só-filtradas por chamada (evita prender numa faixa de spam).
      for (let page = 0; page < 5 && !exhaustedRef.current; page++) {
        const older = (await relayManager.query([r.olderFilter(oldest.current - 1)], {
          relays: r.relays,
          maxWait: 6000,
        })) as FeedEvent[]
        const minTime = older.length ? Math.min(...older.map((e) => e.created_at)) : 0
        // Relay não devolveu nada novo (vazio, timeout, ou ignorou o `until`).
        if (older.length === 0 || minTime >= oldest.current) {
          emptyStreak.current += 1
          if (emptyStreak.current >= 3) {
            exhaustedRef.current = true
            setExhausted(true)
          }
          break // deixa a próxima rolagem re-disparar (re-tenta a janela)
        }
        emptyStreak.current = 0
        oldest.current = minTime // avança SEMPRE — mesmo se tudo foi filtrado
        const fresh = older.map(unwrapRepost).filter(
          (e) => r.accept(e) && !ids.current.has(e.id) && !isBlacklisted(e.pubkey) && !isSpamEvent(e),
        )
        if (fresh.length) {
          fresh.forEach((e) => ids.current.add(e.id))
          setEvents((prev) => [...prev, ...fresh].sort(sortDesc))
          void fetchProfiles(fresh.map((e) => e.pubkey))
          void fetchStatsFor(fresh.map((e) => e.id))
          break // já trouxe conteúdo visível → a sentinela re-dispara ao rolar
        }
        // página só-filtrada: cursor já avançou, segue o loop p/ a próxima janela
      }
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [r, fetchProfiles, fetchStatsFor])

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
