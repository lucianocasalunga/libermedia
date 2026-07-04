// Card embutido da nota citada (quote repost NIP-18). Busca o evento por id nos
// relays, mostra autor (avatar+nome+badge), trecho do texto E a mídia (imagem/
// vídeo/embed), e leva à thread no clique. Para evitar recursão (citação de
// citação), as refs nostr internas são removidas antes de renderizar o corpo.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { relayManager } from '../../services/relay-manager'
import { useProfileCache } from '../../services/profiles'
import { parseContent, stripMediaUrls, emojiTagMap } from '../../lib/content-parser'
import { useCustomEmojiVersion } from '../../services/custom-emoji'
import { FeedVideo } from '../FeedVideo/FeedVideo'
import { VoicePlayer } from '../VoicePlayer/VoicePlayer'
import { Avatar } from '../Avatar/Avatar'
import { UserName } from '../UserName/UserName'
import type { FeedEvent } from '../../types/nostr'

// Cache de módulo (id → evento|null) — uma busca por nota citada, compartilhada.
const cache = new Map<string, FeedEvent | null>()
const SNIPPET = 280
const NOSTR_REF = /nostr:(note1|nevent1|naddr1)[0-9a-z]+/gi

export function QuotedNote({
  id,
  author,
  relays,
}: {
  id: string
  author?: string
  relays?: string[]
}) {
  const navigate = useNavigate()
  const [ev, setEv] = useState<FeedEvent | null | undefined>(() => cache.get(id))

  useEffect(() => {
    if (cache.has(id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEv(cache.get(id))
      return
    }
    let alive = true
    relayManager
      .query([{ ids: [id] }], { relays: relays?.length ? relays : undefined, maxWait: 4000 })
      .then((res) => {
        const found = (res[0] as FeedEvent) ?? null
        cache.set(id, found)
        if (alive) setEv(found)
      })
      .catch(() => {
        if (alive) setEv(null)
      })
    return () => {
      alive = false
    }
  }, [id, relays])

  const hex = ev?.pubkey ?? author ?? ''
  const prof = useProfileCache(hex || null) // nome/foto do autor (e dispara o fetch)
  useCustomEmojiVersion() // re-render quando o mapa de emoji custom carrega (async)

  const open = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('a')) return // deixa links internos agirem
    navigate(`/thread/${id}`)
  }

  const box =
    'my-2 cursor-pointer rounded-xl border border-[var(--lm-border)] p-3 transition hover:bg-[var(--lm-bg-card)]'

  if (ev === undefined) {
    return <div className={`${box} text-sm text-[var(--lm-text-muted)]`}>Carregando nota…</div>
  }
  if (ev === null) {
    return (
      <div className={`${box} text-sm text-[var(--lm-text-muted)]`} onClick={open}>
        Nota indisponível neste relay
      </div>
    )
  }

  // Texto (sem URLs de mídia, truncado) + mídia (extraída do conteúdo completo).
  const full = (ev.content || '').replace(NOSTR_REF, '')
  const textOnly = stripMediaUrls(full).trim()
  const snippet = textOnly.length > SNIPPET ? textOnly.slice(0, SNIPPET) + '…' : textOnly
  // NIP-30: emoji custom da nota citada (tag do evento + mapa de packs carregado).
  const customEmoji = emojiTagMap(ev.tags)
  const { body } = parseContent(snippet, undefined, customEmoji)
  const media = parseContent(full).media.slice(0, 4)
  const avatarName = prof?.display_name?.trim() || prof?.name?.trim() || undefined

  return (
    <div className={box} onClick={open}>
      <div className="mb-1 flex items-center gap-2">
        <Avatar src={prof?.picture} name={avatarName} seed={ev.pubkey} size={20} />
        <UserName hex={ev.pubkey} fallback={avatarName} className="text-sm font-semibold" />
      </div>

      {snippet && (
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--lm-text-pri)]">
          {body}
        </div>
      )}

      {/* Mídia da nota citada — clicar no player não navega (stopPropagation) */}
      {media.length > 0 && (
        <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
          {media.map((m, i) =>
            m.type === 'image' ? (
              <img
                key={i}
                src={m.url}
                loading="lazy"
                referrerPolicy="no-referrer"
                alt=""
                className="max-h-72 w-full rounded-lg object-cover"
              />
            ) : m.type === 'video' ? (
              <FeedVideo key={i} src={m.url} className="max-h-80 w-full rounded-lg bg-black" />
            ) : m.type === 'audio' ? (
              <VoicePlayer key={i} src={m.url} />
            ) : m.provider === 'instagram' ? (
              <div
                key={i}
                className="mx-auto w-full max-w-[360px] aspect-[4/5] overflow-hidden rounded-lg border border-[var(--lm-border)] bg-white"
              >
                <iframe
                  src={m.embedSrc}
                  title="instagram"
                  className="h-full w-full"
                  allow="encrypted-media; picture-in-picture; web-share"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            ) : (
              <div key={i} className="aspect-video w-full overflow-hidden rounded-lg bg-black">
                <iframe
                  src={m.embedSrc}
                  title={m.provider || 'vídeo'}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}
