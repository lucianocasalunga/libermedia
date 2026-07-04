// Renderiza uma enquete (kind:1068, NIP-88) no feed/thread: pergunta + opções.
// Antes de votar/encerrar → botões de voto. Depois → barras de % com a contagem.
// Voto assina kind:1018. Resultado ao vivo (tallyPoll). Otimista.
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../providers/AuthProvider'
import { requireSigner } from '../../services/require-signer'
import {
  parsePoll,
  pollEnded,
  tallyPoll,
  voteOnPoll,
  type PollTally,
} from '../../services/poll'
import type { FeedEvent } from '../../types/nostr'
import './poll-view.css'

function fmtRemaining(endsAt: number): string {
  const s = endsAt - Math.floor(Date.now() / 1000)
  if (s <= 0) return 'agora'
  const d = Math.floor(s / 86400)
  if (d > 0) return `em ${d}d`
  const h = Math.floor(s / 3600)
  if (h > 0) return `em ${h}h`
  return `em ${Math.max(1, Math.floor(s / 60))}min`
}

export function PollView({ event }: { event: FeedEvent }) {
  const { npub, pubkeyHex } = useAuth()
  const poll = parsePoll(event)
  const [tally, setTally] = useState<PollTally>({ counts: {}, total: 0, myVote: null })
  const [busy, setBusy] = useState<string | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    void tallyPoll(event.id, pubkeyHex).then((t) => {
      if (alive.current) setTally(t)
    })
    return () => {
      alive.current = false
    }
  }, [event.id, pubkeyHex])

  const ended = pollEnded(poll)
  const showResults = ended || tally.myVote != null

  async function vote(optId: string) {
    if (busy || ended || tally.myVote != null) return
    setBusy(optId)
    // Otimista
    setTally((t) => ({
      counts: { ...t.counts, [optId]: (t.counts[optId] || 0) + 1 },
      total: t.total + 1,
      myVote: optId,
    }))
    try {
      const signer = await requireSigner(npub)
      if (!signer) throw new Error('sem signer')
      await voteOnPoll(signer, event.id, optId)
      // Reconfere com a rede (pega votos de outros também).
      const fresh = await tallyPoll(event.id, pubkeyHex)
      if (alive.current) setTally(fresh)
    } catch {
      // Reverte
      setTally((t) => ({
        counts: { ...t.counts, [optId]: Math.max(0, (t.counts[optId] || 1) - 1) },
        total: Math.max(0, t.total - 1),
        myVote: null,
      }))
    } finally {
      if (alive.current) setBusy(null)
    }
  }

  return (
    <div className="lm-poll" onClick={(e) => e.stopPropagation()}>
      {poll.question && <div className="lm-poll-q">{poll.question}</div>}

      <div className="lm-poll-options">
        {poll.options.map((opt) => {
          const count = tally.counts[opt.id] || 0
          const pct = tally.total > 0 ? Math.round((count / tally.total) * 100) : 0
          const mine = tally.myVote === opt.id
          if (showResults) {
            return (
              <div key={opt.id} className={`lm-poll-result${mine ? ' is-mine' : ''}`}>
                <div className="lm-poll-bar" style={{ width: `${pct}%` }} />
                <div className="lm-poll-result-row">
                  <span className="lm-poll-label">
                    {mine && '✓ '}
                    {opt.label}
                  </span>
                  <span className="lm-poll-pct">{pct}%</span>
                </div>
              </div>
            )
          }
          return (
            <button
              key={opt.id}
              type="button"
              className="lm-poll-vote"
              disabled={busy != null}
              onClick={() => vote(opt.id)}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      <div className="lm-poll-foot">
        {tally.total} {tally.total === 1 ? 'voto' : 'votos'}
        {poll.endsAt != null && (
          <span> · {ended ? 'encerrada' : `encerra ${fmtRemaining(poll.endsAt)}`}</span>
        )}
      </div>
    </div>
  )
}
