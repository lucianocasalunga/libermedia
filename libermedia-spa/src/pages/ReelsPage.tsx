// Reels 3.0 — player vertical nível TikTok.
//
// Robustez:
//  • Janela virtual: só slides perto do ativo montam <video> (resto = placeholder full-height).
//  • Preload por distância; DESCARTA quebrado À FRENTE antes de chegar (erro duro / sem metadata).
//  • 4G-friendly: vídeo lento NÃO é descartado — mostra spinner e espera. scroll-snap-stop:always.
//  • Áudio sempre entra mudo (global, não persiste). Retenção + completed alimentam o ranking.
//
// Fase B/C (26/Jun): tela cheia no desktop (ESC/X), bordas borradas (canvas do vídeo ativo),
//  barra de ações TikTok (seguir/curtir+coraçõezinhos/comentar-modal/favoritar/repostar-direto).
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAtom, useAtomValue } from 'jotai'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import {
  fetchReels,
  reelSrc,
  reportBadReel,
  reportCompleted,
  reportRetention,
  reportLike,
  type ReelItem,
} from '../services/reels'
import { nsfwFilterActive, isNsfwReel } from '../services/nsfw'
import { useNsfw } from '../hooks/useNsfw'
import { ensureBookmarks } from '../services/bookmarks'
import { like } from '../services/reactions'
import { requireSigner } from '../services/require-signer'
import { useIsMobile } from '../hooks/useIsMobile'
import { useReelEvent } from '../hooks/useReelEvent'
import { composeAtom } from '../state/compose'
import { NsfwOverlay } from '../components/NsfwOverlay/NsfwOverlay'
import { ComposeModal } from '../components/ComposeModal/ComposeModal'
import { ReelActions } from '../components/ReelActions/ReelActions'
import { useFloatingHearts } from '../components/FloatingHearts/FloatingHearts'
import { useWakeLock } from '../hooks/useWakeLock'
import { reelsReturnPathAtom } from '../state/reels-nav'
import { useAppActive } from '../lib/app-lifecycle'

const PAGE = 20
const WINDOW_AHEAD = 3 // quantos slides à frente montam <video> (e são validados)
const WINDOW_BEHIND = 1 // quantos atrás mantêm <video> (back-scroll suave)
const LOAD_AHEAD = 6 // carrega mais quando o ativo está a ≤6 do fim
// 4G-friendly: só descarta se NEM o metadata chegar nesse tempo. Vídeo lento-mas-válido
// carrega o metadata rápido → não é descartado, só vai bufferizar (spinner).
const VALIDATE_MS = 15000

export function ReelsPage() {
  const { pubkeyHex } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // O Layout mantém TODAS as páginas primárias montadas (só display:none na inativa).
  // Como o player é portalizado pro body (escapa do display:none), PRECISAMOS não
  // renderizar nada quando /reels não é a rota ativa — senão o overlay cobre tudo.
  const isReelsRoute = location.pathname === '/reels'
  const isMobile = useIsMobile()
  const [{ open: composeOpen }] = useAtom(composeAtom)
  const { layer: heartsLayer, burst } = useFloatingHearts()
  const returnPath = useAtomValue(reelsReturnPathAtom)

  // Tela acesa enquanto estiver nos Reels (não hiberna).
  useWakeLock(isReelsRoute)

  // Garante a lista NSFW carregada (pubkeys/events da casa) E re-renderiza quando pronta
  // → o canvas/glitch dos reels passa a respeitar a classificação do servidor, não só a
  // flag do nexus. Sem isto, deep-link direto pros Reels não carregaria a lista.
  useNsfw()

  // Fechar os Reels → volta EXATAMENTE pra página onde o usuário estava antes de abrir.
  const closeReels = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    navigate(returnPath || '/feed')
  }, [navigate, returnPath])

  const [items, setItems] = useState<ReelItem[]>([])
  const [badIds, setBadIds] = useState<Set<string>>(() => new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [muted, setMuted] = useState(true) // SEMPRE entra mudo, não persiste
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)
  const loadingRef = useRef(false)
  const seenRef = useRef<Set<string>>(new Set())

  // Filtro NSFW reativo (igual ao feed: filtro ativo → conteúdo +18 some de vez).
  // Feito aqui (não no fetch) p/ reagir quando a lista NSFW carrega depois (useNsfw).
  const visible = items.filter(
    (it) => !badIds.has(it.event_id) && !(nsfwFilterActive() && isNsfwReel(it)),
  )
  const activeIdx = activeId ? visible.findIndex((it) => it.event_id === activeId) : 0
  const safeActiveIdx = activeIdx < 0 ? 0 : activeIdx

  // Garante a lista de favoritos carregada (pro ⭐ refletir estado certo).
  useEffect(() => {
    ensureBookmarks(pubkeyHex)
  }, [pubkeyHex])

  // Desktop: entra em tela cheia. ESC (nativo) sai do fullscreen → fechamos os Reels.
  // requestFullscreen exige gesto; se o browser recusar, o botão X ainda funciona.
  useEffect(() => {
    if (isMobile || !isReelsRoute) return
    const el = document.documentElement
    el.requestFullscreen?.().catch(() => {})
    const onFsChange = () => {
      if (!document.fullscreenElement) navigate(returnPath || '/feed')
    }
    // ESC fecha mesmo se o fullscreen foi recusado (sem gesto).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) navigate(returnPath || '/feed')
    }
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('keydown', onKey)
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [isMobile, isReelsRoute, navigate, returnPath])

  const loadMore = useCallback(async () => {
    if (loadingRef.current || done) return
    loadingRef.current = true
    try {
      const batch = await fetchReels({ limit: PAGE, offset: offsetRef.current, pubkey: pubkeyHex })
      offsetRef.current += batch.length
      const fresh = batch.filter((b) => !seenRef.current.has(b.event_id))
      fresh.forEach((b) => seenRef.current.add(b.event_id))
      setItems((prev) => [...prev, ...fresh])
      if (batch.length < PAGE) setDone(true)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar reels')
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [done, pubkeyHex])

  // Só busca quando /reels está ativo (a página fica montada+escondida no resto).
  useEffect(() => {
    if (isReelsRoute && items.length === 0) void loadMore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReelsRoute])

  useEffect(() => {
    if (!activeId && visible.length > 0) setActiveId(visible[0].event_id)
  }, [visible, activeId])

  useEffect(() => {
    if (visible.length > 0 && safeActiveIdx >= visible.length - LOAD_AHEAD) void loadMore()
  }, [safeActiveIdx, visible.length, loadMore])

  const toggleMute = useCallback(() => {
    setMuted((m) => !m) // global, sem persistir
  }, [])

  const handleBad = useCallback(
    (id: string) => {
      reportBadReel(id)
      const idx = visible.findIndex((it) => it.event_id === id)
      if (idx > safeActiveIdx) {
        setBadIds((prev) => new Set(prev).add(id)) // à frente: remove (não desloca o scroll)
      } else if (idx === safeActiveIdx) {
        const cont = containerRef.current // ativo quebrou: só rola pro próximo, NÃO remove
        if (cont) cont.scrollBy({ top: cont.clientHeight, behavior: 'smooth' })
      }
    },
    [visible, safeActiveIdx],
  )

  const onWatched = useCallback((id: string, pct: number) => {
    if (pct > 0) reportRetention(id, pct)
  }, [])

  // FORA da rota /reels: não renderiza NADA (o portal escaparia do display:none
  // do Layout e cobriria a página ativa). Todos os hooks acima já rodaram.
  if (!isReelsRoute) return null

  if (!loading && error && visible.length === 0) {
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-2 bg-black px-8 text-center text-sm text-white/70">
        <p>{error}</p>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setLoading(true)
            void loadMore()
          }}
          className="rounded-full border border-white/30 px-4 py-1.5 font-bold text-white"
        >
          Tentar de novo
        </button>
      </div>
    )
  }

  // Desktop: player vira overlay fixo de tela cheia VIA PORTAL no body (escapa da
  // coluna de 600px e do containing-block do .lm-page). Mobile: fica na coluna (full-width).
  const containerCls =
    'snap-y snap-mandatory overflow-y-scroll overscroll-contain bg-black ' +
    (isMobile ? 'h-svh' : 'fixed inset-0 z-40')

  const player = (
    <div ref={containerRef} className={containerCls}>
      {/* X (fechar) — no ALTO, canto direito. Volta pra página onde o usuário estava
          antes de abrir os Reels. Tela cheia: sem barra inferior no mobile. */}
      <button
        type="button"
        onClick={closeReels}
        aria-label="Fechar"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        className="fixed right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Som — BEM mais abaixo do X (alvo de toque confortável no mobile). Entra MUDO;
          ativar/silenciar vale p/ TODOS os vídeos (estado global). */}
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? 'Ativar som' : 'Silenciar'}
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 88px)' }}
        className="fixed right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
      >
        {muted ? (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4z" />
            <path d="m23 9-6 6M17 9l6 6" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
          </svg>
        )}
      </button>

      {visible.map((item, i) => {
        const distance = i - safeActiveIdx
        return (
          <Slide
            key={item.event_id}
            item={item}
            distance={distance}
            isActive={item.event_id === activeId}
            muted={muted}
            paused={composeOpen}
            containerRef={containerRef}
            onActivate={setActiveId}
            onBad={handleBad}
            onWatched={onWatched}
            onCompleted={reportCompleted}
            onBurstHearts={burst}
          />
        )
      })}

      {loading && visible.length === 0 && (
        <div className="flex h-svh snap-start items-center justify-center text-sm text-white/70">
          Carregando reels…
        </div>
      )}
      {!loading && visible.length === 0 && !error && (
        <div className="flex h-svh snap-start items-center justify-center text-sm text-white/70">
          Nenhum reel disponível.
        </div>
      )}

    </div>
  )

  return (
    <>
      {isMobile ? player : createPortal(player, document.body)}
      {/* Corações + modal de comentário: SEMPRE via portal no body (escapam do
          containing-block do .lm-page → fixed ancora no viewport). */}
      {createPortal(
        <>
          {heartsLayer}
          <ComposeModal />
        </>,
        document.body,
      )}
    </>
  )
}

function Slide({
  item,
  distance,
  isActive,
  muted,
  paused,
  containerRef,
  onActivate,
  onBad,
  onWatched,
  onCompleted,
  onBurstHearts,
}: {
  item: ReelItem
  distance: number
  isActive: boolean
  muted: boolean
  paused: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  onActivate: (id: string) => void
  onBad: (id: string) => void
  onWatched: (id: string, pct: number) => void
  onCompleted: (id: string) => void
  onBurstHearts: (x: number, y: number) => void
}) {
  const { npub } = useAuth()
  const appActive = useAppActive() // false em background → pausa (iOS/PWA não para o áudio sozinho)
  const slideRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const bgCanvasRef = useRef<HTMLCanvasElement>(null)
  const [revealed, setRevealed] = useState(false)
  const [failed, setFailed] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [userPaused, setUserPaused] = useState(false) // pausa manual (1 toque)
  const [liked, setLiked] = useState(false) // estado de curtida — COMPARTILHADO com o coração da direita

  // Gestos no vídeo: 1 toque = pausar/retomar · 2 toques = curtir (coraçõezinhos + kind:7 +
  // marca o coração da direita). Mesma fonte de verdade `liked` p/ vídeo e botão lateral.
  const lastTapRef = useRef(0)
  const singleTimerRef = useRef<number | null>(null)
  const doLike = (x: number, y: number) => {
    onBurstHearts(x, y) // coraçõezinhos sempre
    if (liked || !reelEvent) { setLiked(true); return } // marca mesmo sem evento (otimista)
    setLiked(true)
    ;(async () => {
      try {
        const signer = await requireSigner(npub)
        if (!signer) throw new Error('sem signer')
        await like(signer, reelEvent)
        reportLike(reelEvent.id) // sinal de ranking (kind:7 já publicado acima)
      } catch { setLiked(false) }
    })()
  }
  const handleTap = (e: React.MouseEvent) => {
    const now = Date.now()
    if (now - lastTapRef.current < 280) {
      // duplo toque → curtir (cancela a pausa pendente do 1º toque)
      if (singleTimerRef.current) { window.clearTimeout(singleTimerRef.current); singleTimerRef.current = null }
      lastTapRef.current = 0
      doLike(e.clientX, e.clientY)
    } else {
      lastTapRef.current = now
      singleTimerRef.current = window.setTimeout(() => {
        singleTimerRef.current = null
        setUserPaused((p) => !p)
      }, 280)
    }
  }

  const maxProgress = useRef(0)
  const completedSent = useRef(false)
  const validateTimer = useRef<number | null>(null)
  const validated = useRef(false)
  const progressRef = useRef<HTMLDivElement>(null) // barra de progresso (atualizada via DOM, sem re-render)

  const mountVideo = distance >= -WINDOW_BEHIND && distance <= WINDOW_AHEAD
  const locked = !nsfwFilterActive() && isNsfwReel(item) && !revealed
  // Evento Nostr completo só pro ativo (pra curtir/repostar/responder) — cacheado.
  const reelEvent = useReelEvent(isActive ? item.event_id : null)

  const preload: 'auto' | 'metadata' | 'none' =
    isActive || distance === 1 ? 'auto' : mountVideo ? 'metadata' : 'none'

  // Visibilidade: quem fica ≥60% visível vira o ativo.
  useEffect(() => {
    const el = slideRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) onActivate(item.event_id)
      },
      { threshold: [0.6], root: containerRef.current },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [item.event_id, onActivate, containerRef])

  // Play/pause. Pausa se: não-ativo, bloqueado, falhou, modal aberto (paused), pausa
  // manual OU app em background (appActive=false). Ao voltar, re-roda e retoma.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (isActive && !locked && !failed && !paused && !userPaused && appActive) {
      void v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [isActive, locked, failed, paused, userPaused, appActive])

  // Teardown no unmount: iOS/WebKit NÃO para o áudio só ao tirar o <video> do DOM —
  // precisa pause + soltar o src + load. Sem isto, sair dos Reels deixa o último
  // vídeo tocando em background no PWA (e mantém o app vivo/lento). Causa nº1 do bug.
  useEffect(() => {
    return () => {
      const v = videoRef.current
      if (!v) return
      try {
        v.pause()
        v.removeAttribute('src')
        v.load()
      } catch {
        /* noop */
      }
    }
  }, [])

  // Reseta progresso E a pausa manual ao (re)entrar como ativo (vídeo novo sempre toca).
  useEffect(() => {
    if (isActive) {
      maxProgress.current = 0
      completedSent.current = false
      if (progressRef.current) progressRef.current.style.width = '0%'
    }
    setUserPaused(false)
    setLiked(false)
  }, [isActive])

  // Ao DEIXAR de ser o ativo, reporta % assistido.
  const wasActive = useRef(false)
  useEffect(() => {
    if (wasActive.current && !isActive) {
      const v = videoRef.current
      const dur = v?.duration || 0
      if (dur > 0) onWatched(item.event_id, Math.min(100, (maxProgress.current / dur) * 100))
    }
    wasActive.current = isActive
  }, [isActive, item.event_id, onWatched])

  // Bordas borradas: desenha o frame do vídeo ATIVO num canvas pequeno (sem baixar
  // nada extra). CSS borra e estica pra cobrir as faixas pretas. Vídeo cross-origin
  // "tinge" o canvas, mas só exibimos (não lemos pixels) → OK.
  useEffect(() => {
    if (!isActive || !mountVideo) return
    const cv = bgCanvasRef.current
    const v = videoRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !v || !ctx) return
    const draw = () => {
      if (v.readyState >= 2) {
        try {
          ctx.drawImage(v, 0, 0, cv.width, cv.height)
        } catch {
          /* canvas tainted ou frame indisponível — ignora */
        }
      }
    }
    const id = window.setInterval(draw, 150)
    draw()
    return () => window.clearInterval(id)
  }, [isActive, mountVideo])

  // Validação dos slides À FRENTE: descarta só se NEM metadata chegar em VALIDATE_MS.
  useEffect(() => {
    if (!mountVideo || validated.current) return
    if (distance <= 0) return
    validateTimer.current = window.setTimeout(() => {
      const rs = videoRef.current?.readyState ?? 0
      if (!validated.current && rs === 0) {
        validated.current = true
        onBad(item.event_id)
      } else {
        markValidated()
      }
    }, VALIDATE_MS)
    return () => {
      if (validateTimer.current) window.clearTimeout(validateTimer.current)
    }
  }, [mountVideo, distance, item.event_id, onBad])

  const markValidated = () => {
    validated.current = true
    if (validateTimer.current) window.clearTimeout(validateTimer.current)
  }

  const handleError = () => {
    markValidated()
    if (isActive) {
      setFailed(true)
      onBad(item.event_id)
    } else {
      onBad(item.event_id)
    }
  }

  // Re-bloqueia NSFW ao sair dos Reels / trocar de página.
  useEffect(() => {
    const relock = () => setRevealed(false)
    window.addEventListener('lm:nsfw-relock', relock)
    return () => window.removeEventListener('lm:nsfw-relock', relock)
  }, [])

  const handleTimeUpdate = () => {
    const v = videoRef.current
    if (!v || !v.duration) return
    if (progressRef.current) progressRef.current.style.width = `${(v.currentTime / v.duration) * 100}%`
    if (v.currentTime > maxProgress.current) maxProgress.current = v.currentTime
    if (!completedSent.current && v.currentTime / v.duration >= 0.95) {
      completedSent.current = true
      onCompleted(item.event_id)
    }
  }

  return (
    <div ref={slideRef} className="relative flex h-svh snap-start snap-always items-center justify-center overflow-hidden">
      {/* Bordas borradas: canvas do vídeo ativo; senão, thumbnail borrada; senão, preto. */}
      {isActive && mountVideo ? (
        <canvas
          ref={bgCanvasRef}
          width={72}
          height={128}
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-80 blur-2xl"
        />
      ) : item.thumbnail ? (
        <div
          className="absolute inset-0 scale-110 bg-cover bg-center opacity-70 blur-2xl"
          style={{ backgroundImage: `url(${item.thumbnail})` }}
        />
      ) : null}

      {mountVideo ? (
        <video
          ref={videoRef}
          src={reelSrc(item)}
          poster={item.thumbnail || undefined}
          muted={muted}
          loop
          playsInline
          preload={preload}
          onClick={handleTap}
          onError={handleError}
          onLoadedMetadata={markValidated}
          onCanPlay={() => {
            markValidated()
            setBuffering(false)
          }}
          onWaiting={() => setBuffering(true)}
          onStalled={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onTimeUpdate={handleTimeUpdate}
          className="relative h-full w-full object-contain"
        />
      ) : (
        <div className="relative h-full w-full" />
      )}

      {/* Barra de ações TikTok — só no ativo. `liked`/`onLike` compartilhados com o
          duplo-toque no vídeo → o coração da direita marca junto. */}
      {isActive && mountVideo && !locked && (
        <ReelActions item={item} reelEvent={reelEvent} liked={liked} onLike={doLike} />
      )}

      {/* Barra de progresso do vídeo (parte inferior). Atualizada via DOM (sem re-render). */}
      {isActive && mountVideo && !locked && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 h-1 bg-white/20">
          <div ref={progressRef} className="h-full bg-[var(--lm-accent)]" style={{ width: '0%' }} />
        </div>
      )}

      {failed && isActive && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/70">
          Vídeo indisponível
        </div>
      )}

      {buffering && isActive && !failed && !locked && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/30 border-t-white/90" />
        </div>
      )}

      {/* Pausado (1 toque): ícone central de play. */}
      {userPaused && isActive && !locked && mountVideo && !failed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <svg viewBox="0 0 24 24" width="64" height="64" fill="rgba(255,255,255,0.85)" className="drop-shadow-lg">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      )}

      {locked && (
        <NsfwOverlay
          type="adult"
          onReveal={() => {
            setRevealed(true)
            requestAnimationFrame(() => videoRef.current?.play().catch(() => {}))
          }}
        />
      )}
    </div>
  )
}
