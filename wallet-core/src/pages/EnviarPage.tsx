// Enviar (F4) — cola/escaneia uma invoice (bolt11) OU um Lightning Address, confirma e paga.
// Scanner via BarcodeDetector nativo (sem dependência); some se o navegador não suportar.
import { useEffect, useRef, useState } from 'react'
import { useWalletNav } from '../nav'
import { wallet, WalletApiError, type DecodeResp } from '../services/wallet'

const nf = new Intl.NumberFormat('pt-BR')
const ADDR_RE = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const hasScanner = () => 'BarcodeDetector' in window

type Stage = 'input' | 'confirm' | 'lnaddr' | 'done'
interface LnMeta { lightning_address: string; min_sats: number; max_sats: number; description: string }

export function EnviarPage() {
  const nav = useWalletNav()
  const [stage, setStage] = useState<Stage>('input')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [decoded, setDecoded] = useState<DecodeResp | null>(null)
  const [meta, setMeta] = useState<LnMeta | null>(null)
  const [amount, setAmount] = useState('')
  const [scanning, setScanning] = useState(false)

  function fail(e: unknown) {
    setError(e instanceof WalletApiError ? e.message : 'Falha. Confira e tente de novo.')
    setBusy(false)
  }

  async function continuar() {
    const v = value.trim()
    if (!v) return
    setBusy(true); setError(null)
    try {
      if (ADDR_RE.test(v)) {
        const m = await wallet.resolveLnaddr(v, null)
        setMeta(m as LnMeta); setStage('lnaddr')
      } else if (v.toLowerCase().startsWith('ln')) {
        const d = await wallet.decode(v)
        setDecoded(d); setStage('confirm')
      } else {
        setError('Cole uma invoice (lnbc…) ou um endereço (usuario@dominio).')
      }
    } catch (e) { fail(e); return }
    setBusy(false)
  }

  async function pagarInvoice() {
    setBusy(true); setError(null)
    try { await wallet.pay(value.trim()); setStage('done') } catch (e) { fail(e) }
  }

  async function pagarLnaddr() {
    const sats = parseInt(amount, 10)
    if (!sats || !meta) return
    setBusy(true); setError(null)
    try {
      const r = await wallet.resolveLnaddr(meta.lightning_address, sats)
      await wallet.pay(r.payment_request)
      setStage('done')
    } catch (e) { fail(e) }
  }

  function reset() { setStage('input'); setValue(''); setDecoded(null); setMeta(null); setAmount(''); setError(null) }

  return (
    <div className="lm-page min-h-full bg-[var(--lm-bg-main)] text-[var(--lm-text-pri)]">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-[color-mix(in_srgb,var(--lm-text-pri)_10%,transparent)]">
        <button type="button" onClick={() => (stage === 'input' ? nav.back() : reset())} aria-label="Voltar" className="p-1 -ml-1">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 className="text-base font-semibold">Enviar</h1>
      </header>

      <div className="p-5 flex flex-col items-center gap-4">
        {scanning && <Scanner onResult={(v) => { setValue(v); setScanning(false) }} onClose={() => setScanning(false)} />}

        {stage === 'input' && (
          <div className="w-full max-w-[340px] flex flex-col gap-3 pt-2">
            <textarea
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(null) }}
              placeholder="Invoice (lnbc…) ou endereço (usuario@libernet.app)"
              rows={3}
              autoCapitalize="none" autoCorrect="off" spellCheck={false}
              className="resize-none rounded-xl px-4 py-3 bg-[color-mix(in_srgb,var(--lm-text-pri)_8%,transparent)] outline-none placeholder:opacity-40 break-all"
            />
            {hasScanner() && (
              <button type="button" onClick={() => setScanning(true)} className="flex items-center justify-center gap-2 rounded-xl py-3 font-medium bg-[color-mix(in_srgb,var(--lm-text-pri)_8%,transparent)]">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10" /></svg>
                Escanear QR
              </button>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="button" disabled={busy || !value.trim()} onClick={continuar} className="rounded-xl py-3 font-semibold text-white bg-[var(--lm-accent,#f5a623)] disabled:opacity-40 transition">
              {busy ? 'Lendo…' : 'Continuar'}
            </button>
          </div>
        )}

        {stage === 'confirm' && decoded && (
          <div className="w-full max-w-[340px] flex flex-col items-center gap-4 pt-4">
            <p className="text-sm opacity-60">Você vai enviar</p>
            <p className="text-4xl font-bold tabular-nums">{nf.format(decoded.amount_sats)} <span className="text-base opacity-50">sats</span></p>
            {decoded.description && <p className="text-center text-sm opacity-60">{decoded.description}</p>}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="button" disabled={busy} onClick={pagarInvoice} className="mt-2 w-full rounded-xl py-3 font-semibold text-white bg-[var(--lm-accent,#f5a623)] disabled:opacity-40 transition">
              {busy ? 'Pagando…' : 'Pagar'}
            </button>
          </div>
        )}

        {stage === 'lnaddr' && meta && (
          <div className="w-full max-w-[340px] flex flex-col gap-3 pt-4">
            <p className="text-center text-sm opacity-70 break-all">{meta.lightning_address}</p>
            {meta.description && <p className="text-center text-xs opacity-50">{meta.description}</p>}
            <label className="text-sm opacity-70">Valor (sats)</label>
            <input
              value={amount}
              onChange={(e) => { setAmount(e.target.value.replace(/[^0-9]/g, '')); setError(null) }}
              inputMode="numeric" placeholder={`${nf.format(meta.min_sats)} – ${nf.format(meta.max_sats)}`}
              className="rounded-xl px-4 py-3 text-lg tabular-nums bg-[color-mix(in_srgb,var(--lm-text-pri)_8%,transparent)] outline-none placeholder:opacity-40"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="button" disabled={busy || !amount} onClick={pagarLnaddr} className="mt-2 rounded-xl py-3 font-semibold text-white bg-[var(--lm-accent,#f5a623)] disabled:opacity-40 transition">
              {busy ? 'Pagando…' : 'Pagar'}
            </button>
          </div>
        )}

        {stage === 'done' && (
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-green-500/15 text-green-400">
              <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
            </div>
            <p className="text-lg font-semibold">Enviado!</p>
            <button type="button" onClick={() => nav.go('dashboard')} className="rounded-xl px-6 py-2.5 font-medium text-white bg-[var(--lm-accent,#f5a623)]">Concluir</button>
          </div>
        )}
      </div>
    </div>
  )
}

// Scanner de QR via BarcodeDetector (nativo). Câmera traseira.
function Scanner({ onResult, onClose }: { onResult: (v: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const Detector = (window as any).BarcodeDetector
    const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null

    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return }
        const v = videoRef.current
        if (v) { v.srcObject = stream; await v.play() }
        const tick = async () => {
          if (stopped || !detector || !videoRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes && codes[0]?.rawValue) {
              const raw = String(codes[0].rawValue).replace(/^lightning:/i, '')
              onResult(raw); return
            }
          } catch { /* frame sem código */ }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      } catch {
        setErr('Não foi possível acessar a câmera.')
      }
    })()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onResult])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-6">
      <video ref={videoRef} playsInline muted className="w-full max-w-[360px] rounded-2xl" />
      {err && <p className="mt-4 text-sm text-red-400">{err}</p>}
      <button type="button" onClick={onClose} className="mt-6 rounded-xl px-6 py-2.5 font-medium text-white bg-white/15">Fechar</button>
    </div>
  )
}
