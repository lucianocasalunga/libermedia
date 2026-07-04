// Visualizador de mídia dentro do sistema (lightbox). Abre imagem/vídeo/áudio/
// PDF/arquivo sem sair do app. Navegação horizontal: ←/→ no desktop, swipe no
// mobile. Sem seta à esquerda na 1ª, sem seta à direita na última. Transição slide.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { VoicePlayer } from '../VoicePlayer/VoicePlayer'
import './media-viewer.css'

export interface ViewerItem {
  id: number
  name: string
  mime_type: string
  sha256?: string
  /** URL direta da mídia (feed). Se ausente, usa /f/{id} (arquivos do usuário). */
  url?: string
}

export function MediaViewer({
  items,
  index,
  onClose,
  onIndex,
}: {
  items: ViewerItem[]
  index: number
  onClose: () => void
  onIndex: (i: number) => void
}) {
  const [dir, setDir] = useState<1 | -1 | 0>(0)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const item = items[index]
  const hasPrev = index > 0
  const hasNext = index < items.length - 1

  function go(d: 1 | -1) {
    const ni = index + d
    if (ni < 0 || ni >= items.length) return
    setDir(d)
    onIndex(ni)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && index > 0) go(-1)
      else if (e.key === 'ArrowRight' && index < items.length - 1) go(1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  if (!item) return null

  function onTouchStart(e: React.TouchEvent) {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!touch.current) return
    const dx = e.changedTouches[0].clientX - touch.current.x
    const dy = e.changedTouches[0].clientY - touch.current.y
    touch.current = null
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0 && hasNext) go(1)
      else if (dx > 0 && hasPrev) go(-1)
    }
  }

  const src = item.url ?? `/f/${item.id}`
  const isImg = item.mime_type?.startsWith('image/')
  const isVid = item.mime_type?.startsWith('video/')
  const isAud = item.mime_type?.startsWith('audio/')
  const isPdf = item.mime_type === 'application/pdf'
  const animClass = dir === 1 ? 'lm-viewer-enter-r' : dir === -1 ? 'lm-viewer-enter-l' : ''

  return createPortal(
    <div className="lm-viewer" onClick={onClose} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="lm-viewer-top" onClick={(e) => e.stopPropagation()}>
        <span className="lm-viewer-name" title={item.name}>{item.name}</span>
        <div className="lm-viewer-actions">
          <a href={src} download={item.name} aria-label="Baixar" className="lm-viewer-btn" onClick={(e) => e.stopPropagation()}>
            <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
          </a>
          <button type="button" aria-label="Fechar" className="lm-viewer-btn" onClick={onClose}>
            <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      </div>

      <div className="lm-viewer-stage" onClick={(e) => e.stopPropagation()}>
        <div key={item.id} className={`lm-viewer-media ${animClass}`}>
          {isImg && <img src={src} alt={item.name} className="lm-viewer-img" />}
          {isVid && <video src={src} controls autoPlay playsInline className="lm-viewer-video" />}
          {isAud && (
            <div className="lm-viewer-card">
              <svg viewBox="0 0 24 24" width={64} height={64} fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM21 16a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <p className="lm-viewer-cardname">{item.name}</p>
              {/* Player CUSTom (mesmo do mensageiro) — unifica áudio no app inteiro; antes o
                  <audio> nativo divergia do VoicePlayer e o video/webm caía no <video>. */}
              <VoicePlayer src={src} />
            </div>
          )}
          {isPdf && <iframe src={src} title={item.name} className="lm-viewer-pdf" />}
          {!isImg && !isVid && !isAud && !isPdf && (
            <div className="lm-viewer-card">
              <svg viewBox="0 0 24 24" width={64} height={64} fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
              <p className="lm-viewer-cardname">{item.name}</p>
              <a href={src} target="_blank" rel="noopener noreferrer" className="lm-viewer-open">Abrir / Baixar</a>
            </div>
          )}
        </div>
      </div>

      {hasPrev && (
        <button type="button" aria-label="Anterior" className="lm-viewer-arrow lm-viewer-arrow-l" onClick={(e) => { e.stopPropagation(); go(-1) }}>
          <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
      )}
      {hasNext && (
        <button type="button" aria-label="Próximo" className="lm-viewer-arrow lm-viewer-arrow-r" onClick={(e) => { e.stopPropagation(); go(1) }}>
          <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      )}

      <div className="lm-viewer-counter" onClick={(e) => e.stopPropagation()}>{index + 1} / {items.length}</div>
    </div>,
    document.body,
  )
}
