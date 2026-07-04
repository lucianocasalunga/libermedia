// Follow/unfollow via lista de contatos NIP-02 (kind:3). Busca a lista atual,
// preserva o content (metadados de relay legados) e republica com a p-tag
// adicionada/removida.
import { relayManager } from './relay-manager'
import { readRelays, writeRelays } from './relays'
import type { Signer } from './signer'


export interface ContactList {
  follows: string[]
  content: string
}

export async function fetchContactList(myHex: string): Promise<ContactList> {
  const evs = await relayManager.query([{ kinds: [3], authors: [myHex], limit: 1 }], {
    relays: readRelays(),
    maxWait: 4000,
  })
  const latest = evs.sort((a, b) => b.created_at - a.created_at)[0]
  if (!latest) return { follows: [], content: '' }
  return {
    follows: latest.tags.filter((t) => t[0] === 'p' && t[1]).map((t) => t[1]),
    content: latest.content || '',
  }
}

export async function publishContactList(
  signer: Signer,
  follows: string[],
  content: string,
): Promise<void> {
  const tags = [...new Set(follows)].map((pk) => ['p', pk])
  const ev = await signer.signEvent({
    kind: 3,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  })
  await relayManager.publish(ev, writeRelays())
}
