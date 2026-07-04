// Busca o evento Nostr COMPLETO de um reel pelo id (a reels-api só manda url+id+pubkey).
// Necessário pra curtir (kind:7), repostar (kind:6) e responder (kind:1) — todas exigem
// o FeedEvent inteiro. Cache em módulo: 1 query por id na vida da aba.
import { useEffect, useState } from 'react'
import { relayManager } from '../services/relay-manager'
import { readRelays } from '../services/relays'
import type { FeedEvent } from '../types/nostr'

const cache = new Map<string, FeedEvent>()
const inflight = new Map<string, Promise<FeedEvent | null>>()

// Relays grandes onde os reels NASCEM (o crawler os colhe de lá). Sem o pool agregador
// (removido 26/Jun), buscar o evento só nos nossos relays falhava → reelEvent ficava null
// → zap/comentar/curtir/repostar não funcionavam. Buscamos nos nossos + nestes.
const DISCOVERY_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.band',
]

async function loadReelEvent(eventId: string): Promise<FeedEvent | null> {
  const cached = cache.get(eventId)
  if (cached) return cached
  let p = inflight.get(eventId)
  if (!p) {
    const relays = Array.from(new Set([...readRelays(), ...DISCOVERY_RELAYS]))
    p = relayManager
      .query([{ ids: [eventId] }], { maxWait: 5000, relays })
      .then((evs) => {
        const ev = evs[0] as FeedEvent | undefined
        if (ev) cache.set(eventId, ev)
        return ev ?? null
      })
      .catch(() => null)
      .finally(() => inflight.delete(eventId))
    inflight.set(eventId, p)
  }
  return p
}

export function useReelEvent(eventId: string | null): FeedEvent | null {
  const [event, setEvent] = useState<FeedEvent | null>(() => (eventId ? cache.get(eventId) ?? null : null))

  useEffect(() => {
    if (!eventId) return
    const hit = cache.get(eventId)
    if (hit) {
      setEvent(hit)
      return
    }
    let alive = true
    void loadReelEvent(eventId).then((ev) => {
      if (alive) setEvent(ev)
    })
    return () => {
      alive = false
    }
  }, [eventId])

  return event
}
