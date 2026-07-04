// Identidade própria servida pelo NOSSO servidor (/api/me) — instantânea, sem relay.
// Cacheada em localStorage por npub p/ pintar nome/avatar/badge na hora já no load.
import { api } from './api'

export interface Me {
  npub: string
  pubkey: string
  name: string
  picture: string
  nip05: string
  lud16: string
  badge: { active: boolean; type: string; color: string }
}

const KEY = (npub: string) => `libermedia_me_${npub}`

export function cachedMe(npub: string | null): Me | null {
  if (!npub) return null
  try {
    const v = localStorage.getItem(KEY(npub))
    return v ? (JSON.parse(v) as Me) : null
  } catch {
    return null
  }
}

export async function fetchMe(npub: string | null): Promise<Me | null> {
  if (!npub) return null
  try {
    const m = await api.get<Me>('/api/me')
    if (m && m.npub) {
      try {
        localStorage.setItem(KEY(npub), JSON.stringify(m))
      } catch {
        /* quota */
      }
      return m
    }
  } catch {
    /* offline/erro — usa o cache */
  }
  return null
}
