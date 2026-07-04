// Renderiza os toasts (portal no body). Montado uma vez no Layout.
import { createPortal } from 'react-dom'
import { useToasts } from '../../lib/toast'

const COLOR: Record<string, string> = {
  success: 'bg-[#16a34a] text-white',
  error: 'bg-[#dc2626] text-white',
  info: 'bg-[var(--lm-text-pri)] text-[var(--lm-bg-main)]',
}

export function Toaster() {
  const toasts = useToasts()
  if (!toasts.length) return null
  return createPortal(
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[2000] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${COLOR[t.type]}`}
        >
          {t.msg}
        </div>
      ))}
    </div>,
    document.body,
  )
}
