// Geo-relays (Fase 2) — busca a lista de relays por proximidade do backend
// (GET /api/relays/geo, que lê o CF-IPCountry) e aplica no RelayManager:
// LEITURA pesada vai pro relay REGIONAL, tempo real/publish incluem o origem.
// Cache local de 24h (conexão fria rápida, menos chamadas). Robusto: se a API
// falhar ou não houver região, mantém o comportamento atual (não quebra nada).
import { relayManager } from './relay-manager'
import { readRelays } from './relays'
import { FALLBACK_RELAYS } from '../constants'

const CACHE_KEY = 'libermedia_geo_relays_v1'
const TTL = 24 * 60 * 60 * 1000 // 24h

interface Geo {
  primary: string[]
  fallback: string[]
  country?: string
  ts?: number
}

const isWs = (x: unknown): x is string => typeof x === 'string' && x.startsWith('ws')

function fromCache(): Geo | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
    if (c && c.ts && Date.now() - c.ts < TTL && Array.isArray(c.primary) && c.primary.length) {
      return c as Geo
    }
  } catch {
    /* corrompido → ignora */
  }
  return null
}

export async function fetchGeoRelays(): Promise<Geo> {
  const c = fromCache()
  if (c) return c
  try {
    const r = await fetch('/api/relays/geo', { credentials: 'omit' })
    const d = await r.json()
    const geo: Geo = {
      primary: (d.primary || []).filter(isWs),
      fallback: (d.fallback || []).filter(isWs),
      country: d.country,
      ts: Date.now(),
    }
    if (geo.primary.length) localStorage.setItem(CACHE_KEY, JSON.stringify(geo))
    return geo
  } catch {
    // Sem rede/erro → fallback público; mantém o app funcional.
    return { primary: [], fallback: [...FALLBACK_RELAYS] }
  }
}

/**
 * Aplica a geo-distribuição no RelayManager. Respeita a escolha do usuário:
 * os relays de leitura dele (NIP-65 / página /relays) entram no fallback —
 * o geo ADICIONA o regional na frente, nunca remove o que o usuário escolheu.
 * Chamado uma vez na inicialização (não bloqueia o primeiro render).
 */
export async function applyGeoRelays(): Promise<void> {
  const geo = await fetchGeoRelays()
  if (!geo.primary.length) return // sem região → mantém o setRelays(readRelays()) atual
  const userRead = readRelays()
  const fallback = [...new Set([...geo.fallback, ...userRead])]
  relayManager.setGeo(geo.primary, fallback)
}

/** Permite ao usuário forçar/limpar a região manualmente (override de VPN/viagem). */
export function clearGeoCache(): void {
  localStorage.removeItem(CACHE_KEY)
}
