// Contadores de posts (curtidas/respostas/reposts/zaps) contados direto dos
// relays — padrão Nostr puro, sem depender da API de cache privada da Primal
// (cujo `event_actions_count` foi descontinuado; retorna "unknown api request").
//
// Para um lote de event_ids, consulta:
//   kind:7    (reações/likes)   #e → alvo
//   kind:6    (reposts NIP-18)  #e → alvo
//   kind:1    (respostas)       #e → alvo
//   kind:9735 (recibos de zap)  #e → alvo
// e conta por evento-alvo. O RelayManager.query já faz dedup do evento contador
// (mesma reação vinda de múltiplos relays não conta duas vezes).
import { relayManager } from './relay-manager'
import { readRelays } from './relays'
import { normalizeReaction } from './emoji'
import type { FeedEvent } from '../types/nostr'

export interface PostStats {
  likes: number
  replies: number
  reposts: number
  zaps: number
  reactions: Record<string, number> // emoji → contagem (NIP-25, agrupado)
  mineEmoji?: string // MINHA reação a este alvo (emoji ou "+"), se houver — p/ likedByMe
  mineId?: string // id do MEU kind:7 (p/ desfazer a reação sem ter reagido nesta sessão)
}

function emptyStats(): PostStats {
  return { likes: 0, replies: 0, reposts: 0, zaps: 0, reactions: {} }
}

// Conta likes/reposts/respostas/zaps de um lote de eventos JÁ EM MÃOS (bundle do
// servidor OU query de relay), por evento-alvo (último 'e' que pertence ao conjunto).
// Se `myHex` for passado, marca `mineEmoji` no alvo que EU reagi (kind:7) → likedByMe.
export function tallyStats(ids: string[], events: FeedEvent[], myHex?: string): Record<string, PostStats> {
  const out: Record<string, PostStats> = {}
  const idSet = new Set(ids)
  for (const id of ids) out[id] = emptyStats()
  for (const ev of events) {
    let target: string | undefined
    for (const t of ev.tags) {
      if (t[0] === 'e' && idSet.has(t[1])) target = t[1]
    }
    if (!target) continue
    const s = out[target]
    if (ev.kind === 7) {
      s.likes++
      const em = normalizeReaction(ev.content)
      s.reactions[em] = (s.reactions[em] || 0) + 1
      if (myHex && ev.pubkey === myHex) {
        s.mineEmoji = em
        s.mineId = ev.id
      }
    } else if (ev.kind === 6) s.reposts++
    else if (ev.kind === 1) s.replies++
    else if (ev.kind === 9735) s.zaps++
  }
  return out
}

export async function fetchStats(
  eventIds: string[],
  myHex?: string,
): Promise<Record<string, PostStats>> {
  const ids = [...new Set(eventIds)].filter(Boolean)
  if (ids.length === 0) return {}

  const events = await relayManager.query(
    [
      { kinds: [7], '#e': ids, limit: 1000 },
      { kinds: [6], '#e': ids, limit: 1000 },
      { kinds: [1], '#e': ids, limit: 1000 },
      { kinds: [9735], '#e': ids, limit: 1000 },
    ],
    // Cobertura ampla melhora a contagem (reações espalhadas por vários relays).
    // maxWait 3000: o bundle do servidor já dá o 1º paint dos contadores; isto é
    // REFINAMENTO em fundo (merge Math.max no useThread) → não precisa esperar 5s.
    { relays: readRelays(), maxWait: 3000 },
  )

  return tallyStats(ids, events as FeedEvent[], myHex)
}
