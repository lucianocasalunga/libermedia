// Post agendado (publicar-depois). O cliente assina o kind:1 JÁ com
// created_at = hora agendada (assim, quando o servidor publicar, ele entra na
// posição certa do feed). Manda o evento assinado + a hora pro backend, que
// guarda e publica na hora marcada. O servidor nunca vê a nsec.
import { api } from './api'
import type { Signer } from './signer'
import type { FeedEvent } from '../types/nostr'

export async function schedulePost(
  signer: Signer,
  content: string,
  scheduledAt: number, // unix seconds (futuro)
  opts?: { contentWarning?: boolean; replyTo?: FeedEvent | null },
): Promise<void> {
  const tags: string[][] = []
  if (opts?.replyTo) {
    tags.push(['e', opts.replyTo.id, '', 'reply'])
    tags.push(['p', opts.replyTo.pubkey])
  }
  if (opts?.contentWarning) tags.push(['content-warning', ''])
  const ev = await signer.signEvent({
    kind: 1,
    created_at: scheduledAt,
    tags,
    content: content.trim(),
  })
  await api.post('/api/scheduled', { event: ev, scheduled_at: scheduledAt })
}
