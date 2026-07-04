// Menção @npub no texto — resolve o nome via cache de perfil INSTANTÂNEO (mostra
// o fallback na hora, troca pelo nome real quando chega). Sem badge inline (no
// meio do texto poluiria; a badge fica nos nomes "principais" via <UserName>).
import { Link } from 'react-router-dom'
import { useProfileCache } from '../../services/profiles'

export function Mention({
  hex,
  npub,
  fallbackName,
}: {
  hex: string
  npub: string
  fallbackName?: string
}) {
  const profile = useProfileCache(hex || null)
  const name =
    profile?.display_name?.trim() || profile?.name?.trim() || fallbackName?.trim() || `${npub.slice(0, 10)}…`
  return (
    <Link to={`/perfil/${npub}`} className="text-[var(--lm-mention)] hover:underline">
      @{name}
    </Link>
  )
}
