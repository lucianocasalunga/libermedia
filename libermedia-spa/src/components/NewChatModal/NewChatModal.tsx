// Nova conversa — modal de busca de pessoas (igual ao "pesquisar pessoas"):
// acha por @usuário, nome, npub/nprofile, NIP-05. Nossos usuários primeiro (selo).
// Clicar no nome/avatar → abre uma conversa nova com essa pessoa.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { searchUsers, type SearchUser } from '../../services/search'
import { Avatar } from '../Avatar/Avatar'

export function NewChatModal({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (u: SearchUser) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchUser[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Busca ao vivo (debounce 300ms).
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    const t = setTimeout(() => {
      searchUsers(term)
        .then((u) => alive && (setResults(u), setLoading(false)))
        .catch(() => alive && setLoading(false))
    }, 300)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q])

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-start justify-center bg-black/60 p-4 pt-[10vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--lm-border-str)] bg-[var(--lm-bg-sidebar)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--lm-border)] px-4 py-3">
          <h2 className="flex-1 font-bold text-[var(--lm-text-pri)]">Nova conversa</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--lm-text-muted)] hover:bg-[var(--lm-bg-card)]"
          >
            ✕
          </button>
        </div>

        <div className="p-3">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="@usuário, nome ou npub…"
            className="w-full rounded-full bg-[var(--lm-bg-input)] px-4 py-2 text-[var(--lm-text-pri)] outline-none placeholder:text-[var(--lm-text-muted)]"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && <p className="p-6 text-center text-sm text-[var(--lm-text-muted)]">Buscando…</p>}
          {!loading && q.trim().length >= 2 && results.length === 0 && (
            <p className="p-6 text-center text-sm text-[var(--lm-text-muted)]">Ninguém encontrado.</p>
          )}
          {!loading && q.trim().length < 2 && (
            <p className="p-6 text-center text-sm text-[var(--lm-text-muted)]">
              Digite um @, nome ou npub para encontrar alguém.
            </p>
          )}
          {results.map((u) => (
            <button
              key={u.pubkey}
              type="button"
              onClick={() => onPick(u)}
              className="flex w-full items-center gap-3 border-t border-[var(--lm-border)] px-4 py-2.5 text-left transition hover:bg-[var(--lm-bg-card)]"
            >
              <Avatar src={u.picture} name={u.name} seed={u.pubkey} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-semibold text-[var(--lm-text-pri)]">{u.name}</span>
                  {u.ours && (
                    <span
                      title="Usuário LiberMedia"
                      className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[var(--lm-accent)] text-[var(--lm-accent-txt)]"
                    >
                      <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12l5 5L20 6" />
                      </svg>
                    </span>
                  )}
                </div>
                <span className="block truncate text-xs text-[var(--lm-text-muted)]">
                  {u.nip05 || `${u.npub.slice(0, 18)}…`}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
