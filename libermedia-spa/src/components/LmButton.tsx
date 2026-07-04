// Botão de ação primária editável — design Mistral, implementação Claude.
// Estilo .lm-btn (6 temas) + ripple no toque/clique + som sutil.
// Desacoplado da sidebar: usado onde a página quiser (ex.: slot da sidebar).
import type { ReactNode } from 'react'
import { playTap } from '../lib/sound'
import '../styles/lm-btn.css'

export function LmButton({
  children,
  onClick,
  className = '',
  ariaLabel,
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
  ariaLabel?: string
}) {
  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    const btn = e.currentTarget
    const rect = btn.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height) * 2.2
    const span = document.createElement('span')
    span.className = 'ripple'
    span.style.width = span.style.height = `${size}px`
    span.style.left = `${e.clientX - rect.left}px`
    span.style.top = `${e.clientY - rect.top}px`
    span.addEventListener('animationend', () => span.remove())
    btn.appendChild(span)
    playTap()
  }

  return (
    <button
      type="button"
      className={`lm-btn ${className}`}
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
