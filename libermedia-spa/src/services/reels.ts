// Reels — vídeos curados servidos pela reels-api do nexus.
// Chama nexus.libernet.app DIRETO (CORS liberado: *). A reels-api vive no src/ TS
// do nexus-relay desde 26/Jun (sobrevive a rebuilds).
const NEXUS_API = 'https://nexus.libernet.app'

export interface ReelItem {
  event_id: string
  url: string
  cdn_url: string | null
  orientation: 'vertical' | 'horizontal' | 'unknown'
  author_pubkey: string
  thumbnail: string
  kind: number
  nsfw?: boolean
}

// session_id estável por aba (igual MPA): random base36 + timestamp, em sessionStorage.
// O backend usa isso pra dedup de 6h (não repetir vídeos na mesma sessão).
function reelsSessionId(): string {
  let id = sessionStorage.getItem('reels_session_id')
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36)
    sessionStorage.setItem('reels_session_id', id)
  }
  return id
}

export async function fetchReels(opts: {
  limit?: number
  offset?: number
  orientation?: 'all' | 'vertical' | 'horizontal'
  pubkey?: string | null
} = {}): Promise<ReelItem[]> {
  const params = new URLSearchParams({
    limit: String(opts.limit ?? 20),
    orientation: opts.orientation ?? 'all',
    offset: String(opts.offset ?? 0),
    session_id: reelsSessionId(),
    pubkey: opts.pubkey && /^[0-9a-f]{64}$/i.test(opts.pubkey) ? opts.pubkey : '',
  })
  const res = await fetch(`${NEXUS_API}/api/reels/feed?${params.toString()}`)
  if (!res.ok) throw new Error(`reels HTTP ${res.status}`)
  const data: unknown = await res.json()
  return Array.isArray(data) ? (data as ReelItem[]) : []
}

// URL de vídeo preferindo o CDN quando disponível.
export function reelSrc(item: ReelItem): string {
  return item.cdn_url || item.url
}

// Reporta vídeo quebrado (404, codec, timeout). 3 reports → some do pool no backend.
// keepalive: sobrevive mesmo se a página/aba fechar logo após.
export function reportBadReel(eventId: string): void {
  try {
    void fetch(`${NEXUS_API}/api/reels/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* silencioso — telemetria não pode quebrar o player */
  }
}

// Registra quanto % do vídeo foi assistido — alimenta o retention_bonus do ranking.
export function reportRetention(eventId: string, watchedPct: number): void {
  const pct = Math.max(0, Math.min(100, Math.round(watchedPct)))
  try {
    void fetch(`${NEXUS_API}/api/reels/retention`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, watched_pct: pct }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* silencioso */
  }
}

// Sinaliza que o vídeo foi assistido até o fim (boost de score).
export function reportCompleted(eventId: string): void {
  try {
    void fetch(`${NEXUS_API}/api/reels/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, action: 'completed' }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* silencioso */
  }
}

// Sinaliza um LIKE (kind:7 já publicado nos relays) → boost FORTE no ranking (estilo
// TikTok: engajamento explícito sobe o vídeo). Reportar 1× por reel/sessão (guard no
// chamador) pra não inflar com toque-duplo repetido. NÃO substitui o kind:7 — é o sinal
// interno de ranking; o kind:7 é o like portável/contado de verdade.
export function reportLike(eventId: string): void {
  try {
    void fetch(`${NEXUS_API}/api/reels/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, action: 'like' }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* silencioso */
  }
}
