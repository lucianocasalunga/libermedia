// Vigia leve de não-lido para a bolinha do nav. Polling HTTP (não WS — barato; o
// bundle de notificações já tem cache 30s no servidor) + recheck ao focar a aba.
// "Não-lido" = evento mais recente da fonte > marca d'água `lastSeen` (localStorage,
// por npub). Entrar em /notificacoes ou /mensagens marca como visto e zera a bolinha.
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import { unreadAtom } from '../state/unread'
import { api } from '../services/api'
import { useAuth } from '../providers/AuthProvider'

const POLL_MS = 60_000

type Kind = 'notif' | 'dm'
const seenKey = (npub: string | null, kind: Kind) => `lm_seen_${kind}_${npub || 'anon'}`
const readSeen = (npub: string | null, kind: Kind) =>
  Number(localStorage.getItem(seenKey(npub, kind)) || 0)
const writeSeen = (npub: string | null, kind: Kind, ts: number) =>
  localStorage.setItem(seenKey(npub, kind), String(ts))

interface NotifResp {
  notifications?: { pubkey: string; created_at: number }[]
}
interface ConvResp {
  conversations?: { last_ts: number }[]
}

export function useUnreadWatcher() {
  const { pubkeyHex, npub } = useAuth()
  const { pathname } = useLocation()
  const setUnread = useSetAtom(unreadAtom)
  const maxNotif = useRef(0)
  const maxDm = useRef(0)

  useEffect(() => {
    if (!pubkeyHex) {
      setUnread({ notif: false, dm: false })
      return
    }
    let alive = true

    async function check() {
      // Notificações: ignora os meus próprios eventos; pega o created_at mais novo.
      try {
        const r = await api.get<NotifResp>(`/api/bundle/notifications?pubkey=${pubkeyHex}`)
        const max = (r.notifications ?? []).reduce(
          (m, e) => (e.pubkey !== pubkeyHex && e.created_at > m ? e.created_at : m),
          0,
        )
        if (!alive) return
        maxNotif.current = max
        setUnread((s) => ({ ...s, notif: max > readSeen(npub, 'notif') }))
      } catch {
        /* rede — mantém estado atual */
      }
      // DM: maior last_ts entre as conversas (requer sessão; 401 cai no catch).
      try {
        const r = await api.get<ConvResp>('/api/dm/conversations')
        const max = (r.conversations ?? []).reduce((m, c) => (c.last_ts > m ? c.last_ts : m), 0)
        if (!alive) return
        maxDm.current = max
        setUnread((s) => ({ ...s, dm: max > readSeen(npub, 'dm') }))
      } catch {
        /* idem */
      }
    }

    void check()
    const id = setInterval(() => void check(), POLL_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [pubkeyHex, npub, setUnread])

  // Entrou na página → marca tudo até agora como visto e apaga a bolinha.
  useEffect(() => {
    const now = Math.floor(Date.now() / 1000)
    if (pathname === '/notificacoes') {
      writeSeen(npub, 'notif', Math.max(maxNotif.current, now))
      setUnread((s) => ({ ...s, notif: false }))
    } else if (pathname === '/mensagens') {
      writeSeen(npub, 'dm', Math.max(maxDm.current, now))
      setUnread((s) => ({ ...s, dm: false }))
    }
  }, [pathname, npub, setUnread])
}
