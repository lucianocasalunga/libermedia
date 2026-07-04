// Barra superior PADRÃO da coluna central — a mesma em todas as páginas.
// Elementos fixos: logo do LiberMedia (→ feed) + seta voltar (→ página anterior).
// O resto é um SLOT (children): cada página coloca seus próprios elementos
// (nome da página, ações, busca, etc.). Cores seguem o tema (abismo=preto/branco,
// neve=branco/preto, demais=suas cores) via var(--lm-bg-main)/var(--lm-text-pri).
import { Link, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useHideOnScroll } from '../../hooks/useHideOnScroll'
import './topbar.css'

export function TopBar({ children, onBack }: { children?: ReactNode; onBack?: () => void }) {
  const navigate = useNavigate()
  const hidden = useHideOnScroll()
  return (
    <header className={`lm-topbar${hidden ? ' is-hidden' : ''}`}>
      <Link to="/feed" className="lm-topbar-logo" aria-label="Início (Feed)">
        <img src="/static/img/logo.jpg" alt="LiberMedia" />
      </Link>
      <button
        type="button"
        className="lm-topbar-back"
        aria-label="Voltar"
        onClick={() => (onBack ? onBack() : navigate(-1))}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <div className="lm-topbar-slot">{children}</div>
      {/* Hambúrguer — SÓ mobile, à direita → abre a sidebar esquerda como drawer */}
      <button
        type="button"
        className="lm-topbar-burger"
        aria-label="Menu"
        onClick={() => window.dispatchEvent(new Event('lm:open-drawer'))}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </header>
  )
}
