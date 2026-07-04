// Cabeçalho de identidade da sidebar: avatar + nome (do kind:0 nos relays) +
// nossa badge (backend) + badges externas (NIP-58). Tudo carregado em background;
// enquanto não chega, a sidebar usa o cache local como fallback.
import { useEffect, useState } from 'react'
import { relayManager } from '../services/relay-manager'
import { readRelays } from '../services/relays'
import { getOurBadge, getExternalBadges, type BadgeView } from '../services/badges'

interface IdentityHeader {
  avatar?: string
  name?: string
  ourBadge: BadgeView | null
  externalBadges: BadgeView[]
}

export function useIdentityHeader(hex: string | null): IdentityHeader {
  const [data, setData] = useState<IdentityHeader>({ ourBadge: null, externalBadges: [] })

  useEffect(() => {
    if (!hex) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData({ ourBadge: null, externalBadges: [] })
      return
    }
    let alive = true

    // Perfil kind:0 (avatar + nome)
    relayManager
      .query([{ kinds: [0], authors: [hex], limit: 1 }], { relays: readRelays(), maxWait: 4000 })
      .then((evs) => {
        if (!alive) return
        const k0 = evs.sort((a, b) => b.created_at - a.created_at)[0]
        if (!k0) return
        try {
          const p = JSON.parse(k0.content)
          setData((d) => ({ ...d, avatar: p.picture || undefined, name: (p.display_name || p.name || '').trim() || undefined }))
        } catch {
          /* content malformado */
        }
      })
      .catch(() => {})

    // Nossa badge + externas
    void getOurBadge(hex).then((b) => alive && setData((d) => ({ ...d, ourBadge: b })))
    void getExternalBadges(hex).then((b) => alive && setData((d) => ({ ...d, externalBadges: b })))

    return () => {
      alive = false
    }
  }, [hex])

  return data
}
