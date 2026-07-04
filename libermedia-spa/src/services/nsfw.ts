// Conteúdo sensível (+18). Carrega as pubkeys e events marcados como NSFW
// (/api/nsfw-pubkeys, /api/nsfw-events) uma vez e expõe um checker.
// Toggle do usuário em Config: libermedia_nsfw_enabled (=1 → mostrar tudo).
import { api } from './api'
import type { FeedEvent } from '../types/nostr'

interface NsfwCache {
  pubkeys: Set<string>
  events: Set<string>
}
let cache: NsfwCache | null = null
let loading: Promise<void> | null = null

export function loadNsfw(): Promise<void> {
  if (cache) return Promise.resolve()
  if (!loading) {
    loading = Promise.allSettled([
      api.get<{ pubkeys?: string[] }>('/api/nsfw-pubkeys'),
      api.get<{ events?: string[] }>('/api/nsfw-events'),
    ]).then((res) => {
      const pubkeys = res[0].status === 'fulfilled' ? res[0].value.pubkeys ?? [] : []
      const events = res[1].status === 'fulfilled' ? res[1].value.events ?? [] : []
      cache = { pubkeys: new Set(pubkeys), events: new Set(events) }
    })
  }
  return loading
}

// NSFW "habilitado" = conteúdo +18 VISÍVEL (filtro desligado). Compat. backend/MPA:
// a chave 'libermedia_nsfw_enabled'='1' significa mostrar. Ausente = não mostrar.
export function nsfwEnabled(): boolean {
  return localStorage.getItem('libermedia_nsfw_enabled') === '1'
}

// Filtro de conteúdo adulto. ATIVO (padrão, toggle à direita) = bloqueia tudo +18.
// É o inverso de nsfwEnabled(): ativo quando a chave NÃO é '1' (inclui ausente →
// padrão de fábrica = filtro ligado, nada NSFW chega ao usuário).
export function nsfwFilterActive(): boolean {
  return localStorage.getItem('libermedia_nsfw_enabled') !== '1'
}

// Hashtags que marcam NSFW (portado de mini-feed.js + post-renderer.js do MPA).
const NSFW_TAGS = new Set([
  'nsfw', 'porn', 'porno', 'pornografia', 'xxx', 'nude', 'nudes', 'putaria', 'sexo',
  'pelada', 'pelado', 'hentai', 'loli', 'lolita', 'shota', 'shotacon', 'cp', 'underage',
  'menor', 'pornstar', '18plus', 'onlyfans', 'fansly', 'camgirl', 'camboy', 'nudez',
  'adulto', 'bdsm', 'fetiche', 'puta',
  // violência
  'gore', 'snuff', 'violencia', 'tortura', 'sangue', 'mapa', 'nomap',
])
const VIOLENCE_TAGS = new Set([
  'gore', 'snuff', 'violencia', 'tortura', 'sangue', 'morte', 'guerra',
])
// Palavras explícitas no texto livre (sem precisar de #).
const NSFW_TEXT_RE =
  /\b(buceta|xoxota|gozada|pornografia|putaria|masturba[çc][ãa]o|camgirl|camboy|onlyfans|fansly|pussy|blowjob|cumshot|creampie|pornstar|pedofilia|zoofilia)\b|(?<![a-zA-ZÀ-ú])(xxx|bdsm|hentai|lolita|shotacon)(?![a-zA-ZÀ-ú])/i

function eventHashtags(ev: FeedEvent): string[] {
  return (ev.tags || []).filter((t) => t[0] === 't').map((t) => (t[1] || '').toLowerCase())
}

// NSFW de um reel. Os reels vêm da reels-api do nexus — que NÃO conhece a
// lista nsfw_pubkeys da casa. Então checamos os DOIS: a flag do nexus + as listas do
// servidor (pubkey do autor / id do evento) que o resto do app já carrega via loadNsfw().
export function isNsfwReel(item: { author_pubkey: string; event_id: string; nsfw?: boolean }): boolean {
  if (item.nsfw) return true
  if (cache?.pubkeys.has(item.author_pubkey)) return true
  if (cache?.events.has(item.event_id)) return true
  return false
}

export function isNsfwEvent(ev: FeedEvent): boolean {
  // NIP-36 content-warning tag (marcado pelo próprio autor) — sempre vale.
  if (ev.tags?.some((t) => t[0] === 'content-warning')) return true
  // Hashtags marcadas como NSFW.
  if (eventHashtags(ev).some((h) => NSFW_TAGS.has(h))) return true
  // Listas do servidor (nsfw_pubkeys / nsfw-events).
  if (cache?.pubkeys.has(ev.pubkey)) return true
  if (cache?.events.has(ev.id)) return true
  // Palavras explícitas no texto livre.
  if (NSFW_TEXT_RE.test(ev.content || '')) return true
  return false
}

// Categoria da canvas (spoiler.js): violence vs adult (paid = Top Secret, à parte).
export function nsfwCategory(ev: FeedEvent): 'adult' | 'violence' | 'paid' {
  if (eventHashtags(ev).some((h) => VIOLENCE_TAGS.has(h))) return 'violence'
  const cw = ev.tags?.find((t) => t[0] === 'content-warning')?.[1]?.toLowerCase() || ''
  if (/viol|gore|sangue|tortura/.test(cw)) return 'violence'
  return 'adult'
}
