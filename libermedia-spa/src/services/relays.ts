// Relays — FONTE DA VERDADE da lista de relays do usuário (página /relays).
// Modelo Jumble (NIP-65): ESCRITA (write) forçada nos nossos + LEITURA (read)
// razoável. Persistida em localStorage + na rede (kind:10002, recuperável de
// qualquer device). Alimenta o relayManager (leitura) e a publicação (escrita).
import { LS } from '../constants'
import { relayManager } from './relay-manager'
import { getSigner, type Signer } from './signer'

export interface RelaySet {
  write: string[]
  read: string[]
}

// Escrita = nossos relays (mínimo sustentável, redundância na nossa infra).
export const DEFAULT_WRITE = [
  'wss://relay.libernet.app',
  'wss://nexus.libernet.app',
]

// pool.libernet.app (LibrePool) ELIMINADO 26/Jun — travava as queries (sem EOSE).
// Filtra de qualquer lista (inclusive a salva no localStorage do usuário) pra não voltar.
const POOL_HOST = 'pool.libernet.app'
const stripPool = (a: string[]): string[] => a.filter((u) => !u.includes(POOL_HOST))
// nexus.libernet.app é o serviço Nexus/Feed-Engine (WS→:8889), NÃO um relay Nostr: não
// responde REQ (0 evento, sem EOSE), igual ao pool. Serve só como ESCRITA (publish). Na
// LEITURA ele travava TODA query (Seguindo/autor/hashtag/scroll) esperando o timeout
// inteiro sem trazer nada → some da leitura. (01/Jul — queixa de usuário sobre "Seguindo".)
const NEXUS_HOST = 'nexus.libernet.app'
const stripNexusRead = (a: string[]): string[] => a.filter((u) => !u.includes(NEXUS_HOST))
// Leitura = relay.libernet (origem, serve REQ) + grandes públicos. SEM o nexus (só escrita).
export const DEFAULT_READ = [
  'wss://relay.libernet.app',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
]

export function loadRelaySet(): RelaySet {
  const s = loadRelaySetRaw()
  // read: tira o pool E o nexus (prefs antigas de usuários já salvaram o nexus na leitura).
  return { write: stripPool(s.write), read: stripNexusRead(stripPool(s.read)) }
}

function loadRelaySetRaw(): RelaySet {
  try {
    const raw = JSON.parse(localStorage.getItem(LS.relays) || 'null')
    if (raw && Array.isArray(raw.write) && Array.isArray(raw.read)) {
      return { write: raw.write, read: raw.read }
    }
    // Migração do formato antigo (string[]) → era usado como leitura+escrita.
    if (Array.isArray(raw) && raw.length && raw.every((x: unknown) => typeof x === 'string')) {
      return { write: raw, read: raw }
    }
  } catch {
    /* corrompido → default */
  }
  return { write: [...DEFAULT_WRITE], read: [...DEFAULT_READ] }
}

export function saveRelaySet(set: RelaySet): void {
  localStorage.setItem(LS.relays, JSON.stringify(set))
}

export function writeRelays(): string[] {
  return loadRelaySet().write
}
export function readRelays(): string[] {
  return loadRelaySet().read
}

// Lista combinada (compat — quem só precisa de "todos os relays").
export function loadRelays(): string[] {
  const s = loadRelaySet()
  return [...new Set([...s.read, ...s.write])]
}

export type RelayStatus = 'checking' | 'online' | 'offline'

// Checa conectividade abrindo um WebSocket. Resolve online se conectar a tempo.
export function checkRelay(url: string, timeoutMs = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    let ws: WebSocket
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      try {
        ws.close()
      } catch {
        /* noop */
      }
      resolve(ok)
    }
    try {
      ws = new WebSocket(url)
    } catch {
      resolve(false)
      return
    }
    const t = setTimeout(() => finish(false), timeoutMs)
    ws.onopen = () => {
      clearTimeout(t)
      finish(true)
    }
    ws.onerror = () => {
      clearTimeout(t)
      finish(false)
    }
  })
}

// ── NIP-65 (kind:10002) — publicar e importar a lista (com markers read/write) ──

export async function publishRelayList(signer: Signer, set: RelaySet): Promise<void> {
  const urls = [...new Set([...set.read, ...set.write])]
  const tags = urls.map((url) => {
    const r = set.read.includes(url)
    const w = set.write.includes(url)
    if (r && w) return ['r', url] // sem marker = leitura + escrita
    return ['r', url, w ? 'write' : 'read']
  })
  const ev = await signer.signEvent({
    kind: 10002,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: '',
  })
  await relayManager.publish(ev, set.write.length ? set.write : urls)
}

function parseNip65(tags: string[][]): RelaySet {
  const write: string[] = []
  const read: string[] = []
  for (const t of tags) {
    if (t[0] !== 'r' || typeof t[1] !== 'string') continue
    const marker = t[2]
    if (marker === 'read') read.push(t[1])
    else if (marker === 'write') write.push(t[1])
    else {
      read.push(t[1])
      write.push(t[1])
    }
  }
  return { write: [...new Set(write)], read: [...new Set(read)] }
}

// Busca a kind:10002 do usuário na rede. Retorna o RelaySet ou null.
export async function fetchUserRelaySet(hex: string): Promise<RelaySet | null> {
  const evs = await relayManager.query([{ kinds: [10002], authors: [hex], limit: 1 }], {
    relays: loadRelays(),
    maxWait: 6000,
  })
  const latest = evs.sort((a, b) => b.created_at - a.created_at)[0]
  if (!latest) return null
  const set = parseNip65(latest.tags)
  return set.read.length || set.write.length ? set : null
}

// No login: usuário externo com kind:10002 → fonte da verdade dele (não forçamos
// a nossa). Usuário novo segue com a nossa default. Roda uma vez por npub.
export async function importUserRelaysOnce(hex: string | null): Promise<void> {
  if (!hex) return
  const flag = `libermedia_relays_imported_${hex}`
  if (localStorage.getItem(flag)) return
  try {
    const theirs = await fetchUserRelaySet(hex)
    if (theirs) {
      saveRelaySet(theirs)
      relayManager.setRelays(theirs.read)
    }
  } catch {
    return
  }
  localStorage.setItem(flag, '1')
}

// Heartbeat do CLIENTE: republica a kind:10002 a cada 12h ao abrir o app. Só
// auto-publica SILENCIOSAMENTE (nsec local) — NIP-07/bunker abriria popup.
const PUB_TTL = 12 * 60 * 60 * 1000

export async function heartbeatPublish(npub: string | null, hex: string | null): Promise<void> {
  if (!npub || !hex) return
  const hasLocalKey =
    !!localStorage.getItem(`libermedia_nsec_${npub}`) ||
    !!sessionStorage.getItem(`libermedia_nsec_${npub}`)
  if (!hasLocalKey) return
  const key = `libermedia_relays_pub_${hex}`
  const last = Number(localStorage.getItem(key) || 0)
  if (last && Date.now() - last < PUB_TTL) return
  const signer = await getSigner(npub)
  if (!signer) return
  try {
    await publishRelayList(signer, loadRelaySet())
    localStorage.setItem(key, String(Date.now()))
  } catch {
    /* tenta no próximo load */
  }
}
