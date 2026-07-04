// Picker de GIF (estilo WhatsApp): busca + grid de GIFs em alta (Tenor via proxy).
// Clicar insere o GIF no post (como mídia). Portal no body. Mostra "em breve"
// enquanto o backend não tem a chave (TENOR_API_KEY) — sem quebrar.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { trendingGifs, searchGifs, type Gif } from '../../services/gif'
import './gif-picker.css'

export function GifPicker({ onPick, onClose }: { onPick: (url: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [gifs, setGifs] = useState<Gif[]>([])
  const [loading, setLoading] = useState(true)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqId = useRef(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Em alta no início; busca com debounce ao digitar.
  useEffect(() => {
    const id = ++reqId.current
    if (debounce.current) clearTimeout(debounce.current)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    debounce.current = setTimeout(
      () => {
        void (q.trim() ? searchGifs(q) : trendingGifs()).then((g) => {
          if (id !== reqId.current) return
          setGifs(g)
          setLoading(false)
        })
      },
      q.trim() ? 350 : 0,
    )
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [q])

  return createPortal(
    <div
      className="lm-gifpick-root"
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <div className="lm-gifpick" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="lm-gifpick-search">
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 110-14 7 7 0 010 14z" />
          </svg>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar GIF…"
            aria-label="Buscar GIF"
          />
        </div>

        <div className="lm-gifpick-grid">
          {loading ? (
            <p className="lm-gifpick-msg">Carregando…</p>
          ) : gifs.length === 0 ? (
            <p className="lm-gifpick-msg">GIFs chegando em breve 🎬</p>
          ) : (
            gifs.map((g) => (
              <button
                key={g.id}
                type="button"
                className="lm-gifpick-cell"
                onClick={() => onPick(g.url)}
              >
                <img src={g.preview} alt="" loading="lazy" />
              </button>
            ))
          )}
        </div>

        <p className="lm-gifpick-credit">via GIPHY</p>
      </div>
    </div>,
    document.body,
  )
}
