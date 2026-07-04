// Barra de ações do Reels (lateral direita, estilo TikTok), de cima pra baixo:
//   avatar + seguir (kind:3) · curtir ❤️ (kind:7 + coraçõezinhos) · zap ⚡ (modal) ·
//   comentar (modal) · favoritar ⭐ (kind:10003) · repostar 🔁 (kind:6, sem modal).
// Ícones enxutos (28px / stroke 1.5) p/ não pesar sobre o vídeo. Feedback via toast +
// efeito visual no próprio ícone. Reaproveita toda a infra existente do SPA.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { useSetAtom } from 'jotai'
import { useAuth } from '../../providers/AuthProvider'
import { useFollow } from '../../hooks/useFollow'
import { useProfileCache } from '../../services/profiles'
import { useIsBookmarked, toggleBookmark } from '../../services/bookmarks'
import { repost } from '../../services/reactions'
import { requireSigner } from '../../services/require-signer'
import { composeAtom } from '../../state/compose'
import { ZapModal } from '../ZapModal/ZapModal'
import { FavoritosIcon } from '../icons'
import { toast } from '../../lib/toast'
import type { ReelItem } from '../../services/reels'
import type { FeedEvent } from '../../types/nostr'

const ICON = 28 // tamanho padrão dos ícones (antes 32–34: ficavam "gordos" sobre o vídeo)
const SW = 1.5 // espessura do traço — fina e elegante

export function ReelActions({
  item,
  reelEvent,
  liked,
  onLike,
}: {
  item: ReelItem
  reelEvent: FeedEvent | null
  liked: boolean
  onLike: (x: number, y: number) => void
}) {
  const { npub, loggedIn } = useAuth()
  const navigate = useNavigate()
  const authorHex = item.author_pubkey
  const goProfile = () => {
    let n = authorHex
    try { n = nip19.npubEncode(authorHex) } catch { /* hex como fallback */ }
    navigate(`/perfil/${n}`)
  }
  const profile = useProfileCache(authorHex)
  const { following, isOwn, toggle: toggleFollow } = useFollow(authorHex)
  const bookmarked = useIsBookmarked(item.event_id)

  const [reposted, setReposted] = useState(false)
  const [repostFx, setRepostFx] = useState(false) // overlay central "Repostado"
  const [busy, setBusy] = useState(false)
  const [zapOpen, setZapOpen] = useState(false)
  const setCompose = useSetAtom(composeAtom)

  const avatar = profile?.picture
  const initial = (profile?.display_name || profile?.name || '?').trim().charAt(0).toUpperCase()

  // Like agora é fonte ÚNICA no Slide (compartilhado com o duplo-toque no vídeo).
  const handleLike = (e: React.MouseEvent) => onLike(e.clientX, e.clientY)

  const handleZap = () => {
    if (!reelEvent) {
      toast('Aguarde o vídeo carregar', 'info')
      return
    }
    setZapOpen(true)
  }

  const handleComment = () => {
    if (!reelEvent) return
    setCompose({ open: true, replyTo: reelEvent })
  }

  const handleBookmark = async () => {
    if (busy) return
    setBusy(true)
    const willAdd = !bookmarked
    try {
      const signer = await requireSigner(npub)
      if (!signer) throw new Error('sem signer')
      await toggleBookmark(signer, item.event_id, authorHex)
      toast(willAdd ? 'Adicionado aos favoritos ⭐' : 'Removido dos favoritos', 'success')
    } catch {
      toast('Não foi possível favoritar', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleRepost = async () => {
    if (reposted) return
    if (!reelEvent) {
      toast('Aguarde o vídeo carregar', 'info')
      return
    }
    setReposted(true) // otimista + ícone verde
    try {
      const signer = await requireSigner(npub)
      if (!signer) throw new Error('sem signer')
      await repost(signer, reelEvent)
      setRepostFx(true) // efeito de confirmação (some sozinho)
      window.setTimeout(() => setRepostFx(false), 1400)
      toast('Repostado ✓', 'success')
    } catch {
      setReposted(false)
      toast('Não foi possível repostar', 'error')
    }
  }

  const btn = 'flex flex-col items-center text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]'

  return (
    <div className="absolute bottom-28 right-3 z-20 flex flex-col items-center gap-4">
      {/* Avatar (→ perfil) + seguir */}
      <div className="relative mb-1">
        <div
          role="button"
          tabIndex={0}
          onClick={goProfile}
          aria-label="Abrir perfil"
          className="h-11 w-11 cursor-pointer overflow-hidden rounded-full border-2 border-white/90 bg-neutral-700"
        >
          {avatar ? (
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-lg font-bold text-white">
              {initial}
            </span>
          )}
        </div>
        {loggedIn && !isOwn && !following && (
          <button
            type="button"
            onClick={toggleFollow}
            aria-label="Seguir"
            className="absolute -bottom-2 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-[#ff2d55] text-white"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3">
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>

      {/* Curtir */}
      <button type="button" onClick={handleLike} className={btn} aria-label="Curtir">
        <svg viewBox="0 0 24 24" width={ICON} height={ICON} fill={liked ? '#ff2d55' : 'none'} stroke={liked ? '#ff2d55' : 'currentColor'} strokeWidth={SW}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      </button>

      {/* Zap (abre o ZapModal) */}
      <button type="button" onClick={handleZap} className={btn} aria-label="Zap">
        <svg viewBox="0 0 24 24" width={ICON} height={ICON} fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      </button>

      {/* Comentar (modal sobre o vídeo) */}
      <button type="button" onClick={handleComment} className={btn} aria-label="Comentar" disabled={!reelEvent}>
        <svg viewBox="0 0 24 24" width={ICON} height={ICON} fill="none" stroke="currentColor" strokeWidth={SW}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.84L3 20l1.4-3.5A7.9 7.9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>

      {/* Favoritar */}
      <button type="button" onClick={handleBookmark} className={btn} aria-label="Favoritar" disabled={busy}>
        <FavoritosIcon width={ICON} height={ICON} fill={bookmarked ? 'currentColor' : 'none'} />
      </button>

      {/* Repostar direto (sem modal) */}
      <button type="button" onClick={handleRepost} className={btn} aria-label="Repostar">
        <svg
          viewBox="0 0 24 24"
          width={ICON}
          height={ICON}
          fill="none"
          stroke={reposted ? '#22c55e' : 'currentColor'}
          strokeWidth={SW}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={reposted ? 'scale-110 transition-transform' : 'transition-transform'}
        >
          <path d="m17 2 4 4-4 4" />
          <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
          <path d="m7 22-4-4 4-4" />
          <path d="M21 13v1a4 4 0 0 1-4 4H3" />
        </svg>
      </button>

      {/* Efeito de confirmação de repost — overlay central que aparece e some. */}
      {repostFx && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
          <div className="lm-repost-fx flex items-center gap-2 rounded-full bg-black/70 px-5 py-3 text-white">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#22c55e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14m-14 16-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3" />
            </svg>
            <span className="text-sm font-bold">Repostado</span>
          </div>
        </div>
      )}

      {/* ZapModal — só com o evento carregado. profiles: mapa mínimo do autor. */}
      {zapOpen && reelEvent && (
        <ZapModal
          event={reelEvent}
          profiles={profile ? { [authorHex]: { ...profile, pubkey: authorHex } } : {}}
          onClose={() => setZapOpen(false)}
        />
      )}
    </div>
  )
}
