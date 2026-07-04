// Efeitos sonoros sutis via Web Audio API (sem arquivos). O AudioContext só é
// criado no primeiro gesto do usuário (clique), respeitando a política dos browsers.
let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const W = window as unknown as { webkitAudioContext?: typeof AudioContext }
      const Ctor = window.AudioContext || W.webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** "Tap" curto e discreto ao clicar/tocar um botão. */
export function playTap() {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(440, t)
  osc.frequency.exponentialRampToValueAtTime(620, t + 0.04)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.12, t + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.start(t)
  osc.stop(t + 0.13)
}

/** Mensagem ENVIADA — "chirp" curto subindo (sutil). */
export function playSendMsg() {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(520, t)
  osc.frequency.exponentialRampToValueAtTime(900, t + 0.11)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.24, t + 0.02) // volume reforçado (era 0.09)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.17)
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.start(t)
  osc.stop(t + 0.18)
}

/** "Chamar a atenção" (zumbido MSN) — 3 buzzes graves (square) em rajada. */
export function playNudge() {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  for (const delay of [0, 0.16, 0.32]) {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    const s = t + delay
    osc.type = 'square'
    osc.frequency.setValueAtTime(190, s)
    osc.frequency.exponentialRampToValueAtTime(110, s + 0.12)
    gain.gain.setValueAtTime(0.0001, s)
    gain.gain.exponentialRampToValueAtTime(0.22, s + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, s + 0.14)
    osc.connect(gain)
    gain.connect(ac.destination)
    osc.start(s)
    osc.stop(s + 0.15)
  }
}

// Coalescer: uma rajada de mensagens novas (ex.: 5 de uma vez) toca UM som, não 5.
let lastRecvAt = 0
const RECV_MIN_GAP_MS = 1500

/** Mensagem RECEBIDA — "ding-dong" suave (duas notas descendentes). */
export function playRecvMsg() {
  const now = Date.now()
  if (now - lastRecvAt < RECV_MIN_GAP_MS) return
  lastRecvAt = now
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  for (const [freq, delay] of [
    [784, 0],
    [587, 0.13],
  ] as const) {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    const s = t + delay
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, s)
    gain.gain.setValueAtTime(0.0001, s)
    gain.gain.exponentialRampToValueAtTime(0.24, s + 0.02) // volume reforçado (era 0.08)
    gain.gain.exponentialRampToValueAtTime(0.0001, s + 0.22)
    osc.connect(gain)
    gain.connect(ac.destination)
    osc.start(s)
    osc.stop(s + 0.24)
  }
}
