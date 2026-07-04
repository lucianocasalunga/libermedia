// Criar Chaves Nostr — cópia da página generate_keys.html do v2.0.
// Geração 100% no browser (nostr-tools), a chave nunca sai do dispositivo.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { nip19 } from 'nostr-tools'
import { useAuth } from '../providers/AuthProvider'
import { loginWithNsec } from '../services/login'

export function CriarChavesPage() {
  const navigate = useNavigate()
  const { refresh, loggedIn } = useAuth()
  const [npub, setNpub] = useState('')
  const [nsec, setNsec] = useState('')
  const [showNsec, setShowNsec] = useState(false)
  const [copied, setCopied] = useState<'npub' | 'nsec' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function generate() {
    const sk = generateSecretKey()
    const pk = getPublicKey(sk)
    setNpub(nip19.npubEncode(pk))
    setNsec(nip19.nsecEncode(sk))
    setShowNsec(false)
    setError(null)
  }

  function copy(value: string, which: 'npub' | 'nsec') {
    if (!value) return
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(which)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  // Quando a sessão ficar pronta, vai ao feed (via efeito, sem depender de timing).
  useEffect(() => {
    if (loggedIn) navigate('/feed', { replace: true })
  }, [loggedIn, navigate])

  async function entrarComChaves() {
    if (!nsec) return
    setBusy(true)
    setError(null)
    try {
      await loginWithNsec(nsec)
      await refresh() // dispara o efeito acima → redireciona
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao entrar com as chaves')
      setBusy(false)
    }
  }

  const generated = !!nsec

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-amber-500 via-orange-600 to-amber-700 px-4 py-12 dark:from-gray-900 dark:via-black dark:to-gray-900">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200/50 bg-white/95 p-8 shadow-2xl backdrop-blur-xl dark:border-gray-800 dark:bg-gray-900/95">
        {/* Logo + título */}
        <div className="mb-8 text-center">
          <img
            src="/static/img/logo.jpg"
            alt="LiberMedia"
            className="mx-auto mb-4 h-16 w-16 rounded-full border-2 border-amber-500 shadow-lg"
          />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Criar Conta Nostr</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Gere seu par de chaves para usar o LiberMedia
          </p>
        </div>

        {/* Aviso de segurança */}
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/30">
          <div className="flex gap-3">
            <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Guarde sua chave privada (nsec)
              </p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                Ela é como sua senha. Se perder, não tem como recuperar. Anote em um lugar seguro.
              </p>
            </div>
          </div>
        </div>

        {/* Área das chaves (após gerar) */}
        {generated && (
          <div className="mb-6 space-y-4">
            {/* npub */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Chave Pública (npub) — pode compartilhar
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={npub}
                  className="flex-1 select-all rounded-xl border border-gray-300 bg-gray-100 px-3 py-2.5 font-mono text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                />
                <button
                  type="button"
                  onClick={() => copy(npub, 'npub')}
                  className="flex-shrink-0 rounded-xl bg-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  {copied === 'npub' ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>

            {/* nsec */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Chave Privada (nsec) — <span className="font-semibold text-red-500">nunca compartilhe</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showNsec ? 'text' : 'password'}
                    readOnly
                    value={nsec}
                    autoComplete="new-password"
                    className="w-full select-all rounded-xl border border-red-300 bg-red-50 px-3 py-2.5 font-mono text-xs text-gray-800 dark:border-red-800 dark:bg-red-950/40 dark:text-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNsec((v) => !v)}
                    aria-label={showNsec ? 'Ocultar nsec' : 'Mostrar nsec'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400"
                  >
                    {showNsec ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => copy(nsec, 'nsec')}
                  className="flex-shrink-0 rounded-xl bg-red-100 px-3 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-800/60"
                >
                  {copied === 'nsec' ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>

            {/* Usar e entrar */}
            <button
              type="button"
              onClick={() => void entrarComChaves()}
              disabled={busy}
              className="mt-2 w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-amber-600 disabled:opacity-50"
            >
              {busy ? 'Entrando…' : 'Usar estas chaves e entrar'}
            </button>

            {/* Gerar novamente */}
            <button
              type="button"
              onClick={generate}
              className="w-full rounded-xl border border-gray-300 bg-transparent py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              Gerar novas chaves
            </button>
          </div>
        )}

        {/* Botão inicial: gerar */}
        {!generated && (
          <button
            type="button"
            onClick={generate}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-4 text-base font-bold text-white shadow-lg transition hover:bg-amber-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Gerar Chaves Nostr
          </button>
        )}

        {error && <p className="mt-4 text-center text-sm text-red-500">{error}</p>}

        {/* Separador */}
        <div className="my-6 flex items-center gap-3">
          <div className="flex-1 border-t border-gray-200 dark:border-gray-800" />
          <span className="text-xs text-gray-400">ou</span>
          <div className="flex-1 border-t border-gray-200 dark:border-gray-800" />
        </div>

        {/* Links */}
        <div className="space-y-2 text-center">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="block w-full text-sm text-amber-600 hover:underline dark:text-amber-400"
          >
            Já tenho uma extensão Nostr (NIP-07)
          </button>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="block w-full text-sm text-gray-500 hover:underline dark:text-gray-500"
          >
            Já tenho minha chave privada (nsec)
          </button>
        </div>
      </div>
    </div>
  )
}
