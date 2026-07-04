// Conta seguidores de um pubkey. Espelha a lógica do MPA (perfil.html):
//  1) Primal Cache API (wss://cache2.primal.net/v1) → kind:10000105 com
//     followers_count exato (agregação que o Primal mantém).
//  2) Fallback kind:3 (#p) nos relays: conta autores únicos que seguem o pubkey
//     (subestima, mas dá um número quando o Primal não responde).
import { useEffect, useState } from 'react'
import { relayManager } from '../services/relay-manager'
import { readRelays } from '../services/relays'

const PRIMAL_CACHE = 'wss://cache2.primal.net/v1'
const PRIMAL_KIND = 10000105 // user_profile stats do Primal

// Busca followers_count no Primal. Resolve null se não responder a tempo.
function fetchPrimalFollowers(hex: string, timeoutMs = 4000): Promise<number | null> {
  return new Promise((resolve) => {
    let done = false
    let ws: WebSocket
    const finish = (v: number | null) => {
      if (done) return
      done = true
      try {
        ws.close()
      } catch {
        /* noop */
      }
      resolve(v)
    }
    try {
      ws = new WebSocket(PRIMAL_CACHE)
    } catch {
      resolve(null)
      return
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    ws.onopen = () => {
      ws.send(JSON.stringify(['REQ', `flw_${hex.slice(0, 8)}`, { cache: ['user_profile', { pubkey: hex }] }]))
    }
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data as string)
        if (data[0] === 'EVENT' && data[2]?.kind === PRIMAL_KIND) {
          const stats = JSON.parse(data[2].content)
          if (typeof stats.followers_count === 'number') {
            clearTimeout(timer)
            finish(stats.followers_count)
          }
        } else if (data[0] === 'EOSE') {
          clearTimeout(timer)
          finish(null)
        }
      } catch {
        /* mensagem não-JSON do relay */
      }
    }
    ws.onerror = () => {
      clearTimeout(timer)
      finish(null)
    }
  })
}

// Fallback: conta autores únicos de kind:3 com #p = hex.
async function fetchKind3Followers(hex: string): Promise<number | null> {
  try {
    const events = await relayManager.query([{ kinds: [3], '#p': [hex], limit: 500 }], {
      relays: readRelays(),
      maxWait: 6000,
    })
    const authors = new Set(events.map((e) => e.pubkey))
    return authors.size || null
  } catch {
    return null
  }
}

export function useFollowers(hex: string | null): number | null {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!hex) return
    let alive = true
    // Reset ao trocar de perfil; o restante atualiza após await (assíncrono).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCount(null)
    void (async () => {
      const primal = await fetchPrimalFollowers(hex)
      if (!alive) return
      if (primal != null) {
        setCount(primal)
        return
      }
      const k3 = await fetchKind3Followers(hex)
      if (alive && k3 != null) setCount(k3)
    })()
    return () => {
      alive = false
    }
  }, [hex])

  return count
}
