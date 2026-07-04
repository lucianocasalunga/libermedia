// Layout shell — Sidebar (esq) + área principal + RightSidebar (dir) + BottomNav.
// Padrão Jumble: páginas primárias NUNCA desmontam (display:block/none).
// /compose, /perfil/:npub e /thread/:id são páginas de overlay renderizadas na
// área principal (o feed segue montado por baixo → volta sem perder scroll).
import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useSetAtom } from 'jotai'
import { nip19 } from 'nostr-tools'
import { Sidebar } from './Sidebar/Sidebar'
import { RightSidebar } from './RightSidebar/RightSidebar'
import { BottomNav } from './BottomNav/BottomNav'
import { MobileDrawer } from './MobileDrawer/MobileDrawer'
import { PlaceholderPage } from './PlaceholderPage'
import { PRIMARY_PATHS, DEFAULT_PATH, SIDEBAR_ITEMS } from '../nav-config'
import { useAuth } from '../providers/AuthProvider'
import { useUnreadWatcher } from '../hooks/useUnreadWatcher'
import { useHideOnScroll } from '../hooks/useHideOnScroll'
import { ensureBookmarks } from '../services/bookmarks'
import { ensurePins } from '../services/pins'
import { ensureMutes } from '../services/mutes'
import { ensureBlacklist } from '../services/blacklist'
import { initWoT } from '../services/wot'
import { initCustomEmoji } from '../services/custom-emoji'
import { installAppLifecycle } from '../lib/app-lifecycle'
import { setVideoMuted } from '../lib/video-mute'
import { reelsReturnPathAtom } from '../state/reels-nav'
import { Toaster } from './Toaster/Toaster'
import { FeedPage } from '../pages/FeedPage'
import { ArquivosPage } from '../pages/ArquivosPage'
import { ReelsPage } from '../pages/ReelsPage'
import { NotificacoesPage } from '../pages/NotificacoesPage'
import { MensagensPage } from '../pages/MensagensPage'
import { ConfiguracoesPage } from '../pages/ConfiguracoesPage'
import { PesquisarPage } from '../pages/PesquisarPage'
import { FavoritosPage } from '../pages/FavoritosPage'
import { AssinaturaPage } from '../pages/AssinaturaPage'
import { CarteiraPage } from '../pages/CarteiraPage'
import { RelaysPage } from '../pages/RelaysPage'
import { ComposePage } from '../pages/ComposePage'
import { PerfilPage } from '../pages/PerfilPage'
import { ThreadPage } from '../pages/ThreadPage'
import { EditarPerfilPage } from '../pages/EditarPerfilPage'
import { LoginPage } from '../pages/LoginPage'
import { CriarChavesPage } from '../pages/CriarChavesPage'
import { PlanosPage, DoarPage } from '../pages/StaticPages'
import { AboutPage } from '../pages/AboutPage'
import { SignerModal } from './SignerModal/SignerModal'
import type { ReactNode } from 'react'

const PRIMARY_PAGES: Record<string, ReactNode> = {
  '/feed': <FeedPage />,
  '/carteira': <CarteiraPage />,
  '/arquivos': <ArquivosPage />,
  '/reels': <ReelsPage />,
  '/notificacoes': <NotificacoesPage />,
  '/mensagens': <MensagensPage />,
  '/pesquisar': <PesquisarPage />,
  '/favoritos': <FavoritosPage />,
  '/assinatura': <AssinaturaPage />,
  '/configuracoes': <ConfiguracoesPage />,
  '/about': <AboutPage />,
  '/apoiar': <DoarPage />,
}

const LABELS: Record<string, string> = Object.fromEntries(
  SIDEBAR_ITEMS.map((i) => [i.path, i.label]),
)

function safeNpub(hex: string | null): string | null {
  if (!hex) return null
  try {
    return nip19.npubEncode(hex)
  } catch {
    return null
  }
}

export function Layout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { pubkeyHex } = useAuth()
  const setReelsReturnPath = useSetAtom(reelsReturnPathAtom)

  // Vigia de não-lido → bolinha no nav (notificações + mensagens).
  useUnreadWatcher()

  // Recolhe-ao-rolar (mesmo estado das barras) → no mobile o FAB desliza p/ a direita.
  const barsHidden = useHideOnScroll()

  // Carrega listas NIP-51 ao logar → favoritos (estrela), fixados e bloqueados
  // (posts de bloqueados já somem do feed).
  useEffect(() => {
    ensureBookmarks(pubkeyHex)
    ensurePins(pubkeyHex)
    ensureMutes(pubkeyHex)
    void initWoT(pubkeyHex) // Web of Trust (modo sombra) — carrega anel 1+2 em background
    void initCustomEmoji(pubkeyHex) // paleta de emoji custom NIP-30 (kind:10030 + packs)
  }, [pubkeyHex])

  // Blacklist de bots/spam — carrega 1x p/ todos (logado ou não); posts de
  // pubkeys bloqueadas somem do feed e do PostCard.
  useEffect(() => {
    void ensureBlacklist()
    installAppLifecycle() // pausa mídia e suspende quando o app vai pra background (iOS/PWA)
  }, [])

  // Drawer mobile (sidebar esquerda) — aberto pelo hambúrguer da TopBar.
  const [drawerOpen, setDrawerOpen] = useState(false)
  useEffect(() => {
    const open = () => setDrawerOpen(true)
    window.addEventListener('lm:open-drawer', open)
    return () => window.removeEventListener('lm:open-drawer', open)
  }, [])
  // Fecha o drawer e RE-BLOQUEIA o NSFW ao trocar de rota (o canva volta — só
  // desbloqueia um de cada vez e re-bloqueia em qualquer troca de página).
  // MESMA regra para o ÁUDIO dos vídeos: ao trocar de página todos voltam a MUDO
  // (autoplay mudo); abrir o som de um abre todos daquela página; sair reseta.
  // Vale p/ todos os feeds E threads (todos usam FeedVideo + lib/video-mute).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrawerOpen(false)
    window.dispatchEvent(new Event('lm:nsfw-relock'))
    setVideoMuted(true)
    // Guarda a última rota que NÃO é /reels → o X dos Reels volta pra cá.
    if (pathname !== '/reels') setReelsReturnPath(pathname)
  }, [pathname, setReelsReturnPath])

  // Scroll por rota: a janela é o ÚNICO scroll (páginas primárias ficam montadas em
  // display:block/none). Sem memória de posição, ao rolar o feed e trocar de aba a
  // janela continua rolada → a página nova "abre pelo rodapé" (ex.: Notificações).
  // Guarda a posição de cada rota e restaura ao voltar; rota nova / 1ª visita → topo.
  // Preserva o scroll do feed ao voltar de thread/perfil.
  const scrollPos = useRef<Record<string, number>>({})
  useEffect(() => {
    const saved = scrollPos.current[pathname] ?? 0
    window.scrollTo(0, saved)
    const onScroll = () => { scrollPos.current[pathname] = window.scrollY }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [pathname])

  // Páginas de overlay (dinâmicas) renderizadas na área principal.
  const profileMatch = pathname.match(/^\/perfil(?:\/(.+))?$/)
  const threadMatch = pathname.match(/^\/thread\/(.+)$/)
  const profileNpub = profileMatch ? profileMatch[1] || safeNpub(pubkeyHex) : null

  let overlay: ReactNode = null
  if (pathname === '/login') overlay = <LoginPage />
  else if (pathname === '/criar-chaves') overlay = <CriarChavesPage />
  else if (pathname === '/compose') overlay = <ComposePage />
  else if (pathname === '/editar-perfil') overlay = <EditarPerfilPage />
  else if (pathname === '/relays') overlay = <RelaysPage />
  else if (pathname === '/planos') overlay = <PlanosPage />
  else if (pathname === '/doar') overlay = <DoarPage />
  // Compat: links/QR antigos de /sobre e /privacidade abrem o About já na aba certa.
  else if (pathname === '/sobre') overlay = <AboutPage initialTab="sobre" />
  else if (pathname === '/privacidade') overlay = <AboutPage initialTab="privacidade" />
  else if (profileNpub) overlay = <PerfilPage key={profileNpub} npub={profileNpub} />
  else if (threadMatch) overlay = <ThreadPage key={threadMatch[1]} id={threadMatch[1]} />

  const active = PRIMARY_PATHS.includes(pathname) ? pathname : DEFAULT_PATH

  // FAB "+" só existe em /feed → novo post. (Arquivos tem o próprio "+" na linha do
  // seletor de tamanho — o FAB flutuante saiu de lá.)
  const showFab = !overlay && active === '/feed'
  function onFab() {
    navigate('/compose')
  }

  return (
    <div className="flex min-h-svh w-full justify-center bg-[var(--lm-bg-main)] text-[var(--lm-text-pri)]">
      <Sidebar />
      <main className="w-full max-w-[600px] min-w-0 pb-28 md:pb-0">
        {PRIMARY_PATHS.map((path) => {
          const visible = !overlay && path === active
          return (
            <div key={path} className={visible ? 'lm-page' : undefined} style={{ display: visible ? 'block' : 'none' }}>
              {PRIMARY_PAGES[path] ?? <PlaceholderPage title={LABELS[path] ?? 'Página'} phase="em breve" />}
            </div>
          )
        })}
        {overlay && (
          <div key={pathname} className="lm-page">
            {overlay}
          </div>
        )}

        {/* FAB sticky DENTRO da coluna → ancora na borda direita da coluna. */}
        {showFab && (
          <div className={`lm-fab-wrap${barsHidden ? ' lm-fab-hidden' : ''}`}>
            <button
              type="button"
              className="lm-fab"
              aria-label="Novo post"
              onClick={onFab}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        )}
      </main>
      <RightSidebar />
      <BottomNav />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <SignerModal />
      <Toaster />
    </div>
  )
}
