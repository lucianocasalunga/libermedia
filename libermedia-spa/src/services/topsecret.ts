// Top Secret — posts pagos. Aba "Comprados" lista o que o usuário desbloqueou.
// Backend: GET /api/topsecret/purchased (auth por sessão Flask).
import { api } from './api'

export interface PurchasedItem {
  file_id: string
  event_id: string
  thumbnail_url: string
  preco_sats: number
  mime_type: string
  pago_em: string
  valor_sats: number
}

// Lista os arquivos Top Secret que o usuário logado já comprou (mais recentes primeiro).
export async function getPurchased(): Promise<PurchasedItem[]> {
  const res = await api.get<{ items?: PurchasedItem[] }>('/api/topsecret/purchased')
  return res.items ?? []
}

// URL do arquivo real (já desbloqueado) servido pelo Flask.
export function purchasedFileUrl(fileId: string): string {
  return `/api/files/${fileId}`
}

// ── Criação de conteúdo pago (compose) ───────────────────────────────────────
export interface PrepareResp { file_id: string; thumbnail_url: string; preco_sats?: number }

// Registra a mídia (já enviada) como Top Secret + preço. Gera a thumbnail psicodélica.
export async function prepare(fileHash: string, precoSats: number, mime: string): Promise<PrepareResp> {
  return api.post<PrepareResp>('/api/topsecret/prepare', {
    file_hash: fileHash, preco_sats: precoSats, mime_type: mime,
  })
}

// Vincula o evento Nostr publicado ao arquivo TS (após publicar o kind:1).
export async function linkEvent(fileId: string, eventId: string): Promise<void> {
  await api.post('/api/topsecret/link-event', { file_id: fileId, event_id: eventId })
}

// ── Desbloqueio (feed) ───────────────────────────────────────────────────────
export interface UnlockResp {
  already_unlocked?: boolean
  mime_type?: string
  bolt11?: string
  payment_hash?: string
  preco_sats?: number
}
// Pede unlock: se já comprou (ou é o criador) → already_unlocked; senão → invoice.
export async function unlock(fileId: string): Promise<UnlockResp> {
  return api.post<UnlockResp>('/api/topsecret/unlock', { file_id: fileId })
}
// Polling do pagamento.
export async function checkPayment(fileId: string, hash: string): Promise<{ paid: boolean; mime_type?: string }> {
  return api.get<{ status?: string; paid: boolean; mime_type?: string }>(
    `/api/topsecret/check/${encodeURIComponent(fileId)}/${encodeURIComponent(hash)}`,
  )
}

// Cache (1x) dos itens já comprados → auto-revela o que o usuário já tem.
let _purchased: Map<string, string> | null = null
let _purchasedP: Promise<Map<string, string>> | null = null
export function ensurePurchased(): Promise<Map<string, string>> {
  if (_purchased) return Promise.resolve(_purchased)
  if (!_purchasedP) {
    _purchasedP = getPurchased()
      .then((items) => { _purchased = new Map(items.map((i) => [i.file_id, i.mime_type || ''])); return _purchased })
      .catch(() => { _purchased = new Map(); return _purchased })
  }
  return _purchasedP
}
export function markPurchased(fileId: string, mime = '') {
  if (!_purchased) _purchased = new Map()
  _purchased.set(fileId, mime)
}

// Lista enxuta de "presentes" (preços) — TikTok-style. Ícones em media.libernet.app/static/gifts/.
// Último item (sats:0) = "Outro valor" (aberto, clamp [10, 1_000_000]).
export interface Gift { sats: number; nome: string; img?: string }
export const GIFTS: Gift[] = [
  { sats: 18, nome: 'Chai', img: 'gift_18_chaim.gif' },
  { sats: 20, nome: 'Cafezinho', img: 'gift_20_cafezinho.png' },
  { sats: 25, nome: 'Sorvete', img: 'gift_25_sorvete.gif' },
  { sats: 50, nome: 'Rosa', img: 'gift_50_rosa.png' },
  { sats: 75, nome: 'Refri', img: 'gift_75_refrigerante.png' },
  { sats: 150, nome: 'Chocolate', img: 'gift_150_chocolate.png' },
  { sats: 200, nome: 'Pizza', img: 'gift_200_pizza.png' },
  { sats: 0, nome: 'Outro valor' },
]
export const giftImg = (img: string) => `https://media.libernet.app/static/gifts/${img}`
export const clampPrice = (n: number) => Math.max(10, Math.min(1_000_000, Math.round(n) || 10))
