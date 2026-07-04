// Emoji custom NIP-30 do usuário LOGADO — a fonte do que EU posso INSERIR e mandar.
// (O render de emoji custom de TERCEIROS já é feito no content-parser, a partir das tags
//  do próprio evento — isto aqui é só a MINHA paleta.)
// Fonte: kind:10030 (lista pessoal de emoji do usuário) → emoji inline `["emoji",code,url]`
// + referências a packs via `["a","30030:<pubkey>:<d>"]` → resolve cada kind:30030 (pack).
// Alimenta o EmojiPicker (propriedade customEmoji) e o publish (tags NIP-30).
import { useSyncExternalStore } from 'react'
import { relayManager } from './relay-manager'
import { readRelays } from './relays'
import type { Event as NostrEvent } from 'nostr-tools'

// Formato que o emoji-picker-element espera na propriedade `customEmoji`.
export interface PickerCustomEmoji {
  name: string
  shortcodes: string[]
  url: string
  category: string
}

// Packs FEATURED (default LiberNet) — carregados p/ todo usuário
// logado, além dos packs próprios dele. Coordenadas kind:30030 (pubkey + d), verificadas
// ao vivo (CDN 200). Ressalva: dependem do CDN do criador; img morta = alt text (degrada).
const FEATURED_PACKS: { pubkey: string; d: string }[] = [
  { pubkey: '955433096fca223f29adfd52a0c2de07a3c52eb680f9b4d9eb6c46d9196c540e', d: 'cats-emojis' }, // Blob Cats (animado)
  { pubkey: '4f2199ca4f700fd5c15f8dfaa3088bce74599e762a127f2769b9da1544caf170', d: 'Blob Cats Emojis' }, // Blob Cats (estático)
  { pubkey: '4dbfcb7c5ddb8249f9c7eb8c21e019f08fbfb7ec5ded5408b614590beb8d1695', d: 'Telegram Animated Emojis' }, // Telegram animados
]

let list: PickerCustomEmoji[] = []
let map: Record<string, string> = {} // shortcode → url
let loadedFor = ''
let version = 0 // bump a cada notify() → dispara re-render das superfícies que assinam
const subs = new Set<() => void>()
const notify = () => {
  version++
  subs.forEach((c) => c())
}

export function subscribeCustomEmoji(cb: () => void): () => void {
  subs.add(cb)
  return () => {
    subs.delete(cb)
  }
}
export function customEmojiForPicker(): PickerCustomEmoji[] {
  return list
}
export function customEmojiMap(): Record<string, string> {
  return map
}

// Hook de REATIVIDADE: retorna a versão atual do mapa e re-renderiza quando ele carrega
// (async, pós-login). Usado no PostCard/DM/etc. como dep dos useMemo de render — sem isto,
// o :shortcode: pintado antes do mapa chegar ficaria texto pra sempre (não repinta).
export function useCustomEmojiVersion(): number {
  return useSyncExternalStore(
    subscribeCustomEmoji,
    () => version,
    () => version,
  )
}

// Tags NIP-30 `["emoji",code,url]` p/ os :shortcode: custom presentes no texto — anexadas
// ao publicar (só os efetivamente usados; dedup). Assim outros clientes renderizam a imagem.
const SHORTCODE_RE = /:([a-z0-9_+-]+):/gi
export function customEmojiTagsFor(content: string): string[][] {
  if (!content || content.indexOf(':') === -1) return []
  const tags: string[][] = []
  const seen = new Set<string>()
  const re = new RegExp(SHORTCODE_RE.source, 'gi')
  let mm: RegExpExecArray | null
  while ((mm = re.exec(content)) !== null) {
    const code = mm[1]
    const url = map[code]
    if (url && !seen.has(code)) {
      seen.add(code)
      tags.push(['emoji', code, url])
    }
  }
  return tags
}

function collect(ev: NostrEvent, packName: string, into: PickerCustomEmoji[], m: Record<string, string>) {
  for (const t of ev.tags) {
    if (t[0] === 'emoji' && t[1] && t[2] && /^https?:\/\//i.test(t[2]) && !m[t[1]]) {
      m[t[1]] = t[2]
      into.push({ name: t[1], shortcodes: [t[1]], url: t[2], category: packName })
    }
  }
}

// Carrega a paleta custom (packs FEATURED + os do próprio usuário). Background, best-effort,
// idempotente por pubkey. Emoji custom de terceiros no feed já renderiza sem isto (F2a).
export async function initCustomEmoji(myHex: string | null): Promise<void> {
  if (!myHex || myHex === loadedFor) return
  loadedFor = myHex
  try {
    const relays = readRelays()
    // Lista pessoal do usuário (kind:10030): emoji inline + a-tags p/ packs.
    const [meList] = (await relayManager.query([{ kinds: [10030], authors: [myHex], limit: 1 }], {
      relays,
      maxWait: 4000,
    })) as NostrEvent[]

    const newList: PickerCustomEmoji[] = []
    const newMap: Record<string, string> = {}
    if (meList) collect(meList, 'Meus', newList, newMap) // emoji inline do usuário primeiro

    // Coordenadas a buscar = FEATURED + packs referenciados na lista do usuário (dedup).
    const coords = new Map<string, { pubkey: string; d: string }>()
    for (const p of FEATURED_PACKS) coords.set(`${p.pubkey}:${p.d}`, p)
    for (const t of meList?.tags ?? []) {
      if (t[0] === 'a' && typeof t[1] === 'string' && t[1].startsWith('30030:')) {
        const [, pk, d] = t[1].split(':')
        if (pk && d) coords.set(`${pk}:${d}`, { pubkey: pk, d })
      }
    }
    const packFilters = [...coords.values()].map((c) => ({
      kinds: [30030],
      authors: [c.pubkey],
      '#d': [c.d],
      limit: 1,
    }))
    if (packFilters.length) {
      // relays amplos: os packs vivem em relays públicos grandes, não só nos nossos.
      const wide = [...new Set([...relays, 'wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'])]
      const packs = (await relayManager.query(packFilters, { relays: wide, maxWait: 5000 })) as NostrEvent[]
      for (const p of packs) {
        const title =
          p.tags.find((t) => t[0] === 'title')?.[1] || p.tags.find((t) => t[0] === 'd')?.[1] || 'Pack'
        collect(p, title, newList, newMap)
      }
    }
    list = newList
    map = newMap
    notify()
  } catch {
    /* best-effort: sem custom emoji o picker segue com os nativos */
  }
}
