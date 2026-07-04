// Página "About" — uma página, cinco abas (Sobre · Privacidade · Termos · Seg. Infantil · Pitch).
// Sobre/Pitch: copy executiva (about-content.ts, gerada via Mistral) com diagramação de revista.
// Privacidade/Termos/Seg. Infantil: texto LEGAL fiel do v2.0 (about-legal.ts), prosa editorial.
import { useEffect, useState } from 'react'
import { TopBar } from '../components/TopBar/TopBar'
import { Tabs } from '../components/Tabs/Tabs'
import { SobreIcon } from '../components/icons'
import { api } from '../services/api'
import { aboutContent, type AboutSection, type AboutTab } from './about-content'
import { aboutLegal } from './about-legal'
import './about.css'

type TabKey = 'sobre' | 'privacidade' | 'termos' | 'seguranca' | 'pitch'

const TABS = [
  { key: 'sobre', label: 'Sobre' },
  { key: 'privacidade', label: 'Privacidade' },
  { key: 'termos', label: 'Termos de Uso' },
  { key: 'seguranca', label: 'Seg. Infantil' },
  { key: 'pitch', label: 'Pitch' },
]

// Glifo decorativo por seção (a figura é uma faixa de imagem editorial; quando o
// houver fotos reais, basta trocar o gradiente por <img src=…> no <Figure/>).
const GLYPHS = ['🔑', '🌐', '⚡', '🛡️', '🤝', '🚀', '✨', '◆']

// Faixa visual editorial. Com foto real (section.image) renderiza a imagem; sem
// foto, cai no gradiente decorativo + glifo (slot pronto). Selo "LiberMedia" sempre.
function Figure({ section, idx }: { section: AboutSection; idx: number }) {
  return (
    <figure className={section.image ? 'about-figure' : `about-figure about-figure-grad-${idx % 4}`}>
      {section.image ? (
        <img src={section.image} alt={section.image_hint || section.heading} loading="lazy" />
      ) : (
        <span className="about-figure-glyph" aria-hidden="true">
          {GLYPHS[idx % GLYPHS.length]}
        </span>
      )}
      <span className="about-figure-brand" aria-label="LiberMedia">
        <span className="about-figure-logo">Liber</span>
        <span className="about-figure-logo-accent">Media</span>
      </span>
    </figure>
  )
}

function MagSection({ section, idx }: { section: AboutSection; idx: number }) {
  const showFigure = idx % 2 === 0
  return (
    <section className="about-section">
      <p className="about-section-num">{String(idx + 1).padStart(2, '0')}</p>
      <h2 className="about-h">{section.heading}</h2>
      {section.lead && <p className="about-lead">{section.lead}</p>}
      {section.paragraphs.map((p, i) => (
        <p key={i} className={`about-p${i === 0 ? ' about-p--first' : ''}`}>
          {p}
        </p>
      ))}
      {!showFigure && section.pullquote && <blockquote className="about-pullquote">{section.pullquote}</blockquote>}
      {showFigure && <Figure section={section} idx={idx} />}
    </section>
  )
}

function Hero({ hero }: { hero: AboutTab['hero'] }) {
  return (
    <header className="about-hero">
      <img className="about-hero-mark" src="/static/img/logo.jpg" alt="LiberMedia" />
      <p className="about-kicker">{hero.kicker}</p>
      <h1>{hero.title}</h1>
      <p className="about-hero-sub">{hero.subtitle}</p>
    </header>
  )
}

interface PublicStats {
  total_users?: number
  total_files?: number
  zaps_count_30d?: number
  zaps_sats_30d?: number
}
const nf = new Intl.NumberFormat('pt-BR')

function StatsBand() {
  const [s, setS] = useState<PublicStats | null>(null)
  useEffect(() => {
    let alive = true
    api
      .get<PublicStats>('/api/public/stats')
      .then((d) => alive && setS(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  if (!s || !s.total_users) return null
  const cards: [string, number][] = [
    ['Usuários', s.total_users || 0],
    ['Arquivos', s.total_files || 0],
    ['Zaps (30d)', s.zaps_count_30d || 0],
    ['Sats em zaps (30d)', s.zaps_sats_30d || 0],
  ]
  return (
    <section className="about-stats">
      <p className="about-section-num">EM TEMPO REAL</p>
      <h2 className="about-h">A rede em números</h2>
      <div className="about-stats-grid">
        {cards.map(([label, n]) => (
          <div key={label} className="about-stat">
            <div className="about-stat-num">{nf.format(n)}</div>
            <div className="about-stat-label">{label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function MagazineTab({ tab }: { tab: AboutTab }) {
  return (
    <>
      <Hero hero={tab.hero} />
      {tab.sections.map((sec, i) => (
        <MagSection key={i} section={sec} idx={i} />
      ))}
    </>
  )
}

export function AboutPage({ initialTab = 'sobre' }: { initialTab?: TabKey }) {
  const [tab, setTab] = useState<TabKey>(initialTab)
  return (
    <div className="about mx-auto min-h-svh w-full max-w-[600px] border-x border-[var(--lm-border)] bg-[var(--lm-bg-main)]">
      <TopBar>
        <span className="flex items-center gap-2 font-bold text-[var(--lm-text-pri)]">
          <SobreIcon className="h-5 w-5" />
          About
        </span>
      </TopBar>

      <div className="about-tabs">
        <Tabs items={TABS} value={tab} onChange={(k) => setTab(k as TabKey)} />
      </div>

      {tab === 'sobre' && (
        <>
          <MagazineTab tab={aboutContent.sobre} />
          <StatsBand />
        </>
      )}
      {tab === 'pitch' && <MagazineTab tab={aboutContent.pitch} />}
      {tab === 'privacidade' && (
        <div className="about-prose" dangerouslySetInnerHTML={{ __html: aboutLegal.privacidade }} />
      )}
      {tab === 'termos' && <div className="about-prose" dangerouslySetInnerHTML={{ __html: aboutLegal.termos }} />}
      {tab === 'seguranca' && (
        <div className="about-prose" dangerouslySetInnerHTML={{ __html: aboutLegal.seguranca }} />
      )}
    </div>
  )
}
