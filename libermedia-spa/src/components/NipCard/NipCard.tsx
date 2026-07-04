// Card de "NIP da comunidade" (kind:30817 — Custom NIP). Quando alguém compartilha
// um nostr:naddr de kind 30817 no feed, em vez de "[nota]" cru mostramos um card:
// título + autor + um trecho do markdown + os kinds que a NIP define + link p/ ler
// completo (njump). Render LEVE — sem lib de markdown (excerpt em texto plano).
import { useEffect, useState } from 'react'
import { relayManager } from '../../services/relay-manager'
import { useProfileCache } from '../../services/profiles'
import { Avatar } from '../Avatar/Avatar'
import { UserName } from '../UserName/UserName'
import type { FeedEvent } from '../../types/nostr'

const cache = new Map<string, FeedEvent | null>()
const EXCERPT = 280

// Markdown → texto plano p/ prévia (sem renderizar a sintaxe; mantém leve).
function mdExcerpt(md: string, max = EXCERPT): string {
  const t = md
    .replace(/```[\s\S]*?```/g, ' ') // blocos de código
    .replace(/`([^`]+)`/g, '$1') // código inline
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // imagens
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → texto
    .replace(/^[ \t]*[>#-]+[ \t]*/gm, '') // marcadores no início da linha
    .replace(/[*_~`]/g, '') // ênfase
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > max ? t.slice(0, max) + '…' : t
}

export function NipCard({
  naddr,
  kind,
  pubkey,
  identifier,
  relays,
}: {
  naddr: string
  kind: number
  pubkey: string
  identifier: string
  relays?: string[]
}) {
  const cacheKey = `${kind}:${pubkey}:${identifier}`
  const [ev, setEv] = useState<FeedEvent | null | undefined>(() => cache.get(cacheKey))
  const prof = useProfileCache(pubkey || null)

  useEffect(() => {
    if (cache.has(cacheKey)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEv(cache.get(cacheKey))
      return
    }
    let alive = true
    const pool = [
      ...(relays ?? []),
      'wss://relay.nostr.band',
      'wss://nos.lol',
      'wss://relay.primal.net',
      'wss://relay.damus.io',
    ]
    relayManager
      .query([{ kinds: [kind], authors: [pubkey], '#d': [identifier], limit: 1 }], { relays: pool, maxWait: 5000 })
      .then((res) => {
        const found = (res[0] as FeedEvent) ?? null
        cache.set(cacheKey, found)
        if (alive) setEv(found)
      })
      .catch(() => {
        if (alive) setEv(null)
      })
    return () => {
      alive = false
    }
  }, [cacheKey, kind, pubkey, identifier, relays])

  const box = 'my-2 block rounded-xl border border-[var(--lm-border)] p-3'
  const njump = `https://njump.me/${naddr}`

  if (ev === undefined) {
    return <div className={`${box} text-sm text-[var(--lm-text-muted)]`}>Carregando NIP…</div>
  }

  const title = ev?.tags.find((t) => t[0] === 'title')?.[1] || identifier
  const kinds = (ev?.tags.filter((t) => t[0] === 'k' && t[1]) ?? []).slice(0, 4)
  const excerpt = ev ? mdExcerpt(ev.content || '') : ''
  const avatarName = prof?.display_name?.trim() || prof?.name?.trim() || undefined

  return (
    <div className={box}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="rounded-full bg-[var(--lm-bg-input)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[var(--lm-text-muted)]">
          📄 NIP da comunidade
        </span>
        {kinds.map((k, i) => (
          <span key={i} className="rounded-full bg-[var(--lm-bg-input)] px-2 py-0.5 text-[11px] text-[var(--lm-text-muted)]">
            kind {k[1]}{k[2] ? ` · ${k[2]}` : ''}
          </span>
        ))}
      </div>

      <p className="text-base font-bold text-[var(--lm-text-pri)]">{title}</p>

      <div className="mt-1 flex items-center gap-2">
        <Avatar src={prof?.picture} name={avatarName} seed={pubkey} size={18} />
        <UserName hex={pubkey} fallback={avatarName} className="text-xs font-semibold text-[var(--lm-text-sec)]" />
      </div>

      {ev === null ? (
        <p className="mt-2 text-sm text-[var(--lm-text-muted)]">Conteúdo indisponível nos relays públicos.</p>
      ) : (
        excerpt && (
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--lm-text-pri)]">
            {excerpt}
          </p>
        )
      )}

      <a
        href={njump}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="mt-2 inline-block text-sm font-semibold text-[var(--lm-accent)] hover:underline"
      >
        Ler completo ↗
      </a>
    </div>
  )
}
