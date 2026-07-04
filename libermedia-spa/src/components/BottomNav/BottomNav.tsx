// Bottom nav mobile — pílula flutuante, hide-on-scroll. Fiel ao MPA
// (partial _bottom_nav.html + mobile.css). Visível só em telas pequenas.
import { NavLink, useLocation } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { BOTTOM_ITEMS } from '../../nav-config'
import { useHideOnScroll } from '../../hooks/useHideOnScroll'
import { unreadAtom } from '../../state/unread'
import './bottom-nav.css'

export function BottomNav() {
  // Mesmo hook da TopBar → as duas barras recolhem/voltam juntas (modelo v2.0).
  const hidden = useHideOnScroll()
  // Nos Reels NÃO existe barra inferior — tela cheia, fechar pelo X do player.
  const isReels = useLocation().pathname === '/reels'
  const unread = useAtomValue(unreadAtom)
  const hasDot = (path: string) =>
    (path === '/notificacoes' && unread.notif) || (path === '/mensagens' && unread.dm)

  if (isReels) return null

  const cls = 'lm-bottom-nav md:hidden' + (hidden ? ' nav-hidden' : '')

  return (
    <nav className={cls}>
      <div className="lm-bottom-nav-items">
        {BOTTOM_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `lm-bottom-nav-item${item.center ? ' reels-btn' : ''}${isActive ? ' active' : ''}`
            }
            aria-label={item.label}
          >
            <span className="lm-nav-icon-wrap">
              {item.icon}
              {hasDot(item.path) && <span className="lm-nav-dot" />}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
