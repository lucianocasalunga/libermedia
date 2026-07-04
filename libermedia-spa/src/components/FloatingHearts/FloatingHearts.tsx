// Coraçõezinhos subindo ao curtir (estilo TikTok). Base gerada pela Mistral
// (codestral) e finalizada aqui: sobem ~220px da posição do toque, com deriva
// horizontal e rotação aleatórias por coração, fade-out. Só transform/opacity (GPU).
//
// Uso:
//   const { layer, burst } = useFloatingHearts()
//   ...render {layer} no topo da árvore; chame burst(clientX, clientY) ao curtir.
import { useCallback, useRef, useState } from 'react'

interface Heart {
  id: number
  x: number
  y: number
  dx: number
  rot: number
  scale: number
  duration: number
  delay: number
}

// Injeta os keyframes uma única vez (idempotente, seguro no iOS Safari).
const STYLE_ID = 'lm-floating-hearts-kf'
function ensureKeyframes() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes lm-heart-float {
      0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.4) rotate(0deg); }
      12%  { opacity: 1; }
      100% { opacity: 0; transform: translate(calc(-50% + var(--lm-dx)), calc(-50% - 230px)) scale(1.15) rotate(var(--lm-rot)); }
    }`
  document.head.appendChild(style)
}

export function useFloatingHearts() {
  const [hearts, setHearts] = useState<Heart[]>([])
  const nextId = useRef(0)

  const burst = useCallback((x: number, y: number) => {
    ensureKeyframes()
    const count = 8 + Math.floor(Math.random() * 5) // 8–12
    const batch: Heart[] = []
    for (let i = 0; i < count; i++) {
      batch.push({
        id: nextId.current++,
        x: x + (Math.random() * 30 - 15),
        y,
        dx: Math.random() * 100 - 50, // deriva ±50px
        rot: Math.random() * 60 - 30, // rotação ±30deg
        scale: 0.6 + Math.random() * 0.6,
        duration: 1000 + Math.random() * 500,
        delay: i * 45,
      })
    }
    setHearts((prev) => [...prev, ...batch])
    batch.forEach((h) => {
      window.setTimeout(() => {
        setHearts((prev) => prev.filter((p) => p.id !== h.id))
      }, h.duration + h.delay + 60)
    })
  }, [])

  const layer = (
    <div className="pointer-events-none fixed inset-0 z-[1200]" aria-hidden>
      {hearts.map((h) => (
        <span
          key={h.id}
          style={{
            position: 'absolute',
            left: h.x,
            top: h.y,
            // @ts-expect-error — CSS custom properties
            '--lm-dx': `${h.dx}px`,
            '--lm-rot': `${h.rot}deg`,
            fontSize: `${22 * h.scale}px`,
            color: '#ff2d55',
            willChange: 'transform, opacity',
            animation: `lm-heart-float ${h.duration}ms cubic-bezier(0.22,0.61,0.36,1) ${h.delay}ms forwards`,
          }}
        >
          <svg viewBox="0 0 24 24" width="1em" height="1em" fill="#ff2d55" aria-hidden>
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </span>
      ))}
    </div>
  )

  return { layer, burst }
}
