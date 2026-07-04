// Padrões simples de fundo do chat (importados do MPA DM_BACKGROUNDS): pontos, grade,
// linhas, cruz — desenhados via CSS (base + dots), sem imagem. A pref de wallpaper
// guarda 'pattern:<id>' p/ padrões e a URL crua p/ imagens; chatBgStyle resolve os dois.
import type { CSSProperties } from 'react'
import { cssBackgroundImage } from './safe-url'

export interface DmPattern {
  id: string
  label: string
  base: string
  dots: string
}

export const DM_PATTERN_GROUPS: { group: string; items: DmPattern[] }[] = [
  {
    group: 'Escuros',
    items: [
      { id: 'none', label: 'Liso', base: '#0f172a', dots: '#374151' },
      { id: 'dots', label: 'Pontos', base: '#0f172a', dots: '#374151' },
      { id: 'grid', label: 'Grade', base: '#0f172a', dots: '#1f2937' },
      { id: 'lines', label: 'Linhas', base: '#0f172a', dots: '#1f2937' },
      { id: 'cross', label: 'Cruz', base: '#0f172a', dots: '#374151' },
    ],
  },
  {
    group: 'Claros',
    items: [
      { id: 'light-none', label: 'Branco', base: '#f5f5f5', dots: 'rgba(0,0,0,0.10)' },
      { id: 'light-dots', label: 'Pontos', base: '#f0f0f0', dots: 'rgba(0,0,0,0.15)' },
      { id: 'light-grid', label: 'Grade', base: '#ffffff', dots: 'rgba(0,0,0,0.08)' },
      { id: 'light-lines', label: 'Linhas', base: '#f5f5f5', dots: 'rgba(0,0,0,0.08)' },
      { id: 'light-warm', label: 'Quente', base: '#faf8f0', dots: 'rgba(0,0,0,0.07)' },
    ],
  },
]

const PATTERN_BY_ID = new Map(DM_PATTERN_GROUPS.flatMap((g) => g.items).map((p) => [p.id, p]))
const shapeOf = (id: string) => id.replace(/^light-/, '')

// Estilo CSS de um padrão (espelha o renderizador do MPA mensagens.html).
export function patternStyle(p: DmPattern): CSSProperties {
  const d = p.dots
  const base: CSSProperties = { background: p.base }
  switch (shapeOf(p.id)) {
    case 'dots':
      return { ...base, backgroundImage: `radial-gradient(circle, ${d} 1px, transparent 1px)`, backgroundSize: '22px 22px' }
    case 'grid':
      return { ...base, backgroundImage: `linear-gradient(${d} 1px, transparent 1px), linear-gradient(90deg, ${d} 1px, transparent 1px)`, backgroundSize: '24px 24px' }
    case 'lines':
      return { ...base, backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 23px, ${d} 23px, ${d} 24px)` }
    case 'cross':
      return {
        ...base,
        backgroundImage: `radial-gradient(circle, ${d} 1px, transparent 1px), radial-gradient(circle, ${d} 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
        backgroundPosition: '0 0, 12px 12px',
      }
    default: // none / warm → fundo liso
      return base
  }
}

// Mapa dos wallpapers-imagem legados do MPA (id 'img-*' → URL). Necessário p/
// RESTAURAR os temas-por-conversa salvos na v2.0 (ex.: Flávia = 'img-coracao').
export const DM_IMG_MAP: Record<string, string> = {
  'img-androide': '/static/img/chat-bg/KNATF4.jpg', 'img-nexus': '/static/img/chat-bg/5nMNRU.jpg',
  'img-guardian': '/static/img/chat-bg/rbsRQ5.jpg', 'img-olhar': '/static/img/chat-bg/XoNHRP.jpg',
  'img-armadura': '/static/img/chat-bg/VzwH0g.jpg', 'img-gatinha': '/static/img/chat-bg/6ff3Le.jpg',
  'img-dragao': '/static/img/chat-bg/UzV4u2.jpg', 'img-demonya': '/static/img/chat-bg/YWIB1v.jpg',
  'img-fada': '/static/img/chat-bg/C3yrZb.jpg', 'img-dragprata': '/static/img/chat-bg/n4kbMZ.jpg',
  'img-supergirl': '/static/img/chat-bg/igjGdn.jpg', 'img-galaxia': '/static/img/chat-bg/uGSIRc.jpg',
  'img-incrivel': '/static/img/chat-bg/neokYc.jpg', 'img-shinobi': '/static/img/chat-bg/gvvyu9.jpg',
  'img-couro': '/static/img/chat-bg/DvtdKy.jpg', 'img-pirata': '/static/img/chat-bg/08Zlfs.jpg',
  'img-corsaria': '/static/img/chat-bg/tu0UdE.jpg', 'img-cereza': '/static/img/chat-bg/gzHuCM.jpg',
  'img-dragrosa': '/static/img/chat-bg/QvnE6D.jpg', 'img-lutadora': '/static/img/chat-bg/Ca1sIz.jpg',
  'img-coracao': '/static/img/chat-bg/dzqN8M.jpg', 'img-assassina': '/static/img/chat-bg/YjRQGQ.jpg',
  'img-feiticeira': '/static/img/chat-bg/HbUSZr.jpg', 'img-samurai': '/static/img/chat-bg/zu9epu.jpg',
  'img-laranjinha': '/static/img/chat-bg/yvr6Mm.jpg', 'img-guerreira': '/static/img/chat-bg/0aUfui.jpg',
  'img-cavaleira': '/static/img/chat-bg/PdXDLU.jpg', 'img-and18': '/static/img/chat-bg/dyIFGA.jpg',
  'img-alma': '/static/img/chat-bg/jnWgpc.jpg', 'img-trooper': '/static/img/chat-bg/Ku9E0O.jpg',
  'img-rosaneon': '/static/img/chat-bg/erc0Yv.jpg', 'img-gueixa': '/static/img/chat-bg/kjUg1B.jpg',
  'img-banquete': '/static/img/chat-bg/BUUVCJ.jpg', 'img-matrix': '/static/img/chat-bg/6l3yue.jpg',
  'img-alice': '/static/img/chat-bg/LT1bt9.jpg', 'img-punidora': '/static/img/chat-bg/xb9XGS.jpg',
  'img-elfa': '/static/img/chat-bg/YBU1ko.jpg', 'img-hellokitty': '/static/img/chat-bg/W1l7EJ.jpg',
  'img-zumbi': '/static/img/chat-bg/eSxHyI.jpg', 'img-sailor': '/static/img/chat-bg/dVYJbB.jpg',
  'img-valquiria': '/static/img/chat-bg/mOrjVG.jpg', 'img-elfinha': '/static/img/chat-bg/VuPBrg.jpg',
  'img-lua': '/static/img/chat-bg/dqUIbH.jpg', 'img-hacker': '/static/img/chat-bg/aunoHc.jpg',
  'img-neonvioleta': '/static/img/chat-bg/ncN8ss.jpg',
}

function imageStyle(url: string): CSSProperties {
  return { backgroundImage: cssBackgroundImage(url), backgroundSize: 'cover', backgroundPosition: 'center' }
}

// Resolve QUALQUER valor de wallpaper → estilo CSS. Aceita os formatos:
//  • 'pattern:<id>' (novo SPA) e id de padrão cru ('cross', 'dots', 'light-grid'…)  → CSS
//  • 'img-*' (legado MPA) → imagem do DM_IMG_MAP
//  • URL ('/static/…', '/s/…', 'http…') → imagem cover
export function chatBgStyle(wallpaper: string): CSSProperties | undefined {
  if (!wallpaper) return undefined
  const id = wallpaper.startsWith('pattern:') ? wallpaper.slice('pattern:'.length) : wallpaper
  const pat = PATTERN_BY_ID.get(id)
  if (pat) return patternStyle(pat)
  if (DM_IMG_MAP[wallpaper]) return imageStyle(DM_IMG_MAP[wallpaper])
  if (/^(https?:|\/)/.test(wallpaper)) return imageStyle(wallpaper)
  return undefined
}
