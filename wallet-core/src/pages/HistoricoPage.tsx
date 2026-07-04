// Histórico (F5) — lista todas as transações (/api/wallet/history), agrupadas por data.
import { useEffect, useState } from 'react'
import { wallet, type Tx } from '../services/wallet'

const nf = new Intl.NumberFormat('pt-BR')

function tsOf(t: Tx): number {
  const c = t.created_at
  if (typeof c === 'number') return c > 1e12 ? c : c * 1000
  if (typeof c === 'string') { const d = Date.parse(c); return isNaN(d) ? 0 : d }
  return 0
}
function dayLabel(ms: number): string {
  if (!ms) return 'Sem data'
  const d = new Date(ms)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}
function timeLabel(ms: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function isOut(t: Tx): boolean {
  return t.type === 'out' || t.type === 'send' || (t.amount_sats ?? 0) < 0
}

export function HistoricoPage() {
  const [txs, setTxs] = useState<Tx[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    void wallet.history()
      .then((h) => setTxs([...h.transactions].sort((a, b) => tsOf(b) - tsOf(a))))
      .catch(() => setError(true))
  }, [])

  // agrupa por dia
  const groups: { day: string; items: Tx[] }[] = []
  for (const t of txs ?? []) {
    const day = dayLabel(tsOf(t))
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.items.push(t)
    else groups.push({ day, items: [t] })
  }

  return (
    <div className="lm-page px-4 py-5">
      <h1 className="px-1 pb-3 text-lg font-semibold">Histórico</h1>

      {error && <p className="px-1 py-8 text-center text-sm text-red-400">Não foi possível carregar.</p>}
      {!error && txs === null && <p className="px-1 py-8 text-center text-sm opacity-40">Carregando…</p>}
      {!error && txs?.length === 0 && <p className="px-1 py-10 text-center text-sm opacity-40">Nenhuma transação ainda.</p>}

      {groups.map((g) => (
        <section key={g.day} className="mb-4">
          <h2 className="px-1 pb-1 text-xs font-medium uppercase tracking-wide opacity-40">{g.day}</h2>
          <ul className="flex flex-col">
            {g.items.map((t, i) => {
              const out = isOut(t)
              const amt = Math.abs(t.amount_sats ?? Math.round((t.amount_msats ?? 0) / 1000))
              const ms = tsOf(t)
              const pending = t.status === 'pending'
              return (
                <li key={t.payment_hash || `${g.day}-${i}`} className="flex items-center gap-3 py-3 border-b border-[color-mix(in_srgb,var(--lm-text-pri)_8%,transparent)]">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${out ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'}`}>
                    {out ? '↑' : '↓'}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm opacity-85">{t.memo || (out ? 'Enviado' : 'Recebido')}</span>
                    <span className="block text-xs opacity-40">{timeLabel(ms)}{pending ? ' · pendente' : ''}</span>
                  </span>
                  <span className={`shrink-0 text-sm tabular-nums ${out ? 'text-red-400' : 'text-green-400'}`}>
                    {out ? '−' : '+'}{nf.format(amt)}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
