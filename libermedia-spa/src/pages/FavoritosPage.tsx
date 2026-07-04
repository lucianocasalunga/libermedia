// Favoritos (/favoritos) — feed das notas marcadas como favorito (NIP-51,
// kind:10003). Lê o store reativo de bookmarks e renderiza pelo MOTOR ÚNICO
// (source: 'bookmarks'). Remover um favorito some o card na hora (filtro local).
import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useFeedSource } from '../hooks/useFeedSource'
import { useAuth } from '../providers/AuthProvider'
import { ensureBookmarks, useBookmarkIds } from '../services/bookmarks'
import { PostCard } from '../components/PostCard/PostCard'
import { TopBar } from '../components/TopBar/TopBar'
import { FavoritosIcon } from '../components/icons'

export function FavoritosPage() {
  const { pubkeyHex, npub } = useAuth()
  const bookmarkIds = useBookmarkIds()

  useEffect(() => {
    ensureBookmarks(pubkeyHex)
  }, [pubkeyHex])

  const spec = useMemo(
    () => (bookmarkIds.length ? ({ source: 'bookmarks', ids: bookmarkIds } as const) : ({ source: 'idle' } as const)),
    [bookmarkIds],
  )
  const favActive = useLocation().pathname === '/favoritos'
  const { events, profiles, stats, loading } = useFeedSource(spec, favActive)

  // Filtro local pelo set atual → remover favorito some o card sem esperar re-fetch.
  const idSet = useMemo(() => new Set(bookmarkIds), [bookmarkIds])
  const shown = useMemo(() => events.filter((e) => idSet.has(e.id)), [events, idSet])

  return (
    <div className="relative mx-auto min-h-svh w-full max-w-[600px]">
      <TopBar>
        <span className="flex items-center gap-2">
          <FavoritosIcon className="h-5 w-5 flex-shrink-0" />
          <h1 className="lm-topbar-title">Favoritos</h1>
        </span>
      </TopBar>

      <div className="px-2 pt-3">
        {!npub && (
          <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">
            Entre para ver seus favoritos.
          </p>
        )}

        {npub && bookmarkIds.length === 0 && (
          <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">
            Nenhum favorito ainda. Toque na estrela de um post para salvá-lo aqui.
          </p>
        )}

        {npub && bookmarkIds.length > 0 && (
          <>
            {loading && shown.length === 0 && (
              <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">Carregando favoritos…</p>
            )}
            {shown.map((ev) => (
              <PostCard key={ev.id} event={ev} profiles={profiles} stats={stats[ev.id]} />
            ))}
            {!loading && shown.length === 0 && (
              <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">
                Não foi possível carregar os favoritos neste relay.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
