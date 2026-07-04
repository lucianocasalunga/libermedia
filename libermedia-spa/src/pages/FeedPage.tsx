// Feed — Fase 1: bundle inicial + scroll infinito (relays) + tempo real (pílula).
// Cards estilo MPA (.post-card): arredondados, encostadinhos à coluna central.
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import { fetchContactList } from '../services/follow'
import { useFeedSource } from '../hooks/useFeedSource'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { useHideOnScroll } from '../hooks/useHideOnScroll'
import { PostCard } from '../components/PostCard/PostCard'
import { TopBar } from '../components/TopBar/TopBar'
import { FeedFilter } from '../components/FeedFilter/FeedFilter'
import { Tabs } from '../components/Tabs/Tabs'
import type { FeedEvent } from '../types/nostr'

type FeedTab = 'notas' | 'respostas'
const FEED_TABS = [
  { key: 'notas', label: 'Notas' },
  { key: 'respostas', label: 'Respostas' },
]
const isReply = (ev: FeedEvent) => ev.tags?.some((t) => t[0] === 'e') ?? false

function SkeletonPost() {
  return (
    <div className="mb-3 rounded-xl border border-[var(--lm-border)] bg-[var(--lm-bg-card)] p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-[var(--lm-bg-input)]" />
        <div className="h-3 w-1/3 rounded bg-[var(--lm-bg-input)]" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-4/5 rounded bg-[var(--lm-bg-input)]" />
        <div className="h-3 w-2/3 rounded bg-[var(--lm-bg-input)]" />
      </div>
    </div>
  )
}

export function FeedPage() {
  // Página fica MONTADA mesmo quando você sai (Layout não desmonta) → só mantém o
  // feed ao vivo quando /feed é a rota ativa (senão acumula pra sempre escondido).
  const active = useLocation().pathname === '/feed'
  const { pubkeyHex } = useAuth()
  // Modo do FeedFilter (Seguindo · Favoritos · Todos). "Seguindo" troca a fonte do feed
  // pra só quem o usuário segue (kind:3). Reage à troca no FeedFilter (evento) + cross-device.
  const [mode, setMode] = useState(() => localStorage.getItem('libermedia_feed_mode') || 'todos')
  const [follows, setFollows] = useState<string[]>([])
  useEffect(() => {
    const onMode = () => setMode(localStorage.getItem('libermedia_feed_mode') || 'todos')
    window.addEventListener('lm:feed-mode', onMode)
    window.addEventListener('libermedia:prefs-loaded', onMode)
    return () => {
      window.removeEventListener('lm:feed-mode', onMode)
      window.removeEventListener('libermedia:prefs-loaded', onMode)
    }
  }, [])
  // Carrega a lista de quem o usuário segue ao entrar no modo "Seguindo".
  useEffect(() => {
    if (mode !== 'seguindo' || !pubkeyHex) return
    let alive = true
    void fetchContactList(pubkeyHex)
      .then((list) => { if (alive) setFollows(list.follows) })
      .catch(() => {})
    return () => { alive = false }
  }, [mode, pubkeyHex])

  const spec =
    mode === 'seguindo'
      ? ({ source: 'following', authors: follows } as const)
      : ({ source: 'home' } as const)

  const {
    events,
    profiles,
    stats,
    loading,
    loadingMore,
    exhausted,
    error,
    newCount,
    loadMore,
    showNew,
    reload,
  } = useFeedSource(spec, active)

  const sentinel = useInfiniteScroll(loadMore)
  const pull = usePullToRefresh(reload) // puxar pra baixo no topo = recarregar
  const [tab, setTab] = useState<FeedTab>('notas')

  // Eixo TIPO de conteúdo: Notas (post de topo) | Respostas (tem tag 'e'). O eixo
  // FONTE (relays/seguindo) é o FeedFilter — controles ortogonais, não brigam.
  const shown = useMemo(
    () => (tab === 'respostas' ? events.filter(isReply) : events.filter((e) => !isReply(e))),
    [events, tab],
  )

  // Barras recolhidas (rolar p/ baixo) → no mobile a pílula de novos posts sobe p/ perto do topo.
  const barsHidden = useHideOnScroll()

  return (
    <div className="relative mx-auto min-h-svh w-full max-w-[600px]">
      {/* Pull-to-refresh: indicador que desce com a puxada (só aparece ao puxar no topo) */}
      {pull > 0 && (
        <div
          className="pointer-events-none fixed left-1/2 top-0 z-40 flex -translate-x-1/2 justify-center"
          style={{ transform: `translate(-50%, ${pull}px)`, opacity: Math.min(pull / 56, 1) }}
        >
          <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--lm-accent)] text-[var(--lm-accent-txt)] shadow-lg">
            <span
              className="text-lg leading-none transition-transform"
              style={{ transform: `rotate(${Math.min(pull * 3, 270)}deg)` }}
            >
              ↻
            </span>
          </div>
        </div>
      )}
      {/* Reload removido: a pílula de novos posts já faz esse papel. */}
      <TopBar>
        <FeedFilter />
        {/* Reload — SÓ desktop (no mobile usa-se o gesto pull-to-refresh). Mesma ação:
            o reload do feed (re-fetch), não window.reload. Extrema direita da linha. */}
        <button
          type="button"
          onClick={() => reload()}
          aria-label="Atualizar feed"
          title="Atualizar"
          className="ml-auto hidden flex-shrink-0 items-center justify-center rounded-full p-1.5 text-[var(--lm-text-sec)] transition hover:bg-[var(--lm-bg-card)] hover:text-[var(--lm-accent)] md:inline-flex"
        >
          <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </TopBar>

      {/* Abas Notas | Respostas */}
      <div className="px-3 pt-2 pb-1">
        <Tabs items={FEED_TABS} value={tab} onChange={(k) => setTab(k as FeedTab)} />
      </div>

      {/* Pílula de novos posts (tempo real) */}
      {newCount > 0 && (
        <div className={`pointer-events-none sticky z-20 flex justify-center transition-[top] duration-300 ${barsHidden ? 'lm-newposts-up' : 'top-14'}`}>
          <button
            type="button"
            onClick={() => {
              showNew()
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            className="pointer-events-auto mt-3 cursor-pointer rounded-full bg-[var(--lm-accent)] px-4 py-1.5 text-sm font-bold text-[var(--lm-accent-txt)] shadow-lg"
          >
            {newCount} {newCount === 1 ? 'novo post' : 'novos posts'}
          </button>
        </div>
      )}

      {/* Lista — espaçamento mínimo até a borda da coluna (encostadinho) */}
      <div className="px-2 pt-3">
        {error && (
          <div className="mb-3 rounded-xl border border-[var(--lm-border)] bg-[var(--lm-bg-card)] p-4 text-sm text-[var(--lm-text-sec)]">
            {error}{' '}
            <button onClick={reload} className="font-semibold text-[var(--lm-accent)]">
              tentar de novo
            </button>
          </div>
        )}

        {loading && events.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonPost key={i} />)
        ) : (
          <>
            {shown.map((ev) => (
              <PostCard key={ev.id} event={ev} profiles={profiles} stats={stats[ev.id]} inlineReplies wotFilter />
            ))}

            {!loading && shown.length === 0 && !error && (
              <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">
                {tab === 'respostas' ? 'Nenhuma resposta por aqui.' : 'Nenhum post no feed ainda.'}
              </p>
            )}

            {events.length > 0 && (
              <div ref={sentinel} className="py-6 text-center text-sm text-[var(--lm-text-muted)]">
                {loadingMore ? 'Carregando mais…' : exhausted ? 'Você chegou ao início.' : ''}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
