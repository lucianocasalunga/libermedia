// Estado de mute dos vídeos POR PÁGINA (regra X/Twitter): todos começam MUTADOS;
// desmutar um desmuta TODOS daquela página; mutar um muta TODOS. Ao TROCAR de página
// volta ao padrão (mudo) — o Layout chama setVideoMuted(true) em cada troca de rota
// (mesma lógica do re-lock do NSFW). Vale p/ todos os feeds E threads. Em memória;
// reload também reseta. useSyncExternalStore para reatividade.
import { useSyncExternalStore } from 'react'

let muted = true
const subs = new Set<() => void>()

export function getVideoMuted(): boolean {
  return muted
}

export function setVideoMuted(v: boolean): void {
  if (muted === v) return
  muted = v
  subs.forEach((c) => c())
}

export function useVideoMuted(): boolean {
  return useSyncExternalStore(
    (c) => {
      subs.add(c)
      return () => subs.delete(c)
    },
    () => muted,
    () => muted,
  )
}
