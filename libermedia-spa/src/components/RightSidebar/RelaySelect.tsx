// Seletor de relay do MINI FEED (sidebar direita). Dropdown PRÓPRIO (não <select>
// nativo) p/ controlar a abertura e o espaçamento. Default pool.libernet; opções =
// relays de LEITURA do usuário (fonte da verdade = página de Relays). Um por vez.
// O campo INTEIRO abre (nome E setinha). Mexe SÓ no mini feed.
import { useEffect, useRef, useState } from 'react'

function pretty(url: string): string {
  return url.replace(/^wss?:\/\//, '').replace(/\/$/, '')
}

export function RelaySelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: string[]
  onChange: (relay: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="lm-relay-select" ref={ref}>
      {/* Campo: o botão inteiro abre (nome + setinha) */}
      <button
        type="button"
        className="lm-relay-select-field"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7c0-1.657 3.582-3 8-3s8 1.343 8 3-3.582 3-8 3-8-1.343-8-3zM4 7v10c0 1.657 3.582 3 8 3s8-1.343 8-3V7M4 12c0 1.657 3.582 3 8 3s8-1.343 8-3" />
        </svg>
        <span className="lm-relay-select-value">{pretty(value)}</span>
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}
          className={`lm-relay-select-caret ${open ? 'is-open' : ''}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="lm-relay-select-menu" role="listbox">
          {options.map((r) => (
            <button
              key={r}
              type="button"
              role="option"
              aria-selected={r === value}
              className={`lm-relay-select-option ${r === value ? 'is-active' : ''}`}
              onClick={() => {
                onChange(r)
                setOpen(false)
              }}
            >
              {pretty(r)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
