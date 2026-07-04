// Cliente da API da LiberWallet — FONTE DA VERDADE (espelhada no libermedia-spa).
// Dual-mode:
//   • standalone (origin = wallet.libernet.app): mesma origem → cookie de refresh + Bearer em memória.
//   • embarcado (origin ≠ wallet, ex.: media.libernet.app): cross-origin → SÓ Bearer em memória,
//     com re-challenge Nostr quando o token expira (cookie de 3º é bloqueado pelos navegadores).
// Segurança (23/Jun): token NUNCA em localStorage (anti-XSS) — vive só em memória do módulo.

// ── Base da API ────────────────────────────────────────────────────────────────
function detectBase(): string {
  if (typeof window === 'undefined') return 'https://wallet.libernet.app'
  const h = window.location.hostname
  // mesma origem quando servido no próprio domínio da carteira
  if (h === 'wallet.libernet.app' || h === 'localhost' || h === '127.0.0.1') return ''
  // embarcado em qualquer outro host (ex.: LiberMedia) → absoluto
  return 'https://wallet.libernet.app'
}
export const WALLET_API_BASE = detectBase()
export const isEmbedded = WALLET_API_BASE !== ''

// ── Token em memória + hooks de re-auth ──────────────────────────────────────────
let accessToken: string | null = null
export function setWalletToken(t: string | null): void { accessToken = t }
export function getWalletToken(): string | null { return accessToken }
export function hasWalletToken(): boolean { return !!accessToken }

// O app injeta como renovar o token quando expira (embarcado = re-challenge Nostr assinado).
// Deve devolver o novo access_token (ou null se não conseguir).
let reauthFn: (() => Promise<string | null>) | null = null
export function setWalletReauth(fn: (() => Promise<string | null>) | null): void { reauthFn = fn }

export class WalletApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'WalletApiError'
    this.status = status
  }
}

function parseDetail(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const d = (data as Record<string, unknown>).detail ?? (data as Record<string, unknown>).error
    if (typeof d === 'string') return d
    if (Array.isArray(d)) return d.map((e: any) => e?.msg || JSON.stringify(e)).join('; ')
  }
  return `HTTP ${status}`
}

async function raw<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`

  const res = await fetch(WALLET_API_BASE + path, {
    method,
    headers,
    credentials: 'include', // standalone usa cookie; embarcado ignora (3rd-party bloqueado)
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let data: unknown = null
  if (text) { try { data = JSON.parse(text) } catch { data = text } }

  if (!res.ok) throw new WalletApiError(parseDetail(data, res.status), res.status)
  return data as T
}

// Wrapper com retry único no 401 via re-auth (re-challenge no embarcado).
async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    return await raw<T>(method, path, body)
  } catch (e) {
    if (e instanceof WalletApiError && e.status === 401 && reauthFn) {
      const nt = await reauthFn()
      if (nt) { accessToken = nt; return await raw<T>(method, path, body) }
    }
    throw e
  }
}

// ── Tipos ────────────────────────────────────────────────────────────────────────
export interface TokenResp { access_token: string; token_type: string; username: string; expires_in: number }
export interface RefreshResp { access_token: string; token_type: string; expires_in: number }
export interface WalletInfo { balance_msats: number; balance_sats: number; lightning_address: string; currency?: string; theme?: string; language?: string; nostr_pubkey?: string | null }
export interface UsernameCheck { username: string; available: boolean; reason?: string | null }
export interface Rates { [code: string]: number } // ex.: { BRL, USD, ILS, EUR } — preço do BTC
export interface InvoiceResp { payment_hash: string; payment_request: string; amount_sats: number | null; memo?: string }
export interface InvoiceStatus { paid: boolean; [k: string]: unknown }
export interface DecodeResp { amount_sats: number; amount_msat: number; description?: string; [k: string]: unknown }
export interface PayResp { [k: string]: unknown }
export interface Tx { type: string; status: string; amount_sats?: number; amount_msats?: number; memo?: string; payment_hash?: string; created_at?: string | number; [k: string]: unknown }
export interface History { transactions: Tx[]; total: number }

// ── API ────────────────────────────────────────────────────────────────────────
export const wallet = {
  // ── auth ──
  nostrChallenge: () => req<{ challenge: string }>('GET', '/api/auth/nostr/challenge'),
  nostrVerify: (event: object) => req<TokenResp>('POST', '/api/auth/nostr/verify', { event }),
  login: (username: string, pin: string) => req<TokenResp>('POST', '/api/auth/login', { username, pin }),
  // refresh usa `raw` (sem retry/reauth) p/ não recursar; vale só no standalone (cookie mesma-origem).
  refresh: () => raw<RefreshResp>('POST', '/api/auth/refresh'),
  register: (username: string, pin: string) => req<TokenResp>('POST', '/api/auth/register', { username, pin }),
  checkUsername: (username: string) =>
    req<UsernameCheck>('GET', `/api/auth/check-username?username=${encodeURIComponent(username)}`),
  loginInfo: (username: string) =>
    req<{ exists: boolean; has_pin: boolean }>('GET', `/api/auth/login-info?username=${encodeURIComponent(username)}`),
  logout: () => req<{ message: string }>('POST', '/api/auth/logout'),
  getNsec: () => req<{ nsec: string }>('GET', '/api/auth/nostr/nsec'),

  // ── WebAuthn (biometria/passkey) ──
  // registro exige estar logado (Bearer); login é público (só username).
  // As opções e a credencial são JSON bruto do @simplewebauthn/browser.
  webauthn: {
    registerBegin: () => req<Record<string, unknown>>('GET', '/api/auth/webauthn/register/begin'),
    registerComplete: (credential: unknown, device_name: string) =>
      req<{ ok: boolean; message: string }>('POST', '/api/auth/webauthn/register/complete', { credential, device_name }),
    loginBegin: (username: string) =>
      req<Record<string, unknown>>('POST', '/api/auth/webauthn/login/begin', { username }),
    loginComplete: (username: string, credential: unknown) =>
      req<{ access_token: string; username: string }>('POST', '/api/auth/webauthn/login/complete', { username, credential }),
  },

  // ── PIN ── (quem entra por chave nasce sem PIN → cria após login)
  pinStatus: () => req<{ has_pin: boolean }>('GET', '/api/auth/pin/status'),
  setPin: (pin: string, current_pin?: string) =>
    req<{ message: string }>('POST', '/api/auth/pin', { pin, current_pin: current_pin ?? null }),

  // ── carteira ──
  info: () => req<WalletInfo>('GET', '/api/wallet'),
  updateSettings: (patch: { currency?: string; theme?: string; language?: string }) =>
    req<WalletInfo>('PATCH', '/api/wallet/settings', patch),
  // Normaliza o descasamento backend↔frontend: o backend devolve `direction`
  // ("in"/"out"), `time` e `amount_msat`; a UI lê `type`, `created_at` e
  // `amount_msats`. Sem isso, type=undefined → isOut sempre false → tudo "Recebido".
  history: () =>
    req<History>('GET', '/api/wallet/history').then((h) => ({
      ...h,
      transactions: (h.transactions ?? []).map((tx) => ({
        ...tx,
        type: tx.direction === 'out' ? 'out' : tx.type ?? 'in',
        created_at: (tx.time as string | number | undefined) ?? tx.created_at,
        amount_msats: (tx.amount_msat as number | undefined) ?? tx.amount_msats,
      })),
    })),

  // ── cotação ── (backend embrulha em {rates:{BRL,USD,EUR,ILS}} = preço do BTC)
  rates: () => req<{ rates: Rates }>('GET', '/api/rates').then((r) => r.rates),

  // ── receber ──
  createInvoice: (amount_sats?: number | null, memo?: string) =>
    req<InvoiceResp>('POST', '/api/receive/invoice', { amount_sats: amount_sats ?? null, memo: memo ?? '' }),
  checkInvoice: (hash: string) => req<InvoiceStatus>('GET', `/api/receive/invoice/${encodeURIComponent(hash)}`),

  // ── enviar ──
  decode: (payment_request: string) => req<DecodeResp>('POST', '/api/send/decode', { payment_request }),
  pay: (payment_request: string) => req<PayResp>('POST', '/api/send/pay', { payment_request }),
  resolveLnaddr: (lightning_address: string, amount_sats?: number | null) =>
    req<any>('POST', '/api/send/lnaddr', { lightning_address, amount_sats: amount_sats ?? null }),
}
