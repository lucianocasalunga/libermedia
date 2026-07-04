// Picker de emoji — agora sobre a lib `emoji-picker-element` (Web Component mantido pelo
// Nolan Lawson: mobile-first, busca, skin tones, recentes, e ISOLAMENTO de estilo via Shadow
// DOM — mata a classe de bug do picker artesanal). Mantém a MESMA interface do picker antigo
// ({current?, onPick, onClose}) → compose, reações (ReactionPicker), DM e RepostModal seguem
// SEM alteração. Dados em PT self-hospedados (public/emoji-data/pt.json) → zero CDN externo em
// runtime (offline PWA ok; lição do nexus/pool). O elemento é criado imperativamente (evita a
// tipagem de custom-element no JSX) e estilizado por CSS custom properties (piercing shadow).
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import 'emoji-picker-element'
import { recordEmoji } from '../../services/emoji'
import { customEmojiForPicker, subscribeCustomEmoji } from '../../services/custom-emoji'
import './emoji-picker.css'

// Tema escuro? Deriva da luminância do --lm-bg-main atual — funciona p/ QUALQUER tema nosso
// sem depender do nome da classe. Só decide o preset claro/escuro interno do <emoji-picker>;
// as cores em si vêm das custom properties no CSS.
function isDarkBg(): boolean {
  try {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--lm-bg-main').trim()
    const m = bg.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
    if (!m) return true
    let h = m[1]
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5
  } catch {
    return true
  }
}

export function EmojiPicker({
  onPick,
  onClose,
}: {
  current?: string | null // mantido p/ compat de interface (a lib não destaca "atual")
  onPick: (emoji: string) => void
  onClose: () => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const picker = document.createElement('emoji-picker') as HTMLElement & { customEmoji?: unknown }
    picker.className = isDarkBg() ? 'dark' : 'light'
    // respeita o base do build (raiz '/' e /v2.5/) → self-host correto nos dois
    picker.setAttribute('data-source', `${import.meta.env.BASE_URL}emoji-data/pt.json`)
    picker.setAttribute('locale', 'pt')
    // Emoji custom NIP-30 do usuário (kind:10030 + packs) — atualiza quando carregar em bg.
    picker.customEmoji = customEmojiForPicker()
    const unsub = subscribeCustomEmoji(() => {
      picker.customEmoji = customEmojiForPicker()
    })
    const onEmoji = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const uni = detail?.unicode as string | undefined
      if (uni) {
        recordEmoji(uni) // alimenta a fila de recentes/quick-row (services/emoji.ts)
        onPickRef.current(uni)
      } else if (detail?.emoji?.url) {
        // custom (NIP-30): insere o :shortcode: — o publish anexa a tag ["emoji",code,url].
        const code = (detail.emoji.shortcodes?.[0] || detail.name) as string | undefined
        if (code) onPickRef.current(`:${code}:`)
      }
    }
    picker.addEventListener('emoji-click', onEmoji)
    host.appendChild(picker)
    return () => {
      unsub()
      picker.removeEventListener('emoji-click', onEmoji)
      picker.remove()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="lm-emojipick-root"
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <div className="lm-emojipick" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div ref={hostRef} className="lm-emojipick-host" />
      </div>
    </div>,
    document.body,
  )
}
