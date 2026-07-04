// Perfil do usuário (/perfil/:npub) — header (banner/avatar/nome/nip05/bio) +
// posts do autor. Renderiza na área principal do shell.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile'
import { useFeedSource } from '../hooks/useFeedSource'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { useFollow } from '../hooks/useFollow'
import { useFollowers } from '../hooks/useFollowers'
import { usePinnedPosts } from '../hooks/usePinnedPosts'
import { usePostCount } from '../hooks/usePostCount'
import { getPurchased, purchasedFileUrl, type PurchasedItem } from '../services/topsecret'
import { parseContent } from '../lib/content-parser'
import { genericBanner } from '../lib/generic-assets'
import { cssBackgroundImage } from '../lib/safe-url'
import { TopBar } from '../components/TopBar/TopBar'
import { PerfilIcon } from '../components/icons'
import { Avatar } from '../components/Avatar/Avatar'
import { ZapModal } from '../components/ZapModal/ZapModal'
import { UserName } from '../components/UserName/UserName'
import { PostCard } from '../components/PostCard/PostCard'
import { MediaViewer, type ViewerItem } from '../components/MediaViewer/MediaViewer'
import type { FeedEvent } from '../types/nostr'

type Tab = 'posts' | 'midia' | 'comprados'

// Favoritos de PERFIL — local por ora (set de pubkeys). Futuro: lista NIP-51 de pessoas.
const FAV_KEY = 'libermedia_fav_perfis'
function getFavPerfis(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')) } catch { return new Set() }
}
function toggleFavPerfil(hex: string): boolean {
  const s = getFavPerfis()
  if (s.has(hex)) s.delete(hex); else s.add(hex)
  localStorage.setItem(FAV_KEY, JSON.stringify([...s]))
  return s.has(hex)
}

export function PerfilPage({ npub }: { npub: string }) {
  const navigate = useNavigate()
  const { profile, profiles: headerProfiles, hex, followingCount, error } = useProfile(npub)
  // Posts do autor agora vêm do MOTOR ÚNICO (com scroll infinito — capacidade nova).
  const {
    events: posts,
    profiles: feedProfiles,
    stats,
    loading: postsLoading,
    loadingMore,
    exhausted,
    loadMore,
  } = useFeedSource({ source: 'author', pubkey: hex ?? '' })
  const profiles = { ...headerProfiles, ...feedProfiles }
  const sentinel = useInfiniteScroll(loadMore)
  const postCount = usePostCount(hex)
  const { following, busy, isOwn, toggle } = useFollow(hex)
  const followersCount = useFollowers(hex)
  const pinned = usePinnedPosts(hex)
  const pinnedIds = useMemo(() => new Set(pinned.map((p) => p.id)), [pinned])
  const [npubCopied, setNpubCopied] = useState(false)
  const [hoverFollow, setHoverFollow] = useState(false)
  const [showZap, setShowZap] = useState(false)
  const [fav, setFav] = useState(false)
  useEffect(() => { setFav(hex ? getFavPerfis().has(hex) : false) }, [hex])
  function copyNpub() {
    void navigator.clipboard.writeText(npub).then(() => {
      setNpubCopied(true)
      setTimeout(() => setNpubCopied(false), 1500)
    })
  }
  const [tab, setTab] = useState<Tab>('posts')

  // Aba "Comprados" (Top Secret) — só no próprio perfil. Carrega sob demanda.
  const [purchased, setPurchased] = useState<PurchasedItem[] | null>(null)
  const [loadingPurchased, setLoadingPurchased] = useState(false)
  useEffect(() => {
    if (tab !== 'comprados' || !isOwn || purchased !== null) return
    let alive = true
    // setState após o gate acima; o reload só dispara ao trocar de aba (não cascateia).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingPurchased(true)
    getPurchased()
      .then((items) => alive && setPurchased(items))
      .catch(() => alive && setPurchased([]))
      .finally(() => alive && setLoadingPurchased(false))
    return () => {
      alive = false
    }
  }, [tab, isOwn, purchased])

  // Mídia: todas as imagens/vídeos extraídos dos posts do autor.
  const media = useMemo(
    () => posts.flatMap((p) => parseContent(p.content || '').media).filter((m) => m.type !== 'embed'),
    [posts],
  )
  // Mídia em tela cheia no lightbox interno (X de fechar + Esc + swipe entre as mídias),
  // em vez de abrir nova aba do navegador.
  const [mediaViewer, setMediaViewer] = useState<number | null>(null)
  const mediaItems = useMemo<ViewerItem[]>(
    () => media.map((m, i) => ({
      id: i,
      name: m.url.split('/').pop()?.split('?')[0] || 'mídia',
      mime_type: m.type === 'video' ? 'video/*' : 'image/*',
      url: m.url,
    })),
    [media],
  )

  const name =
    profile?.display_name?.trim() ||
    profile?.name?.trim() ||
    `${npub.slice(0, 12)}…`

  return (
    <div className="mx-auto min-h-svh w-full max-w-[600px] border-x border-[var(--lm-border)]">
      <TopBar>
        <span className="flex items-center gap-2">
          <PerfilIcon className="h-5 w-5 flex-shrink-0" />
          <h1 className="lm-topbar-title">Perfil</h1>
        </span>
      </TopBar>

      {showZap && (
        <ZapModal
          event={{
            id: '', pubkey: hex || '', kind: 0, created_at: 0, tags: [], content: '',
            // lud16 do kind:0; se faltar, usa o nip05 como endereço Lightning (na LiberNet
            // o handle é NIP-05 E Lightning Address) — assim zap funciona p/ usuários migrados.
            profile: profile
              ? { ...profile, lud16: profile.lud16 || profile.lud06 || (profile.nip05?.includes('@') ? profile.nip05.replace(/^_@/, '') : undefined) }
              : undefined,
          } as unknown as FeedEvent}
          profiles={profiles}
          onClose={() => setShowZap(false)}
        />
      )}

      {/* Banner — genérico determinístico quando o usuário não tem (nunca o logo) */}
      <div
        className="aspect-[3/1] w-full bg-[var(--lm-bg-input)] bg-cover bg-center"
        style={{ backgroundImage: cssBackgroundImage(profile?.banner) ?? cssBackgroundImage(genericBanner(hex || npub)) }}
      />

      {/* Cabeçalho do perfil */}
      <div className="px-4">
        <div className="-mt-10 flex items-end justify-between">
          <div className="rounded-full border-4 border-[var(--lm-bg-main)]">
            <Avatar src={profile?.picture} name={name} seed={hex || npub} size={80} />
          </div>
          {isOwn ? (
            <button
              type="button"
              onClick={() => navigate('/editar-perfil')}
              className="mb-2 translate-y-2 rounded-full border border-[var(--lm-border-str)] px-4 py-1.5 text-sm font-bold text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)]"
            >
              Editar perfil
            </button>
          ) : (
            <div className="mb-2 translate-y-2 flex items-center gap-2">
              {/* mensagem */}
              <button type="button" aria-label="Mensagem" onClick={() => navigate('/mensagens', { state: { peer: npub } })}
                className="grid h-9 w-9 place-items-center rounded-full border border-[var(--lm-border-str)] text-[var(--lm-text-pri)] transition-all duration-200 hover:-translate-y-0.5 hover:scale-110 hover:bg-[var(--lm-bg-card)] hover:border-[var(--lm-accent)] hover:text-[var(--lm-accent)] hover:shadow-[0_2px_10px_color-mix(in_srgb,var(--lm-accent)_30%,transparent)] active:scale-95">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.4 8.4 0 0 1-3.8-.9L3 21l2.1-5.6A8.4 8.4 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z" /></svg>
              </button>
              {/* favoritar (estrela, igual aos favoritos) */}
              <button type="button" aria-label="Favoritar" onClick={() => { if (hex) setFav(toggleFavPerfil(hex)) }}
                className={`grid h-9 w-9 place-items-center rounded-full border border-[var(--lm-border-str)] transition-all duration-200 hover:-translate-y-0.5 hover:scale-110 hover:bg-[var(--lm-bg-card)] hover:border-[var(--lm-accent)] hover:text-[var(--lm-accent)] hover:shadow-[0_2px_10px_color-mix(in_srgb,var(--lm-accent)_30%,transparent)] active:scale-95 ${fav ? 'text-[var(--lm-accent)]' : 'text-[var(--lm-text-pri)]'}`}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill={fav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.5l2.95 5.98 6.6.96-4.77 4.65 1.13 6.57L12 17.55 6.09 20.66l1.13-6.57L2.45 9.44l6.6-.96z" /></svg>
              </button>
              {/* zap */}
              <button type="button" aria-label="Zap" onClick={() => setShowZap(true)}
                className="grid h-9 w-9 place-items-center rounded-full border border-[var(--lm-border-str)] text-[var(--lm-accent)] transition-all duration-200 hover:-translate-y-0.5 hover:scale-110 hover:bg-[var(--lm-bg-card)] hover:border-[var(--lm-accent)] hover:text-[var(--lm-accent)] hover:shadow-[0_2px_10px_color-mix(in_srgb,var(--lm-accent)_30%,transparent)] active:scale-95">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" /></svg>
              </button>
              {/* seguir / seguindo (hover: abandonar) */}
              {following ? (
                <button type="button" disabled={busy}
                  onMouseEnter={() => setHoverFollow(true)} onMouseLeave={() => setHoverFollow(false)}
                  onClick={() => void toggle()}
                  className={`rounded-full border px-4 py-1.5 text-sm font-bold disabled:opacity-50 ${hoverFollow ? 'border-red-500 bg-red-500/10 text-red-500' : 'border-[var(--lm-border-str)] text-[var(--lm-text-pri)]'}`}
                >
                  {hoverFollow ? 'Abandonar' : 'Seguindo'}
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => void toggle()}
                  className="rounded-full bg-[var(--lm-accent)] px-4 py-1.5 text-sm font-bold text-[var(--lm-accent-txt)] disabled:opacity-50"
                >
                  Seguir
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-2">
          <h2 className="text-xl font-extrabold text-[var(--lm-text-pri)]">
            <UserName hex={hex || ''} fallback={name} />
          </h2>
          {profile?.nip05 && (
            <p className="text-sm text-[var(--lm-text-muted)]">{profile.nip05.replace(/^_@/, '')}</p>
          )}
          {profile?.about && (
            <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-[var(--lm-text-pri)]">
              {parseContent(profile.about).body}
            </p>
          )}
          {(() => {
            // Links nomeados (kind:0 `links[]`); fallback p/ perfis antigos que só têm `website`.
            const list = profile?.links?.length
              ? profile.links
              : profile?.website
                ? [{ title: '', url: profile.website }]
                : []
            const valid = list.filter((l) => l.url?.trim())
            if (!valid.length) return null
            const label = (l: { title: string; url: string }) => {
              if (l.title?.trim()) return l.title.trim()
              try { return new URL(l.url.startsWith('http') ? l.url : `https://${l.url}`).hostname.replace(/^www\./, '') } catch { return l.url.replace(/^https?:\/\//, '') }
            }
            return (
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {valid.map((l, i) => (
                  <a
                    key={i}
                    href={l.url.startsWith('http') ? l.url : `https://${l.url}`}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 text-sm text-[var(--lm-link-ext)] hover:underline"
                  >
                    <span aria-hidden>🔗</span>{label(l)}
                  </a>
                ))}
              </div>
            )
          })()}
          <div className="mt-1 flex items-center gap-1.5">
            <span className="font-mono text-xs text-[var(--lm-text-muted)]">
              {`${npub.slice(0, 12)}…${npub.slice(-6)}`}
            </span>
            <button
              type="button"
              onClick={copyNpub}
              title="Copiar npub"
              aria-label="Copiar npub"
              className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs transition-colors ${
                npubCopied ? 'text-green-500' : 'text-[var(--lm-text-muted)] hover:text-[var(--lm-text-pri)]'
              }`}
            >
              {npubCopied ? (
                <>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.6}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Copiado!
                </>
              ) : (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15V5a2 2 0 012-2h10" />
                </svg>
              )}
            </button>
          </div>

          {/* Contadores */}
          <div className="mt-3 flex gap-4 text-sm">
            <span>
              <b className="text-[var(--lm-text-pri)]">{followingCount ?? '—'}</b>{' '}
              <span className="text-[var(--lm-text-muted)]">Seguindo</span>
            </span>
            <span>
              <b className="text-[var(--lm-text-pri)]">{followersCount ?? '—'}</b>{' '}
              <span className="text-[var(--lm-text-muted)]">Seguidores</span>
            </span>
            <span>
              <b className="text-[var(--lm-text-pri)]">{postCount ?? posts.length}</b>{' '}
              <span className="text-[var(--lm-text-muted)]">Posts</span>
            </span>
          </div>
        </div>
      </div>

      {/* Abas */}
      <div className="mt-3 flex border-t border-[var(--lm-border)]">
        {((isOwn ? ['posts', 'midia', 'comprados'] : ['posts', 'midia']) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-bold transition ${
              tab === t
                ? 'border-b-2 border-[var(--lm-accent)] text-[var(--lm-text-pri)]'
                : 'text-[var(--lm-text-muted)] hover:bg-[var(--lm-bg-card)]'
            }`}
          >
            {t === 'posts' ? 'Posts' : t === 'midia' ? 'Mídia' : 'Comprados'}
          </button>
        ))}
      </div>

      {error && (
        <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">{error}</p>
      )}

      {/* Conteúdo da aba — DESACOPLADO do loading do cabeçalho (useProfile). Os posts
          têm seu próprio postsLoading; prendê-los atrás do fetch de kind:0/kind:3 do
          cabeçalho deixava as abas em branco se aquele fetch travasse no aparelho. */}
      {tab === 'posts' && (
        <>
          {postsLoading && posts.length === 0 && (
            <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">Carregando posts…</p>
          )}
          {!postsLoading && posts.length === 0 && pinned.length === 0 && !error && (
            <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">Nenhum post.</p>
          )}
          {pinned.map((p) => (
            <div key={'pin-' + p.id}>
              <div className="flex items-center gap-1.5 px-4 pt-3 text-xs font-medium text-[var(--lm-text-muted)]">
                <span aria-hidden>📌</span> Fixado
              </div>
              <PostCard event={p} profiles={profiles} stats={stats[p.id]} />
            </div>
          ))}
          {posts
            .filter((p) => !pinnedIds.has(p.id))
            .map((p) => (
              <PostCard key={p.id} event={p} profiles={profiles} stats={stats[p.id]} />
            ))}
          {posts.length > 0 && (
            <div ref={sentinel} className="py-6 text-center text-sm text-[var(--lm-text-muted)]">
              {loadingMore ? 'Carregando mais…' : exhausted ? 'Fim dos posts.' : ''}
            </div>
          )}
        </>
      )}
      {tab === 'midia' && (
        <div className="grid grid-cols-3 gap-1 p-1">
          {media.length === 0 ? (
            <p className="col-span-3 p-8 text-center text-sm text-[var(--lm-text-muted)]">
              Nenhuma mídia.
            </p>
          ) : (
            media.map((m, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setMediaViewer(i)}
                aria-label="Abrir mídia"
                className="block aspect-square overflow-hidden rounded-md bg-[var(--lm-bg-input)]"
              >
                {m.type === 'image' ? (
                  <img src={m.url} loading="lazy" alt="" className="h-full w-full object-cover" />
                ) : m.type === 'audio' ? (
                  <span className="flex h-full w-full items-center justify-center text-[var(--lm-text-muted)]">
                    <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM21 16a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </span>
                ) : (
                  <video src={m.url} className="h-full w-full object-cover" preload="metadata" />
                )}
              </button>
            ))
          )}
          {/* Infinite scroll TAMBÉM na aba Mídia (antes só na de Posts): a mídia deriva dos
              posts, então puxar mais posts traz mais mídia. Mesmo padrão do feed. */}
          {media.length > 0 && (
            <div ref={sentinel} className="col-span-3 py-6 text-center text-sm text-[var(--lm-text-muted)]">
              {loadingMore ? 'Carregando mais…' : exhausted ? 'Fim da mídia.' : ''}
            </div>
          )}
        </div>
      )}
      {mediaViewer != null && mediaItems[mediaViewer] && (
        <MediaViewer
          items={mediaItems}
          index={mediaViewer}
          onClose={() => setMediaViewer(null)}
          onIndex={setMediaViewer}
        />
      )}
      {tab === 'comprados' && (
        <div className="grid grid-cols-3 gap-1 p-1">
          {loadingPurchased && (
            <p className="col-span-3 p-8 text-center text-sm text-[var(--lm-text-muted)]">Carregando…</p>
          )}
          {!loadingPurchased && (purchased?.length ?? 0) === 0 && (
            <p className="col-span-3 p-8 text-center text-sm text-[var(--lm-text-muted)]">
              Nada comprado ainda.
            </p>
          )}
          {purchased?.map((item) => {
            const src = purchasedFileUrl(item.file_id)
            const isVideo = item.mime_type?.startsWith('video/')
            return (
              <a
                key={item.file_id}
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="relative block aspect-square overflow-hidden rounded-md bg-[var(--lm-bg-input)]"
              >
                {isVideo ? (
                  <video src={src} className="h-full w-full object-cover" preload="metadata" />
                ) : (
                  <img src={src} loading="lazy" alt="" className="h-full w-full object-cover" />
                )}
                <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-xs font-bold text-amber-400">
                  ⚡ {item.preco_sats || '?'} sats
                </span>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
