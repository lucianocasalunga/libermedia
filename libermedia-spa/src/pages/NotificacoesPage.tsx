// Notificações — TopBar padrão (ícone+nome), seletor de período (persistido) e 6 abas
// padrão (Mistral): Todas · Respostas · Menções · Reações · Reposts · Zap's.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { useAuth } from '../providers/AuthProvider'
import { useNotifications } from '../hooks/useNotifications'
import { TopBar } from '../components/TopBar/TopBar'
import { Tabs } from '../components/Tabs/Tabs'
import { Avatar } from '../components/Avatar/Avatar'
import { UserName } from '../components/UserName/UserName'
import { NotificacoesIcon } from '../components/icons'
import { ZapModal } from '../components/ZapModal/ZapModal'
import { relayManager } from '../services/relay-manager'
import { api } from '../services/api'
import { translateText } from '../services/translate'
import { relativeTime } from '../lib/time'
import { emojifyShortcodes } from '../lib/emoji-shortcodes'
import { renderEmojiText, emojiTagMap } from '../lib/content-parser'
import { useCustomEmojiVersion } from '../services/custom-emoji'
import { twemojiUrl } from '../lib/twemoji'
import type { FeedEvent } from '../types/nostr'

const fmtSats = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : String(n))

// Emoji da notificação como IMAGEM Twemoji (catálogo self-hosted): tamanho fixo idêntico em
// todo aparelho → resolve o ❤ que destoava no mobile/iOS e garante ALINHAMENTO perfeito (todos
// no mesmo eixo). Se o emoji NÃO está no nosso catálogo (404 → onError), cai pro ❤️ — o coração
// é o nosso genérico para os "estranhos ao sistema".
const HEART_URL = twemojiUrl('❤️')
function NotifEmoji({ emoji }: { emoji: string }) {
  const [src, setSrc] = useState(() => twemojiUrl(emoji))
  return (
    <img
      src={src}
      alt={emoji}
      draggable={false}
      className="h-[22px] w-[22px]"
      onError={() => { if (src !== HEART_URL) setSrc(HEART_URL) }}
    />
  )
}

function zapAmountSats(ev: FeedEvent): number | null {
  const direct = ev.tags.find((t) => t[0] === 'amount')?.[1]
  if (direct) { const n = Number(direct); if (n > 0) return Math.round(n / 1000) }
  const desc = ev.tags.find((t) => t[0] === 'description')?.[1]
  if (desc) {
    try {
      const zr = JSON.parse(desc)
      const a = zr?.tags?.find((t: string[]) => t[0] === 'amount')?.[1]
      if (a) { const n = Number(a); if (n > 0) return Math.round(n / 1000) }
    } catch { /* description malformada */ }
  }
  return null
}

function describe(ev: FeedEvent): { verb: string; emoji: string } {
  switch (ev.kind) {
    case 7:
      return { verb: 'curtiu seu post', emoji: ev.content === '+' || !ev.content ? '❤️' : emojifyShortcodes(ev.content) }
    case 6:
      return { verb: 'repostou seu post', emoji: '🔁' }
    case 9735: {
      const s = zapAmountSats(ev)
      return { verb: s ? `te zapou ${fmtSats(s)} sats` : 'te enviou um zap', emoji: '⚡' }
    }
    case 1:
    default:
      return ev.tags.some((t) => t[0] === 'e')
        ? { verb: 'respondeu seu post', emoji: '💬' }
        : { verb: 'mencionou você', emoji: '@' }
  }
}

function refEventId(ev: FeedEvent): string | null {
  let id: string | null = null
  for (const t of ev.tags) if (t[0] === 'e' && t[1]) id = t[1]
  return id
}

// Raiz da THREAD de um kind:1 (NIP-10): a tag `e` marcada `root`, senão a 1ª `e`
// (convenção posicional). Null = post de topo / menção pura (sem `e`). Abrir a thread
// pela RAIZ (não pela resposta) faz aparecer o post + a resposta cascateada (modelo
// YouTube) — em vez da resposta solta sem contexto.
function threadRootId(ev: FeedEvent): string | null {
  const eTags = ev.tags.filter((t) => t[0] === 'e' && t[1])
  if (!eTags.length) return null
  const rootMarked = eTags.find((t) => t[3] === 'root')
  return rootMarked ? rootMarked[1] : eTags[0][1]
}

const PERIODS = [
  { k: 'h24', label: '24h', sec: 86400 },
  { k: 'h36', label: '36h', sec: 129600 },
  { k: 'semana', label: 'Semana', sec: 604800 },
  { k: 'mes', label: 'Mês', sec: 2592000 },
  { k: 'ano', label: 'Ano', sec: 31536000 },
  { k: 'tudo', label: 'Tudo', sec: 0 },
] as const

const TABS = [
  { key: 'todas', label: 'Todas' },
  { key: 'respostas', label: 'Respostas' },
  { key: 'mencoes', label: 'Menções' },
  { key: 'reacoes', label: 'Reações' },
  { key: 'reposts', label: 'Reposts' },
  { key: 'zaps', label: "Zap's" },
]

const PERIOD_KEY = 'libermedia_notif_period'

export function NotificacoesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { pubkeyHex, loggedIn } = useAuth()
  useCustomEmojiVersion() // re-render das prévias quando o mapa de emoji custom carrega (async)
  const [period, setPeriod] = useState<string>(() => localStorage.getItem(PERIOD_KEY) || 'semana')
  const [tab, setTab] = useState('todas')

  // A página é keep-alive (padrão Jumble: nunca desmonta, só display:none). Sem isto o
  // fetch só rodaria 1x no mount da sessão → a lista CONGELA e notificações novas não
  // aparecem até trocar o período/recarregar. Re-busca ao (re)entrar na rota e ao voltar
  // do segundo plano (visibilitychange).
  const [reloadTick, setReloadTick] = useState(0)
  useEffect(() => {
    if (location.pathname === '/notificacoes') setReloadTick((t) => t + 1)
  }, [location.pathname])
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && location.pathname === '/notificacoes') {
        setReloadTick((t) => t + 1)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [location.pathname])

  const since = useMemo(() => {
    const p = PERIODS.find((x) => x.k === period) ?? PERIODS[2]
    return p.sec ? Math.floor(Date.now() / 1000) - p.sec : 1 // 'tudo' → since=1 (1970), evita default 24h
    // reloadTick na dep: recalcula a janela (now-período) a cada re-entrada na rota.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, reloadTick])

  const { notifications, profiles, loading, error } = useNotifications(pubkeyHex, since, reloadTick)

  // Pré-aquece o bundle das threads das notificações de comentário (kind:1): ao TOCAR, o
  // /thread responde do cache (HIT ~instantâneo) em vez de MISS (cascata 3-5s). Fire-and-
  // forget, dedupe por sessão, só o topo (fica bem abaixo do rate-limit 30/min do endpoint).
  const prefetchedThreads = useRef(new Set<string>())
  useEffect(() => {
    const ids = notifications.filter((e) => e.kind === 1).map((e) => threadRootId(e) ?? e.id)
    const todo = [...new Set(ids)].filter((id) => !prefetchedThreads.current.has(id)).slice(0, 6)
    todo.forEach((id) => {
      prefetchedThreads.current.add(id)
      void api.get(`/api/bundle/thread/${encodeURIComponent(id)}`).catch(() => {})
    })
  }, [notifications])

  function pickPeriod(k: string) { setPeriod(k); localStorage.setItem(PERIOD_KEY, k) }

  const filtered = useMemo(() => {
    switch (tab) {
      case 'respostas': return notifications.filter((e) => e.kind === 1 && e.tags.some((t) => t[0] === 'e'))
      case 'mencoes': return notifications.filter((e) => e.kind === 1 && !e.tags.some((t) => t[0] === 'e'))
      case 'reacoes': return notifications.filter((e) => e.kind === 7)
      case 'reposts': return notifications.filter((e) => e.kind === 6)
      case 'zaps': return notifications.filter((e) => e.kind === 9735)
      default: return notifications
    }
  }, [notifications, tab])

  // Prévia do POST referenciado (o que foi curtido/repostado/zapado). Reações/reposts/
  // zaps (kind 7/6/9735) só apontam pro post via tag `e` → buscamos o conteúdo p/ a
  // prévia. Respostas/menções (kind 1) já trazem o texto no próprio evento.
  const [refPosts, setRefPosts] = useState<Record<string, FeedEvent | null>>({})
  useEffect(() => {
    const ids = Array.from(
      new Set(
        notifications
          .filter((e) => e.kind !== 1)
          .map(refEventId)
          .filter((x): x is string => !!x && !(x in refPosts)),
      ),
    )
    if (!ids.length) return
    let cancel = false
    void relayManager.query([{ ids }]).then((evs) => {
      if (cancel) return
      setRefPosts((prev) => {
        const next = { ...prev }
        for (const e of evs) next[e.id] = e as FeedEvent
        for (const id of ids) if (!(id in next)) next[id] = null // não-achado: não re-buscar
        return next
      })
    })
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications])

  // Zap (abre o ZapModal p/ a pessoa que notificou) + tradutor (proxy /api/translate,
  // toggle original↔tradução, cache por evento). Mensagem usa navigate(state.peer).
  const [zapEvent, setZapEvent] = useState<FeedEvent | null>(null)
  const [trans, setTrans] = useState<Record<string, string>>({})
  const [transOn, setTransOn] = useState<Record<string, boolean>>({})
  const [translatingN, setTranslatingN] = useState<Record<string, boolean>>({}) // buscando (spinner)
  async function translate(ev: FeedEvent, text: string) {
    if (trans[ev.id]) {
      setTransOn((s) => ({ ...s, [ev.id]: !s[ev.id] }))
      return
    }
    if (!text.trim() || translatingN[ev.id]) return
    setTranslatingN((s) => ({ ...s, [ev.id]: true }))
    try {
      const lang = localStorage.getItem('libermedia_lang') || 'pt'
      // translateText protege npub/URL/hashtag da tradução (Google só mexe no texto exposto).
      const out = await translateText(text, lang)
      if (out) {
        setTrans((s) => ({ ...s, [ev.id]: out }))
        setTransOn((s) => ({ ...s, [ev.id]: true }))
      }
    } catch {
      /* falha de tradução — ignora, mantém original */
    } finally {
      setTranslatingN((s) => ({ ...s, [ev.id]: false }))
    }
  }

  return (
    <div className="lm-page">
      <TopBar>
        <div className="flex w-full items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <NotificacoesIcon className="h-5 w-5 flex-shrink-0" />
            <h1 className="lm-topbar-title">Notificações</h1>
          </span>
          {/* Seletor de período (persistido) — na própria barra superior */}
          <select
            value={period}
            onChange={(e) => pickPeriod(e.target.value)}
            aria-label="Período"
            className="flex-shrink-0 appearance-none rounded-lg border border-[var(--lm-border)] bg-[var(--lm-bg-input)] py-1 pl-2.5 text-sm text-[var(--lm-text-pri)] outline-none"
            style={{
              colorScheme: 'dark',
              paddingRight: '30px',
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 10px center',
              backgroundSize: '13px',
            }}
          >
            {PERIODS.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}
          </select>
        </div>
      </TopBar>

      {/* 6 abas padrão — com uma folga em relação à barra superior */}
      <div className="px-3 pb-1 pt-3">
        <Tabs items={TABS} value={tab} onChange={setTab} />
      </div>

      {!loggedIn && <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">Entre para ver suas notificações.</p>}
      {loggedIn && loading && <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">Carregando…</p>}
      {error && <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">{error}</p>}
      {loggedIn && !loading && !error && filtered.length === 0 && (
        <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">Nada por aqui neste período.</p>
      )}

      {filtered.map((ev) => {
        const prof = profiles[ev.pubkey]
        const npub = (() => { try { return nip19.npubEncode(ev.pubkey) } catch { return ev.pubkey } })()
        const name = prof?.display_name?.trim() || prof?.name?.trim() || `${npub.slice(0, 10)}…`
        const { verb, emoji } = describe(ev)
        const eid = refEventId(ev)
        // RESPOSTA (kind:1 com `e`) abre a thread pela RAIZ → aparece o post + a resposta
        // cascateada (YouTube), com `?focus=` na resposta p/ rolar e destacar. MENÇÃO pura
        // (kind:1 sem `e`) → o próprio evento (mantém o fix da menção que antes morria).
        // Reação/repost/zap → o post referenciado (tag `e`).
        const root = ev.kind === 1 ? threadRootId(ev) : null
        const threadId = ev.kind === 1 ? (root ?? ev.id) : eid
        // foca a resposta dentro da thread só quando abrimos pela raiz (root existe).
        const focusId = root ? ev.id : null
        const goThread = () => {
          if (threadId) navigate(`/thread/${threadId}${focusId ? `?focus=${focusId}` : ''}`)
        }
        const goProfile = () => navigate(`/perfil/${npub}`)
        // Prévia (2 linhas + reticências): resposta/menção = o texto dela; reação/
        // repost/zap = o post referenciado que foi curtido.
        const refEv = ev.kind === 1 ? ev : eid ? refPosts[eid] : null
        const previewRaw = ev.kind === 1 ? ev.content : refEv?.content || ''
        // Prévia com emoji custom (NIP-30): resolve pela tag do evento referenciado + mapa de packs.
        const previewNodes = renderEmojiText(previewRaw, emojiTagMap(refEv?.tags))
        const showTrans = !!(transOn[ev.id] && trans[ev.id])
        return (
          <div
            key={ev.id}
            className="flex w-full items-start gap-3 border-b border-[var(--lm-border)] py-3 pr-4 pl-5 hover:bg-[var(--lm-bg-card)] md:pl-4"
          >
            {/* indicador da ação → thread. Caixa quadrada FIXA centralizada → alinhamento
                idêntico de todos (incl. ❤). Repost (kind:6) = ícone verde do X; menção = "@"
                (não é emoji); o resto = imagem Twemoji (NotifEmoji, com fallback coração). */}
            <span role="button" tabIndex={0} onClick={goThread} className="flex h-[22px] w-[22px] flex-shrink-0 cursor-pointer items-center justify-center">
              {ev.kind === 6 ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" style={{ color: '#00ba7c' }}>
                  <path d="m17 2 4 4-4 4" />
                  <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                  <path d="m7 22-4-4 4-4" />
                  <path d="M21 13v1a4 4 0 0 1-4 4H3" />
                </svg>
              ) : emoji === '@' ? (
                <span className="text-lg font-bold leading-none text-[var(--lm-accent)]">@</span>
              ) : (
                <NotifEmoji emoji={emoji} />
              )}
            </span>
            {/* avatar → perfil (respiro extra do emoji no mobile p/ não encostar) */}
            <span role="button" tabIndex={0} onClick={goProfile} className="ml-2 flex-shrink-0 cursor-pointer md:ml-1">
              <Avatar src={prof?.picture} name={name} seed={ev.pubkey} size={36} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[var(--lm-text-pri)]">
                {/* nome → perfil */}
                <span role="button" tabIndex={0} onClick={goProfile} className="cursor-pointer hover:underline">
                  <UserName hex={ev.pubkey} fallback={name} className="font-bold align-middle" />
                </span>{' '}
                {/* verbo/tempo → thread */}
                <span onClick={goThread} className="cursor-pointer text-[var(--lm-text-sec)]">{verb}</span>{' '}
                <span onClick={goThread} className="cursor-pointer text-[var(--lm-text-muted)]">· {relativeTime(ev.created_at)}</span>
              </p>
              {/* prévia do assunto (2 linhas + reticências); mostra a tradução se ligada */}
              {previewRaw && (
                <p
                  onClick={goThread}
                  className="mt-0.5 line-clamp-2 cursor-pointer text-sm text-[var(--lm-text-muted)]"
                >
                  {showTrans ? trans[ev.id] : previewNodes}
                </p>
              )}
              {/* ícones: Zap · Mensagem · Tradutor */}
              <div className="mt-1.5 flex items-center gap-5 text-[var(--lm-text-muted)]">
                <button
                  type="button"
                  aria-label="Enviar Zap"
                  title="Enviar Zap"
                  className="transition-colors hover:text-[var(--lm-accent)]"
                  onClick={() => setZapEvent(ev)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
                    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="Mensagem"
                  title="Conversar no mensageiro"
                  className="transition-colors hover:text-[var(--lm-accent)]"
                  onClick={() => navigate('/mensagens', { state: { peer: npub } })}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
                {previewRaw && (
                  <button
                    type="button"
                    aria-label="Traduzir"
                    title={translatingN[ev.id] ? 'Traduzindo…' : showTrans ? 'Ver original' : 'Traduzir'}
                    aria-busy={!!translatingN[ev.id]}
                    disabled={!!translatingN[ev.id]}
                    className={`transition-colors hover:text-[var(--lm-accent)]${translatingN[ev.id] || showTrans ? ' text-[var(--lm-accent)]' : ''}`}
                    onClick={() => translate(ev, previewRaw)}
                  >
                    {translatingN[ev.id] ? (
                      <svg className="animate-spin h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" d="M12 3a9 9 0 1 0 9 9" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-[18px] w-[18px]">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h7M9 3v2c0 4.418-2.239 8-5 8M5 9c0 2.144 2.952 3.908 6.7 4M12 20l4-9 4 9M19.1 18h-6.2" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {zapEvent && (
        <ZapModal event={zapEvent} profiles={profiles} onClose={() => setZapEvent(null)} />
      )}
    </div>
  )
}
