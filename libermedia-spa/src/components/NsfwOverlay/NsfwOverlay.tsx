// Filtro canvas NSFW por cima do conteúdo (reusa spoiler.js). Olhinho + mensagem
// "toque para desbloquear". Toque → desbloqueia (um de cada vez). type = adult /
// violence / paid (escolhe um dos ~10 temas da categoria). O overlay bloqueia o
// clique no conteúdo de baixo → vídeo fica pausado até desbloquear.
import { useEffect, useRef } from 'react'
import { ensureSpoiler } from '../../lib/spoiler-loader'
import './nsfw-overlay.css'

export type NsfwType = 'adult' | 'violence' | 'paid'

export function NsfwOverlay({ type = 'adult', onReveal }: { type?: NsfwType; onReveal: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let stopped = false
    const cv = canvasRef.current
    void ensureSpoiler().then(() => {
      if (stopped || !cv || !window.SpoilerInit) return
      window.SpoilerInit(cv, type)
    })
    return () => {
      stopped = true
      if (cv && window.SpoilerStop) window.SpoilerStop(cv)
    }
  }, [type])

  const label =
    type === 'violence' ? 'Conteúdo violento' : type === 'paid' ? 'Conteúdo premium' : 'Conteúdo sensível'

  return (
    <div
      className="lm-nsfw-overlay"
      role="button"
      tabIndex={0}
      aria-label={`${label} — toque para desbloquear`}
      onClick={(e) => {
        e.stopPropagation()
        onReveal()
      }}
    >
      <canvas ref={canvasRef} className="lm-nsfw-canvas" />
      <div className="lm-nsfw-msg">
        {/* olhinho maroto */}
        <svg viewBox="0 0 24 24" width={30} height={30} fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12S5.5 5.5 12 5.5 21.5 12 21.5 12 18.5 18.5 12 18.5 2.5 12 2.5 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span className="lm-nsfw-title">🔞 {label}</span>
        <span className="lm-nsfw-hint">toque para desbloquear</span>
      </div>
    </div>
  )
}
