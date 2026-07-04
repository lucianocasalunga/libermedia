// Seletor de reação. Dois estados:
//  • QuickRow: linha dos 5 emojis do usuário + ⋯, ANCORADA perto do botão de like.
//  • Expandido: abre o EmojiPicker categorizado reutilizável (estilo WhatsApp).
// Portal no body (escapa de ancestral com transform/will-change).
import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { EmojiPicker } from '../EmojiPicker/EmojiPicker'
import { twemojiUrl } from '../../lib/twemoji'
import './reaction-picker.css'

// Emoji como IMAGEM Twemoji (tamanho fixo, idêntico em todo aparelho — resolve o ❤ que
// destoava no iOS). Se a imagem falhar, cai no caractere (fallback seguro).
function TwemojiImg({ emoji }: { emoji: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <>{emoji}</>
  return (
    <img
      src={twemojiUrl(emoji)}
      alt={emoji}
      draggable={false}
      className="lm-reactpick-img"
      onError={() => setFailed(true)}
    />
  )
}

export interface AnchorRect {
  x: number
  y: number
  width: number
  height: number
}

function QuickRow({
  quick,
  current,
  anchor,
  onPick,
  onMore,
  onClose,
}: {
  quick: string[]
  current: string | null
  anchor: AnchorRect | null
  onPick: (e: string) => void
  onMore: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // Posiciona perto do botão (acima; se não couber, abaixo), preso na viewport VISÍVEL
  // (visualViewport no iOS ≠ innerWidth quando há zoom/overflow). Antes de medir, capa a
  // largura na viewport → a pílula nunca fica mais larga que a tela (senão vazava pra fora,
  // escondendo o ⋮ no iPhone estreito). Com o teto + flex-wrap no CSS, ela quebra em vez de sumir.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const vv = window.visualViewport
    const vw = vv?.width ?? window.innerWidth
    const vh = vv?.height ?? window.innerHeight
    const offX = vv?.offsetLeft ?? 0
    const offY = vv?.offsetTop ?? 0
    el.style.maxWidth = `${vw - 16}px` // teto = viewport visível → nunca vaza
    // offsetWidth/Height = tamanho de LAYOUT, que IGNORA o transform:scale da animação de
    // entrada (lm-reactbar-in começa em scale .82). getBoundingClientRect mediria o tamanho
    // JÁ ESCALADO (menor) → clamp errado → pílula posicionada longe demais e vazando ao
    // terminar a animação. Medir o layout real conserta a posição. (Bug pego medindo via CDP.)
    const w = el.offsetWidth
    const h = el.offsetHeight
    const gap = 8
    let left = anchor ? anchor.x + anchor.width / 2 - w / 2 : offX + (vw - w) / 2
    left = Math.max(offX + 8, Math.min(left, offX + vw - w - 8))
    let top = anchor ? anchor.y - h - gap : offY + (vh - h) / 2
    if (anchor && top < offY + 8) top = anchor.y + anchor.height + gap
    top = Math.max(offY + 8, Math.min(top, offY + vh - h - 8))
    setPos({ left, top })
  }, [anchor])

  return createPortal(
    <div
      className="lm-reactpick-root transparent"
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <div
        ref={ref}
        className="lm-reactpick anchored"
        style={pos ? { left: pos.left, top: pos.top } : { opacity: 0 }}
        role="menu"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lm-reactpick-row">
          {quick.map((em, i) => (
            <button
              key={em}
              type="button"
              className={`lm-reactpick-emoji${current === em ? ' is-current' : ''}`}
              style={{ ['--lm-i' as string]: i }}
              onClick={() => onPick(em)}
            >
              <TwemojiImg emoji={em} />
            </button>
          ))}
          <button type="button" className="lm-reactpick-more" aria-label="Mais emojis" onClick={onMore}>
            <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
              <circle cx="5" cy="12" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="19" cy="12" r="1.7" />
            </svg>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function ReactionPicker({
  quick,
  current,
  anchor,
  onPick,
  onClose,
}: {
  quick: string[]
  current: string | null
  anchor: AnchorRect | null
  onPick: (emoji: string) => void
  onClose: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  if (expanded) return <EmojiPicker current={current} onPick={onPick} onClose={onClose} />
  return (
    <QuickRow
      quick={quick}
      current={current}
      anchor={anchor}
      onPick={onPick}
      onMore={() => setExpanded(true)}
      onClose={onClose}
    />
  )
}
