// Posts ocultados localmente nesta sessão (após deletar ou re-marcar NSFW) → o
// PostCard some na hora sem esperar refresh. Não persiste (é só feedback de UI).
import { useSyncExternalStore } from 'react'

const hidden = new Set<string>()
const subs = new Set<() => void>()

export function hidePost(id: string) {
  hidden.add(id)
  subs.forEach((c) => c())
}

export function useIsHidden(id: string): boolean {
  return useSyncExternalStore(
    (c) => {
      subs.add(c)
      return () => subs.delete(c)
    },
    () => hidden.has(id),
    () => false,
  )
}
