// Ciclo de vida do app (primeiro plano / segundo plano) + FREIO DE MÃO de mídia.
// No iOS/PWA, quando o app vai pra background, vídeo/áudio continuam tocando e
// MANTÊM o WebKit vivo (bateria/CPU/lentidão que não passa nem "fechando"). Aqui,
// ao esconder (visibilitychange) ou fechar (pagehide), pausamos TODA mídia. Ao
// voltar, notificamos os players p/ retomarem o vídeo ativo.
import { useSyncExternalStore } from 'react'

const subs = new Set<(active: boolean) => void>()
let active = typeof document === 'undefined' ? true : !document.hidden
let installed = false

function pauseAllMedia(): void {
  try {
    document.querySelectorAll('video, audio').forEach((el) => {
      try {
        ;(el as HTMLMediaElement).pause()
      } catch {
        /* noop */
      }
    })
  } catch {
    /* noop */
  }
}

function setActive(a: boolean): void {
  if (a === active) return
  active = a
  if (!a) pauseAllMedia() // background → silêncio imediato
  subs.forEach((c) => c(a))
}

export function isAppActive(): boolean {
  return active
}

export function onAppActive(cb: (active: boolean) => void): () => void {
  subs.add(cb)
  return () => subs.delete(cb)
}

export function useAppActive(): boolean {
  return useSyncExternalStore(onAppActive, isAppActive, isAppActive)
}

// Instala os listeners 1x (chamado no boot pelo Layout).
export function installAppLifecycle(): void {
  if (installed || typeof document === 'undefined') return
  installed = true
  document.addEventListener('visibilitychange', () => setActive(!document.hidden))
  window.addEventListener('pagehide', () => setActive(false))
}
