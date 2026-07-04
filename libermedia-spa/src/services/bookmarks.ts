// Favoritos — NIP-51, kind:10003 (lista de bookmarks). Notas favoritadas viram
// tags `e` no evento. Store reativo (useSyncExternalStore) → a estrela atualiza
// em todo lugar de uma vez.
//
// ⚠️ LIÇÃO (bug "favoritos sumindo", documentado): a lista é REPLACEABLE — cada
// relay guarda a sua versão. Buscamos de TODOS os relays e usamos a de `created_at`
// MAIS ALTO (relayManager.query já junta e ordena desc → events[0]). Nunca o
// "primeiro relay que responde". Ao publicar, preservamos as outras tags (a/r/t)
// e o content (lista privada NIP-04 fica intacta), mexendo só no `e` do post.
import { useSyncExternalStore } from 'react'
import { relayManager } from './relay-manager'
import { readRelays, writeRelays } from './relays'
import type { EventTemplate, VerifiedEvent } from 'nostr-tools'
import type { Signer } from './signer'

const KIND = 10003
const LS_KEY = 'libermedia_bookmarks' // { pubkey, created_at, tags, content }

// Estado em memória da lista carregada.
let owner: string | null = null
let ids = new Set<string>()
let latestCreatedAt = 0
let latestTags: string[][] = []
let latestContent = ''
let snapshot: string[] = [] // array estável p/ useSyncExternalStore (só muda no notify)
const fetching = new Set<string>() // pubkeys com fetch em andamento

const subscribers = new Set<() => void>()
function subscribe(cb: () => void) {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}
function notify() {
  snapshot = [...ids]
  subscribers.forEach((cb) => cb())
}

const nowSec = () => Math.floor(Date.now() / 1000)

interface StoredList {
  pubkey: string
  created_at: number
  tags: string[][]
  content: string
}

function readLocal(pubkey: string): StoredList | null {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null') as StoredList | null
    return raw && raw.pubkey === pubkey ? raw : null
  } catch {
    return null
  }
}
function writeLocal(list: StoredList) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list))
  } catch {
    /* quota — ignora */
  }
}

// Adota um evento kind:10003 (de relay, do localStorage ou recém-publicado) como a
// verdade ATUAL — desde que seja mais novo que o que já temos. ids vêm das tags `e`.
function adopt(list: StoredList) {
  if (list.created_at < latestCreatedAt) return
  latestCreatedAt = list.created_at
  latestTags = list.tags
  latestContent = list.content
  ids = new Set(list.tags.filter((t) => t[0] === 'e' && t[1]).map((t) => t[1]))
  owner = list.pubkey
  notify()
}

/** Busca a lista mais recente em TODOS os relays (read+write) e adota a de maior
 *  created_at. Funde com o localStorage (instantâneo + à prova de relay velho). */
export async function fetchBookmarks(pubkey: string): Promise<void> {
  const local = readLocal(pubkey)
  if (local) adopt(local) // mostra na hora o que tínhamos salvo

  const relays = [...new Set([...readRelays(), ...writeRelays()])]
  const evs = await relayManager.query([{ kinds: [KIND], authors: [pubkey], limit: 5 }], {
    relays,
    maxWait: 3500,
  })
  const best = evs.find((e) => e.kind === KIND) // já vem ordenado desc por created_at
  if (best && best.created_at >= latestCreatedAt) {
    const list: StoredList = {
      pubkey,
      created_at: best.created_at,
      tags: best.tags,
      content: best.content,
    }
    adopt(list)
    writeLocal(list)
  }
}

/** Garante que a lista do usuário foi carregada (idempotente, 1x por pubkey). */
export function ensureBookmarks(pubkey: string | null): void {
  if (!pubkey) return
  if (owner !== pubkey) {
    // troca de conta → zera e recarrega
    owner = pubkey
    ids = new Set()
    latestCreatedAt = 0
    latestTags = []
    latestContent = ''
    notify()
  }
  if (fetching.has(pubkey)) return
  fetching.add(pubkey)
  void fetchBookmarks(pubkey).finally(() => fetching.delete(pubkey))
}

/** Marca/desmarca um post como favorito. Otimista; reverte se a publicação falhar.
 *  Retorna o novo estado (true = favoritado). */
export async function toggleBookmark(
  signer: Signer,
  postId: string,
  pubkey: string,
): Promise<boolean> {
  const had = ids.has(postId)
  // Otimista
  if (had) ids.delete(postId)
  else ids.add(postId)
  notify()

  try {
    // Reconstrói preservando TODAS as outras tags (a/r/t e demais `e`) e o content.
    const base = latestTags.filter((t) => !(t[0] === 'e' && t[1] === postId))
    const tags = had ? base : [...base, ['e', postId]]
    const created_at = Math.max(latestCreatedAt + 1, nowSec())
    const tmpl: EventTemplate = { kind: KIND, created_at, tags, content: latestContent }
    const ev: VerifiedEvent = await signer.signEvent(tmpl)
    await relayManager.publish(ev, writeRelays())
    const list: StoredList = { pubkey, created_at: ev.created_at, tags: ev.tags, content: ev.content }
    adopt(list)
    writeLocal(list)
    return !had
  } catch (e) {
    // Reverte o otimista
    if (had) ids.add(postId)
    else ids.delete(postId)
    notify()
    throw e
  }
}

export function isBookmarked(id: string): boolean {
  return ids.has(id)
}

/** Hook reativo: estado favoritado de UM post (boolean estável → sem loop). */
export function useIsBookmarked(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => ids.has(id),
    () => false,
  )
}

/** Hook reativo: lista (array estável) de ids favoritados — para a FavoritosPage. */
export function useBookmarkIds(): string[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  )
}
