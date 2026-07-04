// Login — quatro caminhos: extensão (NIP-07), nsec (conveniência), assinador
// remoto (bunker / NIP-46) e npub (somente leitura). Após sucesso, atualiza a
// sessão e vai ao feed.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import { loginWithNip07, loginWithNsec, loginWithBunker, loginReadOnly } from '../services/login'

export function LoginPage() {
  const navigate = useNavigate()
  const { refresh, loggedIn, readOnly } = useAuth()
  const [nsec, setNsec] = useState('')
  const [bunker, setBunker] = useState('')
  const [npubRo, setNpubRo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Assim que a sessão (ou identidade só-leitura) ficar pronta, vai ao feed.
  // Via efeito (não imperativo) para não depender do timing do refresh().
  useEffect(() => {
    if (loggedIn || readOnly) navigate('/feed', { replace: true })
  }, [loggedIn, readOnly, navigate])

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await refresh() // dispara o efeito acima → redireciona
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao entrar')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-[var(--lm-bg-main)] px-4 text-center">
      <h1 className="text-4xl font-extrabold tracking-tight">
        <span className="text-[var(--lm-text-pri)]">Liber</span>
        <span className="text-[var(--lm-accent)]">Media</span>
      </h1>
      <p className="text-sm text-[var(--lm-text-muted)]">Entre com sua identidade Nostr</p>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(loginWithNip07)}
          className="rounded-full bg-[var(--lm-accent)] px-6 py-3 font-bold text-[var(--lm-accent-txt)] disabled:opacity-50"
        >
          Entrar com extensão (NIP-07)
        </button>

        <div className="my-1 text-xs text-[var(--lm-text-muted)]">ou</div>

        <input
          type="password"
          value={nsec}
          onChange={(e) => setNsec(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && nsec.trim() && !busy) run(() => loginWithNsec(nsec))
          }}
          placeholder="nsec1…"
          className="rounded-full border border-[var(--lm-border-str)] bg-[var(--lm-bg-input)] px-4 py-3 text-center text-[var(--lm-text-pri)] outline-none placeholder:text-[var(--lm-text-muted)]"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          disabled={busy || !nsec.trim()}
          onClick={() => run(() => loginWithNsec(nsec))}
          className="rounded-full border border-[var(--lm-border-str)] px-6 py-3 font-bold text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)] disabled:opacity-50"
        >
          Entrar com nsec
        </button>

        <button
          type="button"
          onClick={() => navigate('/criar-chaves')}
          className="rounded-full border border-[var(--lm-border-str)] px-6 py-3 font-bold text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)]"
        >
          Criar Chaves
        </button>

        <div className="my-1 text-xs text-[var(--lm-text-muted)]">ou</div>

        <input
          value={bunker}
          onChange={(e) => setBunker(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && bunker.trim() && !busy) run(() => loginWithBunker(bunker))
          }}
          placeholder="bunker://… ou nome@dominio"
          className="rounded-full border border-[var(--lm-border-str)] bg-[var(--lm-bg-input)] px-4 py-3 text-center text-sm text-[var(--lm-text-pri)] outline-none placeholder:text-[var(--lm-text-muted)]"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          disabled={busy || !bunker.trim()}
          onClick={() => run(() => loginWithBunker(bunker))}
          className="rounded-full border border-[var(--lm-border-str)] px-6 py-3 font-bold text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)] disabled:opacity-50"
        >
          Conectar assinador (bunker)
        </button>

        <div className="my-1 text-xs text-[var(--lm-text-muted)]">ou</div>

        <input
          value={npubRo}
          onChange={(e) => setNpubRo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && npubRo.trim() && !busy) run(() => Promise.resolve(loginReadOnly(npubRo)))
          }}
          placeholder="npub1… (somente leitura)"
          className="rounded-full border border-[var(--lm-border-str)] bg-[var(--lm-bg-input)] px-4 py-3 text-center text-sm text-[var(--lm-text-pri)] outline-none placeholder:text-[var(--lm-text-muted)]"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          disabled={busy || !npubRo.trim()}
          onClick={() => run(() => Promise.resolve(loginReadOnly(npubRo)))}
          className="rounded-full border border-[var(--lm-border-str)] px-6 py-3 font-bold text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)] disabled:opacity-50"
        >
          Entrar (somente leitura)
        </button>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {busy && <p className="text-sm text-[var(--lm-text-muted)]">Entrando…</p>}
      </div>

      <button
        type="button"
        onClick={() => navigate('/feed')}
        className="text-sm text-[var(--lm-text-muted)] hover:underline"
      >
        Entrar como visitante
      </button>
    </div>
  )
}
