// Carteira embarcada no LiberMedia — 2 abas: LiberWallet | Outros.
// A aba LiberWallet usa o MESMO componente do app standalone (<EmbeddedWallet> de
// @libernet/wallet-core) → visual IDÊNTICO a wallet.libernet.app (fonte única).
// Auth = ponte cross-origin: re-challenge assinado pelo signer do LiberMedia →
// Bearer em memória (token NUNCA em localStorage).
// Cross-origin já permitido: CSP do LiberMedia tem connect-src 'self' https: wss:;
// e o CORS do wallet libera media.libernet.app (ALLOWED_ORIGINS).
import { useCallback, useEffect, useRef, useState } from 'react'
import { TopBar } from '../components/TopBar/TopBar'
import { CarteiraIcon } from '../components/icons'
import { Tabs } from '../components/Tabs/Tabs'
import { useAuth } from '../providers/AuthProvider'
import { requireSigner } from '../services/require-signer'
import {
  wallet, setWalletReauth, setWalletToken, WalletApiError,
  WalletAuthProvider, useWallet, EmbeddedWallet,
} from '@libernet/wallet-core'

const WALLET_LOGO = 'https://wallet.libernet.app/static/spa/logo.png'

// Decodifica o claim `username` do JWT (payload base64url, não é segredo).
function usernameFromJwt(token: string): string {
  try {
    const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return p.username ?? p.sub ?? ''
  } catch { return '' }
}

// ── ponte de auth: token Bearer via re-challenge assinado pelo signer do LiberMedia ──
async function fetchToken(npub: string | null): Promise<string | null> {
  const signer = await requireSigner(npub)
  if (!signer) return null
  const { challenge } = await wallet.nostrChallenge()
  const evt = await signer.signEvent({
    kind: 22242, created_at: Math.floor(Date.now() / 1000),
    tags: [['challenge', challenge]], content: '',
  })
  const r = await wallet.nostrVerify(evt as object)
  return r.access_token
}

export function CarteiraPage() {
  const [tab, setTab] = useState('liberwallet')
  return (
    <div className="lm-page">
      <TopBar>
        <span className="flex items-center gap-2 min-w-0">
          <CarteiraIcon className="h-5 w-5 flex-shrink-0" />
          <h1 className="lm-topbar-title">Carteira</h1>
        </span>
      </TopBar>
      <div className="p-4">
        <Tabs items={[{ key: 'liberwallet', label: 'LiberWallet' }, { key: 'outros', label: 'Outros' }]} value={tab} onChange={setTab} />
      </div>
      {tab === 'liberwallet'
        ? <WalletAuthProvider embedded><LiberWalletTab /></WalletAuthProvider>
        : <OutrosTab />}
    </div>
  )
}

// ── Aba LiberWallet ──────────────────────────────────────────────────────────────
// Enquanto não conectada → tela de "abrir carteira" (handoff). Conectada → a carteira
// REAL embarcada (<EmbeddedWallet>), idêntica ao standalone.
function LiberWalletTab() {
  const { npub } = useAuth()
  const { status, setSession, logout: walletLogout } = useWallet()
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const connectedNpub = useRef<string | null>(null)

  // 🔒 Guarda anti-vazamento entre contas: o token/reauth da carteira são estado de MÓDULO
  // (global). Se o usuário do LiberMedia mudar (troca de conta), zera a sessão da carteira e
  // volta pra guest — exige novo handoff assinado pelo signer ATUAL. Sem isso, a carteira do
  // usuário anterior vazaria para o novo.
  useEffect(() => {
    if (connectedNpub.current && connectedNpub.current !== npub) {
      setWalletToken(null)
      setWalletReauth(null)
      void walletLogout()
      connectedNpub.current = null
    }
  }, [npub, walletLogout])

  const connect = useCallback(async () => {
    setConnecting(true); setError(null)
    try {
      const t = await fetchToken(npub)
      if (!t) { setError('Conexão cancelada.'); return }
      setWalletReauth(() => fetchToken(npub)) // re-challenge no 401 (token expira)
      await setSession(t, usernameFromJwt(t), 'nostr')
      connectedNpub.current = npub // marca de quem é a sessão ativa (guarda anti-vazamento)
    } catch (e) {
      setError(e instanceof WalletApiError ? e.message : 'Falha ao conectar à carteira.')
    } finally { setConnecting(false) }
  }, [npub, setSession])

  // O provider tenta retomar por cookie no mount (falha no embarcado cross-origin →
  // 'guest'); aí mostramos o botão de conectar.
  if (status === 'authed') return <EmbeddedWallet />

  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-center text-[var(--lm-text-pri)]">
      <img src={WALLET_LOGO} alt="" className="h-16 w-16 rounded-2xl" onError={(e) => ((e.currentTarget.style.display = 'none'))} />
      <p className="text-sm opacity-70">Sua carteira Lightning, dentro do LiberMedia.<br />A mesma conta em todo lugar.</p>
      <button type="button" disabled={connecting || status === 'loading'} onClick={connect} className="rounded-xl px-6 py-3 font-semibold text-white bg-[var(--lm-accent)] disabled:opacity-40">
        {connecting ? 'Conectando…' : 'Abrir minha carteira'}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <p className="text-xs opacity-40">Não tem carteira ainda? Ela é criada automaticamente ao conectar.</p>
    </div>
  )
}

// ── Aba Outros (carteira externa via NWC / NIP-47) ───────────────────────────────
function OutrosTab() {
  return (
    <div className="px-5 pb-8 flex flex-col gap-3 text-[var(--lm-text-pri)]">
      <p className="text-sm opacity-75">Conecte a sua própria carteira (Alby, Coinos, Mutiny, etc.) via <b>Nostr Wallet Connect</b>.</p>
      <input placeholder="nostr+walletconnect://…" className="rounded-xl px-4 py-3 bg-[color-mix(in_srgb,var(--lm-text-pri)_8%,transparent)] outline-none break-all" disabled />
      <button type="button" disabled className="rounded-xl py-3 font-medium border border-[var(--lm-border)] opacity-50">Conectar (em breve)</button>
      <p className="text-xs opacity-40">A LiberWallet é a carteira de casa, mas você é livre pra usar a sua — sem KYC, sem amarras.</p>
    </div>
  )
}
