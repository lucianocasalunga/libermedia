// Enquetes (NIP-88). Enquete = kind:1068 (pergunta no content + opções nas tags).
// Voto = kind:1018 (['e', pollId] + ['response', optId]). Contagem = somar votos,
// 1 por pubkey (o mais recente vence). Verificável e descentralizado.
import { relayManager } from './relay-manager'
import { writeRelays, readRelays } from './relays'
import type { Signer } from './signer'
import type { FeedEvent } from '../types/nostr'

export const POLL_KIND = 1068
export const VOTE_KIND = 1018

export interface PollOption {
  id: string
  label: string
}
export interface ParsedPoll {
  question: string
  options: PollOption[]
  multi: boolean
  endsAt: number | null // unix seconds
}

export interface PollTally {
  counts: Record<string, number> // optId → nº de votos
  total: number
  myVote: string | null // optId votado por mim (se houver)
}

// Extrai a enquete de um evento kind:1068.
export function parsePoll(event: FeedEvent): ParsedPoll {
  const options: PollOption[] = []
  let multi = false
  let endsAt: number | null = null
  for (const t of event.tags) {
    if (t[0] === 'option' && t[1]) options.push({ id: t[1], label: t[2] ?? '' })
    else if (t[0] === 'polltype') multi = t[1] === 'multiplechoice'
    else if (t[0] === 'endsAt' && t[1]) endsAt = Number(t[1]) || null
  }
  return { question: event.content || '', options, multi, endsAt }
}

export function pollEnded(poll: ParsedPoll): boolean {
  return poll.endsAt != null && Date.now() / 1000 > poll.endsAt
}

// Publica a enquete (kind:1068). durationDays=0 → sem expiração.
export async function publishPoll(
  signer: Signer,
  question: string,
  options: string[],
  durationDays: number,
): Promise<FeedEvent> {
  const opts = options.map((o) => o.trim()).filter(Boolean)
  const tags: string[][] = opts.map((label, i) => ['option', String(i), label])
  tags.push(['polltype', 'singlechoice'])
  if (durationDays > 0) {
    tags.push(['endsAt', String(Math.floor(Date.now() / 1000) + durationDays * 86400)])
  }
  for (const r of writeRelays()) tags.push(['relay', r])
  const ev = await signer.signEvent({
    kind: POLL_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: question.trim(),
  })
  await relayManager.publish(ev, writeRelays())
  return ev as FeedEvent
}

// Vota numa opção (kind:1018). Retorna o id do voto.
export async function voteOnPoll(signer: Signer, pollId: string, optionId: string): Promise<string> {
  const ev = await signer.signEvent({
    kind: VOTE_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', pollId],
      ['response', optionId],
    ],
    content: '',
  })
  await relayManager.publish(ev, writeRelays())
  return ev.id
}

// Conta os votos de uma enquete (1 por pubkey, o mais recente). myHex = meu pubkey.
export async function tallyPoll(pollId: string, myHex: string | null): Promise<PollTally> {
  const votes = await relayManager.query([{ kinds: [VOTE_KIND], '#e': [pollId], limit: 1000 }], {
    relays: readRelays(),
    maxWait: 4000,
  })
  // Voto mais recente por pubkey.
  const latest = new Map<string, FeedEvent>()
  for (const v of votes as FeedEvent[]) {
    const prev = latest.get(v.pubkey)
    if (!prev || v.created_at > prev.created_at) latest.set(v.pubkey, v)
  }
  const counts: Record<string, number> = {}
  let myVote: string | null = null
  for (const [pk, v] of latest) {
    const opt = v.tags.find((t) => t[0] === 'response')?.[1]
    if (!opt) continue
    counts[opt] = (counts[opt] || 0) + 1
    if (myHex && pk === myHex) myVote = opt
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return { counts, total, myVote }
}
