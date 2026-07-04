// Zap (NIP-57) — espelha o fluxo do MPA (nostr.js + base.html enviarZap).
// Proxies backend (já existentes, read-only do ponto de vista de pagamento):
//   GET  /api/lnurl-resolve?lud16=  → { callback, allowsNostr, nostrPubkey, ... }
//   POST /api/lnurl-callback {callback, amount, nostr} → { pr (bolt11), ... }
//
// IMPORTANTE: este módulo só GERA o invoice. O pagamento em si (NWC/WebLN) é
// disparado pela UI por ação explícita do usuário — nunca automaticamente.
import { api } from './api'
import { DEFAULT_RELAYS, FALLBACK_RELAYS } from '../constants'
import type { Signer } from './signer'

interface LnurlData {
  callback?: string
  allowsNostr?: boolean
  nostrPubkey?: string
  minSendable?: number
  maxSendable?: number
  error?: string
}

export async function resolveLnurl(lud16: string): Promise<LnurlData> {
  return api.get<LnurlData>(`/api/lnurl-resolve?lud16=${encodeURIComponent(lud16)}`)
}

/** Monta e assina o zap request (kind:9734). */
async function createZapRequest(
  signer: Signer,
  recipientHex: string,
  sats: number,
  message: string,
  eventId?: string,
) {
  const relays = Array.from(new Set([...DEFAULT_RELAYS, ...FALLBACK_RELAYS])).slice(0, 6)
  const tags: string[][] = [
    ['relays', ...relays],
    ['amount', String(sats * 1000)], // msats
    ['p', recipientHex],
  ]
  if (eventId) tags.push(['e', eventId])
  return signer.signEvent({
    kind: 9734,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: message || '',
  })
}

export interface InvoiceResult {
  bolt11: string
  checkingId?: string
}

/**
 * Resolve o LNURL do destinatário, monta o zap request e pede o invoice.
 * Não paga nada — devolve o bolt11 para a UI exibir/pagar.
 */
export async function requestZapInvoice(opts: {
  signer: Signer
  lud16: string
  recipientHex: string
  sats: number
  message?: string
  eventId?: string
}): Promise<InvoiceResult> {
  const { signer, lud16, recipientHex, sats, message = '', eventId } = opts
  if (sats <= 0) throw new Error('Valor inválido.')

  const ln = await resolveLnurl(lud16)
  if (ln.error || !ln.callback) throw new Error(ln.error || 'Não foi possível resolver o endereço Lightning.')
  if (ln.minSendable && sats * 1000 < ln.minSendable) throw new Error(`Mínimo: ${Math.ceil(ln.minSendable / 1000)} sats.`)
  if (ln.maxSendable && sats * 1000 > ln.maxSendable) throw new Error(`Máximo: ${Math.floor(ln.maxSendable / 1000)} sats.`)

  // Só inclui o zap request se o servidor suporta NIP-57.
  let nostr = ''
  if (ln.allowsNostr && ln.nostrPubkey) {
    const zr = await createZapRequest(signer, recipientHex, sats, message, eventId)
    nostr = JSON.stringify(zr)
  }

  const res = await api.post<{ pr?: string; checking_id?: string; error?: string }>(
    '/api/lnurl-callback',
    { callback: ln.callback, amount: String(sats * 1000), nostr },
  )
  if (res.error || !res.pr) throw new Error(res.error || 'O servidor não retornou um invoice.')
  return { bolt11: res.pr, checkingId: res.checking_id }
}

/**
 * Pagamento via WebLN (extensão do usuário — Alby etc.). Disparado SÓ por clique.
 * NWC (Nostr Wallet Connect / auto-pagamento) ainda NÃO está ligado aqui:
 * requer teste com carteira real antes de habilitar.
 */
export async function payWithWebLN(bolt11: string): Promise<boolean> {
  const webln = (window as unknown as { webln?: { enable(): Promise<void>; sendPayment(b: string): Promise<unknown> } }).webln
  if (!webln) return false
  await webln.enable()
  await webln.sendPayment(bolt11)
  return true
}
