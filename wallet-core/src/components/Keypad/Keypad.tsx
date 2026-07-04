// Teclado numérico de PIN — moderno/minimalista. Botões INLINE (sem componente
// interno) e efeito de toque via CSS :active — recriar o botão / mudar estado no
// pointerDown remontava o elemento e MATAVA o clique (bug do "frontend de mentira").
import './keypad.css'

interface KeypadProps {
  value: string
  onChange: (v: string) => void
  length?: number
  onComplete?: (v: string) => void
  showBiometric?: boolean
  onBiometric?: () => void
  error?: boolean
}

const haptic = (ms = 8) => { try { navigator.vibrate?.(ms) } catch { /* noop */ } }

export function Keypad({
  value, onChange, length = 6, onComplete, showBiometric, onBiometric, error,
}: KeypadProps) {
  function push(d: string) {
    if (value.length >= length) return
    haptic()
    const next = value + d
    onChange(next)
    if (next.length === length) onComplete?.(next)
  }
  function back() { if (value.length) { haptic(); onChange(value.slice(0, -1)) } }

  return (
    <div className="lw-keypad">
      <div className={`lw-dots${error ? ' is-error' : ''}`} role="status" aria-label={`${value.length} de ${length} dígitos`}>
        {Array.from({ length }).map((_, i) => (
          <span key={i} className={`lw-dot${i < value.length ? ' filled' : ''}`} />
        ))}
      </div>

      <div className="lw-keypad-grid">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className="lw-key" onClick={() => push(d)}>
            <span className="lw-key-face">{d}</span>
          </button>
        ))}

        {showBiometric ? (
          <button type="button" className="lw-key lw-key-aux lw-key-bio" onClick={() => { haptic(); onBiometric?.() }} aria-label="Biometria">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
              <path d="M12 2a8 8 0 00-8 8v2" /><path d="M20 12v-2a8 8 0 00-4-6.9" />
              <path d="M12 6a4 4 0 00-4 4v3" /><path d="M16 13v-3a4 4 0 00-2-3.5" />
              <path d="M12 10v4a6 6 0 01-1 3.3" /><path d="M8 16v.5A5 5 0 007 20" /><path d="M12 14v2a8 8 0 01-1.2 4" />
            </svg>
          </button>
        ) : <span />}

        <button type="button" className="lw-key" onClick={() => push('0')}>
          <span className="lw-key-face">0</span>
        </button>

        <button type="button" className="lw-key lw-key-aux" onClick={back} aria-label="Apagar" disabled={!value.length}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6H9.4a2 2 0 00-1.5.7l-4.2 4.6a1 1 0 000 1.4l4.2 4.6a2 2 0 001.5.7H20a1 1 0 001-1V7a1 1 0 00-1-1z" />
            <path d="M17 9.5l-5 5M12 9.5l5 5" />
          </svg>
        </button>
      </div>
    </div>
  )
}
