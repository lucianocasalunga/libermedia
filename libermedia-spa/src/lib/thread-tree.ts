// Constrói a árvore de respostas de uma thread (estilo YouTube) a partir da lista
// PLANA de respostas. Pai = evento a que a resposta responde (NIP-10): marcador
// 'reply' > marcador 'root' > último 'e' (legado posicional). Órfãos colam na raiz.
import type { FeedEvent } from '../types/nostr'

export interface ThreadNode {
  event: FeedEvent
  children: ThreadNode[]
}

function parentIdOf(ev: FeedEvent, rootId: string): string {
  const eTags = ev.tags.filter((t) => t[0] === 'e' && t[1])
  if (eTags.length === 0) return rootId
  const reply = eTags.find((t) => t[3] === 'reply')
  if (reply) return reply[1]
  const root = eTags.find((t) => t[3] === 'root')
  if (root && !eTags.some((t) => t[3] === 'reply')) return root[1]
  // Legado (sem marcadores): o último 'e' é o pai imediato.
  return eTags[eTags.length - 1][1]
}

export function buildThreadTree(rootId: string, replies: FeedEvent[]): ThreadNode[] {
  const ids = new Set(replies.map((r) => r.id))
  const childrenOf = new Map<string, FeedEvent[]>()
  for (const r of replies) {
    let parent = parentIdOf(r, rootId)
    // Pai fora da thread (não é a raiz nem está nas respostas) → cola na raiz.
    if (parent !== rootId && !ids.has(parent)) parent = rootId
    const arr = childrenOf.get(parent) ?? []
    arr.push(r)
    childrenOf.set(parent, arr)
  }
  // Cronológico ascendente dentro de cada nível (mais antigas primeiro, como YouTube).
  for (const arr of childrenOf.values()) arr.sort((a, b) => a.created_at - b.created_at)

  const seen = new Set<string>()
  function build(id: string): ThreadNode[] {
    const out: ThreadNode[] = []
    for (const ev of childrenOf.get(id) ?? []) {
      if (seen.has(ev.id)) continue // anti-ciclo (eventos forjados)
      seen.add(ev.id)
      out.push({ event: ev, children: build(ev.id) })
    }
    return out
  }
  return build(rootId)
}
