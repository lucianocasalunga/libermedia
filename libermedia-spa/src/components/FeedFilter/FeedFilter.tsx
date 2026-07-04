// Seletor de relays do Feed (centro da barra). Duas partes:
//  1) modo (rádio, um só): Seguindo · Favoritos · Todos
//  2) abaixo de uma linha tênue: relays (checkbox, marcado = busca).
// A lista de relays é PLACEHOLDER (relays ativos atuais) — a fonte da verdade
// será a futura PÁGINA DE RELAYS. Estado persistido em localStorage; o "amarrar
// de verdade no feed" (bundle/scroll/modos) vem junto com a página de relays.
import { useEffect, useRef, useState } from 'react'
import { readRelays } from '../../services/relays'
import { syncPref } from '../../services/user-prefs'
import { usePrefsLoaded } from '../../hooks/usePrefsLoaded'

const MODES = [
  { key: 'seguindo', label: 'Seguindo' },
  { key: 'favoritos', label: 'Favoritos' },
  { key: 'todos', label: 'Todos' },
] as const
type Mode = (typeof MODES)[number]['key']

const LS_MODE = 'libermedia_feed_mode'
const LS_RELAYS = 'libermedia_feed_relays' // relays DESMARCADOS (exclui)

function prettyRelay(url: string): string {
  return url.replace(/^wss?:\/\//, '').replace(/\/$/, '')
}

// Nome curto do relay p/ o botão (ex.: nexus.libernet.app → "Nexus",
// relay.damus.io → "Damus"). Tira o prefixo "relay." e capitaliza o 1º rótulo.
function relayShortName(url: string): string {
  const host = prettyRelay(url).replace(/^relay\./, '')
  const first = host.split('.')[0] || host
  return first.charAt(0).toUpperCase() + first.slice(1)
}

export function FeedFilter() {
  // Fonte da verdade: os relays de LEITURA da página /relays.
  const allRelays = readRelays()

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem(LS_MODE) as Mode) || 'todos')
  // Guardamos os DESMARCADOS (default: todos marcados).
  const [off, setOff] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(LS_RELAYS) || '[]'))
    } catch {
      return new Set()
    }
  })
  const ref = useRef<HTMLDivElement>(null)

  // Adota o modo vindo do servidor (outro dispositivo) quando as prefs carregam.
  usePrefsLoaded(() => {
    const m = localStorage.getItem(LS_MODE) as Mode | null
    if (m) setMode(m)
  })

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function pickMode(m: Mode) {
    setMode(m)
    localStorage.setItem(LS_MODE, m)
    window.dispatchEvent(new Event('lm:feed-mode')) // FeedPage reage e troca a fonte
    void syncPref('selected_feed') // cross-device (libermedia_feed_mode ↔ selected_feed)
  }

  function toggleRelay(url: string) {
    setOff((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      localStorage.setItem(LS_RELAYS, JSON.stringify([...next]))
      return next
    })
  }

  const modeLabel = MODES.find((m) => m.key === mode)?.label ?? 'Todos'
  // Primeiro relay marcado (não cabem todos no campo → mostra só o 1º, só o nome).
  const firstRelay = allRelays.find((u) => !off.has(u))
  const firstRelayName = firstRelay ? relayShortName(firstRelay) : null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex min-w-[170px] items-center rounded-full border border-[var(--lm-border-str)] px-8 py-1.5 text-sm font-bold text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)]"
      >
        <span className="flex-1 text-center">
          {modeLabel}
          {firstRelayName && (
            <>
              <span className="mx-1.5 text-[var(--lm-text-muted)]">|</span>
              <span className="font-semibold">{firstRelayName}</span>
            </>
          )}
        </span>
        <svg className="absolute right-3 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-xl border border-[var(--lm-border)] bg-[var(--lm-bg-main)] p-2 shadow-xl">
          {/* Parte 1 — modo (rádio) */}
          <div className="flex flex-col">
            {MODES.map((m) => (
              <label
                key={m.key}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)]"
              >
                <input
                  type="radio"
                  name="feed-mode"
                  checked={mode === m.key}
                  onChange={() => pickMode(m.key)}
                  className="accent-[var(--lm-accent)]"
                />
                {m.label}
              </label>
            ))}
          </div>

          {/* Linha tênue */}
          <div className="my-1 border-t border-[var(--lm-border)]" />

          {/* Parte 2 — relays (checkbox) */}
          <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-[var(--lm-text-muted)]">
            Relays
          </p>
          <div className="flex max-h-56 flex-col overflow-y-auto">
            {allRelays.map((url) => (
              <label
                key={url}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)]"
              >
                <input
                  type="checkbox"
                  checked={!off.has(url)}
                  onChange={() => toggleRelay(url)}
                  className="accent-[var(--lm-accent)]"
                />
                <span className="truncate">{prettyRelay(url)}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
