// ThreadTree — cascata de respostas estilo YouTube: cada resposta com filhas tem
// um "Ver N respostas" (recolhido por padrão) que expande indentado. Reusa o
// PostCard (clicar numa resposta foca a sub-thread). Indentação limitada.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PostCard } from '../PostCard/PostCard'
import { buildThreadTree, type ThreadNode } from '../../lib/thread-tree'
import type { FeedEvent, ProfileMap } from '../../types/nostr'
import './thread-tree.css'

const MAX_INDENT = 5 // além disso, não indenta mais (evita correr pra fora em threads fundas)
const MAX_RENDER_DEPTH = 8 // blindagem: além disso, "Ver continuação →" abre /thread/<id>

function ReplyNode({
  node,
  profiles,
  stats,
  depth,
  focusId,
}: {
  node: ThreadNode
  profiles: ProfileMap
  stats: Record<string, import('../../services/stats').PostStats>
  depth: number
  focusId?: string | null
}) {
  // Cascata VISÍVEL por padrão (estilo X/Twitter): as respostas já aparecem
  // aninhadas/indentadas, sem precisar clicar. O toggle continua p/ recolher.
  const [open, setOpen] = useState(true)
  const kids = node.children
  // Resposta em foco (veio da notificação, ?focus=): rola até ela e pisca o destaque.
  const isFocus = focusId === node.event.id
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (isFocus && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [isFocus])
  return (
    <div ref={ref} className={`lm-thread-node${isFocus ? ' lm-thread-focus' : ''}`}>
      <PostCard event={node.event} profiles={profiles} stats={stats[node.event.id]} />
      {kids.length > 0 && depth >= MAX_RENDER_DEPTH ? (
        // Profundidade-teto: não renderiza recursivo (blindagem); leva pra thread daquele nó.
        <Link to={`/thread/${node.event.id}`} className="lm-thread-toggle">
          <span className="lm-thread-toggle-line" />
          Ver continuação →
        </Link>
      ) : (
        kids.length > 0 && (
          <>
            <button type="button" className="lm-thread-toggle" onClick={() => setOpen((o) => !o)}>
              <span className="lm-thread-toggle-line" />
              {open ? 'Ocultar respostas' : `Ver ${kids.length} ${kids.length === 1 ? 'resposta' : 'respostas'}`}
            </button>
            {open && (
              <div className={depth < MAX_INDENT ? 'lm-thread-children' : undefined}>
                {kids.map((k) => (
                  <ReplyNode key={k.event.id} node={k} profiles={profiles} stats={stats} depth={depth + 1} focusId={focusId} />
                ))}
              </div>
            )}
          </>
        )
      )}
    </div>
  )
}

export function ThreadTree({
  rootId,
  replies,
  profiles,
  stats = {},
  focusId,
}: {
  rootId: string
  replies: FeedEvent[]
  profiles: ProfileMap
  stats?: Record<string, import('../../services/stats').PostStats>
  focusId?: string | null
}) {
  const nodes = useMemo(() => buildThreadTree(rootId, replies), [rootId, replies])
  if (nodes.length === 0) return null
  return (
    <div className="lm-thread-tree">
      {nodes.map((n) => (
        <ReplyNode key={n.event.id} node={n} profiles={profiles} stats={stats} depth={0} focusId={focusId} />
      ))}
    </div>
  )
}
