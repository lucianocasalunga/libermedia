// Barramento simples para o feed reagir a posts criados localmente (compose),
// prependando no topo na hora sem esperar o relay devolver.
import type { FeedEvent } from '../types/nostr'

type Listener = (post: FeedEvent) => void
const listeners = new Set<Listener>()

export const feedBus = {
  emit(post: FeedEvent) {
    listeners.forEach((l) => l(post))
  },
  subscribe(l: Listener): () => void {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}
