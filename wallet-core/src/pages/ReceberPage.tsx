// Receber (F3) — gera invoice Lightning, mostra QR (com logo) + bolt11, faz polling
// até o pagamento cair. Overlay /receber.
import { useEffect, useRef, useState } from 'react'
import { useWalletNav } from '../nav'
import { wallet, WalletApiError, type InvoiceResp } from '../services/wallet'
import { QrCode } from '../components/QrCode/QrCode'

const nf = new Intl.NumberFormat('pt-BR')

export function ReceberPage() {
  const nav = useWalletNav()
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [inv, setInv] = useState<InvoiceResp | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paid, setPaid] = useState(false)
  const [copied, setCopied] = useState(false)
  const poll = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearInterval(poll.current), [])

  async function gerar() {
    setBusy(true); setError(null)
    try {
      const sats = amount.trim() ? parseInt(amount, 10) : null
      const r = await wallet.createInvoice(sats, memo.trim() || undefined)
      setInv(r)
      // polling do status
      window.clearInterval(poll.current)
      poll.current = window.setInterval(async () => {
        try {
          const s = await wallet.checkInvoice(r.payment_hash)
          if (s.paid) {
            window.clearInterval(poll.current)
            setPaid(true)
            try { navigator.vibrate?.(40) } catch { /* noop */ }
          }
        } catch { /* segue tentando */ }
      }, 2500)
    } catch (e) {
      setError(e instanceof WalletApiError ? e.message : 'Falha ao gerar a cobrança.')
    } finally { setBusy(false) }
  }

  function copy() {
    if (!inv) return
    void navigator.clipboard.writeText(inv.payment_request).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    })
  }

  function reset() {
    window.clearInterval(poll.current)
    setInv(null); setPaid(false); setAmount(''); setMemo(''); setError(null)
  }

  return (
    <div className="lm-page min-h-full bg-[var(--lm-bg-main)] text-[var(--lm-text-pri)]">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-[color-mix(in_srgb,var(--lm-text-pri)_10%,transparent)]">
        <button type="button" onClick={() => nav.back()} aria-label="Voltar" className="p-1 -ml-1">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 className="text-base font-semibold">Receber</h1>
      </header>

      <div className="p-5 flex flex-col items-center gap-5">
        {/* Pago */}
        {paid ? (
          <div className="flex flex-col items-center gap-4 py-10">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-green-500/15 text-green-400">
              <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
            </div>
            <p className="text-lg font-semibold">Pagamento recebido!</p>
            {inv?.amount_sats ? <p className="opacity-60 tabular-nums">+{nf.format(inv.amount_sats)} sats</p> : null}
            <div className="flex gap-3">
              <button type="button" onClick={reset} className="rounded-xl px-5 py-2.5 font-medium bg-[color-mix(in_srgb,var(--lm-text-pri)_10%,transparent)]">Nova cobrança</button>
              <button type="button" onClick={() => nav.go('dashboard')} className="rounded-xl px-5 py-2.5 font-medium text-white bg-[var(--lm-accent,#f5a623)]">Concluir</button>
            </div>
          </div>
        ) : inv ? (
          /* Invoice gerada */
          <>
            <div className="rounded-xl bg-white p-3"><QrCode value={inv.payment_request} size={232} /></div>
            <p className="text-sm opacity-60">
              {inv.amount_sats ? <span className="tabular-nums">{nf.format(inv.amount_sats)} sats</span> : 'Qualquer valor'}
              <span className="ml-2 inline-flex items-center gap-1"><span className="h-2 w-2 animate-pulse rounded-full bg-green-400" /> aguardando…</span>
            </p>
            <button type="button" onClick={copy} className="w-full max-w-[280px] truncate rounded-xl px-4 py-3 text-sm bg-[color-mix(in_srgb,var(--lm-text-pri)_8%,transparent)] active:scale-95 transition">
              {copied ? '✓ Copiado!' : `${inv.payment_request.slice(0, 22)}…${inv.payment_request.slice(-8)}`}
            </button>
            <a href={`lightning:${inv.payment_request}`} className="text-sm text-[var(--lm-accent,#f5a623)] font-medium">Abrir na carteira</a>
            <button type="button" onClick={reset} className="text-xs opacity-50 underline">cancelar</button>
          </>
        ) : (
          /* Formulário */
          <div className="w-full max-w-[320px] flex flex-col gap-3 pt-4">
            <label className="text-sm opacity-70">Valor (sats) — opcional</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric" placeholder="0"
              className="rounded-xl px-4 py-3 text-lg tabular-nums bg-[color-mix(in_srgb,var(--lm-text-pri)_8%,transparent)] outline-none placeholder:opacity-40"
            />
            <label className="mt-2 text-sm opacity-70">Descrição — opcional</label>
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Para quê?"
              className="rounded-xl px-4 py-3 bg-[color-mix(in_srgb,var(--lm-text-pri)_8%,transparent)] outline-none placeholder:opacity-40"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="button" disabled={busy} onClick={gerar}
              className="mt-3 rounded-xl py-3 font-semibold text-white bg-[var(--lm-accent,#f5a623)] disabled:opacity-40 transition"
            >
              {busy ? 'Gerando…' : 'Gerar cobrança'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
