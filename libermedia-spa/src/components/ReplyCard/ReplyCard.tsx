// Card de resposta LEVE (thread inline estilo YouTube). Só o essencial — avatar, nome,
// tempo, texto (parseContent), no máx 1 imagem pequena, like e responder. SEM mídia pesada,
// zap, repost, menu (isso fica no PostCard completo, na página /thread). React.memo p/ não
// re-renderizar a árvore inteira.
import { memo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { Avatar } from '../Avatar/Avatar'
import { UserName } from '../UserName/UserName'
import { parseContent, emojiTagMap } from '../../lib/content-parser'
import { useCustomEmojiVersion } from '../../services/custom-emoji'
import { relativeTime } from '../../lib/time'
import { formatCount } from '../../lib/format'
import { requireSigner } from '../../services/require-signer'
import { like as doLike } from '../../services/reactions'
import { useAuth } from '../../providers/AuthProvider'
import { MediaViewer } from '../MediaViewer/MediaViewer'
import { safeImageUrl } from '../../lib/safe-url'
import type { FeedEvent, ProfileMap } from '../../types/nostr'
import type { PostStats } from '../../services/stats'

function ReplyCardBase({
  event,
  profiles,
  stats,
}: {
  event: FeedEvent
  profiles: ProfileMap
  stats?: PostStats
}) {
  const navigate = useNavigate()
  const { npub: myNpub } = useAuth()
  const prof = profiles[event.pubkey]
  const npub = (() => {
    try {
      return nip19.npubEncode(event.pubkey)
    } catch {
      return event.pubkey
    }
  })()
  const name = prof?.display_name?.trim() || prof?.name?.trim() || `${npub.slice(0, 10)}…`
  useCustomEmojiVersion() // re-render quando o mapa de emoji custom carrega (async)
  const { body, media } = parseContent(
    event.content || '',
    (hex) => profiles[hex]?.display_name?.trim() || profiles[hex]?.name?.trim(),
    emojiTagMap(event.tags), // NIP-30: emoji custom da resposta (tag + mapa de packs)
  )
  const img = media.find((m) => m.type === 'image')
  // likedByMe: derivado do bundle/fetchStats (mineEmoji) → o coração NÃO nasce branco ao
  // voltar na thread, e o guard impede curtir de novo (kind:7 duplicado).
  const iReacted = stats?.mineEmoji != null
  const [optimistic, setOptimistic] = useState(false)
  const [imgBroken, setImgBroken] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const liked = optimistic || iReacted
  // +1 só enquanto o servidor ainda não me conta (evita dobrar quando o stats atualiza).
  const likeCount = (stats?.likes ?? 0) + (optimistic && !iReacted ? 1 : 0)

  async function onLike() {
    if (liked) return
    setOptimistic(true)
    try {
      const signer = await requireSigner(myNpub)
      if (!signer) throw new Error('sem assinador')
      await doLike(signer, event)
    } catch {
      setOptimistic(false)
    }
  }

  return (
    <div className="-mx-1 flex gap-2 rounded-lg px-1 py-2 transition-colors hover:bg-[var(--lm-bg-card)]">
      <Link to={`/perfil/${npub}`} className="flex-shrink-0">
        <Avatar src={prof?.picture} name={name} seed={event.pubkey} size={28} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <Link
            to={`/perfil/${npub}`}
            className="truncate text-sm font-semibold text-[var(--lm-text-pri)] hover:underline"
          >
            <UserName hex={event.pubkey} fallback={name} />
          </Link>
          <span className="flex-shrink-0 text-xs text-[var(--lm-text-muted)]">
            · {relativeTime(event.created_at)}
          </span>
        </div>
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--lm-text-pri)]">
          {body}
        </div>
        {img && !imgBroken && safeImageUrl(img.url) && (
          <img
            src={img.url}
            loading="lazy"
            referrerPolicy="no-referrer"
            alt=""
            onClick={() => setViewerOpen(true)}
            onError={() => setImgBroken(true)}
            className="mt-1.5 max-h-44 cursor-pointer rounded-lg object-cover"
          />
        )}
        {viewerOpen && img && (
          <MediaViewer
            items={[{ id: 0, name: '', mime_type: 'image/feed', url: img.url }]}
            index={0}
            onClose={() => setViewerOpen(false)}
            onIndex={() => {}}
          />
        )}
        <div className="mt-1 flex items-center gap-4 text-xs text-[var(--lm-text-muted)]">
          <button
            type="button"
            onClick={onLike}
            className={`flex items-center gap-1 hover:text-[var(--lm-accent)] ${liked ? 'text-[var(--lm-accent)]' : ''}`}
            aria-pressed={liked}
            aria-label="Curtir"
          >
            <span>{liked ? '❤️' : '🤍'}</span>
            {formatCount(likeCount) && <span>{formatCount(likeCount)}</span>}
          </button>
          <button
            type="button"
            onClick={() => navigate('/compose', { state: { replyTo: event } })}
            className="font-medium hover:text-[var(--lm-accent)]"
          >
            Responder
          </button>
        </div>
      </div>
    </div>
  )
}

export const ReplyCard = memo(ReplyCardBase)
