// Sync incremental de DMs (Fase 3) — usa o endpoint /api/dm/poll (cursor por
// received_at, estável e imune ao jitter). O cursor é guardado por npub. Em
// foreground roda em intervalo + ao focar a aba; na Fase 4 o push dispara o mesmo.
import { api } from './api'

export interface PollResult {
  events: Record<string, unknown>[]
  cursor: number
  serverNow: number // relógio do SERVIDOR (epoch) — base do cursor, NÃO o do aparelho
}

export async function pollInbox(sinceRecv: number): Promise<PollResult> {
  const r = await api.get<{ events?: Record<string, unknown>[]; cursor?: number; server_now?: number }>(
    `/api/dm/poll?since_recv=${sinceRecv}&limit=300`,
  )
  return { events: r.events ?? [], cursor: r.cursor ?? sinceRecv, serverNow: r.server_now ?? 0 }
}

// Lê SÓ o relógio do servidor (sem trazer eventos) — manda um since gigante. Usado
// p/ ancorar o cursor inicial no tempo do SERVIDOR. CRÍTICO: o cursor do /poll é
// comparado com received_at (relógio do servidor); usar Date.now() do APARELHO
// quebra quando os relógios divergem (poll nunca casa → mensagem nova não chega).
export async function fetchServerNow(): Promise<number> {
  try {
    const r = await pollInbox(4_000_000_000)
    return r.serverNow || 0
  } catch {
    return 0
  }
}

// Relays de onde o servidor puxa os DMs do usuário (convergidos no origem + reserva).
// Pool removido 26/Jun (travava sem EOSE) → nexus como reserva.
export const DM_SYNC_RELAYS = ['wss://relay.libernet.app', 'wss://nexus.libernet.app']

// Dispara o sync server-side (servidor puxa os gift wraps do usuário dos relays →
// nostr_dm_cache). É como DM de TERCEIROS chega ao cache (o /poll lê o cache depois).
// Rate-limit do backend = 5/min → o chamador deve estrangular (ver MensagensPage).
export async function triggerServerSync(relays: string[] = DM_SYNC_RELAYS, deep = false): Promise<void> {
  await api.post('/api/dm/sync', { relays, deep })
}

const KEY = (npub: string) => `libermedia_dm_cursor_${npub}`

export function getCursor(npub: string | null): number {
  if (!npub) return 0
  const v = Number(localStorage.getItem(KEY(npub)) || 0)
  return Number.isFinite(v) ? v : 0
}

export function setCursor(npub: string | null, cursor: number): void {
  if (!npub) return
  try {
    localStorage.setItem(KEY(npub), String(cursor))
  } catch {
    /* quota — ignora */
  }
}

// ── Backfill histórico (paginação reversa por received_at) ───────────────────
// Aparelho novo/limpo: o /poll só traz NOVAS e o relay só ~2-3 dias de wraps. O
// backfill puxa o histórico antigo do cold storage do mais NOVO p/ o mais ANTIGO,
// em LOTES PEQUENOS (p/ não travar o celular). Estado por dono: `oldest` = received_at
// do mais antigo já obtido; `done` = histórico esgotado.
export interface BackfillResult {
  events: Record<string, unknown>[]
  oldest: number // received_at do mais antigo do lote (próximo before_recv)
  oldestId: string // event_id do mais antigo do lote (cursor COMPOSTO — segundos têm milhares de wraps)
  done: boolean // lote incompleto = chegou ao início do histórico
}

export async function backfillBatch(beforeRecv: number, beforeId: string, limit = 150): Promise<BackfillResult> {
  const q = `/api/dm/backfill?before_recv=${beforeRecv}&before_id=${encodeURIComponent(beforeId)}&limit=${limit}`
  const r = await api.get<{ events?: Record<string, unknown>[]; oldest?: number; oldest_id?: string; done?: boolean }>(q)
  return { events: r.events ?? [], oldest: r.oldest ?? beforeRecv, oldestId: r.oldest_id ?? '', done: !!r.done }
}

const BKEY = (npub: string) => `libermedia_dm_backfill_${npub}`

export function getBackfill(npub: string | null): { oldest: number; oldestId: string; done: boolean } {
  if (!npub) return { oldest: 0, oldestId: '', done: false }
  try {
    const raw = localStorage.getItem(BKEY(npub))
    if (!raw) return { oldest: 0, oldestId: '', done: false }
    const v = JSON.parse(raw)
    return { oldest: Number(v.oldest) || 0, oldestId: String(v.oldestId || ''), done: !!v.done }
  } catch {
    return { oldest: 0, oldestId: '', done: false }
  }
}

export function setBackfill(npub: string | null, oldest: number, oldestId: string, done: boolean): void {
  if (!npub) return
  try {
    localStorage.setItem(BKEY(npub), JSON.stringify({ oldest, oldestId, done }))
  } catch {
    /* quota — ignora */
  }
}
