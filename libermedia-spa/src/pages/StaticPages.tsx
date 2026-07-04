// Páginas estáticas — Planos e Doar. (Sobre/Privacidade migraram para AboutPage,
// uma página única com abas — ver pages/AboutPage.tsx.)
import type { ReactNode } from 'react'
import { TopBar } from '../components/TopBar/TopBar'

function StaticPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto min-h-svh w-full max-w-[600px] border-x border-[var(--lm-border)]">
      <TopBar />
      <div className="space-y-3 px-4 py-5 text-[15px] leading-relaxed text-[var(--lm-text-sec)]">
        <h1 className="text-xl font-extrabold text-[var(--lm-text-pri)]">{title}</h1>
        {children}
      </div>
    </div>
  )
}

export function PlanosPage() {
  return (
    <StaticPage title="Planos">
      <p>O LiberMedia é gratuito para usar. Os planos cobrem apenas o armazenamento de mídia que você sobe.</p>
      <ul className="space-y-2">
        <li className="rounded-xl border border-[var(--lm-border)] bg-[var(--lm-bg-card)] p-3">
          <b className="text-[var(--lm-text-pri)]">Grátis</b> — 1 GB de armazenamento + tudo do Nostr (feed, DMs, zaps).
        </li>
        <li className="rounded-xl border border-[var(--lm-border)] bg-[var(--lm-bg-card)] p-3">
          <b className="text-[var(--lm-text-pri)]">Premium</b> — mais armazenamento (3 GB+) para fotos e vídeos.
        </li>
      </ul>
      <p className="text-sm text-[var(--lm-text-muted)]">
        Veja seu uso atual em Configurações → Carteira. (Detalhes/preços finais a confirmar com o time.)
      </p>
    </StaticPage>
  )
}

export function DoarPage() {
  return (
    <StaticPage title="Apoiar o LiberMedia">
      <p>
        O LiberMedia é independente e mantido pela comunidade. Se ele te serve, considere
        apoiar com um <b className="text-[var(--lm-text-pri)]">zap Lightning</b> ⚡.
      </p>
      <p>
        Todo apoio vai direto para manter os relays, o storage e o desenvolvimento livres
        de anúncios e censura.
      </p>
      <p className="text-sm text-[var(--lm-text-muted)]">
        Em breve: botão de zap direto aqui. Por ora, um zap em qualquer post do perfil
        oficial já ajuda. 🙏
      </p>
    </StaticPage>
  )
}
