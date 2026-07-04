// Mini feed da sidebar direita. Consulta UM relay (o selecionado, default pool)
// e aplica o filtro atual: recente (global do relay) · hashtag · texto (NIP-50) ·
// autor. Resolve perfis (best-effort) e respeita o filtro de conteúdo adulto.
import { useEffect, useRef, useState } from 'react'
import type { Filter } from 'nostr-tools'
import { relayManager } from '../services/relay-manager'
import { api } from '../services/api'
import { nsfwFilterActive, isNsfwEvent } from '../services/nsfw'
import { isBlacklisted } from '../services/blacklist'
import { isSpamEvent } from '../services/spam'
import type { FeedEvent, ProfileMap } from '../types/nostr'

export type MiniQuery =
  | { type: 'recent' }
  | { type: 'hashtag'; value: string }
  | { type: 'text'; value: string }
  | { type: 'author'; value: string } // pubkey hex

const LIMIT = 30

function buildFilter(q: MiniQuery): Filter {
  switch (q.type) {
    case 'hashtag':
      return { kinds: [1], '#t': [q.value.toLowerCase()], limit: LIMIT }
    case 'text':
      return { kinds: [1], search: q.value, limit: LIMIT } as Filter
    case 'author':
      return { kinds: [1], authors: [q.value], limit: LIMIT }
    default:
      return { kinds: [1], limit: LIMIT }
  }
}

export function useMiniFeed(relay: string, query: MiniQuery) {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [profiles, setProfiles] = useState<ProfileMap>({})
  const [loading, setLoading] = useState(true)
  const reqId = useRef(0)
  // Desestrutura para deps estáveis (evita re-fetch por identidade de objeto).
  const qtype = query.type
  const qval = 'value' in query ? query.value : ''

  useEffect(() => {
    const id = ++reqId.current
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    const q = buildFilter(query)
    relayManager
      .query([q], { relays: [relay], maxWait: 5000 })
      .then(async (evs) => {
        if (!alive || id !== reqId.current) return
        let list = (evs as FeedEvent[]).filter((e) => !isBlacklisted(e.pubkey) && !isSpamEvent(e))
        if (nsfwFilterActive()) list = list.filter((e) => !isNsfwEvent(e))
        list = list.slice(0, LIMIT)
        setEvents(list)
        setLoading(false)
        const pks = [...new Set(list.map((e) => e.pubkey))].slice(0, 100)
        if (pks.length) {
          try {
            const res = await api.post<{ profiles: ProfileMap }>('/api/profiles/batch', {
              pubkeys: pks,
            })
            if (alive && id === reqId.current && res.profiles) setProfiles(res.profiles)
          } catch {
            /* perfis best-effort → cai no npub curto */
          }
        }
      })
      .catch(() => {
        if (alive && id === reqId.current) setLoading(false)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relay, qtype, qval])

  return { events, profiles, loading }
}
