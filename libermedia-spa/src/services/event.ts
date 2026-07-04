// Eventos de calendário (NIP-52). kind:31922 = evento baseado em data/hora.
// Espelha o /evento do MPA: tags d/title/start/end/location/image/summary/t.
import { nip19 } from 'nostr-tools'
import { relayManager } from './relay-manager'
import { writeRelays } from './relays'
import type { Signer } from './signer'
import type { FeedEvent } from '../types/nostr'

export const EVENT_KIND = 31922

export interface CalendarEventInput {
  title: string
  summary?: string
  start: number // unix seconds (obrigatório)
  end?: number | null
  location?: string
  image?: string
  hashtags?: string[]
}

function randId(): string {
  // sem Math.random proibido em workflows; no browser é permitido.
  return 'evt-' + Math.random().toString(36).slice(2, 10)
}

export async function publishCalendarEvent(
  signer: Signer,
  input: CalendarEventInput,
): Promise<{ event: FeedEvent; naddr: string }> {
  const dTag = randId()
  const tags: string[][] = [
    ['d', dTag],
    ['title', input.title.trim()],
    ['start', String(input.start)],
    ['client', 'LiberMedia'],
  ]
  if (input.summary?.trim()) tags.push(['summary', input.summary.trim()])
  if (input.image) tags.push(['image', input.image])
  if (input.end) tags.push(['end', String(input.end)])
  if (input.location?.trim()) tags.push(['location', input.location.trim()])
  for (const h of input.hashtags ?? []) if (h) tags.push(['t', h.replace(/^#/, '')])

  const ev = await signer.signEvent({
    kind: EVENT_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: (input.summary || input.title).trim(),
  })
  await relayManager.publish(ev, writeRelays())

  let naddr = ''
  try {
    naddr = nip19.naddrEncode({
      kind: EVENT_KIND,
      pubkey: ev.pubkey,
      identifier: dTag,
      relays: writeRelays().slice(0, 2),
    })
  } catch {
    /* naddr opcional */
  }
  return { event: ev as FeedEvent, naddr }
}
