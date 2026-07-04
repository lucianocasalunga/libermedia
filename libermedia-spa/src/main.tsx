import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Splash de abertura (logo pulsando): some assim que o React pinta o 1º frame,
// revelando o app já montado em vez de tela branca/preta. Dois rAF = garante que o
// frame foi pintado antes do fade. O fallback de 8s no index.html cobre falha de JS.
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    ;(window as { __lmHideSplash?: () => void }).__lmHideSplash?.()
  }),
)

// Self-heal de chunk lazy: se um chunk de rota foi apagado num redeploy (rsync --delete),
// o import dinâmico falha (vite:preloadError) → recarrega UMA vez (mesma trava de 30s do
// guard inline no index.html). Sem isso, navegar pra uma rota lazy pós-deploy daria branco.
window.addEventListener('vite:preloadError', () => {
  const KEY = 'lm_selfheal_ts'
  const last = +(sessionStorage.getItem(KEY) || 0)
  if (Date.now() - last < 30000) return
  sessionStorage.setItem(KEY, String(Date.now()))
  location.reload()
})

// PWA — registra o Service Worker (escopo da própria base: /v2.5/ agora, / no futuro).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL || '/'
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {})
  })
}
