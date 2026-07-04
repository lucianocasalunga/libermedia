// Dashboard da carteira (F2) — saldo em sats + cotação fiat, endereço Lightning,
// ações Receber/Enviar e transações recentes. Estilo moderno alinhado ao login.
import { useEffect, useRef, useState } from 'react'
import { useWalletNav } from '../nav'
import { useWallet } from '../providers/WalletAuthProvider'
import { wallet, type Rates, type Tx } from '../services/wallet'

const CURRENCIES = ['BRL', 'USD', 'ILS', 'EUR'] as const
type Cur = (typeof CURRENCIES)[number]
const SYM: Record<Cur, string> = { BRL: 'R$', USD: '$', ILS: '₪', EUR: '€' }
const nfSats = new Intl.NumberFormat('pt-BR')

function fiatFromSats(sats: number, btcPrice?: number): string {
  if (!btcPrice) return '—'
  const v = (sats / 1e8) * btcPrice
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function WalletPage() {
  const { info, refreshInfo, lightningAddress } = useWallet()
  const nav = useWalletNav()
  const [rates, setRates] = useState<Rates | null>(null)
  const [cur, setCur] = useState<Cur>(() => (localStorage.getItem('lw_currency') as Cur) || 'BRL')
  const [recent, setRecent] = useState<Tx[]>([])
  const [copied, setCopied] = useState(false)
  const curHydrated = useRef(false)

  useEffect(() => {
    void refreshInfo()
    void wallet.rates().then(setRates).catch(() => {})
    void wallet.history().then((h) => setRecent(h.transactions.slice(0, 4))).catch(() => {})
  }, [refreshInfo])

  // Moeda preferida vem do PERFIL (servidor = fonte da verdade). Hidrata uma vez,
  // quando o info chega, sem sobrescrever uma escolha que o usuário acabou de fazer.
  useEffect(() => {
    if (curHydrated.current) return
    const c = info?.currency
    if (c && (CURRENCIES as readonly string[]).includes(c)) {
      setCur(c as Cur)
      localStorage.setItem('lw_currency', c)
      curHydrated.current = true
    }
  }, [info?.currency])

  // Troca de moeda: grava no PERFIL (cross-device) + cache local p/ resposta instantânea.
  function pickCur(c: Cur) {
    curHydrated.current = true
    setCur(c)
    localStorage.setItem('lw_currency', c)
    void wallet.updateSettings({ currency: c }).catch(() => {})
  }

  function copyAddr() {
    if (!lightningAddress) return
    void navigator.clipboard.writeText(lightningAddress).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    })
  }

  const sats = info?.balance_sats ?? 0

  return (
    <div className="lm-page px-5 py-6 flex flex-col gap-7">
      {/* Saldo */}
      <section className="flex flex-col items-center gap-2 pt-4">
        <div className="flex items-end gap-2">
          <span className="text-5xl font-bold tracking-tight tabular-nums">{nfSats.format(sats)}</span>
          <span className="mb-1.5 text-base opacity-50">sats</span>
        </div>
        <span className="text-sm opacity-60 tabular-nums">≈ {SYM[cur]} {fiatFromSats(sats, rates?.[cur])}</span>

        {/* Seletor de moeda */}
        <div className="mt-3 flex gap-1 rounded-full p-1 bg-[color-mix(in_srgb,var(--lm-text-pri)_8%,transparent)]">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => pickCur(c)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${cur === c ? 'bg-[var(--lm-accent,#f5a623)] text-white' : 'opacity-60'}`}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      {/* Endereço Lightning */}
      {lightningAddress && (
        <button
          type="button"
          onClick={copyAddr}
          className="mx-auto flex items-center gap-2 rounded-full px-4 py-2 text-sm bg-[color-mix(in_srgb,var(--lm-text-pri)_7%,transparent)] active:scale-95 transition"
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="var(--lm-accent,#f5a623)"><path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13z" /></svg>
          <span className="opacity-80">{lightningAddress}</span>
          <span className="opacity-50">{copied ? '✓' : '⧉'}</span>
        </button>
      )}

      {/* Ações */}
      <section className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => nav.go('receber')}
          className="flex flex-col items-center gap-2 rounded-2xl py-5 font-semibold bg-[color-mix(in_srgb,var(--lm-text-pri)_8%,transparent)] active:scale-95 transition"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
          Receber
        </button>
        <button
          type="button"
          onClick={() => nav.go('enviar')}
          className="flex flex-col items-center gap-2 rounded-2xl py-5 font-semibold text-white bg-[var(--lm-accent,#f5a623)] active:scale-95 transition"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          Enviar
        </button>
      </section>

      {/* Transações recentes */}
      <section className="flex flex-col gap-1">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold opacity-80">Atividade</h2>
          <button type="button" className="text-xs opacity-50" onClick={() => nav.go('historico')}>Ver tudo</button>
        </div>
        {recent.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm opacity-40">Nenhuma transação ainda.</p>
        ) : (
          <ul className="flex flex-col">
            {recent.map((t, i) => {
              const out = t.type === 'out' || t.type === 'send' || (t.amount_sats ?? 0) < 0
              const amt = Math.abs(t.amount_sats ?? Math.round((t.amount_msats ?? 0) / 1000))
              return (
                <li key={t.payment_hash || i} className="flex items-center gap-3 py-3 border-b border-[color-mix(in_srgb,var(--lm-text-pri)_8%,transparent)]">
                  <span className={`grid h-9 w-9 place-items-center rounded-full ${out ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'}`}>
                    {out ? '↑' : '↓'}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm opacity-80">{t.memo || (out ? 'Enviado' : 'Recebido')}</span>
                  <span className={`text-sm tabular-nums ${out ? 'text-red-400' : 'text-green-400'}`}>{out ? '−' : '+'}{nfSats.format(amt)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
