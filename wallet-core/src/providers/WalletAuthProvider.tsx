// WalletAuthProvider — sessão da LiberWallet (token JWT em memória).
//  • standalone: retoma sessão pelo cookie de refresh (mesma origem); re-auth no 401 via /refresh.
//  • embarcado: o app hospedeiro injeta token + reauth (re-challenge Nostr) via setSession/setWalletReauth.
// Token NUNCA em localStorage (anti-XSS). Duas portas: PIN/usuário e Nostr (NIP-07).
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import { finalizeEvent } from 'nostr-tools/pure'
import { nip19 } from 'nostr-tools'
import {
  wallet, setWalletToken, setWalletReauth, type WalletInfo,
} from '../services/wallet'

type Status = 'loading' | 'authed' | 'guest'
type Mode = 'pin' | 'nostr' | 'webauthn' | null

// Suporte a WebAuthn no dispositivo (passkey/biometria). Só existe em contexto seguro.
const webauthnSupported = typeof window !== 'undefined' && !!window.PublicKeyCredential

// Nome amigável do dispositivo p/ a lista de credenciais no backend.
function deviceName(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/iPhone|iPad|iPod/.test(ua)) return 'iPhone/iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  return 'Dispositivo'
}

interface WalletAuthState {
  status: Status
  mode: Mode
  username: string | null
  lightningAddress: string | null
  info: WalletInfo | null
  needsPin: boolean
  webauthnSupported: boolean
  createPin: (pin: string) => Promise<void>
  loginPin: (username: string, pin: string) => Promise<void>
  registerPin: (username: string, pin: string) => Promise<void>
  loginNostr: () => Promise<void>
  loginNsec: (nsec: string) => Promise<void>
  registerWebAuthn: () => Promise<void>
  loginWebAuthn: (username: string) => Promise<void>
  setSession: (token: string, username: string, mode?: Mode) => Promise<void>
  refreshInfo: () => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<WalletAuthState | null>(null)

// Decodifica o claim `username` do JWT (payload base64url — não é segredo).
function usernameFromJwt(token: string): string | null {
  try {
    const part = token.split('.')[1]
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    const p = JSON.parse(json)
    return p.username ?? p.sub ?? null
  } catch { return null }
}

// NIP-07 (extensão) — disponível no standalone/desktop.
function nip07(): any | null {
  const w = window as any
  return w.nostr && typeof w.nostr.signEvent === 'function' ? w.nostr : null
}

// `embedded`: a carteira roda DENTRO de outro app (ex.: LiberMedia em media.libernet.app).
// Nesse caso NÃO pode retomar a sessão pelo cookie de refresh do wallet.libernet.app — media e
// wallet são same-site (libernet.app), então o cookie de um usuário ANTERIOR seria enviado e
// retomaria a carteira DELE (VAZAMENTO entre contas). Embarcado começa SEMPRE como guest e só
// autentica via handoff (re-challenge assinado pelo signer do usuário ATUAL do app hospedeiro).
export function WalletAuthProvider({ children, embedded = false }: { children: ReactNode; embedded?: boolean }) {
  const [status, setStatus] = useState<Status>('loading')
  const [mode, setMode] = useState<Mode>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [info, setInfo] = useState<WalletInfo | null>(null)
  const [needsPin, setNeedsPin] = useState(false)
  const didInit = useRef(false)

  const refreshInfo = useCallback(async () => {
    try { setInfo(await wallet.info()) } catch { /* mantém o que tem */ }
  }, [])

  const adopt = useCallback(async (token: string, uname: string | null, m: Mode) => {
    setWalletToken(token)
    setUsername(uname ?? usernameFromJwt(token))
    setMode(m)
    setStatus('authed')
    // Quem entrou por chave pode não ter PIN ainda → forçar criação.
    try { const s = await wallet.pinStatus(); setNeedsPin(!s.has_pin) } catch { setNeedsPin(false) }
    await refreshInfo()
  }, [refreshInfo])

  const createPin = useCallback(async (pin: string) => {
    await wallet.setPin(pin)
    setNeedsPin(false)
  }, [])

  const loginPin = useCallback(async (u: string, pin: string) => {
    const r = await wallet.login(u, pin)
    await adopt(r.access_token, r.username, 'pin')
  }, [adopt])

  const registerPin = useCallback(async (u: string, pin: string) => {
    const r = await wallet.register(u, pin)
    await adopt(r.access_token, r.username, 'pin')
  }, [adopt])

  const loginNostr = useCallback(async () => {
    const signer = nip07()
    if (!signer) throw new Error('Nenhuma extensão Nostr (NIP-07) encontrada.')
    const { challenge } = await wallet.nostrChallenge()
    const unsigned = {
      kind: 22242,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['challenge', challenge]],
      content: '',
    }
    const event = await signer.signEvent(unsigned)
    const r = await wallet.nostrVerify(event)
    await adopt(r.access_token, r.username, 'nostr')
  }, [adopt])

  // Login por nsec colada (assina o challenge LOCALMENTE; a nsec não vai pro servidor).
  const loginNsec = useCallback(async (nsecInput: string) => {
    const raw = nsecInput.trim()
    let dec: ReturnType<typeof nip19.decode>
    try { dec = nip19.decode(raw) } catch { throw new Error('Chave inválida.') }
    if (dec.type !== 'nsec') throw new Error('Use uma chave nsec.')
    const sk = dec.data as Uint8Array
    const { challenge } = await wallet.nostrChallenge()
    const event = finalizeEvent(
      { kind: 22242, created_at: Math.floor(Date.now() / 1000), tags: [['challenge', challenge]], content: '' },
      sk,
    )
    const r = await wallet.nostrVerify(event)
    await adopt(r.access_token, r.username, 'nostr')
  }, [adopt])

  // Registra uma passkey/biometria para a conta ATUAL (exige estar logado — usa o Bearer).
  // A lib do browser é carregada sob demanda (import dinâmico) p/ não pesar o bundle embarcado.
  const registerWebAuthn = useCallback(async () => {
    const { startRegistration } = await import('@simplewebauthn/browser')
    const options = await wallet.webauthn.registerBegin()
    const credential = await startRegistration({ optionsJSON: options as any })
    await wallet.webauthn.registerComplete(credential, deviceName())
  }, [])

  // Login por biometria (público): username → challenge → asserção → JWT.
  const loginWebAuthn = useCallback(async (uname: string) => {
    const u = uname.trim().toLowerCase()
    if (!u) throw new Error('Informe o usuário.')
    const { startAuthentication } = await import('@simplewebauthn/browser')
    const options = await wallet.webauthn.loginBegin(u)
    const credential = await startAuthentication({ optionsJSON: options as any })
    const r = await wallet.webauthn.loginComplete(u, credential)
    await adopt(r.access_token, r.username ?? u, 'webauthn')
  }, [adopt])

  // Injeção externa (embarcado no LiberMedia): token obtido por re-challenge assinado lá.
  const setSession = useCallback(async (token: string, uname: string, m: Mode = 'nostr') => {
    await adopt(token, uname, m)
  }, [adopt])

  const logout = useCallback(async () => {
    setStatus('guest'); setMode(null); setUsername(null); setInfo(null); setNeedsPin(false)
    setWalletToken(null)
    try { await wallet.logout() } catch { /* cliente já limpo */ }
  }, [])

  // Mount: configura o reauth (standalone = /refresh por cookie) e tenta retomar sessão.
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    // EMBARCADO: nunca retomar por cookie (vazaria a carteira de outro usuário same-site).
    // Zera qualquer token/reauth herdado em memória e começa como guest — o app hospedeiro
    // injeta a sessão do usuário ATUAL via setSession (handoff) + seu próprio setWalletReauth.
    if (embedded) {
      setWalletToken(null)
      setWalletReauth(null)
      setStatus('guest')
      return
    }
    setWalletReauth(async () => {
      try { const r = await wallet.refresh(); setWalletToken(r.access_token); return r.access_token }
      catch { return null }
    })
    ;(async () => {
      try {
        const r = await wallet.refresh()
        await adopt(r.access_token, usernameFromJwt(r.access_token), null)
      } catch {
        setStatus('guest')
      }
    })()
  }, [adopt, embedded])

  const lightningAddress = info?.lightning_address || (username ? `${username}@libernet.app` : null)

  const value = useMemo<WalletAuthState>(() => ({
    status, mode, username, lightningAddress, info, needsPin, webauthnSupported, createPin,
    loginPin, registerPin, loginNostr, loginNsec, registerWebAuthn, loginWebAuthn, setSession, refreshInfo, logout,
  }), [status, mode, username, lightningAddress, info, needsPin, createPin, loginPin, registerPin, loginNostr, loginNsec, registerWebAuthn, loginWebAuthn, setSession, refreshInfo, logout])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWallet(): WalletAuthState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWallet deve ser usado dentro de <WalletAuthProvider>')
  return ctx
}
