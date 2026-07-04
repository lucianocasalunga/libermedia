// Relays (/relays) — modelo Jumble (NIP-65): duas seções, ESCRITA (forçada nos
// nossos relays, mínimo sustentável) e LEITURA (quantidade razoável). Colunas:
// Mover · Relay · Status · Remover. FONTE DA VERDADE da lista (relayManager + Feed).
import { useEffect, useRef, useState } from 'react'
import { TopBar } from '../components/TopBar/TopBar'
import { useRelay } from '../providers/RelayProvider'
import { useAuth } from '../providers/AuthProvider'
import { requireSigner } from '../services/require-signer'
import {
  loadRelaySet,
  saveRelaySet,
  checkRelay,
  publishRelayList,
  DEFAULT_WRITE,
  type RelaySet,
  type RelayStatus,
} from '../services/relays'

const STATUS_UI: Record<RelayStatus, { label: string; cls: string }> = {
  checking: { label: 'Verificando', cls: 'bg-amber-500/15 text-amber-500' },
  online: { label: 'Conectado', cls: 'bg-green-500/15 text-green-500' },
  offline: { label: 'Offline', cls: 'bg-red-500/15 text-red-400' },
}

export function RelaysPage() {
  const { setRelays: applyToManager } = useRelay()
  const { npub } = useAuth()
  const [set, setSet] = useState<RelaySet>(loadRelaySet)
  const [status, setStatus] = useState<Record<string, RelayStatus>>({})
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [probing, setProbing] = useState(false)
  const [found, setFound] = useState<string | null>(null)
  const [publishState, setPublishState] = useState<'idle' | 'publishing' | 'done'>('idle')
  const checkedOnce = useRef(false)

  const allUrls = [...new Set([...set.read, ...set.write])]

  function persist(next: RelaySet) {
    setSet(next)
    saveRelaySet(next)
    applyToManager(next.read) // o app LÊ dos relays de leitura
  }

  async function checkOne(url: string) {
    setStatus((s) => ({ ...s, [url]: 'checking' }))
    const ok = await checkRelay(url)
    setStatus((s) => ({ ...s, [url]: ok ? 'online' : 'offline' }))
  }
  async function checkAll(urls: string[]) {
    setTesting(true)
    await Promise.all(urls.map((u) => checkOne(u)))
    setTesting(false)
  }

  useEffect(() => {
    if (checkedOnce.current) return
    checkedOnce.current = true
    void checkAll(allUrls)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function normalize(raw: string): string {
    let u = raw.trim().replace(/\/+$/, '')
    if (!u) return ''
    if (u.startsWith('ws://')) return u
    if (!/^wss?:\/\//.test(u)) u = 'wss://' + u
    return u
  }

  async function searchRelay() {
    const url = normalize(input)
    setFound(null)
    if (!url) return
    if (url.startsWith('ws://')) {
      setError('Relays inseguros (ws://) não são aceitos. Use wss://.')
      return
    }
    if (allUrls.includes(url)) {
      setError('Esse relay já está na lista.')
      return
    }
    setError(null)
    setProbing(true)
    const ok = await checkRelay(url)
    setProbing(false)
    if (ok) setFound(url)
    else setError('Não encontrei esse relay na rede (offline ou inexistente).')
  }

  function addFound(target: 'read' | 'write') {
    if (!found) return
    const next: RelaySet =
      target === 'read'
        ? { ...set, read: [...set.read, found] }
        : { ...set, write: [...set.write, found] }
    persist(next)
    setStatus((s) => ({ ...s, [found]: 'online' }))
    setInput('')
    setFound(null)
    setError(null)
  }

  function remove(url: string, target: 'read' | 'write') {
    persist({ ...set, [target]: set[target].filter((r) => r !== url) })
  }
  function move(url: string, target: 'read' | 'write', dir: 'up' | 'down') {
    const list = set[target]
    const i = list.indexOf(url)
    const j = dir === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= list.length) return
    const next = [...list]
    ;[next[i], next[j]] = [next[j], next[i]]
    persist({ ...set, [target]: next })
  }

  async function publish() {
    setPublishState('publishing')
    try {
      const signer = await requireSigner(npub)
      if (!signer) {
        setPublishState('idle')
        return
      }
      await publishRelayList(signer, set)
      setPublishState('done')
      setTimeout(() => setPublishState('idle'), 2500)
    } catch {
      setError('Não foi possível publicar a lista na rede.')
      setPublishState('idle')
    }
  }

  return (
    <div className="mx-auto min-h-svh w-full max-w-[600px] border-x border-[var(--lm-border)]">
      <TopBar>
        <span className="flex items-center gap-2">
          <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7c0-1.657 3.582-3 8-3s8 1.343 8 3-3.582 3-8 3-8-1.343-8-3zM4 7v10c0 1.657 3.582 3 8 3s8-1.343 8-3V7M4 12c0 1.657 3.582 3 8 3s8-1.343 8-3" />
          </svg>
          <h1 className="lm-topbar-title">Relays</h1>
        </span>
      </TopBar>

      <div className="p-4">
        <p className="text-sm text-[var(--lm-text-muted)]">
          <b className="text-[var(--lm-text-pri)]">Escrita</b>: onde seus posts são publicados (poucos,
          os nossos). <b className="text-[var(--lm-text-pri)]">Leitura</b>: de onde o app busca conteúdo.
        </p>

        {/* Pesquisar relay (lupa → rede → encontra → link → Adicionar) + Testar */}
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <button
                type="button"
                onClick={() => void searchRelay()}
                disabled={probing || !input.trim()}
                aria-label="Pesquisar relay"
                className="absolute left-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[var(--lm-text-muted)] hover:text-[var(--lm-accent)] disabled:opacity-40"
              >
                <svg className={`h-4 w-4 ${probing ? 'animate-pulse' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 110-14 7 7 0 010 14z" />
                </svg>
              </button>
              <input
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  setError(null)
                  setFound(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && void searchRelay()}
                placeholder="Pesquisar relay (wss://relay.exemplo.com)"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-full border border-[var(--lm-border-str)] bg-[var(--lm-bg-input)] py-2 pl-11 pr-4 text-sm text-[var(--lm-text-pri)] outline-none placeholder:text-[var(--lm-text-muted)]"
              />
            </div>
            <button
              type="button"
              onClick={() => void checkAll(allUrls)}
              disabled={testing}
              aria-label="Testar todos os relays"
              className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-[var(--lm-border-str)] px-3.5 py-2 text-sm font-semibold text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)] disabled:opacity-50"
            >
              <svg className={`h-4 w-4 ${testing ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M20 8a8 8 0 00-14.5-3M4 16a8 8 0 0014.5 3" />
              </svg>
              Testar
            </button>
          </div>

          {probing && <p className="mt-2 text-sm text-[var(--lm-text-muted)]">🔎 Rastreando a rede…</p>}
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

          {/* Encontrado → vira link + adicionar a Leitura ou Escrita */}
          {found && (
            <div className="mt-2 rounded-xl border border-green-500/40 bg-green-500/10 px-3 py-2">
              <a href={found} target="_blank" rel="noopener noreferrer" className="block truncate font-mono text-sm text-green-500 hover:underline">
                ✓ {found}
              </a>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => addFound('read')} className="flex-1 rounded-full bg-[var(--lm-accent)] px-3 py-1.5 text-sm font-bold text-[var(--lm-accent-txt)]">
                  + Leitura
                </button>
                <button type="button" onClick={() => addFound('write')} className="flex-1 rounded-full border border-[var(--lm-border-str)] px-3 py-1.5 text-sm font-bold text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)]">
                  + Escrita
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <RelaySection
        title="Relays de Escrita"
        list={set.write}
        status={status}
        locked={DEFAULT_WRITE}
        onMove={(u, d) => move(u, 'write', d)}
        onRemove={(u) => remove(u, 'write')}
        onCheck={checkOne}
      />
      <RelaySection
        title="Relays de Leitura"
        list={set.read}
        status={status}
        onMove={(u, d) => move(u, 'read', d)}
        onRemove={(u) => remove(u, 'read')}
        onCheck={checkOne}
      />

      {/* Publicar a lista na rede Nostr (kind:10002 NIP-65) */}
      <div className="p-4">
        <button
          type="button"
          onClick={() => void publish()}
          disabled={publishState === 'publishing' || allUrls.length === 0}
          className="flex items-center gap-2 rounded-full bg-[var(--lm-accent)] px-5 py-2.5 text-sm font-bold text-[var(--lm-accent-txt)] disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
          </svg>
          {publishState === 'publishing' ? 'Publicando…' : publishState === 'done' ? '✓ Publicado na rede' : 'Publicar'}
        </button>
        <p className="mt-2 text-xs text-[var(--lm-text-muted)]">
          Publica sua lista na rede Nostr (kind:10002). É o que faz seus relays serem reconhecidos pelos indexadores.
        </p>
      </div>
    </div>
  )
}

function RelaySection({
  title,
  list,
  status,
  locked = [],
  onMove,
  onRemove,
  onCheck,
}: {
  title: string
  list: string[]
  status: Record<string, RelayStatus>
  locked?: string[]
  onMove: (url: string, dir: 'up' | 'down') => void
  onRemove: (url: string) => void
  onCheck: (url: string) => void
}) {
  return (
    <section>
      <h2 className="border-y border-[var(--lm-border)] bg-[var(--lm-bg-card)] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--lm-text-muted)]">
        {title}
      </h2>
      <div className="pr-4">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-12" />
            <col />
            <col className="w-[104px]" />
            <col className="w-12" />
          </colgroup>
          <tbody>
            {list.map((url, i) => {
              const st = status[url]
              const isLocked = locked.includes(url)
              return (
                <tr key={url} className="border-b border-[var(--lm-border)] align-middle">
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-1 text-[var(--lm-text-muted)]">
                      <div className="flex flex-col">
                        <button type="button" onClick={() => onMove(url, 'up')} disabled={i === 0} aria-label="Mover para cima" className="rounded p-0.5 hover:bg-[var(--lm-bg-card)] disabled:opacity-30">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button type="button" onClick={() => onMove(url, 'down')} disabled={i === list.length - 1} aria-label="Mover para baixo" className="rounded p-0.5 hover:bg-[var(--lm-bg-card)] disabled:opacity-30">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <p className="truncate font-medium text-[var(--lm-text-pri)]">{url.replace(/^wss?:\/\//, '')}</p>
                    <p className="truncate font-mono text-xs text-[var(--lm-text-muted)]">{url}</p>
                  </td>
                  <td className="px-2 py-3">
                    <button type="button" onClick={() => onCheck(url)} title="Re-testar" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${st ? STATUS_UI[st].cls : 'bg-[var(--lm-bg-input)] text-[var(--lm-text-muted)]'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${st === 'online' ? 'bg-green-500' : st === 'offline' ? 'bg-red-400' : 'bg-amber-500'}`} />
                      {st ? STATUS_UI[st].label : '—'}
                    </button>
                  </td>
                  <td className="px-2 py-3 text-right">
                    {isLocked ? (
                      <span title="Relay oficial — fixo" className="inline-block p-2 text-[var(--lm-text-muted)]">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </span>
                    ) : (
                      <button type="button" onClick={() => onRemove(url)} aria-label="Remover relay" className="rounded-lg p-2 text-[var(--lm-text-muted)] transition hover:bg-red-500/10 hover:text-red-400">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-sm text-[var(--lm-text-muted)]">
                  Nenhum relay nesta lista.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
