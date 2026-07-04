// DMs (NIP-17) — agora pelo SIGNER (nsec local / NIP-07 / bunker), sem exigir a
// nsec solta no localStorage. Cripto real em dm17.ts. O transporte (publicar nos
// relays + guardar no servidor) é AGNÓSTICO de kind: texto (14), reação (7) e
// recibo (1314) viajam todos como gift wrap kind:1059.
import { nip19 } from 'nostr-tools'
import { relayManager } from './relay-manager'
import { api } from './api'
import { wrapDM, wrapReaction, wrapReceipt, wrapNudge, unwrapDM, KIND_REACTION, KIND_RECEIPT, KIND_NUDGE, type ReceiptStatus } from './dm17'

// Rumor de CONTROLE NIP-17 (reação/recibo/zumbido): NÃO deve subir a conversa na lista.
// O servidor é E2E (só vê o wrap kind:1059) → é o cliente, que decifra, quem informa isso
// via `_ctl` no /api/dm/store, e a listagem ordena ignorando os controles. Ver dm_conversations.
export function isControlKind(kind: number | undefined): boolean {
  return kind === KIND_REACTION || kind === KIND_RECEIPT || kind === KIND_NUDGE
}
import { notifyPeer } from './push'
import type { Event } from 'nostr-tools'
import type { Signer } from './signer'

// DM CONVERGE no relay de ORIGEM (relay.libernet.app), com nexus como reserva.
// NIP-17 prega inbox dedicado: convergir remetente+destinatário no MESMO relay =
// entrega instantânea, sem o lag de 5min entre os repetidores do geo-router (nexus).
// (Pra o feed a geo-distribuição continua; isto é só p/ DM.) Pool removido 26/Jun.
export const DM_RELAYS = ['wss://relay.libernet.app', 'wss://nexus.libernet.app']

export function npubToHex(npub: string): string | null {
  if (/^[0-9a-f]{64}$/i.test(npub)) return npub.toLowerCase()
  try {
    const d = nip19.decode(npub)
    if (d.type === 'npub') return d.data
    if (d.type === 'nprofile') return d.data.pubkey
  } catch {
    /* inválido */
  }
  return null
}

// Existe ALGUM caminho de assinatura p/ este npub? (nsec local / bunker / NIP-07)
// Síncrono — serve p/ habilitar/desabilitar a UI sem await.
export function hasSigner(npub: string | null): boolean {
  if (!npub) return false
  if (
    localStorage.getItem(`libermedia_nsec_${npub}`) ||
    sessionStorage.getItem(`libermedia_nsec_${npub}`) ||
    localStorage.getItem(`libermedia_bunker_${npub}`)
  )
    return true
  return typeof window !== 'undefined' && !!window.nostr
}

export interface DecryptedMsg {
  id: string
  pubkey: string // autor do rumor
  content: string
  created_at: number
  kind: number
  tags: string[][]
  replyTo?: string // id do rumor respondido (tag 'reply')
}

// Parseia o `raw` (string JSON) de um evento armazenado.
export function parseRaw(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null
  if (typeof raw === 'object') return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  return null
}

// Decripta um gift wrap (kind:1059) via signer → mensagem. null se não der.
export async function unwrapWithSigner(signer: Signer | null, giftWrap: unknown): Promise<DecryptedMsg | null> {
  if (!signer || !giftWrap || typeof giftWrap !== 'object') return null
  const gw = giftWrap as { pubkey?: string; content?: string }
  if (!gw.pubkey || !gw.content) return null
  const rumor = await unwrapDM(signer, { pubkey: gw.pubkey, content: gw.content })
  if (!rumor) return null
  return {
    id: rumor.id,
    pubkey: rumor.pubkey,
    content: rumor.content,
    created_at: rumor.created_at,
    kind: rumor.kind,
    tags: rumor.tags,
    replyTo: rumor.tags.find((t) => t[0] === 'reply')?.[1],
  }
}

// Decripta um gift wrap E identifica o peer da conversa (p/ o sync incremental):
//  • se o rumor é meu (auto-wrap) → peer = destinatário (tag 'p' do rumor);
//  • senão → peer = autor do rumor.
// Devolve kind/tags p/ o caller rotear (texto / reação / recibo).
export async function unwrapForInbox(
  signer: Signer | null,
  giftWrap: unknown,
  myHex: string | null,
): Promise<{
  id: string
  content: string
  mine: boolean
  ts: number
  peerHex: string
  kind: number
  tags: string[][]
  replyTo?: string
} | null> {
  if (!signer || !giftWrap || typeof giftWrap !== 'object') return null
  const gw = giftWrap as { pubkey?: string; content?: string; id?: string | number }
  if (!gw.pubkey || !gw.content) return null
  const rumor = await unwrapDM(signer, { pubkey: gw.pubkey, content: gw.content })
  if (!rumor) return null
  const mine = !!myHex && rumor.pubkey === myHex
  const peerHex = mine ? rumor.tags.find((t) => t[0] === 'p')?.[1] || '' : rumor.pubkey
  if (!peerHex) return null
  return {
    id: rumor.id || String(gw.id || ''), // rumor legado pode vir sem id → usa o id do wrap
    content: rumor.content,
    mine,
    ts: rumor.created_at,
    peerHex,
    kind: rumor.kind,
    tags: rumor.tags,
    replyTo: rumor.tags.find((t) => t[0] === 'reply')?.[1],
  }
}

// Publica os gift wraps nos relays + guarda no servidor COM o peer (hex) da conversa.
// CRÍTICO p/ cross-device: o servidor NÃO decripta (E2E), então é o cliente que diz
// qual é o peer (campo `_peer`, só METADADO — NUNCA o texto). Sem isso o wrap fica
// peer_npub NULL e a conversa só aparece no device que estava aberto na hora.
async function publishWraps(wraps: Event[], peerHex: string, isControl = false): Promise<void> {
  // Cada wrap (p/ o peer + cópia p/ mim) precisa que ALGUM relay aceite. Rejeições de
  // relay costumam ser transitórias (carga/rate-limit) → RETRY até 3x com backoff. Se
  // ainda assim nenhum aceitar, lança → o envio otimista marca a msg como "⚠ falhou"
  // (em vez de sumir silenciosamente). Republicar o mesmo wrap é idempotente (mesmo id).
  for (const w of wraps) {
    let lastErr: unknown = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await relayManager.publish(w, DM_RELAYS)
        lastErr = null
        break
      } catch (e) {
        lastErr = e
        if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
      }
    }
    if (lastErr) throw lastErr
  }
  try {
    await api.post('/api/dm/store', { events: wraps.map((w) => ({ ...w, _peer: peerHex, _ctl: isControl })) })
  } catch {
    /* store é best-effort; o relay é a fonte da verdade */
  }
}

// Envia um DM de texto/anexo: gift wrap p/ o peer + cópia p/ si → relays + servidor.
// `extraTags` = metadados opcionais (ex.: tag 'media' p/ anexos).
export async function sendDM(
  signer: Signer | null,
  peerHex: string,
  text: string,
  replyTo?: string,
  extraTags?: string[][],
): Promise<void> {
  if (!signer) throw new Error('Para enviar DM é preciso estar logado com chave (nsec, extensão ou bunker).')
  const content = text.trim()
  if (!content) return
  await publishWraps(await wrapDM(signer, peerHex, content, replyTo, extraTags), peerHex)
  // Sender-ping: cutuca o device do destinatário (push opaco). Best-effort.
  void notifyPeer(nip19.npubEncode(peerHex))
}

// "Chamar a atenção" (zumbido MSN): manda um rumor de controle kind:1316 → o device do
// peer toca som + treme a tela + vibra (Android). Sem balão. O chamador estrangula (anti-spam).
export async function sendNudge(signer: Signer | null, peerHex: string): Promise<void> {
  if (!signer) throw new Error('Para chamar a atenção é preciso estar logado com chave.')
  await publishWraps(await wrapNudge(signer, peerHex), peerHex, true)
  void notifyPeer(nip19.npubEncode(peerHex))
}

// Envia uma reação (kind:7) a uma mensagem. `emoji` = o emoji, ou '-' p/ remover.
export async function sendReaction(signer: Signer | null, peerHex: string, targetId: string, emoji: string): Promise<void> {
  if (!signer) throw new Error('Para reagir é preciso estar logado com chave.')
  await publishWraps(await wrapReaction(signer, peerHex, targetId, emoji), peerHex, true)
  void notifyPeer(nip19.npubEncode(peerHex))
}

// Envia um recibo (kind:1314) de entrega/leitura. Não dispara push (é controle).
export async function sendReceipt(
  signer: Signer | null,
  peerHex: string,
  targetIds: string[],
  status: ReceiptStatus,
): Promise<void> {
  if (!signer || !targetIds.length) return
  await publishWraps(await wrapReceipt(signer, peerHex, targetIds, status), peerHex, true)
}

// Backfill de peer: diz ao servidor o peer (hex) de wraps JÁ decriptados no cliente
// (E2E: só `_peer`, sem texto). Idempotente + dedup por event-id na sessão. Sem isso,
// wraps sincronizados do relay ficam peer_npub NULL → não viram conversa em outros devices.
const _peerStored = new Set<string>()
export async function storePeerForWraps(items: { wrap: Record<string, unknown>; peerHex: string; isControl?: boolean }[]): Promise<void> {
  const fresh = items.filter((it) => {
    const id = String((it.wrap as { id?: unknown }).id || '')
    if (!id || _peerStored.has(id)) return false
    _peerStored.add(id)
    return true
  })
  if (!fresh.length) return
  try {
    await api.post('/api/dm/store', { events: fresh.map((it) => ({ ...it.wrap, _peer: it.peerHex, _ctl: !!it.isControl })) })
  } catch {
    fresh.forEach((it) => _peerStored.delete(String((it.wrap as { id?: unknown }).id))) // re-tenta depois
  }
}

// Recupera wraps que já estão no servidor com peer_npub NULL (sincronizados antes de
// o cliente atribuir o peer): decripta cada um → grava o `_peer`. É o que ressuscita
// conversas "que sumiram" ao trocar de device. Falha de decriptação 3× → marcado e pulado.
export async function recoverPendingWraps(signer: Signer | null, myHex: string | null): Promise<number> {
  if (!signer) return 0
  try {
    const r = await api.get<{ events?: Record<string, unknown>[] }>('/api/dm/pending-wrap?limit=200')
    const events = r.events ?? []
    if (!events.length) return 0
    const toStore: { wrap: Record<string, unknown>; peerHex: string; isControl?: boolean }[] = []
    for (const e of events) {
      const info = await unwrapForInbox(signer, e, myHex)
      if (info?.peerHex) toStore.push({ wrap: e, peerHex: info.peerHex, isControl: isControlKind(info.kind) })
      else if (e.id) {
        try {
          await api.post('/api/dm/mark-wrap-failed', { event_id: String(e.id) })
        } catch {
          /* noop */
        }
      }
    }
    await storePeerForWraps(toStore)
    return toStore.length
  } catch {
    return 0
  }
}
