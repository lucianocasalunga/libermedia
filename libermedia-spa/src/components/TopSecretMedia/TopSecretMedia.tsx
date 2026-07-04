// Conteúdo pago no FEED (Fase 2): mostra a thumbnail sob a canvas (glitch) + "🔒 Pagar X sats".
// Clique → unlock: se já comprou/é criador → revela; senão gera invoice e oferece pagar
// (carteira embarcada 1-toque / WebLN / invoice QR+copiar+lightning:), faz polling e revela.
import { useEffect, useRef, useState } from 'react'
import { ensureSpoiler } from '../../lib/spoiler-loader'
import { FeedVideo } from '../FeedVideo/FeedVideo'
import { QrCode } from '../QrCode/QrCode'
import { hasWalletToken, wallet as liberWallet } from '../../services/wallet'
import {
  unlock, checkPayment, ensurePurchased, markPurchased, purchasedFileUrl,
} from '../../services/topsecret'

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : String(n))

export function TopSecretMedia({ fileId, price, thumb }: { fileId: string; price: number; thumb?: string }) {
  const [unlocked, setUnlocked] = useState(false)
  const [mime, setMime] = useState('')
  // Fallback seguro: se o <img> falhar (o arquivo é na verdade vídeo), renderiza
  // <video> via React — NUNCA via outerHTML com a URL interpolada (evita DOM-XSS).
  const [imgIsVideo, setImgIsVideo] = useState(false)
  const [stage, setStage] = useState<'locked' | 'unlocking' | 'pay'>('locked')
  const [inv, setInv] = useState<{ bolt11: string; hash: string; preco: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const poll = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-revela o que o usuário já comprou.
  useEffect(() => {
    let on = true
    void ensurePurchased().then((m) => { if (on && m.has(fileId)) { setMime(m.get(fileId) || ''); setUnlocked(true) } })
    return () => { on = false }
  }, [fileId])

  // Canvas glitch enquanto bloqueado.
  useEffect(() => {
    if (unlocked) return
    const cv = canvasRef.current
    let stopped = false
    void ensureSpoiler().then(() => { if (!stopped && cv && window.SpoilerInit) window.SpoilerInit(cv, 'paid') })
    return () => { stopped = true; if (cv && window.SpoilerStop) window.SpoilerStop(cv) }
  }, [unlocked, stage])

  useEffect(() => () => { if (poll.current) clearInterval(poll.current) }, [])

  function revealPaid(m?: string) {
    markPurchased(fileId, m || '')
    setMime(m || ''); setUnlocked(true); setInv(null)
    if (poll.current) { clearInterval(poll.current); poll.current = null }
  }

  function startPolling(hash: string) {
    if (poll.current) clearInterval(poll.current)
    poll.current = setInterval(async () => {
      try { const r = await checkPayment(fileId, hash); if (r.paid) revealPaid(r.mime_type) } catch { /* segue */ }
    }, 2500)
  }

  async function begin(e: React.MouseEvent) {
    e.stopPropagation()
    if (stage !== 'locked') return
    setStage('unlocking'); setError(null)
    try {
      const r = await unlock(fileId)
      if (r.already_unlocked) { revealPaid(r.mime_type); return }
      if (r.bolt11 && r.payment_hash) { setInv({ bolt11: r.bolt11, hash: r.payment_hash, preco: r.preco_sats || price }); setStage('pay'); startPolling(r.payment_hash) }
      else { setError('Não foi possível gerar a cobrança.'); setStage('locked') }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao desbloquear.'); setStage('locked')
    }
  }

  async function payWallet() {
    if (!inv) return
    try { await liberWallet.pay(inv.bolt11) } catch (e) { setError(e instanceof Error ? e.message : 'Falha no pagamento.') }
  }
  async function payWebln() {
    if (!inv) return
    try { const w = (window as any).webln; await w?.enable?.(); await w?.sendPayment?.(inv.bolt11) }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha no WebLN.') }
  }

  // ── revelado ── (tamanho natural da mídia: larga/baixa ou alta, como ela é)
  if (unlocked) {
    const url = purchasedFileUrl(fileId)
    if (mime.startsWith('video') || imgIsVideo) return <FeedVideo className="block w-full rounded-xl" src={url} />
    return <img className="block w-full rounded-xl" src={url} alt="" onError={() => setImgIsVideo(true)} />
  }

  // ── bloqueado / pagando ──
  // O canvas segue o tamanho da THUMBNAIL (mesma proporção da imagem real) → sem
  // quadrado fixo: nada de espaço sobrando nem "pulo" ao revelar.
  return (
    <div className="relative overflow-hidden rounded-xl">
      {thumb ? (
        <img src={thumb} alt="" className="block w-full blur-md" />
      ) : (
        <div className="aspect-square w-full" />
      )}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {stage !== 'pay' ? (
        <button
          type="button"
          onClick={begin}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white"
        >
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          <span className="rounded-full bg-black/60 px-4 py-1.5 text-sm font-bold backdrop-blur">
            {stage === 'unlocking' ? 'Abrindo…' : `🔒 Pagar ${fmt(price)} sats`}
          </span>
          {error && <span className="px-3 text-center text-xs text-red-300">{error}</span>}
        </button>
      ) : inv && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-3 text-white" onClick={(e) => e.stopPropagation()}>
          <div className="rounded-lg bg-white p-2"><QrCode value={inv.bolt11} size={150} /></div>
          <span className="text-sm font-bold">{fmt(inv.preco)} sats</span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {hasWalletToken() && <button type="button" onClick={payWallet} className="rounded-full bg-[var(--lm-accent)] px-3 py-1 text-xs font-semibold">Pagar c/ carteira</button>}
            {(window as any).webln && <button type="button" onClick={payWebln} className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">WebLN</button>}
            <button type="button" onClick={() => navigator.clipboard.writeText(inv.bolt11)} className="rounded-full bg-white/20 px-3 py-1 text-xs">Copiar</button>
            <a href={`lightning:${inv.bolt11}`} className="rounded-full bg-white/20 px-3 py-1 text-xs">Abrir carteira</a>
          </div>
          <span className="flex items-center gap-1 text-xs opacity-70"><span className="h-2 w-2 animate-pulse rounded-full bg-green-400" /> aguardando pagamento…</span>
          {error && <span className="text-center text-xs text-red-300">{error}</span>}
        </div>
      )}
    </div>
  )
}
