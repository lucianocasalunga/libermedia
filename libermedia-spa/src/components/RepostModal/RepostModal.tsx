// Modal de repostagem — abre ao clicar no ícone de repost. Dois caminhos:
//  • Repostar  → kind:6 direto (NIP-18), efeito no ícone (quem chama trata).
//  • Comentar  → abre o compose em modo citação (kind:1 com nota embutida).
// Portal em document.body para escapar do containing-block de `.lm-page`
// (will-change:transform) — mesmo motivo do ReactionPicker/PostMenu.
import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export function RepostModal({
  reposted,
  onRepost,
  onComment,
  onClose,
}: {
  reposted: boolean
  onRepost: () => void
  onComment: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl border border-[var(--lm-border)] bg-[var(--lm-bg-main)] p-3 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            onRepost()
            onClose()
          }}
          disabled={reposted}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-[var(--lm-bg-card)] disabled:opacity-40"
        >
          <svg className="h-6 w-6 flex-shrink-0 text-[var(--lm-repost-on,#22c55e)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.01M4 9a8 8 0 0114.9-2M20 20v-5h-.01M20 15a8 8 0 01-14.9 2" />
          </svg>
          <span>
            <span className="block font-bold text-[var(--lm-text-pri)]">
              {reposted ? 'Já repostado' : 'Repostar'}
            </span>
            <span className="block text-sm text-[var(--lm-text-muted)]">
              {reposted ? 'Você já compartilhou esta nota' : 'Compartilhar agora com seus seguidores'}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            onComment()
            onClose()
          }}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-[var(--lm-bg-card)]"
        >
          <svg className="h-6 w-6 flex-shrink-0 text-[var(--lm-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.84L3 20l1.4-3.5A7.9 7.9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span>
            <span className="block font-bold text-[var(--lm-text-pri)]">Comentar</span>
            <span className="block text-sm text-[var(--lm-text-muted)]">Repostar com seu comentário</span>
          </span>
        </button>
      </div>
    </div>,
    document.body,
  )
}
