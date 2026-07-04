// Coordenador de VÍDEO ATIVO — garante que só UM vídeo do feed toca por vez (o mais
// visível na viewport), pausando todos os outros. Resolve o vazamento de áudio em
// que vários <video> tocavam juntos (telas grandes / ao ampliar): antes cada vídeo
// decidia sozinho dar play se estivesse ≥50% visível, e em desktop dois passavam
// disso ao mesmo tempo → dois áudios.
//
// HISTERESE (PLAY_MIN/SWITCH_MARGIN): o ativo só perde o posto se um candidato for
// CLARAMENTE mais visível — evita o revezamento play/pause em loop que derrubou a
// tentativa anterior (v44).
import { onAppActive } from './app-lifecycle'

interface Entry {
  el: HTMLVideoElement
  ratio: number
  gated: boolean
}

const entries = new Map<symbol, Entry>()
let activeKey: symbol | null = null

const PLAY_MIN = 0.5 // visibilidade mínima p/ um vídeo poder ser o ativo
const SWITCH_MARGIN = 0.2 // candidato precisa superar o ativo por esta margem p/ roubar o posto

// Elege o vídeo que deve tocar: o mais visível não-gated; mantém o ativo atual
// se ninguém o superar pela margem (histerese).
function pick(): symbol | null {
  let bestKey: symbol | null = null
  let bestRatio = 0
  for (const [k, e] of entries) {
    if (e.gated) continue
    if (e.ratio > bestRatio) {
      bestRatio = e.ratio
      bestKey = k
    }
  }
  if (bestRatio < PLAY_MIN) return null // ninguém visível o bastante → silêncio total

  // Se o ativo atual ainda está visível e não-gated, só troca por margem clara.
  if (activeKey && activeKey !== bestKey) {
    const cur = entries.get(activeKey)
    if (cur && !cur.gated && cur.ratio >= PLAY_MIN && bestRatio < cur.ratio + SWITCH_MARGIN) {
      return activeKey
    }
  }
  return bestKey
}

// Aplica play/pause SÓ onde o estado diverge do desejado (evita play()/pause()
// redundante que geraria o loop e os warnings de "play interrupted by pause").
function applyPlayState(): void {
  for (const [k, e] of entries) {
    const shouldPlay = k === activeKey && !e.gated
    if (shouldPlay) {
      if (e.el.paused) void e.el.play().catch(() => {})
    } else if (!e.el.paused) {
      e.el.pause()
    }
  }
}

function reconcile(): void {
  activeKey = pick()
  applyPlayState()
}

// Ao voltar do background, o freio de mão (app-lifecycle) já pausou tudo; re-toca o
// vídeo ativo. (No background não faz nada — o pauseAll global já cuidou.)
onAppActive((a) => {
  if (a) applyPlayState()
})

export interface VideoHandle {
  update(ratio: number, gated: boolean): void
  unregister(): void
}

// Registra um <video> no coordenador. Cada FeedVideo chama update() com o seu ratio
// de visibilidade (do IntersectionObserver) — o coordenador decide quem toca.
export function registerVideo(el: HTMLVideoElement): VideoHandle {
  const key = Symbol('video')
  entries.set(key, { el, ratio: 0, gated: false })
  return {
    update(ratio, gated) {
      const e = entries.get(key)
      if (!e) return
      e.ratio = ratio
      e.gated = gated
      reconcile()
    },
    unregister() {
      const wasActive = key === activeKey
      entries.delete(key)
      if (wasActive) {
        activeKey = null
        reconcile()
      }
    },
  }
}
