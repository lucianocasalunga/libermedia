// Drawer mobile da sidebar esquerda. Aberto pelo hambúrguer da TopBar. Off-canvas
// (desliza da esquerda) + backdrop. Reusa o conteúdo da <Sidebar/> (drawer mode).
import { useEffect } from 'react'
import { Sidebar } from '../Sidebar/Sidebar'
import './mobile-drawer.css'

export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return (
    <div className={`lm-drawer-root md:hidden${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <div className="lm-drawer-backdrop" onClick={onClose} />
      <div className="lm-drawer-panel" role="dialog" aria-modal="true">
        <Sidebar drawer onNavigate={onClose} />
      </div>
    </div>
  )
}
