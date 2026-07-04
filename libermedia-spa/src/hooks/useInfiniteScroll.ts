// Scroll infinito via IntersectionObserver. Observa um sentinela no fim da lista e chama
// onLoadMore quando ele se aproxima da viewport (rootMargin generoso).
//
// ⚠️ USA CALLBACK REF (não um ref-objeto): a sentinela só é renderizada DEPOIS que o feed
// carrega (`{events.length>0 && <div ref={sentinel}>}`). Com um ref-objeto + useEffect, o
// effect rodava no mount com `ref.current === null` (sentinela ainda não existia) e NUNCA
// re-anexava o observer quando ela aparecia → o feed não paginava ("feed curto não carrega
// mais"). O callback ref é chamado pelo React EXATAMENTE quando o elemento monta/desmonta,
// então o observer anexa na hora certa. Se a sentinela já estiver visível (feed curto), o
// observer dispara o callback inicial e já carrega mais.
import { useCallback, useEffect, useRef } from 'react'

export function useInfiniteScroll(onLoadMore: () => void, rootMargin = '800px') {
  const cb = useRef(onLoadMore)
  useEffect(() => {
    cb.current = onLoadMore // mantém o loadMore mais recente, sem re-anexar o observer
  }, [onLoadMore])
  const obs = useRef<IntersectionObserver | null>(null)

  return useCallback(
    (el: HTMLDivElement | null) => {
      obs.current?.disconnect()
      if (!el) return
      obs.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) cb.current()
        },
        { rootMargin },
      )
      obs.current.observe(el)
    },
    [rootMargin],
  )
}
