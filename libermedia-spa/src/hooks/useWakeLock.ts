// Mantém a tela acesa (não hiberna) enquanto `active` — usado nos Reels e em vídeo
// em tela cheia. Screen Wake Lock API: o lock é solto quando a aba perde foco, então
// re-adquirimos no visibilitychange. Silencioso onde não há suporte (ex.: iOS antigo).
import { useEffect } from 'react'

export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
      } catch {
        /* negado/sem suporte — ignora */
      }
    }
    void acquire()

    const onVis = () => {
      if (!cancelled && document.visibilityState === 'visible' && !lock) void acquire()
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      try {
        void lock?.release()
      } catch {
        /* noop */
      }
      lock = null
    }
  }, [active])
}
