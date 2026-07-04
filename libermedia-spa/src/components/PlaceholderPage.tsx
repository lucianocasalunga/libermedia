// Página placeholder da Fase 0 — só prova a navegação instantânea + shell.
// Cada página real substitui isto nas fases seguintes.
import type { ReactNode } from 'react'

export function PlaceholderPage({
  title,
  phase,
  children,
}: {
  title: string
  phase: string
  children?: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-[600px] px-4 py-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--lm-text-pri)]">
        {title}
      </h1>
      <p className="mt-2 text-sm text-[var(--lm-text-muted)]">
        Placeholder — implementação na {phase}.
      </p>
      <div className="mt-6 space-y-3">
        {children ??
          Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--lm-border)] bg-[var(--lm-bg-card)] p-4"
            >
              <div className="mb-2 h-3 w-1/3 rounded bg-[var(--lm-bg-input)]" />
              <div className="h-3 w-4/5 rounded bg-[var(--lm-bg-input)]" />
            </div>
          ))}
      </div>
    </div>
  )
}
