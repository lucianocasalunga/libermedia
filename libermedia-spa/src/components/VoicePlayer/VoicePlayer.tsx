// Player de áudio/voz estilo WhatsApp — substitui o <audio controls> nativo (que não
// é estilizável). <audio> headless controlado por JS + UI nossa (play/pause, waveform
// clicável, tempo, velocidade). Cores do tema → combina com os balões do mensageiro.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

// Só UM áudio toca por vez (igual WhatsApp): ao dar play, pausa o anterior.
let currentAudio: HTMLAudioElement | null = null

const RATES = [1, 1.5, 2] as const

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// Waveform sintética (determinística por URL) — PLACEHOLDER instantâneo enquanto a real
// decodifica, e FALLBACK se a real falhar (ex: webm legado que o iOS não decodifica).
function waveBars(src: string, n = 32): number[] {
  let h = 2166136261
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const bars: number[] = []
  for (let i = 0; i < n; i++) {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    bars.push(0.25 + (Math.abs(h) % 1000) / 1000 * 0.75) // 0.25..1.0
  }
  return bars
}

// Waveform REAL: baixa o áudio, decodifica (Web Audio) e extrai o RMS por bucket. Cache
// por URL (não re-decodifica) + 1 AudioContext compartilhado. Retorna null se falhar
// (CORS/formato/erro) → o chamador mantém a sintética. Same-origin (media.libernet.app).
let _sharedCtx: AudioContext | null = null
const _waveCache = new Map<string, number[]>()
async function realWaveBars(src: string, n = 40): Promise<number[] | null> {
  const cached = _waveCache.get(src)
  if (cached) return cached
  try {
    const res = await fetch(src)
    if (!res.ok) return null
    const raw = await res.arrayBuffer()
    if (!_sharedCtx) {
      const W = window as unknown as { webkitAudioContext?: typeof AudioContext }
      const Ctor = window.AudioContext || W.webkitAudioContext
      if (!Ctor) return null
      _sharedCtx = new Ctor()
    }
    const audio = await _sharedCtx.decodeAudioData(raw)
    const data = audio.getChannelData(0) // voz é mono
    const block = Math.max(1, Math.floor(data.length / n))
    const bars: number[] = []
    let max = 1e-4
    for (let i = 0; i < n; i++) {
      let sum = 0
      for (let j = 0; j < block; j++) {
        const v = data[i * block + j] || 0
        sum += v * v
      }
      const rms = Math.sqrt(sum / block)
      bars.push(rms)
      if (rms > max) max = rms
    }
    const norm = bars.map((b) => 0.15 + (b / max) * 0.85) // normaliza 0.15..1.0
    _waveCache.set(src, norm)
    return norm
  } catch {
    return null
  }
}

// `footer` = hora + ticks (vem do balão), renderizado no canto INFERIOR DIREITO da trilha.
// Cores herdam `currentColor` (cor do texto do balão) → não somem no balão colorido.
export function VoicePlayer({ src, footer }: { src: string; footer?: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const waveRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)
  const [rate, setRate] = useState<(typeof RATES)[number]>(1)
  // Sintética na hora (placeholder) → troca pela REAL quando decodificar (suave). A real
  // guarda o próprio `src`: se o componente for reusado p/ outro áudio, cai na sintética
  // até a nova real chegar. setReal só roda no .then (async) → sem setState-no-effect.
  const synth = useMemo(() => waveBars(src, 40), [src])
  const [real, setReal] = useState<{ src: string; bars: number[] } | null>(null)
  const bars = real && real.src === src ? real.bars : synth
  useEffect(() => {
    let alive = true
    void realWaveBars(src, 40).then((r) => {
      if (alive && r) setReal({ src, bars: r })
    })
    return () => {
      alive = false
    }
  }, [src])

  // Duração: o áudio servido é m4a/AAC com +faststart → a duração vem CORRETA no
  // loadedmetadata/durationchange. NÃO seekamos pra forçar duração (o hack de pular pro
  // fim quebrava a reprodução no iOS e fazia tocar só metade). Se vier Infinity (webm
  // legado), deixamos 0 e pegamos a duração no fim (ended) — sem mexer no playback.
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onMeta = () => {
      const d = a.duration
      if (Number.isFinite(d) && d > 0) setDur(d)
    }
    const onTime = () => setCur(a.currentTime)
    const onEnd = () => {
      if (Number.isFinite(a.currentTime) && a.currentTime > 0 && !dur) setDur(a.currentTime)
      setPlaying(false)
      setCur(0)
      if (currentAudio === a) currentAudio = null
    }
    const onPause = () => setPlaying(false)
    const onPlay = () => setPlaying(true)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('durationchange', onMeta)
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('ended', onEnd)
    a.addEventListener('pause', onPause)
    a.addEventListener('play', onPlay)
    return () => {
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('durationchange', onMeta)
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('ended', onEnd)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('play', onPlay)
      if (currentAudio === a) currentAudio = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      if (currentAudio && currentAudio !== a) currentAudio.pause()
      currentAudio = a
      a.playbackRate = rate
      void a.play()
    } else {
      a.pause()
    }
  }

  const seek = (clientX: number) => {
    const a = audioRef.current
    const el = waveRef.current
    if (!a || !el || !dur) return
    const r = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    a.currentTime = ratio * dur
    setCur(a.currentTime)
  }

  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length]
    setRate(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }

  const progress = dur ? cur / dur : 0

  return (
    <div className="flex w-full items-center gap-2">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      {/* Play / Pause — ícone (currentColor), alinhado verticalmente à trilha */}
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pausar' : 'Reproduzir'}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
      >
        {playing ? (
          <svg viewBox="0 0 24 24" width={22} height={22} fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width={22} height={22} fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        {/* Cima: duração (esq) · velocidade (dir) */}
        <div className="mb-0.5 flex items-center justify-between text-[10px] leading-none opacity-70">
          <span>{fmt(playing || cur > 0 ? cur : dur)}</span>
          <button type="button" onClick={cycleRate} aria-label="Velocidade" className="font-semibold opacity-90 hover:opacity-100">
            {rate}x
          </button>
        </div>
        {/* Trilha (waveform) clicável — arrastar/clicar = avançar */}
        <div
          ref={waveRef}
          onPointerDown={(e) => {
            e.stopPropagation() // seek do áudio NÃO deve virar swipe-to-menu da mensagem
            seek(e.clientX)
            const move = (ev: PointerEvent) => seek(ev.clientX)
            const up = () => {
              window.removeEventListener('pointermove', move)
              window.removeEventListener('pointerup', up)
            }
            window.addEventListener('pointermove', move)
            window.addEventListener('pointerup', up)
          }}
          className="flex h-4 cursor-pointer items-center gap-[2px]"
        >
          {bars.map((b, i) => (
            <span
              key={i}
              className="w-full flex-1 rounded-full"
              style={{
                height: `${Math.round(b * 100)}%`,
                background: 'currentColor',
                opacity: i / bars.length <= progress ? 0.95 : 0.3,
              }}
            />
          ))}
        </div>
        {/* Baixo: hora + ticks (canto inferior direito) */}
        {footer && (
          <div className="mt-0.5 flex items-center justify-end gap-0.5 text-[10px] leading-none opacity-70">{footer}</div>
        )}
      </div>
    </div>
  )
}
