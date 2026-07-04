// Sidebar direita (desktop xl+) — painel de exploração ("radar"). De cima p/ baixo:
//  1. Busca — alimenta o mini feed ao vivo (hashtag/texto/perfil); Enter abre a
//     busca COMPLETA no centro (/pesquisar).
//  2. Trending — 3-4 visíveis + scroll; clicar uma hashtag joga no mini feed.
//  3. Seletor de relay — default pool.libernet, opções = read relays (página de
//     Relays). Um por vez. Mexe SÓ no mini feed.
//  4. Mini feed — posts do relay+filtro; itens clicáveis abrem no thread central.
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { useTrending } from '../../hooks/useTrending'
import { readRelays } from '../../services/relays'
import { usePrefsLoaded } from '../../hooks/usePrefsLoaded'
import { RelaySelect } from './RelaySelect'
import { openSearch } from '../../lib/radar-links'
import { RadarFooter } from '../../lib/RadarFooter'
import { MiniFeed } from './MiniFeed'
import type { MiniQuery } from '../../hooks/useMiniFeed'
import './right-sidebar.css'

const TRENDING_VISIBLE = 4 // itens visíveis antes do scroll

function resolveQuery(input: string): MiniQuery {
  const t = input.trim()
  if (!t) return { type: 'recent' }
  if (t.startsWith('#')) return { type: 'hashtag', value: t.slice(1) }
  try {
    const d = nip19.decode(t)
    if (d.type === 'npub') return { type: 'author', value: d.data }
    if (d.type === 'nprofile') return { type: 'author', value: d.data.pubkey }
  } catch {
    /* não é bech32 → texto livre */
  }
  return { type: 'text', value: t }
}

export function RightSidebar() {
  const navigate = useNavigate()
  const { tags, loading } = useTrending()
  const [q, setQ] = useState('')
  const [relay, setRelay] = useState<string>('wss://nexus.libernet.app')
  const [query, setQuery] = useState<MiniQuery>({ type: 'recent' })
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Opções do seletor: nexus primeiro + read relays (fonte da verdade). Recarrega
  // quando as prefs do servidor chegam (relays podem mudar no login).
  const [relayTick, setRelayTick] = useState(0)
  usePrefsLoaded(() => setRelayTick((n) => n + 1))
  const relayOptions = useMemo(() => {
    void relayTick // recomputa quando os relays mudam (prefs-loaded)
    return [...new Set(['wss://nexus.libernet.app', ...readRelays()])]
  }, [relayTick])

  // Busca: ao digitar, atualiza o mini feed (debounce); Enter abre busca completa.
  function onSearchChange(v: string) {
    setQ(v)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => setQuery(resolveQuery(v)), 350)
  }
  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    const term = q.trim()
    if (term) openSearch(navigate, term)
  }

  function pickHashtag(tag: string) {
    setQ(`#${tag}`)
    setQuery({ type: 'hashtag', value: tag })
  }

  return (
    <aside className="lm-right-sidebar hidden xl:flex">
      {/* 1. Busca */}
      <form onSubmit={onSearchSubmit} className="lm-right-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 110-14 7 7 0 010 14z" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Pesquisar"
          aria-label="Pesquisar"
        />
      </form>

      {/* 2. Trending — compacto (3-4 + scroll) */}
      <section className="lm-trending">
        <h2 className="lm-trending-title">Trending</h2>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: TRENDING_VISIBLE }).map((_, i) => (
              <div key={i} className="h-4 w-3/4 rounded bg-[var(--lm-bg-input)]" />
            ))}
          </div>
        ) : tags.length === 0 ? (
          <p className="text-xs text-[var(--lm-text-muted)]">Nenhuma hashtag encontrada.</p>
        ) : (
          <div
            className="lm-trending-list"
            style={{ maxHeight: `${TRENDING_VISIBLE * 38}px` }}
          >
            {tags.map((t, i) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => pickHashtag(t.tag)}
                className={`lm-trending-item ${query.type === 'hashtag' && query.value === t.tag ? 'is-active' : ''}`}
              >
                <span>
                  <span className="text-xs text-[var(--lm-text-muted)]">{i + 1}</span>
                  <span className="ml-2 text-sm font-semibold text-[var(--lm-text-pri)]">#{t.tag}</span>
                </span>
                <span className="text-xs text-[var(--lm-text-muted)]">{t.count}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 3. Seletor de relay (só mini feed) */}
      <RelaySelect value={relay} options={relayOptions} onChange={setRelay} />

      {/* 4. Mini feed */}
      <MiniFeed relay={relay} query={query} />

      {/* Rodapé */}
      <footer className="lm-right-footer">
        <RadarFooter />
      </footer>
    </aside>
  )
}
