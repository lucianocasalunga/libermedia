// Pagamento via NWC (Nostr Wallet Connect / NIP-47) — porta o comportamento do
// MPA (window.pagarComNWC) para o SPA, SEM dependência nova: usa o nip47 nativo
// do nostr-tools (parseConnectionString + makeNwcRequestEvent) + nip04 p/ a resposta.
// A connection string (contém secret de gasto) vive SÓ em memória — ver memCache abaixo.
import { nip04, nip47 } from 'nostr-tools'
import { api } from './api'

const NWC_RESPONSE_KIND = 23195
const CONNECT_TIMEOUT = 10_000
const PAY_TIMEOUT = 90_000

// Cache em MEMÓRIA apenas: a NWC URI contém um `secret` que AUTORIZA GASTAR sats.
// Nunca em localStorage (roubo total via qualquer XSS). O backend provisiona de
// forma determinística (GET /api/carteira/nwc), então re-buscar por sessão é barato.
const memCache = new Map<string, string>()
const lsKeyLegacy = (npub: string) => 'libermedia_nwc_' + npub

// Garante a connection string NWC do usuário: usa o cache em memória; senão
// PROVISIONA pelo endpoint (GET /api/carteira/nwc, chave determinística).
// Retorna null se o usuário não tem carteira NWC (cai no fallback manual).
export async function ensureNwc(npub: string | null): Promise<string | null> {
  if (!npub) return null
  const cached = memCache.get(npub)
  if (cached) return cached
  // Higiene: remove qualquer cópia LEGADA do secret em disco (MPA / versão antiga da SPA).
  try { localStorage.removeItem(lsKeyLegacy(npub)) } catch { /* noop */ }
  try {
    const d = await api.get<{ ok?: boolean; nwc_uri?: string }>('/api/carteira/nwc')
    if (d?.ok && d.nwc_uri) {
      memCache.set(npub, d.nwc_uri)
      return d.nwc_uri
    }
  } catch { /* sem carteira / endpoint indisponível → manual */ }
  return null
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

interface NwcResult { preimage: string }

// Paga um bolt11 pela carteira NWC do usuário. Resolve com {preimage} ou rejeita
// com erro legível (sem saldo, timeout, sem NWC, etc.).
export async function payWithNwc(bolt11: string, uri: string): Promise<NwcResult> {
  const { pubkey: walletPubkey, relay, secret } = nip47.parseConnectionString(uri)
  const secretBytes = hexToBytes(secret)
  const reqEvent = await nip47.makeNwcRequestEvent(walletPubkey, secretBytes, bolt11)

  return await new Promise<NwcResult>((resolve, reject) => {
    let settled = false
    let connectTimer: ReturnType<typeof setTimeout>
    let payTimer: ReturnType<typeof setTimeout>
    const subId = 'nwc-' + reqEvent.id.slice(0, 12)
    const ws = new WebSocket(relay)

    const cleanup = () => {
      clearTimeout(connectTimer)
      clearTimeout(payTimer)
      try { ws.send(JSON.stringify(['CLOSE', subId])) } catch { /* noop */ }
      try { ws.close() } catch { /* noop */ }
    }
    const fail = (msg: string) => { if (settled) return; settled = true; cleanup(); reject(new Error(msg)) }
    const done = (r: NwcResult) => { if (settled) return; settled = true; cleanup(); resolve(r) }

    connectTimer = setTimeout(() => fail('Não consegui conectar à carteira (timeout).'), CONNECT_TIMEOUT)

    ws.onopen = () => {
      clearTimeout(connectTimer)
      payTimer = setTimeout(() => fail('Pagamento expirou (sem resposta da carteira).'), PAY_TIMEOUT)
      ws.send(JSON.stringify(['EVENT', reqEvent]))
      ws.send(JSON.stringify(['REQ', subId, { kinds: [NWC_RESPONSE_KIND], '#e': [reqEvent.id], limit: 1 }]))
    }

    ws.onerror = () => fail('Falha de conexão com a carteira.')
    ws.onclose = () => { if (!settled) fail('Conexão com a carteira encerrada.') }

    ws.onmessage = async (m) => {
      let data: unknown
      try { data = JSON.parse(typeof m.data === 'string' ? m.data : '') } catch { return }
      if (!Array.isArray(data)) return
      const [type] = data
      if (type === 'OK' && data[1] === reqEvent.id && data[2] === false) {
        return fail('Carteira rejeitou o pedido: ' + (data[3] || 'erro'))
      }
      if (type !== 'EVENT' || data[1] !== subId) return
      const ev = data[2] as { content: string }
      try {
        const plain = await nip04.decrypt(secretBytes, walletPubkey, ev.content)
        const resp = JSON.parse(plain) as {
          result?: { preimage?: string }
          error?: { code?: string; message?: string }
        }
        if (resp.error) return fail(resp.error.message || 'Pagamento recusado pela carteira.')
        if (resp.result?.preimage) return done({ preimage: resp.result.preimage })
        fail('Resposta inesperada da carteira.')
      } catch {
        fail('Não consegui ler a resposta da carteira.')
      }
    }
  })
}
