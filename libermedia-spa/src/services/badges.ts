// Badges — NIP-58. A NOSSA badge vem do backend (fonte da verdade do sistema):
//   GET /api/badges/all → { pubkey_hex: { color, name, image } }
// Badges EXTERNAS vêm dos relays: kind:30008 (profile badges que o usuário aceitou)
// → resolve cada kind:30009 (definição, com thumb/image), excluindo a nossa emissora.
import { useSyncExternalStore } from 'react'
import { relayManager } from './relay-manager'
import { readRelays } from './relays'

// Emissora das badges LiberMedia = CHAVE PADRÃO DO SISTEMA (libermedia@libernet.app,
// LIBERMEDIA_USER).
export const OUR_ISSUER_HEX = 'd8e3b15b73adab03d7007c9f0afccb01b2566e69ee30816510efbd67945d9713'

export interface BadgeView {
  name: string
  image: string
}

// ── Nossa badge (cache em memória, TTL 5min, igual badge-lookup.js do MPA) ──
type OurMap = Record<string, { color: string; name: string; image: string }>
let ourCache: OurMap | null = null
let ourTs = 0
let ourLoading: Promise<void> | null = null
const badgeSubs = new Set<() => void>()

// Garante o mapa de badges carregado (1x, TTL 5min). Notifica ao chegar.
export function ensureOurBadges(): void {
  if (ourCache && Date.now() - ourTs < 5 * 60 * 1000) return
  if (ourLoading) return
  ourLoading = fetch('/api/badges/all', { credentials: 'include', cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((map: OurMap | null) => {
      if (map) {
        ourCache = map
        ourTs = Date.now()
        badgeSubs.forEach((cb) => cb())
      }
    })
    .catch(() => {})
    .finally(() => {
      ourLoading = null
    })
}

// Lookup SÍNCRONO da nossa badge (do cache já carregado).
export function cachedBadge(hex: string | null): BadgeView | null {
  if (!hex || !ourCache) return null
  const b = ourCache[hex]
  return b?.image ? { name: b.name || 'Badge LiberMedia', image: b.image } : null
}

// Hook: garante o load e re-renderiza quando as badges chegam (ts muda).
export function useOurBadges(): number {
  return useSyncExternalStore(
    (cb) => {
      badgeSubs.add(cb)
      ensureOurBadges()
      return () => {
        badgeSubs.delete(cb)
      }
    },
    () => ourTs,
    () => 0,
  )
}

export async function getOurBadge(hex: string | null): Promise<BadgeView | null> {
  if (!hex) return null
  if (!ourCache || Date.now() - ourTs > 5 * 60 * 1000) {
    try {
      const res = await fetch('/api/badges/all', { credentials: 'include', cache: 'no-store' })
      if (res.ok) {
        ourCache = (await res.json()) as OurMap
        ourTs = Date.now()
      }
    } catch {
      /* mantém o cache anterior se houver */
    }
  }
  const b = ourCache?.[hex]
  return b?.image ? { name: b.name || 'Badge LiberMedia', image: b.image } : null
}

// ── Badges externas (NIP-58) ──
export async function getExternalBadges(hex: string | null): Promise<BadgeView[]> {
  if (!hex) return []
  // 1) profile badges (kind:30008, d=profile_badges) — o que o usuário aceitou exibir
  const pb = await relayManager.query(
    [{ kinds: [30008], authors: [hex], '#d': ['profile_badges'], limit: 1 }],
    { relays: readRelays(), maxWait: 4000 },
  )
  const latest = pb.sort((a, b) => b.created_at - a.created_at)[0]
  if (!latest) return []

  // Coordenadas "a" = "30009:issuer:dtag"; exclui a nossa emissora (já mostrada).
  const coords = latest.tags
    .filter((t) => t[0] === 'a' && typeof t[1] === 'string')
    .map((t) => t[1])
    .filter((c) => {
      const [k, iss, ...rest] = c.split(':')
      const d = rest.join(':')
      // Exclui as NOSSAS badges (já mostradas ao lado do nome): pela emissora do
      // sistema OU pelo d-tag 'libermedia-*' — cobre o emissor antigo (legado) e
      // qualquer cache de bundle, evitando a badge duplicada.
      return k === '30009' && iss && iss !== OUR_ISSUER_HEX && !d.startsWith('libermedia-')
    })
  if (!coords.length) return []

  // 2) resolve as definições kind:30009 (uma filter por coord)
  const defs = await relayManager.query(
    coords.map((c) => {
      const [, iss, d] = c.split(':')
      return { kinds: [30009], authors: [iss], '#d': [d], limit: 1 }
    }),
    { relays: readRelays(), maxWait: 4000 },
  )

  const out: BadgeView[] = []
  for (const c of coords) {
    const [, iss, d] = c.split(':')
    const def = defs.find((e) => e.pubkey === iss && e.tags.some((t) => t[0] === 'd' && t[1] === d))
    if (!def) continue
    const image =
      def.tags.find((t) => t[0] === 'thumb')?.[1] || def.tags.find((t) => t[0] === 'image')?.[1]
    const name = def.tags.find((t) => t[0] === 'name')?.[1] || 'Badge'
    if (image) out.push({ name, image })
  }
  return out
}
