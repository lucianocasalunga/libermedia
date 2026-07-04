// Efeito de confirmação do Zap pago: explosão RADIAL a partir do centro da tela —
// moedas douradas/prateadas + notas verdes de dólar, com flash central e som de
// CAIXA REGISTRADORA ("ka-ching") + moedas. Some sozinho (~1,5s) e limpa o canvas.
//
// Versão LEVE (sem shadowBlur/blending pesado) — a variante "caprichada" ficou
// lenta. A melhorar com calma depois (mantendo o FPS).
// Base visual: Mistral (codestral), revisada. AudioContext = singleton de módulo.

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  type: 'gold' | 'silver' | 'note'
  rotation: number
  rotationSpeed: number
  alpha: number
  scaleX: number
}

let audioContext: AudioContext | null = null
function getAudioContext(): AudioContext | null {
  try {
    if (!audioContext) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      audioContext = new AC()
    }
    if (audioContext.state === 'suspended') void audioContext.resume()
    return audioContext
  } catch {
    return null
  }
}

export function celebrateZap(): void {
  let canvas: HTMLCanvasElement | null = null
  let animationFrameId: number | null = null

  // Som de CAIXA REGISTRADORA ("ka-ching") + moedas tilintando.
  const playSound = () => {
    const ac = getAudioContext()
    if (!ac) return
    const t0 = ac.currentTime
    const master = ac.createGain()
    master.gain.value = 0.5
    master.connect(ac.destination)

    const bell = (start: number, base: number, vol: number) => {
      ;[1, 2.01, 3.0].forEach((mult, idx) => {
        const o = ac.createOscillator()
        const g = ac.createGain()
        o.type = 'triangle'
        o.frequency.setValueAtTime(base * mult, start)
        g.gain.setValueAtTime(0.0001, start)
        g.gain.exponentialRampToValueAtTime(vol / (idx + 1), start + 0.005)
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.45)
        o.connect(g)
        g.connect(master)
        o.start(start)
        o.stop(start + 0.5)
      })
    }
    bell(t0, 784, 0.18)
    bell(t0 + 0.09, 1046, 0.2)

    const freqs = [2600, 3200, 2900, 3600]
    for (let i = 0; i < freqs.length; i++) {
      const start = t0 + 0.12 + i * 0.05 + Math.random() * 0.02
      const f = freqs[i] * (0.9 + Math.random() * 0.3)
      const o = ac.createOscillator()
      const g = ac.createGain()
      o.type = 'triangle'
      o.frequency.setValueAtTime(f, start)
      o.frequency.exponentialRampToValueAtTime(f * 0.7, start + 0.1)
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(0.12, start + 0.005)
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.1)
      o.connect(g)
      g.connect(master)
      o.start(start)
      o.stop(start + 0.11)
    }
  }

  const createParticle = (x: number, y: number, type: 'gold' | 'silver' | 'note'): Particle => {
    const angle = Math.random() * Math.PI * 2
    const speed = 2 + Math.random() * 3
    const size = type === 'note' ? 15 + Math.random() * 10 : 8 + Math.random() * 6
    const rotationSpeed = (Math.random() - 0.5) * 0.1
    return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size, type, rotation: 0, rotationSpeed, alpha: 1, scaleX: 1 }
  }

  const updateParticle = (p: Particle, progress: number) => {
    p.vy += 0.05
    p.x += p.vx
    p.y += p.vy
    p.rotation += p.rotationSpeed
    p.scaleX = Math.cos(p.rotation)
    p.alpha = 1 - progress
    p.vx *= p.type === 'note' ? 0.98 : 0.99
  }

  const drawCoin = (ctx: CanvasRenderingContext2D, size: number, type: 'gold' | 'silver') => {
    const gradient = ctx.createRadialGradient(-size * 0.3, -size * 0.3, size * 0.1, 0, 0, size)
    if (type === 'gold') {
      gradient.addColorStop(0, '#FFE89A')
      gradient.addColorStop(0.5, '#FFD700')
      gradient.addColorStop(1, '#DAA520')
    } else {
      gradient.addColorStop(0, '#F0F0F0')
      gradient.addColorStop(0.5, '#C0C0C0')
      gradient.addColorStop(1, '#808080')
    }
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(0, 0, size, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = type === 'gold' ? '#B8860B' : '#6E6E6E'
    ctx.lineWidth = 1
    ctx.stroke()
    // brilho deslocado (highlight), não um furo no centro
    ctx.beginPath()
    ctx.arc(-size * 0.32, -size * 0.32, size * 0.22, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fill()
  }

  const drawNote = (ctx: CanvasRenderingContext2D, size: number) => {
    const width = size * 1.6
    const height = size
    ctx.fillStyle = '#3FA86A'
    ctx.beginPath()
    ctx.roundRect(-width / 2, -height / 2, width, height, height / 4)
    ctx.fill()
    ctx.strokeStyle = '#1E6B43'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = '#E8FFEF'
    ctx.font = `bold ${size * 0.7}px Arial`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('$', 0, 0)
  }

  const drawParticle = (ctx: CanvasRenderingContext2D, p: Particle) => {
    ctx.save()
    ctx.globalAlpha = Math.max(0, p.alpha)
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rotation)
    ctx.scale(p.scaleX, 1)
    if (p.type === 'note') drawNote(ctx, p.size)
    else drawCoin(ctx, p.size, p.type)
    ctx.restore()
  }

  const drawFlash = (ctx: CanvasRenderingContext2D, x: number, y: number, progress: number) => {
    const local = progress / 0.2 // 0→1 nos primeiros 20%
    const radius = 30 + local * 180
    const alpha = (1 - local) * 0.8
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(255, 215, 0, ${alpha})`
    ctx.lineWidth = 3
    ctx.stroke()
  }

  const cleanup = () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
    if (canvas && canvas.parentNode) {
      canvas.parentNode.removeChild(canvas)
      canvas = null
    }
  }

  const createCanvas = () => {
    canvas = document.createElement('canvas')
    canvas.style.position = 'fixed'
    canvas.style.inset = '0'
    canvas.style.pointerEvents = 'none'
    canvas.style.zIndex = '2147483646'
    document.body.appendChild(canvas)

    const dpr = window.devicePixelRatio || 1
    const W = window.innerWidth
    const H = window.innerHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) { cleanup(); return }
    ctx.scale(dpr, dpr)

    const cx = W / 2
    const cy = H / 2
    const particles: Particle[] = []
    for (let i = 0; i < 110; i++) {
      const type = i % 3 === 0 ? 'gold' : i % 3 === 1 ? 'silver' : 'note'
      particles.push(createParticle(cx, cy, type))
    }

    let startTime: number | null = null
    const duration = 1500
    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      ctx.clearRect(0, 0, W, H)
      if (progress < 0.2) drawFlash(ctx, cx, cy, progress)
      for (const p of particles) {
        updateParticle(p, progress)
        drawParticle(ctx, p)
      }
      if (progress < 1) animationFrameId = requestAnimationFrame(animate)
      else cleanup()
    }
    animationFrameId = requestAnimationFrame(animate)
  }

  playSound()
  createCanvas()
}
