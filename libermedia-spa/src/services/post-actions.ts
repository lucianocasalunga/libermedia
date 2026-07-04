// Ações do menu do post que ASSINAM evento: deletar (kind:5), denunciar (kind:1984
// NIP-56), republicar (reenvia o evento a um relay) e marcar NSFW (delete + repost
// com content-warning). Cada uma assina com o signer e publica nos relays.
import { relayManager } from './relay-manager'
import { writeRelays } from './relays'
import { api } from './api'
import type { VerifiedEvent } from 'nostr-tools'
import type { Signer } from './signer'
import type { FeedEvent } from '../types/nostr'

const nowSec = () => Math.floor(Date.now() / 1000)

/** kind:5 (NIP-09) — pedido de deleção do post. */
export async function deletePost(signer: Signer, id: string): Promise<void> {
  const ev = await signer.signEvent({ kind: 5, created_at: nowSec(), tags: [['e', id]], content: 'deleted' })
  await relayManager.publish(ev, writeRelays())
}

/** kind:1984 (NIP-56) — denúncia. Também avisa o backend (best-effort). */
export async function reportPost(
  signer: Signer,
  event: FeedEvent,
  reason: string,
  details: string,
): Promise<void> {
  void api
    .post('/api/reports', {
      reported_pubkey: event.pubkey,
      event_id: event.id,
      reason,
      details,
    })
    .catch(() => {})
  const ev = await signer.signEvent({
    kind: 1984,
    created_at: nowSec(),
    tags: [
      ['e', event.id, '', reason],
      ['p', event.pubkey, '', reason],
    ],
    content: details || '',
  })
  await relayManager.publish(ev, writeRelays())
}

/** Reenvia o evento (mesmo id) a um relay específico. */
export async function republishToRelay(event: FeedEvent, relayUrl: string): Promise<void> {
  await relayManager.publish(event as unknown as VerifiedEvent, [relayUrl])
}

/** Marca como NSFW: deleta o original e republica com content-warning (NIP-36). */
export async function markNsfw(signer: Signer, event: FeedEvent): Promise<FeedEvent> {
  await deletePost(signer, event.id)
  const tags = [...event.tags.filter((t) => t[0] !== 'content-warning'), ['content-warning', '']]
  const ev = await signer.signEvent({ kind: event.kind, created_at: nowSec(), tags, content: event.content })
  await relayManager.publish(ev, writeRelays())
  return ev as FeedEvent
}
