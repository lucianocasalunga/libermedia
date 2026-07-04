// Carrega o spoiler.js do MPA (motor de canvas NSFW, ~30 temas em 3 categorias)
// uma única vez. Expõe window.SpoilerInit/SpoilerStop. Reuso — não reescrevo.
declare global {
  interface Window {
    SpoilerInit?: (canvas: HTMLCanvasElement, type: string) => void
    SpoilerStop?: (canvas: HTMLCanvasElement) => void
  }
}

let loadPromise: Promise<void> | null = null

export function ensureSpoiler(): Promise<void> {
  if (window.SpoilerInit) return Promise.resolve()
  if (!loadPromise) {
    loadPromise = new Promise((resolve) => {
      const s = document.createElement('script')
      s.src = '/static/js/spoiler.js'
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => resolve() // falha → sem canvas, mas o overlay ainda bloqueia
      document.head.appendChild(s)
    })
  }
  return loadPromise
}
