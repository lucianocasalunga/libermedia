// Modal de Zap (NIP-57). Presets de sats + valor custom + mensagem.
// Gera o invoice (bolt11) e mostra para pagamento: copiar ou abrir na carteira
// (link lightning:). Botão WebLN paga via extensão (clique explícito do usuário).
//
// NOTE: o auto-pagamento via NWC (carteira LiberWallet/LNbits salva)
// NÃO está ligado aqui — precisa do seu teste com a carteira real antes de
// disparar pagamento automático. Por ora o zap é gerado e pago manualmente.
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { nip19 } from 'nostr-tools'
import { useAuth } from '../../providers/AuthProvider'
import { requireSigner } from '../../services/require-signer'
import { requestZapInvoice, payWithWebLN } from '../../services/zap'
import { payWithNwc, ensureNwc } from '../../services/nwc'
import { QrCode } from '../QrCode/QrCode'
import { notifySocial } from '../../services/push'
import { celebrateZap } from '../../lib/celebrate'
import type { FeedEvent, ProfileMap } from '../../types/nostr'

const PRESETS = [10, 18, 20, 25, 50, 75, 100, 150]

export function ZapModal({
  event,
  profiles,
  onClose,
}: {
  event: FeedEvent
  profiles: ProfileMap
  onClose: () => void
}) {
  const { npub } = useAuth()
  const profile = event.profile ?? profiles[event.pubkey]
  const name = profile?.display_name?.trim() || profile?.name?.trim() || 'este usuário'
  // Endereço Lightning: lud16/lud06 e, se faltarem, o NIP-05 como fallback — o handle
  // (name@dominio) quase sempre É também Lightning Address (LiberNet, getalby, primal,
  // nostrplebs…). O zap.ts resolve via LNURL e falha gracioso se o domínio não suportar.
  const nip05Ln = profile?.nip05?.includes('@') ? profile.nip05.replace(/^_@/, '') : undefined
  const lud16 = profile?.lud16 || profile?.lud06 || nip05Ln

  const [sats, setSats] = useState(18)
  const [custom, setCustom] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bolt11, setBolt11] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [paid, setPaid] = useState(false)
  const [paying, setPaying] = useState(false)

  const amount = custom ? Math.max(0, Math.floor(Number(custom))) : sats

  async function onGenerate() {
    if (busy || !lud16) return
    setBusy(true)
    setError(null)
    try {
      const signer = await requireSigner(npub)
      if (!signer) throw new Error('Faça login para enviar zaps.')
      const recipientHex = (() => {
        try {
          const d = nip19.decode(npub || '')
          return d.type === 'npub' ? (d.data as string) : event.pubkey
        } catch {
          return event.pubkey
        }
      })()
      const { bolt11 } = await requestZapInvoice({
        signer,
        lud16: lud16!,
        recipientHex: event.pubkey || recipientHex,
        sats: amount,
        message,
        eventId: event.id,
      })
      setBolt11(bolt11)
      // Auto-pagamento pela carteira NWC (provisiona via /api/carteira/nwc se ainda
      // não houver). O clique no botão de zap é o consentimento. Sem carteira → manual;
      // falha → erro + manual.
      const uri = await ensureNwc(npub)
      if (uri) {
        setPaying(true)
        // RETRY em falha TRANSITÓRIA (no_route/timeout): pagamento Lightning falha
        // transitoriamente o tempo todo (rota some/volta) e funciona no retry. Seguro:
        // o LND deduplica por payment_hash → nunca paga o mesmo invoice 2×.
        let lastErr: unknown = null
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await payWithNwc(bolt11, uri)
            setPaid(true)
            notifySocial(event.pubkey, 'zap') // push p/ quem recebeu o zap (app fechado)
            celebrateZap()
            window.setTimeout(() => onClose(), 1900) // fecha após o efeito
            lastErr = null
            break
          } catch (e) {
            lastErr = e
            const msg = (e instanceof Error ? e.message : '').toLowerCase()
            const transient =
              /(no.?route|route|timeout|temporar|unavailable|try again|pending|failed)/.test(msg) &&
              !/(saldo|balance|insufficient|insuficiente)/.test(msg)
            if (!transient || attempt === 3) break
            await new Promise((r) => setTimeout(r, 1200)) // respiro antes de tentar de novo
          }
        }
        if (lastErr) {
          setError(lastErr instanceof Error ? lastErr.message : 'Não consegui pagar pela carteira. Pague manualmente abaixo.')
        }
        setPaying(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar o invoice.')
    } finally {
      setBusy(false)
    }
  }

  async function onCopy() {
    if (!bolt11) return
    try {
      await navigator.clipboard.writeText(bolt11)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard indisponível */
    }
  }

  async function onWebLN() {
    if (!bolt11) return
    setError(null)
    try {
      const ok = await payWithWebLN(bolt11)
      if (ok) setPaid(true)
      else setError('Nenhuma carteira WebLN encontrada. Copie o invoice ou abra na sua carteira.')
    } catch {
      setError('Pagamento WebLN cancelado ou falhou.')
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--lm-border)] bg-[var(--lm-bg-main)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--lm-border)] px-5 py-4">
          <h3 className="flex items-center gap-2 text-lg font-bold text-[var(--lm-text-pri)]">
            <span className="text-amber-400">⚡</span> Zap para {name}
          </h3>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-[var(--lm-text-muted)] hover:text-[var(--lm-text-pri)]">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {!lud16 ? (
            <p className="py-4 text-center text-sm text-[var(--lm-text-muted)]">
              {name} não tem endereço Lightning configurado no perfil.
            </p>
          ) : paid ? (
            <p className="py-6 text-center text-sm font-semibold text-amber-400">⚡ Zap enviado! Obrigado.</p>
          ) : paying ? (
            <p className="py-6 text-center text-sm font-semibold text-[var(--lm-text-pri)]">⚡ Pagando pela carteira…</p>
          ) : !bolt11 ? (
            <>
              <div className="grid grid-cols-4 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setSats(p)
                      setCustom('')
                    }}
                    className={`rounded-lg border py-2 text-sm font-semibold transition ${
                      !custom && sats === p
                        ? 'border-amber-500 bg-amber-500/15 text-amber-400'
                        : 'border-[var(--lm-border)] text-[var(--lm-text-sec)] hover:bg-[var(--lm-bg-card)]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Valor personalizado (sats)"
                className="w-full rounded-lg border border-[var(--lm-border)] bg-[var(--lm-bg-card)] px-3 py-2 text-sm text-[var(--lm-text-pri)] outline-none focus:border-amber-500"
              />
              <input
                type="text"
                maxLength={280}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Mensagem (opcional)"
                className="w-full rounded-lg border border-[var(--lm-border)] bg-[var(--lm-bg-card)] px-3 py-2 text-sm text-[var(--lm-text-pri)] outline-none focus:border-amber-500"
              />
              {error && <p className="text-center text-xs text-red-400">{error}</p>}
              <button
                type="button"
                disabled={busy || amount <= 0}
                onClick={onGenerate}
                className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-black transition hover:bg-amber-400 disabled:opacity-50"
              >
                {busy ? 'Gerando invoice…' : `Zap ${amount} sats ⚡`}
              </button>
            </>
          ) : (
            <>
              <p className="text-center text-sm text-[var(--lm-text-sec)]">
                Invoice de <b className="text-[var(--lm-text-pri)]">{amount} sats</b> — escaneie ou pague na sua carteira:
              </p>
              <div className="flex justify-center">
                <div className="rounded-lg bg-white p-3">
                  <QrCode value={bolt11} size={200} />
                </div>
              </div>
              <div className="break-all rounded-lg border border-[var(--lm-border)] bg-[var(--lm-bg-card)] p-2 text-[11px] text-[var(--lm-text-muted)]">
                {bolt11.slice(0, 64)}…
              </div>
              {error && <p className="text-center text-xs text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={onCopy} className="flex-1 rounded-xl border border-[var(--lm-border)] py-2.5 text-sm font-semibold text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)]">
                  {copied ? 'Copiado ✓' : 'Copiar invoice'}
                </button>
                <a href={`lightning:${bolt11}`} className="flex-1 rounded-xl bg-amber-500 py-2.5 text-center text-sm font-bold text-black hover:bg-amber-400">
                  Abrir carteira
                </a>
              </div>
              <button type="button" onClick={onWebLN} className="w-full rounded-xl border border-[var(--lm-border)] py-2 text-xs font-medium text-[var(--lm-text-sec)] hover:bg-[var(--lm-bg-card)]">
                Pagar com extensão (WebLN)
              </button>
              <p className="text-center text-[10px] text-[var(--lm-text-muted)]">
                Sem carteira automática agora — pague pelo invoice acima.
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
