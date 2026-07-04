// Thread INLINE (estilo YouTube) renderizada embaixo do post no feed. Reusa a árvore NIP-10
// (buildThreadTree) com o ReplyCard LEVE. Lazy: mostra as 5 primeiras respostas de topo
// ("Mostrar mais" revela +10). Aninhamento recolhido por padrão ("Ver N respostas"); além de
// MAX_DEPTH níveis, manda pra /thread/:id (evita correr pra fora e render-bomb no mobile).
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ReplyCard } from '../ReplyCard/ReplyCard'
import { buildThreadTree, type ThreadNode } from '../../lib/thread-tree'
import { fetchStats, type PostStats } from '../../services/stats'
import type { FeedEvent, ProfileMap } from '../../types/nostr'

const INITIAL = 5
const STEP = 10
const MAX_DEPTH = 2 // níveis indentados inline; mais fundo → "Ver thread completa"

function Node({
  node,
  profiles,
  stats,
  depth,
}: {
  node: ThreadNode
  profiles: ProfileMap
  stats: Record<string, PostStats>
  depth: number
}) {
  const [open, setOpen] = useState(false) // aninhadas recolhidas por padrão (YouTube)
  const kids = node.children
  return (
    <div style={depth > 0 ? { marginLeft: 14, borderLeft: '2px solid var(--lm-border)', paddingLeft: 8 } : undefined}>
      <ReplyCard event={node.event} profiles={profiles} stats={stats[node.event.id]} />
      {kids.length > 0 &&
        (depth >= MAX_DEPTH ? (
          <Link
            to={`/thread/${node.event.id}`}
            className="ml-9 inline-block py-1 text-xs font-semibold text-[var(--lm-accent)] hover:underline"
          >
            Ver {kids.length} {kids.length === 1 ? 'resposta' : 'respostas'} →
          </Link>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="ml-9 py-1 text-xs font-semibold text-[var(--lm-accent)] hover:underline"
            >
              {open
                ? 'Ocultar respostas'
                : `Ver ${kids.length} ${kids.length === 1 ? 'resposta' : 'respostas'}`}
            </button>
            {open &&
              kids.map((k) => (
                <Node key={k.event.id} node={k} profiles={profiles} stats={stats} depth={depth + 1} />
              ))}
          </>
        ))}
    </div>
  )
}

export function InlineThread({
  rootId,
  replies,
  profiles,
}: {
  rootId: string
  replies: FeedEvent[]
  profiles: ProfileMap
}) {
  const nodes = useMemo(() => buildThreadTree(rootId, replies), [rootId, replies])
  const [visible, setVisible] = useState(INITIAL)
  const [stats, setStats] = useState<Record<string, PostStats>>({})

  // Stats (likes/respostas) das respostas — o bundle não traz por-resposta. Uma chamada em lote.
  useEffect(() => {
    const ids = replies.map((r) => r.id)
    if (!ids.length) return
    let alive = true
    fetchStats(ids.slice(0, 100))
      .then((res) => {
        if (alive && Object.keys(res).length) setStats(res)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [replies])

  if (nodes.length === 0) return null
  const top = nodes.slice(0, visible)
  return (
    <div className="mt-1 animate-[lm-fade_0.18s_ease]">
      {top.map((n) => (
        <Node key={n.event.id} node={n} profiles={profiles} stats={stats} depth={0} />
      ))}
      {nodes.length > visible && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + STEP)}
          className="mt-1 py-1.5 text-sm font-semibold text-[var(--lm-accent)] hover:underline"
        >
          Mostrar mais {Math.min(STEP, nodes.length - visible)} respostas
        </button>
      )}
    </div>
  )
}
