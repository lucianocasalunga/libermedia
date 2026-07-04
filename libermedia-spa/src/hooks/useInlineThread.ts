// Carrega a thread (respostas) de um post SOB DEMANDA (quando expandido inline no feed),
// com cache de módulo (Map por rootId, TTL 2min, stale-while-revalidate). Reusa o bundle
// /api/bundle/thread/<id>. Mostra o cache na hora; se vencido, revalida em fundo.
import { useEffect, useState } from 'react'
import { api } from '../services/api'
import type { ThreadBundleResponse } from '../types/api'
import type { FeedEvent, ProfileMap } from '../types/nostr'

interface Cached {
  event: FeedEvent | null
  replies: FeedEvent[]
  profiles: ProfileMap
  ts: number
}
const cache = new Map<string, Cached>()
const TTL = 2 * 60 * 1000

/** Invalida o cache de uma thread (ex.: ao visitar /thread/:id ou após responder). */
export function invalidateThread(id: string) {
  cache.delete(id)
}

interface State {
  event: FeedEvent | null
  replies: FeedEvent[]
  profiles: ProfileMap
  loading: boolean
  error: string | null
}

export function useInlineThread(id: string, enabled: boolean) {
  const [state, setState] = useState<State>(() => {
    const c = cache.get(id)
    return c
      ? { event: c.event, replies: c.replies, profiles: c.profiles, loading: false, error: null }
      : { event: null, replies: [], profiles: {}, loading: false, error: null }
  })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const cached = cache.get(id)
    const fresh = cached && Date.now() - cached.ts < TTL
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ event: cached.event, replies: cached.replies, profiles: cached.profiles, loading: false, error: null })
      if (fresh) return // cache quente → não refetcha
    } else {
      setState((s) => ({ ...s, loading: true, error: null }))
    }
    let alive = true
    api
      .get<ThreadBundleResponse>(`/api/bundle/thread/${encodeURIComponent(id)}`)
      .then((res) => {
        if (!alive) return
        const replies = [...(res.replies ?? [])].sort((a, b) => a.created_at - b.created_at)
        cache.set(id, { event: res.event ?? null, replies, profiles: res.profiles ?? {}, ts: Date.now() })
        setState({
          event: res.event ?? null,
          replies,
          profiles: res.profiles ?? {},
          loading: false,
          error: null,
        })
      })
      .catch((e: unknown) => {
        if (!alive) return
        setState((s) => ({
          ...s,
          loading: false,
          error: e instanceof Error ? e.message : 'Falha ao carregar respostas',
        }))
      })
    return () => {
      alive = false
    }
  }, [id, enabled, nonce])

  const retry = () => {
    cache.delete(id)
    setNonce((n) => n + 1)
  }
  return { ...state, retry }
}
