// Publicação de posts (kind:1) e respostas. Assina com o signer e publica num
// conjunto amplo de relays (default + fallback) para máxima propagação.
import { nip19 } from 'nostr-tools'
import { relayManager } from './relay-manager'
import { writeRelays } from './relays'
import { notifySocial } from './push'
import { customEmojiTagsFor } from './custom-emoji'
import type { Signer } from './signer'
import type { FeedEvent } from '../types/nostr'

export async function publishNote(
  signer: Signer,
  content: string,
  replyTo?: FeedEvent | null,
  opts?: { contentWarning?: boolean; quoteOf?: FeedEvent | null; extraTags?: string[][] },
): Promise<FeedEvent> {
  const tags: string[][] = []
  if (opts?.extraTags) tags.push(...opts.extraTags) // ex.: ['ts-file', file_id, preco] (conteúdo pago)
  if (replyTo) {
    // NIP-10 COMPLETO: raiz da thread ('root') + pai imediato ('reply') + cadeia de
    // participantes ('p'). Antes só marcava o pai como 'reply' sem 'root' → respostas
    // encadeadas perdiam a raiz e o clique na notificação abria um fragmento do meio.
    const hint = writeRelays()[0] ?? ''
    const parentE = replyTo.tags.filter((t) => t[0] === 'e' && t[1])
    // Raiz: marcador 'root' do pai → senão 1ª tag e posicional (NIP-10 legado) → senão o
    // próprio pai É a raiz (resposta direta a um post de topo).
    const rootId = parentE.find((t) => t[3] === 'root')?.[1] ?? parentE[0]?.[1] ?? replyTo.id
    if (rootId === replyTo.id) {
      tags.push(['e', rootId, hint, 'root'])
    } else {
      tags.push(['e', rootId, hint, 'root'])
      tags.push(['e', replyTo.id, hint, 'reply'])
    }
    // p-chain: participantes herdados do pai + autor do pai (dedup).
    const ps = new Set<string>()
    replyTo.tags.filter((t) => t[0] === 'p' && t[1]).forEach((t) => ps.add(t[1]))
    ps.add(replyTo.pubkey)
    ps.forEach((pk) => tags.push(['p', pk]))
  }
  let body = content.trim()
  if (opts?.quoteOf) {
    // Citação NIP-18: tag `q` + menção `nostr:nevent…` no corpo (todos os clientes
    // renderizam a nota citada a partir do nevent).
    const q = opts.quoteOf
    const hint = writeRelays()[0] ?? ''
    tags.push(['q', q.id, hint, q.pubkey])
    tags.push(['p', q.pubkey])
    const nevent = nip19.neventEncode({ id: q.id, author: q.pubkey, relays: hint ? [hint] : [] })
    body = `${body}\n\nnostr:${nevent}`.trim()
  }
  if (opts?.contentWarning) tags.push(['content-warning', '']) // NIP-36 (NSFW)
  tags.push(...customEmojiTagsFor(body)) // NIP-30: emoji custom usados no texto (:code: → tag)
  const ev = await signer.signEvent({
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: body,
  })
  // Força a publicação nos relays de ESCRITA do usuário (os nossos, por padrão).
  await relayManager.publish(ev, writeRelays())
  // Push social (app fechado): avisa quem foi respondido/citado. Fire-and-forget.
  if (replyTo) notifySocial(replyTo.pubkey, 'reply')
  if (opts?.quoteOf) notifySocial(opts.quoteOf.pubkey, 'mention')
  return ev as FeedEvent
}
