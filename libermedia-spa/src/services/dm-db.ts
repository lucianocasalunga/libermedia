// Cache local das DMs em IndexedDB (Fase 2b) — abre o mensageiro INSTANTÂNEO
// (renderiza do cache antes do servidor) e funciona offline. Isolado por `owner`
// (npub do dono) → multi-conta sem vazamento. O logout apaga este banco
// (wipeIndexedDB enumera databases() + KNOWN_IDB inclui 'libermedia_dm_v1').
const DB_NAME = 'libermedia_dm_v1'
// v2 (25/Jun): PURGA ÚNICA do cache da era-bug. Registros antigos guardavam `mine`
// de lado errado (1059 não-decriptado recebia lado da chave EFÊMERA; kind:4 legado
// marcava mine:false) com `id` que NÃO bate com o rumor fresco → sobreviviam ao lado
// da cópia correta = balões embaralhados em conversas antigas. O lado em si já é
// seguro (autor do rumor verificado contra o seal em dm17.unwrapDM); só faltava
// limpar o lixo persistido. Após a limpeza, o cache se reconstrói do caminho
// autenticado e fresco sempre vence (não recorre — o código que gerava o lixo morreu).
// v3 (26/Jun — PLANO_DM Fase 1): store `wraps` = event.ids dos gift wraps (kind:1059) já
// vistos por este device + o created_at de cada um. É o que torna o RELAY a fonte da verdade:
// (1) dedup cross-sessão à prova de jitter (NIP-59 dá created_at aleatório até 48h no passado);
// (2) âncora do `since` da query ao relay (último created_at visto − 48h). Sem isso o device
// re-decifraria os mesmos wraps todo boot. Isolado por owner; o logout apaga o banco todo.
const DB_VERSION = 3
let dbp: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const d = req.result
      const tx = req.transaction // transação de versionchange (existe no upgrade)
      if (!d.objectStoreNames.contains('messages')) d.createObjectStore('messages', { keyPath: 'key' })
      if (!d.objectStoreNames.contains('conversations')) d.createObjectStore('conversations', { keyPath: 'key' })
      if (!d.objectStoreNames.contains('wraps')) d.createObjectStore('wraps', { keyPath: 'key' })
      // v1 → v2: esvazia o cache poluído (não toca em quem chega já na v2).
      if (e.oldVersion >= 1 && e.oldVersion < 2 && tx) {
        tx.objectStore('messages').clear()
        tx.objectStore('conversations').clear()
      }
      // v2 → v3: só cria o store `wraps` (acima). Nada a migrar.
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

function putAll(store: string, records: unknown[]): Promise<void> {
  if (records.length === 0) return Promise.resolve()
  return db().then(
    (d) =>
      new Promise<void>((res, rej) => {
        const t = d.transaction(store, 'readwrite')
        const s = t.objectStore(store)
        for (const r of records) s.put(r)
        t.oncomplete = () => res()
        t.onerror = () => rej(t.error)
      }),
  )
}

function getAll<T>(store: string): Promise<T[]> {
  return db().then(
    (d) =>
      new Promise<T[]>((res, rej) => {
        const t = d.transaction(store, 'readonly')
        const req = t.objectStore(store).getAll()
        req.onsuccess = () => res((req.result as T[]) || [])
        req.onerror = () => rej(req.error)
      }),
  )
}

export type MediaAttachment = { url: string; kind: 'image' | 'video' | 'audio' | 'file' }
export interface CachedMsg {
  key: string
  owner: string
  peer: string // npub do interlocutor
  id: string
  content: string
  mine: boolean
  ts: number
  eids?: string[] // event_ids dos gift wraps (p/ deletar)
  replyTo?: string // id do rumor respondido
  media?: MediaAttachment // anexo (imagem/vídeo/áudio/arquivo)
}
export interface CachedConv {
  key: string
  owner: string
  peerNpub: string
  peerHex: string | null
  lastTs: number
  total: number
  preview: string
}

export async function cacheMessages(
  owner: string,
  peer: string,
  msgs: { id: string; content: string; mine: boolean; ts: number; eids?: string[]; replyTo?: string; media?: MediaAttachment }[],
): Promise<void> {
  if (!owner) return
  await putAll(
    'messages',
    msgs.map((m) => ({ key: `${owner}|${m.id}`, owner, peer, id: m.id, content: m.content, mine: m.mine, ts: m.ts, eids: m.eids, replyTo: m.replyTo, media: m.media })),
  ).catch(() => {})
}

export async function loadMessages(owner: string, peer: string): Promise<CachedMsg[]> {
  if (!owner) return []
  const all = await getAll<CachedMsg>('messages').catch(() => [])
  return all.filter((m) => m.owner === owner && m.peer === peer).sort((a, b) => a.ts - b.ts)
}

// Última mensagem de TEXTO/MÍDIA por conversa (1 leitura só) → prévia da LISTA.
// O store de mensagens guarda só texto/mídia (recibos/reações ficam de fora), então
// a última daqui é a última mensagem "de verdade" — o último EVENTO do servidor pode
// ser um recibo e viraria "[mensagem]". Chave = npub do peer.
export async function lastTextPreviews(
  owner: string,
): Promise<Record<string, { content: string; media?: MediaAttachment; ts: number }>> {
  if (!owner) return {}
  const all = await getAll<CachedMsg>('messages').catch(() => [])
  const out: Record<string, { content: string; media?: MediaAttachment; ts: number }> = {}
  for (const m of all) {
    if (m.owner !== owner) continue
    const cur = out[m.peer]
    if (!cur || m.ts > cur.ts) out[m.peer] = { content: m.content, media: m.media, ts: m.ts }
  }
  return out
}

// Remove uma mensagem do cache (após deletar). Chave = `${owner}|${rumorId}`.
export async function removeMessage(owner: string, rumorId: string): Promise<void> {
  if (!owner) return
  try {
    const d = await db()
    await new Promise<void>((res, rej) => {
      const t = d.transaction('messages', 'readwrite')
      t.objectStore('messages').delete(`${owner}|${rumorId}`)
      t.oncomplete = () => res()
      t.onerror = () => rej(t.error)
    })
  } catch {
    /* noop */
  }
}

export async function cacheConversations(owner: string, convs: Omit<CachedConv, 'key' | 'owner'>[]): Promise<void> {
  if (!owner) return
  await putAll(
    'conversations',
    convs.map((c) => ({ key: `${owner}|${c.peerNpub}`, owner, ...c })),
  ).catch(() => {})
}

export async function loadConversations(owner: string): Promise<CachedConv[]> {
  if (!owner) return []
  const all = await getAll<CachedConv>('conversations').catch(() => [])
  return all.filter((c) => c.owner === owner).sort((a, b) => b.lastTs - a.lastTs)
}

// ── PLANO_DM Fase 1: rastro dos gift wraps (kind:1059) vistos por este device ──
interface SeenWrap { key: string; owner: string; id: string; ts: number }

// Marca wraps como vistos (id do evento 1059 + created_at). Idempotente (put por chave).
export async function markWrapsSeen(owner: string, wraps: { id: string; ts: number }[]): Promise<void> {
  if (!owner || !wraps.length) return
  await putAll(
    'wraps',
    wraps.filter((w) => w.id).map((w) => ({ key: `${owner}|${w.id}`, owner, id: w.id, ts: w.ts })),
  ).catch(() => {})
}

// Conjunto de event.ids de wrap já vistos por este owner → dedup cross-sessão (jitter-proof).
export async function seenWrapIds(owner: string): Promise<Set<string>> {
  if (!owner) return new Set()
  const all = await getAll<SeenWrap>('wraps').catch(() => [])
  const s = new Set<string>()
  for (const w of all) if (w.owner === owner) s.add(w.id)
  return s
}

// Maior created_at de wrap já visto (âncora do `since`). 0 se nunca viu nada.
export async function lastWrapTs(owner: string): Promise<number> {
  if (!owner) return 0
  const all = await getAll<SeenWrap>('wraps').catch(() => [])
  let max = 0
  for (const w of all) if (w.owner === owner && w.ts > max) max = w.ts
  return max
}
