// Pesquisar — feed (motor único) + ABAS (Tudo/Pessoas/Hashtags/Notas).
// Fase 2: busca AO VIVO (debounce) = autocomplete instantâneo do @; histórico (localStorage);
// trending de hashtags quando vazia. @usuário: nossos primeiro (privilégio) + rede (NIP-50).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useFeedSource, type FeedSpec } from '../hooks/useFeedSource'
import { useTrending } from '../hooks/useTrending'
import { PostCard } from '../components/PostCard/PostCard'
import { TopBar } from '../components/TopBar/TopBar'
import { Tabs } from '../components/Tabs/Tabs'
import { Avatar } from '../components/Avatar/Avatar'
import { PesquisarIcon } from '../components/icons'
import { searchUsers, HASHTAG_RELAYS, type SearchUser } from '../services/search'

type Tab = 'tudo' | 'pessoas' | 'hashtags' | 'notas'
const TABS = [
  { key: 'tudo', label: 'Tudo' }, { key: 'pessoas', label: 'Pessoas' },
  { key: 'hashtags', label: 'Hashtags' }, { key: 'notas', label: 'Notas' },
]

const HIST_KEY = 'libermedia_search_history'
const getHistory = (): string[] => { try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]') } catch { return [] } }
const pushHistory = (t: string) => { const h = getHistory().filter((x) => x !== t); h.unshift(t); localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0, 8))) }
const dropHistory = (t: string) => localStorage.setItem(HIST_KEY, JSON.stringify(getHistory().filter((x) => x !== t)))

function classify(raw: string) {
  const s = raw.trim().replace(/^nostr:/, '')
  if (/^(npub1|nprofile1)[0-9a-z]+$/i.test(s)) return { type: 'profile' as const, value: s }
  if (/^(note1|nevent1)[0-9a-z]+$/i.test(s)) return { type: 'thread' as const, value: s }
  if (s.startsWith('#')) return { type: 'hashtag' as const, value: s.slice(1).toLowerCase() }
  if (s.startsWith('@')) return { type: 'people' as const, value: s.slice(1) }
  return { type: 'text' as const, value: s }
}

function PeopleList({ users, onOpen }: { users: SearchUser[]; onOpen: (npub: string) => void }) {
  return (
    <ul>
      {users.map((u) => (
        <li key={u.pubkey}>
          <button type="button" onClick={() => onOpen(u.npub)}
            className="flex w-full items-center gap-3 border-b border-[var(--lm-border)] px-4 py-3 text-left hover:bg-[var(--lm-bg-card)]">
            <Avatar src={u.picture} name={u.name} seed={u.pubkey} size={40} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate font-bold text-[var(--lm-text-pri)]">
                {u.name}
                {u.ours && <span className="rounded-full bg-[var(--lm-accent)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--lm-accent-txt)]">LiberMedia</span>}
              </p>
              {u.nip05 && <p className="truncate text-sm text-[var(--lm-text-muted)]">{u.nip05.replace(/^_@/, '')}</p>}
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function PesquisarPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [input, setInput] = useState(params.get('q') ?? '')
  const [term, setTerm] = useState((params.get('q') ?? '').trim()) // debounced
  const [tab, setTab] = useState<Tab>('tudo')
  const [people, setPeople] = useState<SearchUser[]>([])
  const [loadingPeople, setLoadingPeople] = useState(false)
  const [hist, setHist] = useState<string[]>(getHistory)
  const { tags: trending } = useTrending()
  const histTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A página é keep-alive (nunca desmonta) → o ?q= da URL só era lido no useState
  // inicial. Sem isto, clicar numa hashtag (Link → /pesquisar?q=#tag) muda a URL mas
  // não re-dispara a busca. Adota o q externo quando ele muda; não limpa se vazio
  // (preserva a busca digitada ao navegar e voltar).
  const q = params.get('q') ?? ''
  useEffect(() => {
    if (q && q !== input) { setInput(q); setTerm(q.trim()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  // Debounce do input → termo ativo (busca ao vivo).
  useEffect(() => {
    const id = setTimeout(() => setTerm(input.trim()), 300)
    return () => clearTimeout(id)
  }, [input])

  // Registra no histórico só após o termo "assentar" (2s sem digitar).
  useEffect(() => {
    if (histTimer.current) clearTimeout(histTimer.current)
    const t = term.trim()
    if (t.length < 2) return
    histTimer.current = setTimeout(() => { pushHistory(t); setHist(getHistory()) }, 2000)
    return () => { if (histTimer.current) clearTimeout(histTimer.current) }
  }, [term])

  // npub/note → redireciona; #/@ → ajusta a aba.
  useEffect(() => {
    if (!term) return
    const c = classify(term)
    if (c.type === 'profile' || c.type === 'thread') {
      // One-shot: solta o termo da memória (a busca é keep-alive e re-dispararia
      // o redirect em loop). Push normal — sem replace — pra o "voltar" funcionar.
      setInput(''); setTerm('')
      navigate(c.type === 'profile' ? `/perfil/${c.value}` : `/thread/${c.value}`)
      return
    }
    if (c.type === 'hashtag') setTab('hashtags')
    else if (c.type === 'people') setTab('pessoas')
  }, [term, navigate])

  const clean = useMemo(() => term.replace(/^[#@]/, '').trim(), [term])

  const spec: FeedSpec = useMemo(() => {
    if (!clean) return { source: 'idle' }
    if (tab === 'hashtags') return { source: 'hashtag', tag: clean.toLowerCase(), relays: HASHTAG_RELAYS }
    if (tab === 'notas' || tab === 'tudo') return { source: 'search', query: clean }
    return { source: 'idle' }
  }, [clean, tab])
  const searchActive = useLocation().pathname === '/pesquisar'
  const { events: results, profiles, loading } = useFeedSource(spec, searchActive)

  // Pessoas: abas Pessoas/Tudo e TAMBÉM Hashtags (buscar "#nsfw" deve achar o user
  // "nsfw" — o termo é a tag sem #, que é justamente o `clean`).
  useEffect(() => {
    if (!clean || (tab !== 'pessoas' && tab !== 'tudo' && tab !== 'hashtags')) { setPeople([]); return }
    let alive = true
    setLoadingPeople(true)
    void searchUsers(clean).then((u) => { if (alive) { setPeople(u); setLoadingPeople(false) } })
    return () => { alive = false }
  }, [clean, tab])

  function go(t: string) { setInput(t); setTerm(t.trim()); setParams(t.trim() ? { q: t.trim() } : {}) }

  const empty = !term.trim()
  const showPeople = tab === 'pessoas' || tab === 'tudo' || tab === 'hashtags'
  const showFeed = tab === 'hashtags' || tab === 'notas' || tab === 'tudo'

  return (
    <div className="lm-page mx-auto min-h-svh w-full max-w-[600px] border-x border-[var(--lm-border)]">
      <TopBar>
        <span className="flex items-center gap-2">
          <PesquisarIcon className="h-5 w-5 flex-shrink-0" />
          <h1 className="lm-topbar-title">Pesquisar</h1>
        </span>
      </TopBar>

      <div className="border-b border-[var(--lm-border)] px-4 py-3">
        <form onSubmit={(e) => { e.preventDefault(); go(input) }} className="flex items-center gap-2 rounded-full bg-[var(--lm-bg-input)] px-4 py-2 text-[var(--lm-text-muted)]">
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 110-14 7 7 0 010 14z" />
          </svg>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="@usuário, #hashtag, npub ou texto"
            className="flex-1 bg-transparent text-[var(--lm-text-pri)] outline-none placeholder:text-[var(--lm-text-muted)]"
            aria-label="Pesquisar"
          />
          {input && <button type="button" aria-label="Limpar" onClick={() => go('')} className="text-[var(--lm-text-muted)] hover:text-[var(--lm-text-pri)]">✕</button>}
        </form>
      </div>

      {!empty && (
        <div className="px-3 pt-3">
          <Tabs items={TABS} value={tab} onChange={(k) => setTab(k as Tab)} />
        </div>
      )}

      {/* Vazio → histórico + trending */}
      {empty && (
        <div className="px-4 pt-4">
          {hist.length > 0 && (
            <div className="mb-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--lm-text-muted)]">Recentes</p>
              {hist.map((h) => (
                <div key={h} className="flex items-center justify-between py-1.5">
                  <button type="button" onClick={() => go(h)} className="flex-1 truncate text-left text-sm text-[var(--lm-text-pri)]">{h}</button>
                  <button type="button" aria-label="Remover" onClick={() => { dropHistory(h); setHist(getHistory()) }} className="px-2 text-[var(--lm-text-muted)] hover:text-[var(--lm-text-pri)]">✕</button>
                </div>
              ))}
            </div>
          )}
          {trending.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--lm-text-muted)]">Em alta</p>
              <div className="flex flex-wrap gap-2">
                {trending.slice(0, 12).map((t) => (
                  <button key={t.tag} type="button" onClick={() => go(`#${t.tag}`)}
                    className="rounded-full border border-[var(--lm-border)] px-3 py-1 text-sm text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)]">
                    #{t.tag} <span className="text-[var(--lm-text-muted)]">{t.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {hist.length === 0 && trending.length === 0 && (
            <p className="p-6 text-center text-sm text-[var(--lm-text-muted)]">Busque <b>@usuário</b>, <b>#hashtag</b>, um perfil (npub) ou texto.</p>
          )}
        </div>
      )}

      {!empty && (
        <div className="pt-2">
          {showPeople && (
            <>
              {(tab === 'tudo' || tab === 'hashtags') && people.length > 0 && <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-[var(--lm-text-muted)]">Pessoas</p>}
              {loadingPeople && people.length === 0 && tab === 'pessoas' && <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">Buscando pessoas…</p>}
              <PeopleList users={tab === 'pessoas' ? people : people.slice(0, 5)} onOpen={(npub) => navigate(`/perfil/${npub}`)} />
              {!loadingPeople && tab === 'pessoas' && people.length === 0 && <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">Nenhuma pessoa encontrada.</p>}
            </>
          )}
          {showFeed && (
            <>
              {tab === 'tudo' && results.length > 0 && <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-[var(--lm-text-muted)]">Notas</p>}
              {tab === 'hashtags' && people.length > 0 && results.length > 0 && <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-[var(--lm-text-muted)]">Publicações</p>}
              {loading && results.length === 0 && <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">Buscando…</p>}
              {!loading && results.length === 0 && tab !== 'tudo' && !(tab === 'hashtags' && people.length > 0) && <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">Nenhum resultado.</p>}
              {results.map((ev) => <PostCard key={ev.id} event={ev} profiles={profiles} wotFilter />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}
