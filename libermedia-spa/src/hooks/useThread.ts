// Carrega uma thread via /api/bundle/thread/<id> (post + respostas + reações +
// perfis, com cache de 5min no servidor). Aceita hex, note1 ou nevent1.
import { useEffect, useState } from 'react'
import { api } from '../services/api'
import type { ThreadBundleResponse } from '../types/api'
import { fetchStats, tallyStats, type PostStats } from '../services/stats'
import { primeProfiles, requestProfiles } from '../services/profiles'
import { useAuth } from '../providers/AuthProvider'
import type { FeedEvent, ProfileMap } from '../types/nostr'

interface ThreadState {
  event: FeedEvent | null
  replies: FeedEvent[]
  profiles: ProfileMap
  stats?: PostStats // stats do post RAIZ (imediato, derivado do bundle)
  statsMap: Record<string, PostStats> // stats de RAIZ + RESPOSTAS (como no feed) — chega async
  loading: boolean
  error: string | null
}

const EMPTY: PostStats = { likes: 0, replies: 0, reposts: 0, zaps: 0, reactions: {} }

// `fresh` = abrir sem cache (ex.: vindo de uma notificação → precisa da resposta recém-chegada
// que a gerou; um bundle cacheado de minutos atrás pode não tê-la ainda).
export function useThread(id: string, fresh = false): ThreadState {
  const { pubkeyHex } = useAuth()
  const [state, setState] = useState<ThreadState>({
    event: null,
    replies: [],
    profiles: {},
    statsMap: {},
    loading: true,
    error: null,
  })

  useEffect(() => {
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((s) => ({ ...s, loading: true, error: null }))
    api
      .get<ThreadBundleResponse>(`/api/bundle/thread/${encodeURIComponent(id)}${fresh ? '?fresh=1' : ''}`)
      .then((res) => {
        if (!alive) return
        const replies = [...(res.replies ?? [])].sort((a, b) => a.created_at - b.created_at)
        if (!res.event) {
          setState({ event: null, replies, profiles: res.profiles ?? {}, statsMap: {}, loading: false, error: 'Post não encontrado.' })
          return
        }
        const rootId = res.event.id
        const ids = [rootId, ...replies.map((r) => r.id)]
        // Contadores JÁ no 1º paint, direto do bundle (por-alvo): respostas contam pelos
        // e-tags dos kind:1; reações/reposts/zaps pelos eventos de engajamento. Com a Fase 2
        // do servidor (engajamento das respostas no bundle) isso já traz o like por-resposta
        // sem esperar o refinamento. mineEmoji = MINHA reação (likedByMe) — sem coração branco.
        const bundleEvents = [
          ...replies,
          ...(res.reactions ?? []),
          ...(res.reposts ?? []),
          ...(res.zaps ?? []),
        ] as FeedEvent[]
        const statsMap = tallyStats(ids, bundleEvents, pubkeyHex || undefined)
        setState({
          event: res.event,
          replies,
          profiles: res.profiles ?? {},
          stats: statsMap[rootId],
          statsMap,
          loading: false,
          error: null,
        })
        // Alimenta o cache GLOBAL de perfil com o que veio no bundle + pede os autores de
        // respostas que faltaram (antes o thread não completava perfis ausentes → npub…).
        primeProfiles(res.profiles ?? {})
        const missing = replies.map((r) => r.pubkey).filter((pk) => !res.profiles?.[pk])
        if (missing.length) requestProfiles(missing)
        // REFINAMENTO em fundo: conta nos relays amplos (reações espalhadas em relay externo
        // que não federou) e faz merge MAX por id — nunca regride o que o bundle já trouxe.
        void fetchStats(ids, pubkeyHex || undefined).then((map) => {
          if (!alive) return
          setState((s) => {
            const merged: Record<string, PostStats> = {}
            for (const eid of ids) {
              const a = s.statsMap[eid] ?? EMPTY
              const b = map[eid] ?? EMPTY
              merged[eid] = {
                likes: Math.max(a.likes, b.likes),
                replies: Math.max(a.replies, b.replies),
                reposts: Math.max(a.reposts, b.reposts),
                zaps: Math.max(a.zaps, b.zaps),
                reactions: Object.keys(b.reactions).length ? b.reactions : a.reactions,
                mineEmoji: a.mineEmoji ?? b.mineEmoji,
                mineId: a.mineId ?? b.mineId,
              }
            }
            return { ...s, stats: merged[rootId], statsMap: merged }
          })
        })
      })
      .catch((e: unknown) => {
        if (!alive) return
        setState((s) => ({
          ...s,
          loading: false,
          error: e instanceof Error ? e.message : 'Falha ao carregar a thread',
        }))
      })
    return () => {
      alive = false
    }
  }, [id, pubkeyHex, fresh])

  return state
}
