// Ações de post: curtir (kind:7), descurtir (kind:5 deleção NIP-09) e repostar
// (kind:6 NIP-18). Cada uma assina com o signer e publica nos relays.
import { relayManager } from './relay-manager'
import { writeRelays } from './relays'
import { notifySocial } from './push'
import { customEmojiTagsFor } from './custom-emoji'
import type { Signer } from './signer'
import type { FeedEvent } from '../types/nostr'

function template(kind: number, content: string, tags: string[][]) {
  return { kind, created_at: Math.floor(Date.now() / 1000), tags, content }
}

/** kind:7 reação "+". Retorna o id do evento de like (para poder desfazer). */
export async function like(signer: Signer, post: FeedEvent): Promise<string> {
  const ev = await signer.signEvent(
    template(7, '+', [
      ['e', post.id],
      ['p', post.pubkey],
    ]),
  )
  // Publica amplo para propagar e bater com os relays onde lemos os contadores.
  await relayManager.publish(ev, writeRelays())
  notifySocial(post.pubkey, 'reaction') // push p/ o autor (app fechado)
  return ev.id
}

/** kind:7 reação com EMOJI (NIP-25). content = o emoji. Retorna o id (p/ desfazer). */
export async function react(signer: Signer, post: FeedEvent, emoji: string): Promise<string> {
  // NIP-30: se a reação é um emoji custom (:code:), anexa ["emoji",code,url] p/ carregar a
  // imagem (interopera com outros clientes; a pílula renderiza a figura, não o texto cru).
  const ev = await signer.signEvent(
    template(7, emoji, [
      ['e', post.id],
      ['p', post.pubkey],
      ...customEmojiTagsFor(emoji),
    ]),
  )
  await relayManager.publish(ev, writeRelays())
  notifySocial(post.pubkey, 'reaction')
  return ev.id
}

/** kind:5 deleção do evento de like (NIP-09). */
export async function unlike(signer: Signer, likeEventId: string): Promise<void> {
  const ev = await signer.signEvent(template(5, '', [['e', likeEventId]]))
  await relayManager.publish(ev, writeRelays())
}

/** kind:6 repost (NIP-18) — content = evento original serializado (sem o profile). */
export async function repost(signer: Signer, post: FeedEvent): Promise<string> {
  const raw = {
    id: post.id,
    pubkey: post.pubkey,
    created_at: post.created_at,
    kind: post.kind,
    tags: post.tags,
    content: post.content,
    sig: post.sig,
  }
  const ev = await signer.signEvent(
    template(6, JSON.stringify(raw), [
      ['e', post.id],
      ['p', post.pubkey],
    ]),
  )
  await relayManager.publish(ev, writeRelays())
  notifySocial(post.pubkey, 'repost') // push p/ o autor (app fechado)
  return ev.id
}
