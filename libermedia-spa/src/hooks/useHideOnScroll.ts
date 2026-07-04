// Esconde barras ao rolar para baixo, mostra ao subir — modelo da v2.0.
// IMPORTANTE: store ÚNICO compartilhado (useSyncExternalStore) → 1 listener de
// scroll e 1 estado para o app inteiro, mesmo com todas as páginas keep-alive
// montadas (TopBar de cada página + BottomNav leem o MESMO valor). Antes era um
// listener por componente → 11+ rAF/frame, regressão de fluidez.
import { useSyncExternalStore } from 'react'

let hidden = false
let lastY = typeof window !== 'undefined' ? window.scrollY : 0
let ticking = false
let listening = false
const subscribers = new Set<() => void>()

function onScroll() {
  if (ticking) return
  ticking = true
  requestAnimationFrame(() => {
    const y = window.scrollY
    const delta = y - lastY
    let next = hidden
    if (y < 120) next = false // perto do topo → sempre mostra
    else if (delta > 4) next = true // descendo → recolhe
    else if (delta < -4) next = false // subindo → retorna
    lastY = y
    ticking = false
    if (next !== hidden) {
      hidden = next
      subscribers.forEach((cb) => cb())
    }
  })
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb)
  if (!listening) {
    window.addEventListener('scroll', onScroll, { passive: true })
    listening = true
  }
  return () => {
    subscribers.delete(cb)
  }
}

export function useHideOnScroll(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hidden,
    () => false,
  )
}
