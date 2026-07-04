// Pull-to-refresh (mobile): no TOPO da página, uma PUXADA pra baixo (≥ threshold px de
// movimento REAL do dedo) dispara o refresh. Threshold deliberado p/ não recarregar só de
// encostar no teto — tem que ser uma forçada. O retorno `pull` (px, com resistência) serve
// p/ desenhar o indicador. Só arma quando começa no topo (window.scrollY <= 0).
import { useEffect, useRef, useState } from 'react'

export function usePullToRefresh(onRefresh: () => void, threshold = 80) {
  const [pull, setPull] = useState(0)
  const startY = useRef<number | null>(null)
  const distRef = useRef(0) // deslocamento REAL do dedo (sem resistência) p/ a decisão

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (window.scrollY <= 0 && e.touches.length === 1) {
        startY.current = e.touches[0].clientY
        distRef.current = 0
      } else {
        startY.current = null
      }
    }
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return
      // Saiu do topo (rolou conteúdo) → cancela, deixa a rolagem nativa.
      if (window.scrollY > 0) {
        startY.current = null
        distRef.current = 0
        setPull(0)
        return
      }
      const dy = e.touches[0].clientY - startY.current
      distRef.current = dy
      // Visual com resistência (cresce devagar) e teto.
      setPull(dy > 0 ? Math.min(dy * 0.5, threshold * 1.4) : 0)
    }
    const onEnd = () => {
      const fire = startY.current !== null && distRef.current >= threshold
      startY.current = null
      distRef.current = 0
      setPull(0)
      if (fire) onRefresh()
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [onRefresh, threshold])

  return pull
}
