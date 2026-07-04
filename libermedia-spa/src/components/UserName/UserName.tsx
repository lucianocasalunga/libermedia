// Nome do usuário + BADGE ao lado (regra fundamental: onde tem o nome, tem a
// badge). Resolve a npub via cache de perfil INSTANTÂNEO (localStorage+servidor):
// mostra o fallback na hora e troca pelo nome real quando chega. Reutilizável em
// todo lugar (header do post, mini-feed, menções, notificações…).
import { nip19 } from 'nostr-tools'
import { useProfileCache } from '../../services/profiles'
import { useOurBadges, cachedBadge } from '../../services/badges'
import './user-name.css'

function shortNpub(hex: string): string {
  try {
    return nip19.npubEncode(hex).slice(0, 10) + '…'
  } catch {
    return hex.slice(0, 8) + '…'
  }
}

export function UserName({
  hex,
  fallback,
  className,
  badge = true,
}: {
  hex: string
  fallback?: string
  className?: string
  badge?: boolean
}) {
  const profile = useProfileCache(hex)
  useOurBadges() // re-renderiza quando o mapa de badges chega
  const name =
    profile?.display_name?.trim() || profile?.name?.trim() || fallback?.trim() || shortNpub(hex)
  const b = badge ? cachedBadge(hex) : null
  return (
    <span className={`lm-username ${className || ''}`}>
      <span className="lm-username-text">{name}</span>
      {b && <img src={b.image} alt="" title={b.name} className="lm-username-badge" loading="lazy" />}
    </span>
  )
}
