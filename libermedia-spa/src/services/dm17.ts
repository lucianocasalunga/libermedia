// NIP-17 (DMs privados) via SIGNER — sem nsec solta no localStorage.
// Monta o gift wrap (kind:1059) que embrulha um seal (kind:13) que cifra o rumor.
// Decriptação acontece SÓ no device, pelo signer (nsec local / NIP-07 / bunker).
// Camada propositalmente isolada → o nível MLS (v2) encaixa por trás desta mesma
// interface sem reescrever a UI.
//
// O rumor INTERNO pode ser de vários tipos (todos viajam igual, como kind:1059):
//   • kind:14  → mensagem de texto (NIP-17 chat).
//   • kind:7   → reação (NIP-25): content = emoji, tag 'e' = id do rumor reagido.
//   • kind:1314→ recibo de entrega/leitura (NÃO há padrão NIP p/ recibo de DM;
//                como é só nosso e nunca é publicado cru, o valor é interno —
//                mnemônico: 13=seal, 14=dm → 1314=recibo). tag 'status' + tags 'e'.
import { finalizeEvent, generateSecretKey, getEventHash } from 'nostr-tools/pure'
import { nip44 } from 'nostr-tools'
import type { Event, UnsignedEvent } from 'nostr-tools'
import type { Signer } from './signer'

export const KIND_DM = 14
export const KIND_REACTION = 7
export const KIND_RECEIPT = 1314
// "Chamar a atenção" (zumbido estilo MSN) — rumor de controle, sem balão. Só dispara o
// efeito (som + tremor + vibração) no device do outro lado. Vizinho do recibo (1314→1316).
export const KIND_NUDGE = 1316
const KIND_SEAL = 13
const KIND_WRAP = 1059
const TWO_DAYS = 2 * 24 * 60 * 60

// Status de recibo (no rumor kind:1314, tag ['status', ...]).
export type ReceiptStatus = 'delivered' | 'read'

export interface Rumor {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
}

const nowSec = () => Math.floor(Date.now() / 1000)
// created_at do seal/wrap recuado aleatoriamente até 2 dias (privacidade, NIP-59).
// O rumor mantém o created_at REAL (verdade p/ ordenar).
const jitter = () => nowSec() - Math.floor(Math.random() * TWO_DAYS)

// Rumor genérico (não assinado — só tem id/hash). `recipientHex` vira tag 'p';
// `extraTags` carrega o que o tipo precisa (e: alvo, status: recibo, etc.).
function buildRumor(
  senderHex: string,
  recipientHex: string,
  kind: number,
  content: string,
  extraTags: string[][] = [],
): Rumor {
  const base: UnsignedEvent = {
    pubkey: senderHex,
    created_at: nowSec(),
    kind,
    tags: [['p', recipientHex], ...extraTags],
    content,
  }
  return { ...base, id: getEventHash(base) }
}

// Cria UM gift wrap endereçado a `targetHex` (destinatário OU eu mesmo).
async function wrapFor(signer: Signer, rumor: Rumor, targetHex: string): Promise<Event> {
  // Seal (kind:13): cifra o rumor com a chave do REMETENTE → destino, assinado pelo remetente.
  const sealContent = await signer.nip44Encrypt(targetHex, JSON.stringify(rumor))
  const seal = await signer.signEvent({
    kind: KIND_SEAL,
    created_at: jitter(),
    tags: [],
    content: sealContent,
  })
  // Gift wrap (kind:1059): chave EFÊMERA descartável → esconde o remetente real.
  const esk = generateSecretKey()
  const ck = nip44.v2.utils.getConversationKey(esk, targetHex)
  const wrapContent = nip44.v2.encrypt(JSON.stringify(seal), ck)
  return finalizeEvent(
    { kind: KIND_WRAP, created_at: jitter(), tags: [['p', targetHex]], content: wrapContent },
    esk,
  )
}

// Embrulha um rumor já montado em 2 wraps: 1 p/ o destinatário + 1 cópia p/ mim
// (auto-wrap → aparece em TODOS os meus aparelhos). Retorna os kind:1059 prontos.
async function wrapBoth(signer: Signer, recipientHex: string, rumor: Rumor): Promise<Event[]> {
  return Promise.all([wrapFor(signer, rumor, recipientHex), wrapFor(signer, rumor, signer.pubkey)])
}

// Texto (kind:14). `replyTo` = id do rumor respondido (tag E2E dentro do cifrado).
// `extraTags` carrega metadados opcionais (ex.: ['media', mime, url] p/ anexos —
// a URL também vai no content, então clients externos veem o link mesmo sem o tag).
export async function wrapDM(
  signer: Signer,
  recipientHex: string,
  content: string,
  replyTo?: string,
  extraTags: string[][] = [],
): Promise<Event[]> {
  const extra = [...(replyTo ? [['reply', replyTo]] : []), ...extraTags]
  const rumor = buildRumor(signer.pubkey, recipientHex, KIND_DM, content, extra)
  return wrapBoth(signer, recipientHex, rumor)
}

// Reação (kind:7, NIP-25): `targetId` = id do rumor reagido; `emoji` = content
// ('+' p/ curtir simples, ou o emoji; '-' tira a reação por convenção do NIP-25).
export async function wrapReaction(signer: Signer, recipientHex: string, targetId: string, emoji: string): Promise<Event[]> {
  const rumor = buildRumor(signer.pubkey, recipientHex, KIND_REACTION, emoji, [['e', targetId]])
  return wrapBoth(signer, recipientHex, rumor)
}

// Recibo (kind:1314): confirma entrega/leitura de uma ou mais mensagens.
export async function wrapReceipt(signer: Signer, recipientHex: string, targetIds: string[], status: ReceiptStatus): Promise<Event[]> {
  const tags: string[][] = [['status', status], ...targetIds.map((id) => ['e', id])]
  const rumor = buildRumor(signer.pubkey, recipientHex, KIND_RECEIPT, '', tags)
  return wrapBoth(signer, recipientHex, rumor)
}

// "Chamar a atenção" (kind:1316): rumor de controle vazio — só sinaliza o zumbido.
export async function wrapNudge(signer: Signer, recipientHex: string): Promise<Event[]> {
  const rumor = buildRumor(signer.pubkey, recipientHex, KIND_NUDGE, '', [])
  return wrapBoth(signer, recipientHex, rumor)
}

// Desembrulha um gift wrap (kind:1059) → rumor (qualquer kind). null se não for
// p/ mim ou se a autenticidade não bater (autor do rumor ≠ quem assinou o seal).
// O CALLER decide o que fazer pelo `rumor.kind` (texto / reação / recibo).
export async function unwrapDM(
  signer: Signer,
  giftWrap: { pubkey: string; content: string },
): Promise<Rumor | null> {
  try {
    const sealJson = await signer.nip44Decrypt(giftWrap.pubkey, giftWrap.content)
    const seal = JSON.parse(sealJson)
    if (seal?.kind !== KIND_SEAL || typeof seal.content !== 'string' || typeof seal.pubkey !== 'string') return null
    const rumorJson = await signer.nip44Decrypt(seal.pubkey, seal.content)
    const rumor = JSON.parse(rumorJson)
    if (typeof rumor?.kind !== 'number' || typeof rumor.pubkey !== 'string') return null
    // Autenticidade: o autor do rumor TEM que ser quem assinou o seal.
    if (rumor.pubkey !== seal.pubkey) return null
    // Blindagem: rumores legados (ex.: MPA kind:4-em-1059) podem não ter `tags`/`content`.
    // Garantir os tipos aqui evita TypeError no caller (it.tags.find) que derruba o lote.
    if (!Array.isArray(rumor.tags)) rumor.tags = []
    if (typeof rumor.content !== 'string') rumor.content = ''
    return rumor as Rumor
  } catch {
    return null
  }
}
