// Posts fixados de um perfil — NIP-51 kind:10001 (tag `e`). Busca a lista do
// perfil VISTO (não o store global de pins do usuário logado) e os eventos
// fixados, na ordem da lista. Usado pela PerfilPage p/ exibir fixados no topo.
import { useEffect, useState } from 'react'
import { relayManager } from '../services/relay-manager'
import { readRelays, writeRelays } from '../services/relays'
import type { FeedEvent } from '../types/nostr'

export function usePinnedPosts(hex: string | null | undefined): FeedEvent[] {
  const [pinned, setPinned] = useState<FeedEvent[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!hex) {
        if (!cancelled) setPinned([])
        return
      }
      const relays = [...new Set([...readRelays(), ...writeRelays()])]
      // 1. lista kind:10001 do perfil — adota a de created_at MAIS ALTO
      const lists = await relayManager.query([{ kinds: [10001], authors: [hex], limit: 5 }], {
        relays,
        maxWait: 3500,
      })
      const best = lists.filter((e) => e.kind === 10001).sort((a, b) => b.created_at - a.created_at)[0]
      const ids = best ? best.tags.filter((t) => t[0] === 'e' && t[1]).map((t) => t[1]) : []
      if (cancelled) return
      if (ids.length === 0) {
        setPinned([])
        return
      }
      // 2. busca os eventos fixados e preserva a ordem da lista
      const evs = (await relayManager.query([{ ids }], { relays, maxWait: 4000 })) as FeedEvent[]
      if (cancelled) return
      const byId = new Map(evs.map((e) => [e.id, e]))
      setPinned(ids.map((id) => byId.get(id)).filter(Boolean) as FeedEvent[])
    })()
    return () => {
      cancelled = true
    }
  }, [hex])

  return pinned
}
