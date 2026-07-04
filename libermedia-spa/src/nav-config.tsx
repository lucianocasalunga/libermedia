// Configuração única de navegação — FONTE ÚNICA para Sidebar, BottomNav e Layout.
// Adicionar/remover/reordenar um item aqui reflete em TODAS as páginas de uma vez.
import type { ReactNode } from 'react'
import {
  FeedIcon,
  ReelsIcon,
  ArquivosIcon,
  NotificacoesIcon,
  MensagensIcon,
  ComunidadesIcon,
  PesquisarIcon,
  PerfilIcon,
  FavoritosIcon,
  BlogIcon,
  AoVivoIcon,
  EventoIcon,
  MercadoIcon,
  AssinaturaIcon,
  ConfiguracoesIcon,
  CarteiraIcon,
  ApoiarIcon,
  SobreIcon,
  PrivacidadeIcon,
} from './components/icons'

export interface NavItem {
  path: string
  label: string
  icon: ReactNode
  center?: boolean // destaque central no bottom nav (Reels)
}

const I = {
  feed: { path: '/feed', label: 'Feed', icon: <FeedIcon /> },
  reels: { path: '/reels', label: 'Reels', icon: <ReelsIcon />, center: true },
  arquivos: { path: '/arquivos', label: 'Arquivos', icon: <ArquivosIcon /> },
  notificacoes: { path: '/notificacoes', label: 'Notificações', icon: <NotificacoesIcon /> },
  mensagens: { path: '/mensagens', label: 'Mensagens', icon: <MensagensIcon /> },
  comunidades: { path: '/comunidades', label: 'Comunidades', icon: <ComunidadesIcon /> },
  pesquisar: { path: '/pesquisar', label: 'Pesquisar', icon: <PesquisarIcon /> },
  perfil: { path: '/perfil', label: 'Perfil', icon: <PerfilIcon /> },
  favoritos: { path: '/favoritos', label: 'Favoritos', icon: <FavoritosIcon /> },
  blog: { path: '/blog', label: 'Blog', icon: <BlogIcon /> },
  aovivo: { path: '/ao-vivo', label: 'Ao Vivo', icon: <AoVivoIcon /> },
  evento: { path: '/evento', label: 'Evento', icon: <EventoIcon /> },
  mercado: { path: '/mercado', label: 'Mercado', icon: <MercadoIcon /> },
  assinatura: { path: '/assinatura', label: 'Assinatura', icon: <AssinaturaIcon /> },
  configuracoes: { path: '/configuracoes', label: 'Configurações', icon: <ConfiguracoesIcon /> },
  carteira: { path: '/carteira', label: 'Carteira', icon: <CarteiraIcon /> },
  apoiar: { path: '/apoiar', label: 'Apoiar LiberMedia', icon: <ApoiarIcon /> },
  sobre: { path: '/sobre', label: 'Sobre', icon: <SobreIcon /> },
  privacidade: { path: '/privacidade', label: 'Privacidade', icon: <PrivacidadeIcon /> },
  // "About" reúne Sobre + Privacidade + Termos + Seg. Infantil + Pitch em abas (link único na sidebar).
  about: { path: '/about', label: 'About', icon: <SobreIcon /> },
} satisfies Record<string, NavItem>

// Sidebar desktop — ordem definida pelo produto.
export const SIDEBAR_ITEMS: NavItem[] = [
  I.feed,
  I.reels,
  I.notificacoes,
  I.mensagens,
  I.perfil,
  I.pesquisar,
  I.arquivos,
  I.configuracoes,
  I.carteira,
  // os demais
  I.comunidades,
  I.favoritos,
  I.blog,
  I.aovivo,
  I.evento,
  I.mercado,
  I.assinatura,
  I.apoiar,
  I.about,
]

// Bottom nav mobile — 5 ícones, Reels ao centro.
export const BOTTOM_ITEMS: NavItem[] = [I.feed, I.arquivos, I.reels, I.notificacoes, I.mensagens]

// Páginas primárias mantidas montadas (keep-alive). Todas as rotas únicas.
export const PRIMARY_PATHS = [...new Set(SIDEBAR_ITEMS.map((i) => i.path))]

export const DEFAULT_PATH = '/feed'
