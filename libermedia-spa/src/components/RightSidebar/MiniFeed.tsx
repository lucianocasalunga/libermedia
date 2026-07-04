// Mini feed da sidebar direita. Posts do relay+filtro selecionados, compactos e
// CLICÁVEIS → abrem no thread da página central. Driven por {relay, query}.
import { useNavigate } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { Avatar } from '../Avatar/Avatar'
import { relativeTime } from '../../lib/time'
import { isNsfwEvent, nsfwFilterActive } from '../../services/nsfw'
import { UserName } from '../UserName/UserName'
import { useMiniFeed, type MiniQuery } from '../../hooks/useMiniFeed'
import { openThread } from '../../lib/radar-links'

function snippet(content: string): string {
  return content
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
}

function shortNpub(hex: string): string {
  try {
    return nip19.npubEncode(hex).slice(0, 10) + '…'
  } catch {
    return hex.slice(0, 8) + '…'
  }
}

export function MiniFeed({ relay, query }: { relay: string; query: MiniQuery }) {
  const navigate = useNavigate()
  const { events, profiles, loading } = useMiniFeed(relay, query)

  return (
    <section className="lm-minifeed">
      {loading ? (
        <div className="space-y-2 py-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-full rounded bg-[var(--lm-bg-input)]" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-xs text-[var(--lm-text-muted)]">Nada por aqui ainda.</p>
      ) : (
        <div className="lm-minifeed-list">
          {events.map((ev) => {
            const p = profiles[ev.pubkey]
            const name = p?.display_name?.trim() || p?.name?.trim() || shortNpub(ev.pubkey)
            // Filtro off + NSFW → esconde o snippet (clica → abre na thread, com canvas).
            const locked = !nsfwFilterActive() && isNsfwEvent(ev)
            return (
              <button
                key={ev.id}
                type="button"
                onClick={() => openThread(navigate, ev.id)}
                className="lm-minifeed-item"
              >
                <Avatar src={p?.picture} name={name} seed={ev.pubkey} size={28} />
                <span className="lm-minifeed-body">
                  <span className="lm-minifeed-head">
                    <UserName hex={ev.pubkey} fallback={name} className="lm-minifeed-name" />
                    <span className="lm-minifeed-time">{relativeTime(ev.created_at)}</span>
                  </span>
                  <span className="lm-minifeed-text">
                    {locked ? '🔞 Conteúdo sensível' : snippet(ev.content)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
