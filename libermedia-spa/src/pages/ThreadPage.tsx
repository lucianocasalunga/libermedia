// Thread — post + respostas (/thread/:id). Usa /api/bundle/thread/<id>.
// Renderiza na área principal do shell (feed segue montado por baixo).
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useThread } from '../hooks/useThread'
import { invalidateThread } from '../hooks/useInlineThread'
import { PostCard } from '../components/PostCard/PostCard'
import { ThreadTree } from '../components/ThreadTree/ThreadTree'
import { TopBar } from '../components/TopBar/TopBar'

export function ThreadPage({ id }: { id: string }) {
  // ?focus=<id> (vindo da notificação): a thread abre pela RAIZ e destaca/rola até a
  // resposta que gerou a notificação (YouTube: post no topo + a resposta em foco).
  const [params] = useSearchParams()
  const focusId = params.get('focus')
  // Aberta por notificação (tem focus) → busca fresca, pra garantir que a resposta que
  // gerou a notificação esteja no bundle (não um retrato cacheado antigo sem ela).
  const { event, replies, profiles, stats, statsMap, loading, error } = useThread(id, !!focusId)
  // Visitar a thread completa invalida o cache inline → ao voltar pro feed e reexpandir, refetcha.
  useEffect(() => invalidateThread(id), [id])

  return (
    <div className="mx-auto min-h-svh w-full max-w-[600px] border-x border-[var(--lm-border)]">
      <TopBar>
        <h1 className="lm-topbar-title">Threads</h1>
      </TopBar>

      <div className="px-2 pt-3">
        {loading && (
          <div className="flex gap-3 p-4">
            <div className="h-11 w-11 flex-shrink-0 rounded-full bg-[var(--lm-bg-input)]" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3 w-1/3 rounded bg-[var(--lm-bg-input)]" />
              <div className="h-3 w-4/5 rounded bg-[var(--lm-bg-input)]" />
            </div>
          </div>
        )}

        {error && !loading && (
          <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">{error}</p>
        )}

        {event && (
          <>
            {/* Post principal */}
            <PostCard event={event} profiles={profiles} stats={statsMap[event.id] ?? stats} clickable={false} />

            {/* Respostas — árvore (cascata estilo YouTube) */}
            {replies.length > 0 && (
              <p className="px-4 py-2 text-sm font-semibold text-[var(--lm-text-muted)]">
                {replies.length} {replies.length === 1 ? 'resposta' : 'respostas'}
              </p>
            )}
            <ThreadTree rootId={event.id} replies={replies} profiles={profiles} stats={statsMap} focusId={focusId} />
          </>
        )}
      </div>
    </div>
  )
}
