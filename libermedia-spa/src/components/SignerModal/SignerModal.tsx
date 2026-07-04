// SignerModal — pedido de assinador quando uma ação precisa assinar e o usuário
// está em modo leitura/visitante. É o "login para agir": conectar extensão
// (NIP-07), assinador remoto (bunker/NIP-46) ou nsec. Ao conectar, a sessão é
// estabelecida e a ação original continua.
import { useEffect, useState } from 'react'
import { useAuth } from '../../providers/AuthProvider'
import { registerSignerModal } from '../../services/require-signer'
import { loginWithNip07, loginWithBunker, loginWithNsec } from '../../services/login'

type Resolver = (npub: string | null) => void
type Mode = 'choose' | 'bunker' | 'nsec'

export function SignerModal() {
  const { refresh } = useAuth()
  const [resolver, setResolver] = useState<Resolver | null>(null)
  const [mode, setMode] = useState<Mode>('choose')
  const [bunker, setBunker] = useState('')
  const [nsec, setNsec] = useState('')
  const [persist, setPersist] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return registerSignerModal((resolve) => {
      setMode('choose')
      setBunker('')
      setNsec('')
      setError(null)
      setBusy(false)
      // guarda o resolve; o estado segura uma função, daí o wrapper.
      setResolver(() => resolve)
    })
  }, [])

  if (!resolver) return null

  const finish = (npub: string | null) => {
    resolver(npub)
    setResolver(null)
  }
  const cancel = () => finish(null)

  async function run(fn: () => Promise<{ npub: string }>) {
    setBusy(true)
    setError(null)
    try {
      const { npub } = await fn()
      await refresh()
      finish(npub)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao conectar o assinador')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={cancel}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl border border-[var(--lm-border)] bg-[var(--lm-bg-main)] p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-[var(--lm-text-pri)]">
            {mode === 'choose' ? 'Conectar assinador' : mode === 'bunker' ? 'Assinador remoto' : 'Entrar com nsec'}
          </h2>
          <button type="button" onClick={cancel} aria-label="Fechar" className="text-[var(--lm-text-muted)]">
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-[var(--lm-text-muted)]">
          Esta ação precisa de uma assinatura. Escolha como assinar.
        </p>

        {mode === 'choose' && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(loginWithNip07)}
              className="rounded-full bg-[var(--lm-accent)] px-5 py-3 font-bold text-[var(--lm-accent-txt)] disabled:opacity-50"
            >
              Extensão (Alby / nos2x)
            </button>
            <button
              type="button"
              onClick={() => setMode('bunker')}
              className="rounded-full border border-[var(--lm-border-str)] px-5 py-3 font-bold text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)]"
            >
              Assinador remoto (bunker)
            </button>
            <button
              type="button"
              onClick={() => setMode('nsec')}
              className="rounded-full border border-[var(--lm-border-str)] px-5 py-3 font-bold text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)]"
            >
              Usar minha nsec
            </button>
          </div>
        )}

        {mode === 'bunker' && (
          <div className="flex flex-col gap-3">
            <input
              value={bunker}
              onChange={(e) => setBunker(e.target.value)}
              placeholder="bunker://… ou nome@dominio"
              autoComplete="off"
              spellCheck={false}
              className="rounded-xl border border-[var(--lm-border-str)] bg-[var(--lm-bg-input)] px-4 py-3 text-sm text-[var(--lm-text-pri)] outline-none placeholder:text-[var(--lm-text-muted)]"
            />
            <p className="text-xs text-[var(--lm-text-muted)]">
              A chave fica no seu app assinador (ex.: Amber). Cada ação é aprovada lá — nada é salvo aqui.
            </p>
            <button
              type="button"
              disabled={busy || !bunker.trim()}
              onClick={() => void run(() => loginWithBunker(bunker))}
              className="rounded-full bg-[var(--lm-accent)] px-5 py-3 font-bold text-[var(--lm-accent-txt)] disabled:opacity-50"
            >
              {busy ? 'Conectando…' : 'Conectar'}
            </button>
            <button type="button" onClick={() => setMode('choose')} className="text-sm text-[var(--lm-text-muted)] hover:underline">
              ← voltar
            </button>
          </div>
        )}

        {mode === 'nsec' && (
          <div className="flex flex-col gap-3">
            <input
              type="password"
              value={nsec}
              onChange={(e) => setNsec(e.target.value)}
              placeholder="nsec1…"
              autoComplete="off"
              spellCheck={false}
              className="rounded-xl border border-[var(--lm-border-str)] bg-[var(--lm-bg-input)] px-4 py-3 text-center text-sm text-[var(--lm-text-pri)] outline-none placeholder:text-[var(--lm-text-muted)]"
            />
            <label className="flex items-center gap-2 text-sm text-[var(--lm-text-pri)]">
              <input type="checkbox" checked={persist} onChange={(e) => setPersist(e.target.checked)} />
              Manter conectado neste dispositivo
            </label>
            <p className="text-xs text-[var(--lm-text-muted)]">
              {persist
                ? 'A nsec fica salva neste navegador. Em PC compartilhado, saia ao terminar.'
                : 'A nsec fica só nesta sessão (some ao fechar). Mais seguro em PC compartilhado.'}
            </p>
            <button
              type="button"
              disabled={busy || !nsec.trim()}
              onClick={() => void run(() => loginWithNsec(nsec, { persist }))}
              className="rounded-full bg-[var(--lm-accent)] px-5 py-3 font-bold text-[var(--lm-accent-txt)] disabled:opacity-50"
            >
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
            <button type="button" onClick={() => setMode('choose')} className="text-sm text-[var(--lm-text-muted)] hover:underline">
              ← voltar
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>
    </div>
  )
}
