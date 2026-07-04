// Carrega o CABEÇALHO do perfil (kind:0) + contagem de Seguindo (kind:3).
// Os POSTS do autor vêm do motor único (useFeedSource({source:'author'})), não daqui.
import { useEffect, useState } from 'react'
import { nip19 } from 'nostr-tools'
import { relayManager } from '../services/relay-manager'
import { readRelays } from '../services/relays'
import type { Profile, ProfileMap } from '../types/nostr'

function toHex(npub: string): string | null {
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

export function useProfile(npub: string) {
  const hex = toHex(npub)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [followingCount, setFollowingCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!hex) {
      setError('npub inválido')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    /* eslint-enable react-hooks/set-state-in-effect */
    let alive = true
    relayManager
      .query(
        [
          { kinds: [0], authors: [hex], limit: 1 },
          { kinds: [3], authors: [hex], limit: 1 },
        ],
        { relays: readRelays(), maxWait: 5000 },
      )
      .then((events) => {
        if (!alive) return
        const k0 = events
          .filter((e) => e.kind === 0)
          .sort((a, b) => b.created_at - a.created_at)[0]
        let prof: Profile | null = null
        if (k0) {
          try {
            prof = { pubkey: hex, ...JSON.parse(k0.content) }
          } catch {
            /* content malformado */
          }
        }
        const k3 = events.filter((e) => e.kind === 3).sort((a, b) => b.created_at - a.created_at)[0]
        setProfile(prof)
        setFollowingCount(k3 ? k3.tags.filter((t) => t[0] === 'p' && t[1]).length : null)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Falha ao carregar o perfil')
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [hex])

  const profiles: ProfileMap = hex && profile ? { [hex]: profile } : {}
  return { profile, profiles, hex, followingCount, loading, error }
}
