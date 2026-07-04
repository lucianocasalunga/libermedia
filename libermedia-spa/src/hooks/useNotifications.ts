// Notificações via /api/bundle/notifications?pubkey=<hex> (kind:1/6/7/9735 que
// referenciam o usuário). Cache 30s no servidor.
import { useEffect, useState } from 'react'
import { api } from '../services/api'
import type { FeedEvent, ProfileMap } from '../types/nostr'

interface NotifResponse {
  notifications: FeedEvent[]
  profiles: ProfileMap
}

interface NotifState {
  notifications: FeedEvent[]
  profiles: ProfileMap
  loading: boolean
  error: string | null
}

export function useNotifications(pubkeyHex: string | null, since = 0, reloadKey = 0): NotifState {
  const [state, setState] = useState<NotifState>({
    notifications: [],
    profiles: {},
    loading: !!pubkeyHex,
    error: null,
  })

  useEffect(() => {
    if (!pubkeyHex) return
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((s) => ({ ...s, loading: true, error: null }))
    const qs = since > 0 ? `&since=${since}` : ''
    api
      .get<NotifResponse>(`/api/bundle/notifications?pubkey=${pubkeyHex}${qs}`)
      .then((res) => {
        if (!alive) return
        const notifications = [...(res.notifications ?? [])].sort(
          (a, b) => b.created_at - a.created_at,
        )
        setState({ notifications, profiles: res.profiles ?? {}, loading: false, error: null })
      })
      .catch((e: unknown) => {
        if (!alive) return
        setState((s) => ({
          ...s,
          loading: false,
          error: e instanceof Error ? e.message : 'Falha ao carregar notificações',
        }))
      })
    return () => {
      alive = false
    }
  }, [pubkeyHex, since, reloadKey])

  return state
}
