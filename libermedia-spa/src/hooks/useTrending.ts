// Trending hashtags (sidebar direita) — porta a lógica do feed.html do MPA:
// busca kind:1 das últimas 24h nos relays, conta hashtags (tags 't' + '#' no
// conteúdo, uma vez por post), top 10. Cache 30min em localStorage.
import { useEffect, useState } from 'react'
import { relayManager } from '../services/relay-manager'
import { readRelays } from '../services/relays'

export interface Trend {
  tag: string
  count: number
}

const CACHE_KEY = 'libermedia_trending_hashtags'
const TTL = 30 * 60 * 1000
const HASHTAG_RE = /#([\p{L}\p{N}_]+)/gu

function readCache(): Trend[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { ts, tags } = JSON.parse(raw)
    if (Date.now() - ts > TTL) return null
    return tags as Trend[]
  } catch {
    return null
  }
}

export function useTrending() {
  // Inicializa do cache (lazy) — evita setState síncrono no effect.
  const [tags, setTags] = useState<Trend[]>(() => readCache() ?? [])
  const [loading, setLoading] = useState(() => readCache() == null)

  useEffect(() => {
    // Já temos cache válido → não busca.
    if (readCache()) return
    let alive = true
    const since = Math.floor(Date.now() / 1000) - 86400
    relayManager
      .query([{ kinds: [1], since, limit: 300 }], { relays: readRelays(), maxWait: 7000 })
      .then((events) => {
        if (!alive) return
        const counts = new Map<string, number>()
        for (const ev of events) {
          const evTags = new Set<string>()
          for (const t of ev.tags) if (t[0] === 't' && t[1]) evTags.add(t[1].toLowerCase())
          for (const m of (ev.content || '').matchAll(HASHTAG_RE)) evTags.add(m[1].toLowerCase())
          for (const tag of evTags) counts.set(tag, (counts.get(tag) || 0) + 1)
        }
        const top = [...counts.entries()]
          .map(([tag, count]) => ({ tag, count }))
          .filter((t) => t.count > 1)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
        setTags(top)
        setLoading(false)
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), tags: top }))
        } catch {
          /* quota — ignora */
        }
      })
      .catch(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  return { tags, loading }
}
