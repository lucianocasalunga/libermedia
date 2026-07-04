// Assinatura — escolha de plano + pagamento Lightning. Cria invoice no backend,
// mostra o bolt11 (copiar / abrir carteira / WebLN) e faz polling até pagar;
// quando confirma, aplica o plano (/api/upgrade-plan).
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import { TopBar } from '../components/TopBar/TopBar'
import {
  PLANS,
  PERIODS,
  createInvoice,
  checkInvoice,
  upgradePlan,
  type Plan,
  type InvoiceResult,
} from '../services/assinatura'

export function AssinaturaPage() {
  const navigate = useNavigate()
  const { loggedIn, npub } = useAuth()
  const [months, setMonths] = useState(1)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [invoice, setInvoice] = useState<InvoiceResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [paid, setPaid] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

  // Polling do pagamento enquanto há invoice aberto e ainda não pago.
  useEffect(() => {
    if (!invoice?.checking_id || paid) return
    const id = window.setInterval(async () => {
      try {
        const ok = await checkInvoice(invoice.checking_id!)
        if (ok) {
          window.clearInterval(id)
          if (npub && plan) await upgradePlan(npub, plan.id, invoice.checking_id!, months)
          setPaid(true)
        }
      } catch {
        /* tenta de novo no próximo tick */
      }
    }, 3000)
    pollRef.current = id
    return () => window.clearInterval(id)
  }, [invoice, paid, npub, plan, months])

  async function assinar(p: Plan) {
    if (p.amount_sats <= 0) return
    setBusy(true)
    setError(null)
    setPaid(false)
    setInvoice(null)
    setPlan(p)
    try {
      const res = await createInvoice(p.id, months, npub)
      if (res.status === 'ok' && res.bolt11 && res.checking_id) {
        setInvoice(res)
      } else if (res.status === 'free') {
        setError('Este plano é gratuito.')
      } else {
        setError(res.error || 'Não foi possível gerar a cobrança.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar a cobrança.')
    } finally {
      setBusy(false)
    }
  }

  function copyInvoice() {
    if (!invoice?.bolt11) return
    void navigator.clipboard.writeText(invoice.bolt11).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  async function payWebln() {
    const webln = (window as unknown as { webln?: { enable(): Promise<void>; sendPayment(b: string): Promise<unknown> } }).webln
    if (!webln || !invoice?.bolt11) return
    try {
      await webln.enable()
      await webln.sendPayment(invoice.bolt11)
    } catch {
      /* usuário cancelou ou sem WebLN */
    }
  }

  function reset() {
    setInvoice(null)
    setPlan(null)
    setPaid(false)
    setError(null)
  }

  return (
    <div className="mx-auto min-h-svh w-full max-w-[600px] border-x border-[var(--lm-border)]">
      <TopBar />

      {!loggedIn && (
        <div className="p-8 text-center">
          <p className="text-sm text-[var(--lm-text-muted)]">Entre para assinar um plano.</p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="mt-4 rounded-full bg-[var(--lm-accent)] px-6 py-2.5 font-bold text-[var(--lm-accent-txt)]"
          >
            Entrar
          </button>
        </div>
      )}

      {loggedIn && paid && (
        <div className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 text-3xl">✅</div>
          <h2 className="text-xl font-extrabold text-[var(--lm-text-pri)]">Pagamento confirmado!</h2>
          <p className="mt-2 text-sm text-[var(--lm-text-muted)]">
            Seu plano <b>{plan?.name}</b> ({months === 1 ? '1 mês' : months === 12 ? '1 ano' : `${months} meses`}) já está ativo.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-full border border-[var(--lm-border-str)] px-6 py-2.5 font-bold text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)]"
          >
            Ver planos
          </button>
        </div>
      )}

      {/* Pagamento (invoice aberto) */}
      {loggedIn && !paid && invoice?.bolt11 && (
        <div className="p-5">
          <button type="button" onClick={reset} className="mb-3 text-sm text-[var(--lm-text-muted)] hover:underline">
            ← voltar aos planos
          </button>
          <div className="rounded-2xl border border-[var(--lm-border)] bg-[var(--lm-bg-card)] p-5 text-center">
            <p className="text-sm text-[var(--lm-text-muted)]">
              {plan?.name} · {invoice.months === 1 ? '1 mês' : invoice.months === 12 ? '1 ano' : `${invoice.months} meses`}
            </p>
            <p className="mt-1 text-2xl font-extrabold text-[var(--lm-text-pri)]">⚡ {invoice.amount_sats} sats</p>

            <div className="mt-4 break-all rounded-xl bg-[var(--lm-bg-input)] p-3 font-mono text-[11px] text-[var(--lm-text-muted)]">
              {invoice.bolt11}
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <a
                href={`lightning:${invoice.bolt11}`}
                className="rounded-full bg-[var(--lm-accent)] px-5 py-3 font-bold text-[var(--lm-accent-txt)]"
              >
                Abrir na carteira
              </a>
              <button
                type="button"
                onClick={() => void payWebln()}
                className="rounded-full border border-[var(--lm-border-str)] px-5 py-3 font-bold text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-main)]"
              >
                Pagar com extensão (WebLN)
              </button>
              <button
                type="button"
                onClick={copyInvoice}
                className="rounded-full border border-[var(--lm-border-str)] px-5 py-3 font-bold text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-main)]"
              >
                {copied ? 'Copiado!' : 'Copiar fatura'}
              </button>
            </div>

            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-[var(--lm-text-muted)]">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              Aguardando pagamento…
            </p>
          </div>
        </div>
      )}

      {/* Lista de planos */}
      {loggedIn && !paid && !invoice && (
        <div className="p-4">
          {/* Período */}
          <div className="mb-4 flex flex-wrap gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.months}
                type="button"
                onClick={() => setMonths(p.months)}
                className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                  months === p.months
                    ? 'bg-[var(--lm-accent)] text-[var(--lm-accent-txt)]'
                    : 'border border-[var(--lm-border-str)] text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

          <div className="flex flex-col gap-3">
            {PLANS.map((p) => {
              const free = p.amount_sats <= 0
              return (
                <div
                  key={p.id}
                  className="rounded-2xl border border-[var(--lm-border)] bg-[var(--lm-bg-card)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-lg font-extrabold text-[var(--lm-text-pri)]">{p.name}</h3>
                      <p className="text-sm text-[var(--lm-text-muted)]">{p.storage_gb} GB de armazenamento</p>
                      <p className="mt-1 text-sm text-[var(--lm-text-pri)]">{p.description}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      {free ? (
                        <span className="text-base font-extrabold text-[var(--lm-text-pri)]">Grátis</span>
                      ) : (
                        <>
                          <p className="text-base font-extrabold text-[var(--lm-text-pri)]">⚡ {p.amount_sats}</p>
                          <p className="text-xs text-[var(--lm-text-muted)]">sats/mês · ~US$ {p.price_usd}</p>
                        </>
                      )}
                    </div>
                  </div>
                  {!free && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void assinar(p)}
                      className="mt-3 w-full rounded-full bg-[var(--lm-accent)] px-5 py-2.5 font-bold text-[var(--lm-accent-txt)] disabled:opacity-50"
                    >
                      {busy && plan?.id === p.id ? 'Gerando cobrança…' : 'Assinar'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
