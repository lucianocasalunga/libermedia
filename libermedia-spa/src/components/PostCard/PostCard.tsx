// Card de post do feed (kind:1). Header do autor, conteúdo parseado, grade de
// mídia e barra de ações. Incremento 3b: curtir/repostar funcionais com update
// otimista (UI reage na hora, publica em background; reverte se falhar).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { Avatar } from '../Avatar/Avatar'
import { parseContent, emojiTagMap, isEmojiOnlyContent, renderEmojiText, stripMediaUrls, videoKindMedia, VIDEO_KINDS, type MediaItem } from '../../lib/content-parser'
import { useCustomEmojiVersion } from '../../services/custom-emoji'
import { relativeTime } from '../../lib/time'
import { formatCount } from '../../lib/format'
import { useAuth } from '../../providers/AuthProvider'
import { useNsfw } from '../../hooks/useNsfw'
import { isNsfwEvent, nsfwFilterActive, nsfwCategory } from '../../services/nsfw'
import { requireSigner } from '../../services/require-signer'
import { unlike as doUnlike, repost as doRepost, react as doReact } from '../../services/reactions'
import { quickReactions, recordEmoji } from '../../services/emoji'
import { ZapModal } from '../ZapModal/ZapModal'
import { PostMenu } from '../PostMenu/PostMenu'
import { ReactionPicker, type AnchorRect } from '../ReactionPicker/ReactionPicker'
import { RepostModal } from '../RepostModal/RepostModal'
import { useIsBookmarked, toggleBookmark } from '../../services/bookmarks'
import { useProfileCache } from '../../services/profiles'
import { useIsMuted } from '../../services/mutes'
import { useIsBlacklisted } from '../../services/blacklist'
import { isSpamEvent } from '../../services/spam'
import { WOT_SHADOW, isWotOperator, useWotScore, useWotShowScore, wotApplyActive, WOT_HIDE_BELOW } from '../../services/wot'
import { WotBadge } from '../WotBadge'
import { useIsHidden } from '../../lib/hidden-posts'
import { PollView } from '../PollView/PollView'
import { NsfwOverlay } from '../NsfwOverlay/NsfwOverlay'
import { TopSecretMedia } from '../TopSecretMedia/TopSecretMedia'
import { LinkPreview } from '../LinkPreview/LinkPreview'
import { MediaViewer } from '../MediaViewer/MediaViewer'
import { InlineThread } from '../InlineThread/InlineThread'
import { useInlineThread, invalidateThread } from '../../hooks/useInlineThread'
import { feedBus } from '../../lib/feed-bus'
import { FeedVideo } from '../FeedVideo/FeedVideo'
import { UserName } from '../UserName/UserName'
import { POLL_KIND } from '../../services/poll'
import { translateText } from '../../services/translate'
import { VoicePlayer } from '../VoicePlayer/VoicePlayer'
import type { PostStats } from '../../services/stats'
import type { FeedEvent, ProfileMap } from '../../types/nostr'
import './post-card.css'

// Truncamento progressivo do texto do post (contagem de caractere).
const LIMIT_1 = 400 // visível de cara
const LIMIT_2 = 1400 // após "mais…" (400 + 1000)

function npubOf(hex: string): string {
  try {
    return nip19.npubEncode(hex)
  } catch {
    return hex
  }
}

function MediaGrid({ media, gated = false }: { media: MediaItem[]; gated?: boolean }) {
  // Imagens que falharam ao carregar (host morto/bloqueado/404) — escondidas em vez de
  // mostrar o ícone de imagem quebrada. Numa rede aberta sempre haverá links de imagem mortos.
  const [broken, setBroken] = useState<ReadonlySet<number>>(() => new Set())
  const [viewerIdx, setViewerIdx] = useState<number | null>(null)
  if (media.length === 0) return null
  const embeds = media.filter((m) => m.type === 'embed')
  const audios = media.filter((m) => m.type === 'audio') // player horizontal, fora do grid
  const rest = media.filter((m) => m.type !== 'embed' && m.type !== 'audio')
  // Itens p/ o lightbox in-app (abrir no feed, não em nova aba). Inclui imagens E vídeos do
  // post → dá pra deslizar entre eles dentro do visualizador.
  const viewerItems = rest.map((m, i) => ({
    id: i,
    name: '',
    mime_type: m.type === 'video' ? 'video/feed' : 'image/feed',
    url: m.url,
  }))
  // Quantas células ainda aparecem (vídeo sempre conta; imagem só se não quebrou).
  const visibleCount = rest.reduce(
    (n, m, i) => n + (m.type === 'image' && broken.has(i) ? 0 : 1),
    0,
  )
  return (
    <>
      {/* Players. YouTube/Vimeo/Facebook = largura cheia 16:9. Instagram = card
          vertical centrado (o embed do IG é retrato + cabeçalho/rodapé). */}
      {embeds.map((m, i) =>
        m.provider === 'instagram' ? (
          <div
            key={`e${i}`}
            className="mt-2.5 mx-auto w-full max-w-[400px] aspect-[4/5] overflow-hidden rounded-xl border border-[var(--lm-border)] bg-white"
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
          <div key={`e${i}`} className="-mx-4 mt-2.5 aspect-video overflow-hidden bg-black">
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
      {/* Imagens/vídeos diretos — grade. Esconde o grid inteiro se nada visível sobrar. */}
      {visibleCount > 0 && (
        <div className={`lm-media-grid count-${Math.min(visibleCount, 4)}`}>
          {rest.map((m, i) =>
            m.type === 'image' ? (
              broken.has(i) ? null : (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  className="lm-media-cell cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    setViewerIdx(i)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation()
                      setViewerIdx(i)
                    }
                  }}
                >
                  <img
                    src={m.url}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    alt=""
                    onError={() => setBroken((s) => new Set(s).add(i))}
                  />
                </div>
              )
            ) : (
              <FeedVideo key={i} className="lm-media-cell" src={m.url} gated={gated} />
            ),
          )}
        </div>
      )}
      {/* Áudio (.mp3/.m4a/.opus…) → player CUSTOM, largura cheia (antes virava link azul morto). */}
      {audios.map((m, i) => (
        <div key={`aud-${i}`} className="mt-1" onClick={(e) => e.stopPropagation()}>
          <VoicePlayer src={m.url} />
        </div>
      ))}
      {viewerIdx != null && viewerItems[viewerIdx] && (
        <MediaViewer
          items={viewerItems}
          index={viewerIdx}
          onClose={() => setViewerIdx(null)}
          onIndex={setViewerIdx}
        />
      )}
    </>
  )
}

function ActionBar({
  event,
  profiles,
  stats,
}: {
  event: FeedEvent
  profiles: ProfileMap
  stats?: PostStats
}) {
  const { npub, pubkeyHex } = useAuth()
  const navigate = useNavigate()
  const bookmarked = useIsBookmarked(event.id)
  const bmBusy = useRef(false)
  const [reposted, setReposted] = useState(false)
  const [repostDelta, setRepostDelta] = useState(0)
  const [repostOpen, setRepostOpen] = useState(false)
  const [showZap, setShowZap] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [anchor, setAnchor] = useState<AnchorRect | null>(null)
  const [myEmoji, setMyEmoji] = useState<string | null>(null)
  const [reactDelta, setReactDelta] = useState<Record<string, number>>({})
  const myReactIdRef = useRef<string | null>(null)
  const likeBtnRef = useRef<HTMLButtonElement>(null)
  const busy = useRef(false)
  // Semeia MINHA reação a partir do stats (bundle/fetchStats) → o coração não nasce branco
  // ao reabrir e não deixa reagir duplicado. Não sobrescreve se o usuário já mexeu nesta sessão.
  const touchedRef = useRef(false)
  useEffect(() => {
    if (touchedRef.current) return
    if (stats?.mineEmoji) {
      setMyEmoji(stats.mineEmoji)
      myReactIdRef.current = stats.mineId ?? null
    }
  }, [stats?.mineEmoji, stats?.mineId])

  function openPicker() {
    const r = likeBtnRef.current?.getBoundingClientRect()
    setAnchor(r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null)
    setPickerOpen(true)
  }

  const repostCount = (stats?.reposts ?? 0) + repostDelta
  const quick = useMemo(() => {
    void pickerOpen // recomputa os 5 sugeridos a cada abertura do seletor
    return quickReactions(5)
  }, [pickerOpen])

  // Reações agregadas do post (servidor) + ajuste otimista local, top 8.
  const merged: Record<string, number> = { ...(stats?.reactions ?? {}) }
  for (const [em, d] of Object.entries(reactDelta)) merged[em] = (merged[em] || 0) + d
  const reactionEntries = Object.entries(merged)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  function bumpDelta(emoji: string, d: number) {
    setReactDelta((m) => ({ ...m, [emoji]: (m[emoji] || 0) + d }))
  }

  // Reagir com um emoji (NIP-25). Toggle (mesmo emoji = desfaz) / troca (outro =
  // remove o anterior e põe o novo). Otimista, com revert em falha.
  async function onPick(emoji: string) {
    setPickerOpen(false)
    touchedRef.current = true // usuário decidiu → o seed do stats não sobrescreve mais
    if (busy.current) return
    busy.current = true
    const prevEmoji = myEmoji
    const prevId = myReactIdRef.current
    if (prevEmoji === emoji) {
      bumpDelta(emoji, -1)
      setMyEmoji(null)
    } else {
      if (prevEmoji) bumpDelta(prevEmoji, -1)
      bumpDelta(emoji, 1)
      setMyEmoji(emoji)
      recordEmoji(emoji)
    }
    try {
      const signer = await requireSigner(npub)
      if (!signer) throw new Error('sem signer')
      if (prevEmoji === emoji) {
        if (prevId) await doUnlike(signer, prevId)
        myReactIdRef.current = null
      } else {
        if (prevId) await doUnlike(signer, prevId)
        myReactIdRef.current = await doReact(signer, event, emoji)
      }
    } catch {
      if (prevEmoji === emoji) {
        bumpDelta(emoji, 1)
        setMyEmoji(prevEmoji)
      } else {
        bumpDelta(emoji, -1)
        if (prevEmoji) bumpDelta(prevEmoji, 1)
        setMyEmoji(prevEmoji)
      }
      myReactIdRef.current = prevId
    } finally {
      busy.current = false
    }
  }

  async function onRepost() {
    if (busy.current || reposted) return
    busy.current = true
    setReposted(true)
    setRepostDelta((d) => d + 1)
    try {
      const signer = await requireSigner(npub)
      if (!signer) throw new Error('sem signer')
      await doRepost(signer, event)
    } catch {
      setReposted(false)
      setRepostDelta((d) => d - 1)
    } finally {
      busy.current = false
    }
  }

  async function onBookmark() {
    if (bmBusy.current || !pubkeyHex) return
    bmBusy.current = true
    try {
      const signer = await requireSigner(npub)
      if (!signer) return
      await toggleBookmark(signer, event.id, pubkeyHex) // otimista + reverte sozinho
    } catch {
      /* o serviço já reverteu o estado otimista */
    } finally {
      bmBusy.current = false
    }
  }

  return (
    <>
      {/* Reações do post (emoji + número pequeno e sutil) — acima da linha de ações */}
      {reactionEntries.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3.5 pb-1 pt-1.5">
          {reactionEntries.map(([em, c]) => (
            <button
              key={em}
              type="button"
              onClick={() => onPick(em)}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm leading-tight ${
                myEmoji === em
                  ? 'border-[var(--lm-accent)] bg-[color-mix(in_srgb,var(--lm-accent)_14%,transparent)]'
                  : 'border-[var(--lm-border)] hover:bg-[var(--lm-bg-input)]'
              }`}
            >
              <span>{renderEmojiText(em)}</span>
              <span className="text-xs text-[var(--lm-text-muted)]">{c}</span>
            </button>
          ))}
        </div>
      )}

      <div className="lm-action-bar">
      {/* Ordem: Like · Comentário · Repost · Favoritos · Zap */}

      {/* Curtir / Reagir — abre o seletor de emoji (ancorado neste botão) */}
      <button
        ref={likeBtnRef}
        type="button"
        onClick={openPicker}
        className={`lm-action-btn lm-like${myEmoji ? ' active' : ''}`}
        aria-label="Reagir"
        aria-haspopup="menu"
        title="Reagir"
      >
        {myEmoji ? (
          <span className="text-[18px] leading-none">{renderEmojiText(myEmoji)}</span>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        )}
      </button>

      {/* Comentário — abre o ComposeModal com o post como contexto */}
      <button
        type="button"
        className="lm-action-btn"
        aria-label="Responder"
        title="Responder"
        onClick={() => navigate('/compose', { state: { replyTo: event } })}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.84L3 20l1.4-3.5A7.9 7.9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {formatCount(stats?.replies) && <span className="lm-action-count">{formatCount(stats?.replies)}</span>}
      </button>

      {/* Repostar (Reload) — abre o modal (Repostar direto / Comentar) */}
      <button
        type="button"
        onClick={() => setRepostOpen(true)}
        className={`lm-action-btn lm-repost${reposted ? ' active' : ''}`}
        aria-label="Repostar"
        aria-pressed={reposted}
        title="Repostar"
      >
        {/* Retweet/repost estilo X (Lucide "repeat") — 2 setas em loop, limpo */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="m17 2 4 4-4 4" />
          <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
          <path d="m7 22-4-4 4-4" />
          <path d="M21 13v1a4 4 0 0 1-4 4H3" />
        </svg>
        {formatCount(repostCount) && <span className="lm-action-count">{formatCount(repostCount)}</span>}
      </button>

      {/* Favoritos (NIP-51 kind:10003) — estrela enche quando favoritado */}
      <button
        type="button"
        onClick={onBookmark}
        className={`lm-action-btn lm-bookmark${bookmarked ? ' active' : ''}`}
        aria-label={bookmarked ? 'Remover dos favoritos' : 'Favoritar'}
        aria-pressed={bookmarked}
        title={bookmarked ? 'Remover dos favoritos' : 'Favoritar'}
      >
        <svg viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
      </button>

      {/* Zap */}
      <button type="button" className="lm-action-btn lm-zap" aria-label="Zap" title="Zap" onClick={() => setShowZap(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        {formatCount(stats?.zaps) && <span className="lm-action-count">{formatCount(stats?.zaps)}</span>}
      </button>
      {showZap && <ZapModal event={event} profiles={profiles} onClose={() => setShowZap(false)} />}
      </div>
      {pickerOpen && (
        <ReactionPicker
          quick={quick}
          current={myEmoji}
          anchor={anchor}
          onPick={onPick}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {repostOpen && (
        <RepostModal
          reposted={reposted}
          onRepost={onRepost}
          onComment={() => navigate('/compose', { state: { quoteOf: event } })}
          onClose={() => setRepostOpen(false)}
        />
      )}
    </>
  )
}

export function PostCard({
  event,
  profiles,
  stats,
  clickable = true,
  inlineReplies = false,
  wotFilter = false,
}: {
  event: FeedEvent
  profiles: ProfileMap
  stats?: PostStats
  clickable?: boolean
  inlineReplies?: boolean
  wotFilter?: boolean
}) {
  const navigate = useNavigate()
  const { pubkeyHex } = useAuth() // p/ o badge WoT (modo sombra), restrito aos operadores
  // Thread inline (estilo YouTube): só no feed (inlineReplies). Busca sob demanda + cache.
  const [threadOpen, setThreadOpen] = useState(false)
  const [replyDelta, setReplyDelta] = useState(0) // +1 quando o usuário responde (feedBus)
  const inline = useInlineThread(event.id, inlineReplies && threadOpen)
  // Ao responder este post (compose emite no feedBus), sobe o contador na hora e invalida o
  // cache da thread (o relay/servidor pega a resposta na próxima carga — cache servidor=5min).
  useEffect(() => {
    if (!inlineReplies) return
    return feedBus.subscribe((post) => {
      if (post.kind === 1 && post.tags?.some((t) => t[0] === 'e' && t[1] === event.id)) {
        setReplyDelta((d) => d + 1)
        invalidateThread(event.id)
      }
    })
  }, [inlineReplies, event.id])
  useNsfw() // re-renderiza quando a lista NSFW carrega
  const muted = useIsMuted(event.pubkey)
  const blacklisted = useIsBlacklisted(event.pubkey)
  const hidden = useIsHidden(event.id)
  const [revealed, setRevealed] = useState(false)
  // WoT Fase 2: score do autor (reativo — sobe quando o anel 2 carrega).
  const wot = useWotScore(event.pubkey)
  const showWotScore = useWotShowScore() // pref do usuário (Configurações): mostrar o selinho
  const [wotRevealed, setWotRevealed] = useState(false)
  const [trans, setTrans] = useState<string | null>(null) // tradução (cache local)
  const [transOn, setTransOn] = useState(false) // mostrando tradução?
  const [translating, setTranslating] = useState(false) // buscando a tradução (spinner)
  const [menuOpen, setMenuOpen] = useState(false)
  const [expand, setExpand] = useState(0) // 0=400 chars · 1=1400 · 2=tudo

  // Re-bloqueia o NSFW ao trocar de página (Layout dispara o evento na navegação).
  useEffect(() => {
    const relock = () => {
      setRevealed(false)
      setWotRevealed(false)
    }
    window.addEventListener('lm:nsfw-relock', relock)
    return () => window.removeEventListener('lm:nsfw-relock', relock)
  }, [])
  // Filtro ATIVO (padrão) → conteúdo +18 é BLOQUEADO de verdade: nem renderiza
  // (vale para todos os feeds — feed, perfil, thread, pesquisa). Filtro desligado
  // → mostra com véu por post (toque em "Mostrar" revela).
  const isNsfw = isNsfwEvent(event)
  const hideNsfw = isNsfw && !revealed
  const isPoll = event.kind === POLL_KIND
  // Avatar/nome do autor: feed local → cache GLOBAL (auto-corrige quando resolve; antes o
  // avatar ficava genérico pra sempre se o bundle veio sem o perfil, mesmo com a foto no
  // localStorage). O UserName já fazia isso; o avatar não.
  const authorCached = useProfileCache(event.pubkey)
  const profile = event.profile ?? profiles[event.pubkey] ?? authorCached
  // Perfil de quem repostou (NIP-18) — busca via cache global se não veio no feed.
  const repostProfile = useProfileCache(event.repostedBy ?? null)

  // "Em resposta a @user" (estilo X/Twitter) — NIP-10: é reply se tem 'e' (marcado
  // "reply", senão o último 'e') e NÃO é repost nem quote ('q'). Autor-pai = último
  // 'p' tag (convenção NIP-10). Mostra no feed e no perfil que aquilo é uma resposta.
  const replyTo = useMemo(() => {
    if (event.repostedBy) return null
    const tags = event.tags || []
    if (tags.some((t) => t[0] === 'q')) return null
    const eTags = tags.filter((t) => t[0] === 'e' && t[1])
    const replyETag = eTags.find((t) => t[3] === 'reply') || (eTags.length ? eTags[eTags.length - 1] : null)
    if (!replyETag) return null
    const pTags = tags.filter((t) => t[0] === 'p' && t[1])
    return { pubkey: pTags.length ? pTags[pTags.length - 1][1] : '', eventId: replyETag[1] }
  }, [event])
  const replyToProfile = useProfileCache(replyTo?.pubkey || null)

  // Clicar no card abre a thread — exceto em links/botões/mídia (que têm sua própria ação).
  function onCardClick(e: React.MouseEvent) {
    if (!clickable) return
    if ((e.target as HTMLElement).closest('a, button, video, input, textarea')) return
    navigate(`/thread/${event.id}`)
  }

  // Tradutor universal: traduz o conteúdo (proxy /api/translate, Google). Toggle
  // original ↔ tradução; cacheia a 1ª tradução.
  async function onTranslate() {
    if (trans) {
      setTransOn((v) => !v)
      return
    }
    if (translating) return
    setTranslating(true) // spinner no ícone → o usuário vê que está traduzindo
    try {
      const lang = localStorage.getItem('libermedia_lang') || 'pt'
      // translateText protege npub/URL/hashtag da tradução (Google só mexe no texto exposto).
      const out = await translateText(event.content, lang)
      if (out) {
        setTrans(out)
        setTransOn(true)
      }
    } catch {
      /* tradução best-effort */
    } finally {
      setTranslating(false)
    }
  }
  const npub = useMemo(() => npubOf(event.pubkey), [event.pubkey])
  const name =
    profile?.display_name?.trim() || profile?.name?.trim() || `${npub.slice(0, 10)}…`

  // Truncamento progressivo por CONTAGEM DE CARACTERE (texto visível, sem URLs de
  // mídia): 400 → "mais…" (até 1400) → "ver tudo" (íntegra). Cada char conta.
  const content = event.content || ''
  // NIP-30: emoji custom declarados nas tags do evento (:shortcode: → imagem no render).
  const customEmoji = useMemo(() => emojiTagMap(event.tags), [event.tags])
  // Reatividade: o mapa de packs (custom-emoji.ts) carrega async pós-login. Sem esta dep,
  // o :shortcode: resolvido pelo mapa (não pela tag) ficaria texto até algum outro re-render.
  const emojiVer = useCustomEmojiVersion()
  const parsed = useMemo(
    () =>
      parseContent(
        content,
        (hex) => {
          const p = profiles[hex]
          return p?.display_name?.trim() || p?.name?.trim()
        },
        customEmoji,
      ),
    [content, profiles, customEmoji, emojiVer],
  )
  // Vídeo NIP-71 (reel kind:21/22/34235/34236) repostado/favoritado: a URL vem das tags,
  // não do conteúdo → injeta como mídia de vídeo pra renderizar (senão ficava em branco).
  const media = useMemo(() => {
    if (VIDEO_KINDS.includes(event.kind)) {
      const vm = videoKindMedia(event.tags || [])
      if (vm.length) return [...vm, ...parsed.media]
    }
    return parsed.media
  }, [parsed.media, event.kind, event.tags])
  const links = parsed.links
  // Conteúdo pago (Top Secret): tag ['ts-file', file_id, preço]. A mídia visível é a thumbnail.
  const tsTag = useMemo(() => event.tags?.find((t) => t[0] === 'ts-file'), [event.tags])
  const tsFileId = tsTag?.[1]
  const tsPrice = Number(tsTag?.[2] || 0)
  const displayText = useMemo(() => stripMediaUrls(content), [content])
  const limit = expand === 0 ? LIMIT_1 : expand === 1 ? LIMIT_2 : Infinity
  const shownText = displayText.length > limit ? displayText.slice(0, limit) : displayText
  const bodyNodes = useMemo(
    () =>
      parseContent(
        shownText,
        (hex) => {
          const p = profiles[hex]
          return p?.display_name?.trim() || p?.name?.trim()
        },
        customEmoji,
      ).body,
    [shownText, profiles, customEmoji, emojiVer],
  )
  // "Sticker" (F4): post que é só emoji (custom/unicode, ≤6) → renderiza grande (Telegram/jumbo).
  const jumbo = useMemo(() => isEmojiOnlyContent(shownText, customEmoji), [shownText, customEmoji, emojiVer])

  // Filtro ATIVO + post +18 → bloqueado de verdade (nem renderiza). Depois de
  // todos os hooks para não violar as regras de hooks. Idem usuário bloqueado
  // (mute NIP-51) e post ocultado nesta sessão (deletado/re-marcado NSFW).
  if (hidden || muted || blacklisted || isSpamEvent(event)) return null
  if (isNsfw && nsfwFilterActive()) return null

  // WoT Fase 2 — autor fora da sua rede de confiança (score < limiar) no feed de
  // DESCOBERTA: COLAPSA com "mostrar mesmo assim" (não some de vez; reversível ao
  // navegar). Só quando wotFilter está ligado (feed/busca) e a aplicação está ativa
  // p/ este usuário (global OU opt-in OU operador). Perfil/thread/favoritos não passam.
  if (wotFilter && !wotRevealed && wotApplyActive(pubkeyHex) && wot.score < WOT_HIDE_BELOW) {
    const p = profiles[event.pubkey]
    const who = p?.display_name?.trim() || p?.name?.trim() || `${event.pubkey.slice(0, 8)}…`
    return (
      <article className="lm-post" style={{ opacity: 0.65 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 14, color: 'var(--lm-text-muted, #8a8f98)' }}>
            🕸️ Fora da sua rede de confiança — {who}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setWotRevealed(true)
            }}
            style={{
              fontSize: 13,
              color: 'var(--lm-accent, #1d9bf0)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Mostrar mesmo assim
          </button>
        </div>
      </article>
    )
  }

  return (
    <article
      className="lm-post"
      onClick={onCardClick}
      style={clickable ? { cursor: 'pointer' } : undefined}
    >
      {/* NIP-18: cabeçalho "🔁 Fulano repostou" quando o card é um repost desembrulhado. */}
      {event.repostedBy && (
        <Link
          to={`/perfil/${npubOf(event.repostedBy)}`}
          onClick={(e) => e.stopPropagation()}
          className="mb-1 flex items-center gap-1.5 pl-1 text-xs font-semibold text-[var(--lm-text-muted)] hover:underline"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />
          </svg>
          {(() => {
            const rp = repostProfile ?? profiles[event.repostedBy]
            const rn = rp?.display_name?.trim() || rp?.name?.trim() || `${npubOf(event.repostedBy).slice(0, 10)}…`
            return `${rn} repostou`
          })()}
        </Link>
      )}
      {/* "Em resposta a @user" (estilo X) — deixa claro que é uma resposta, não um post solto. */}
      {replyTo && (
        <div className="mb-1 flex items-center gap-1.5 pl-1 text-xs text-[var(--lm-text-muted)]">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6M3 10l6-6" />
          </svg>
          <span>Em resposta a</span>
          {replyTo.pubkey ? (
            <Link
              to={`/perfil/${npubOf(replyTo.pubkey)}`}
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-[var(--lm-accent)] hover:underline"
            >
              @{replyToProfile?.display_name?.trim() || replyToProfile?.name?.trim() || `${npubOf(replyTo.pubkey).slice(0, 10)}…`}
            </Link>
          ) : (
            <span>alguém</span>
          )}
        </div>
      )}

      {/* Cabeçalho: avatar + nome no canto superior esquerdo (sem coluna lateral
          que desperdiça espaço). Conteúdo e mídia ocupam a largura cheia abaixo. */}
      <div className="lm-post-head">
        <Link to={`/perfil/${npub}`} className="flex-shrink-0">
          <Avatar src={profile?.picture} name={name} seed={event.pubkey} size={40} />
        </Link>
        <div className="lm-post-author">
          <Link to={`/perfil/${npub}`} className="lm-post-name">
            <UserName hex={event.pubkey} fallback={name} />
          </Link>
          {profile?.nip05 && (
            <span className="lm-post-nip05" title={profile.nip05}>
              {profile.nip05.replace(/^_@/, '')}
            </span>
          )}
          <span className="lm-post-dot">·</span>
          <time className="lm-post-time">{relativeTime(event.created_at)}</time>
          {(showWotScore || (WOT_SHADOW && isWotOperator(pubkeyHex))) && <WotBadge pubkey={event.pubkey} />}
        </div>

        {/* Canto superior direito: tradutor universal + três pontinhos (menu) */}
        <div className="ml-auto flex flex-shrink-0 items-center gap-0.5 self-start">
          <button
            type="button"
            aria-label="Traduzir"
            title={translating ? 'Traduzindo…' : 'Traduzir'}
            aria-pressed={transOn}
            aria-busy={translating}
            disabled={translating}
            onClick={onTranslate}
            className={`flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--lm-bg-input)] ${translating || transOn ? 'text-[var(--lm-accent)]' : 'text-[var(--lm-text-muted)] hover:text-[var(--lm-text-pri)]'}`}
          >
            {translating ? (
              // Spinner: sinaliza que a tradução está em andamento (o usuário não fica na dúvida).
              <svg className="animate-spin" viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M12 3a9 9 0 1 0 9 9" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h7M9 3v2c0 4.418-2.239 8-5 8M5 9c0 2.144 2.952 3.908 6.7 4M12 20l4-9 4 9M19.1 18h-6.2" />
              </svg>
            )}
          </button>
          <button
            type="button"
            aria-label="Mais opções"
            title="Mais opções"
            onClick={() => setMenuOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--lm-text-muted)] hover:bg-[var(--lm-bg-input)] hover:text-[var(--lm-text-pri)]"
          >
            <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor">
              <circle cx="5" cy="12" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="19" cy="12" r="1.7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="relative">
        <div className={hideNsfw ? 'pointer-events-none max-h-80 select-none overflow-hidden blur-md' : ''}>
          {isPoll ? (
            <PollView event={event} />
          ) : (
            <>
              {transOn && trans ? (
                <div className="lm-post-content whitespace-pre-wrap">{trans}</div>
              ) : (
                shownText.trim().length > 0 && (
                  <div className={`lm-post-content${jumbo ? ' lm-jumbo-emoji' : ''}`}>
                    {bodyNodes}
                    {expand === 0 && displayText.length > LIMIT_1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpand(1)
                        }}
                        className="ml-1 font-semibold text-[var(--lm-accent)] hover:underline"
                      >
                        … mais
                      </button>
                    )}
                    {expand === 1 && displayText.length > LIMIT_2 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpand(2)
                        }}
                        className="ml-1 font-semibold text-[var(--lm-accent)] hover:underline"
                      >
                        ver tudo
                      </button>
                    )}
                  </div>
                )
              )}
              {tsFileId ? (
                <div className="mt-2">
                  <TopSecretMedia fileId={tsFileId} price={tsPrice} thumb={media.find((m) => m.type === 'image')?.url} />
                </div>
              ) : (
                <MediaGrid media={media} gated={hideNsfw} />
              )}
              {links.slice(0, 3).map((u) => (
                <LinkPreview key={u} url={u} />
              ))}
            </>
          )}
        </div>
        {hideNsfw && <NsfwOverlay type={nsfwCategory(event)} onReveal={() => setRevealed(true)} />}
      </div>
      <ActionBar event={event} profiles={profiles} stats={stats} />

      {/* Thread INLINE (feed): toggle "Ver N respostas" expande as respostas embaixo, sem navegar.
          stopPropagation p/ o clique no card não levar pra /thread. */}
      {inlineReplies && (stats?.replies ?? 0) + replyDelta > 0 && (
        <div onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setThreadOpen((o) => !o)}
            aria-expanded={threadOpen}
            aria-controls={`thr-${event.id}`}
            className="px-1 pb-1 text-sm font-semibold text-[var(--lm-accent)] hover:underline"
          >
            {(() => {
              const n = (stats?.replies ?? 0) + replyDelta
              return threadOpen ? '▴ Ocultar respostas' : `▾ Ver ${n} ${n === 1 ? 'resposta' : 'respostas'}`
            })()}
          </button>
          {threadOpen && (
            <div id={`thr-${event.id}`} className="border-t border-[var(--lm-border)] pt-1">
              {inline.loading && (
                <p className="px-1 py-3 text-sm text-[var(--lm-text-muted)]">Carregando respostas…</p>
              )}
              {inline.error && !inline.loading && (
                <p className="px-1 py-3 text-sm text-[var(--lm-text-muted)]">
                  Erro ao carregar respostas.{' '}
                  <button onClick={inline.retry} className="font-semibold text-[var(--lm-accent)]">
                    Tentar de novo
                  </button>
                </p>
              )}
              {!inline.loading && !inline.error && inline.replies.length === 0 && (
                <p className="px-1 py-3 text-sm text-[var(--lm-text-muted)]">
                  Respostas não encontradas no nosso relay.{' '}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/thread/${event.id}`)}
                    className="cursor-pointer font-semibold text-[var(--lm-accent)]"
                  >
                    Abrir thread
                  </span>
                </p>
              )}
              {!inline.loading && !inline.error && inline.replies.length > 0 && (
                <InlineThread
                  rootId={event.id}
                  replies={inline.replies}
                  profiles={{ ...profiles, ...inline.profiles }}
                />
              )}
            </div>
          )}
        </div>
      )}
      {menuOpen && <PostMenu event={event} onClose={() => setMenuOpen(false)} />}
    </article>
  )
}
