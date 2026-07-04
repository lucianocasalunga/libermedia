// Tipos de resposta das APIs Flask consumidas pelo SPA.

/** GET /api/auth/check */
export interface AuthCheckResponse {
  logged_in: boolean
  npub?: string
  pubkey_hex?: string
}

/** Erro genérico das rotas Flask. */
export interface ApiError {
  error: string
}

/** GET /api/feed/bundle */
export interface FeedBundleResponse {
  events: import('./nostr').FeedEvent[]
  profiles: import('./nostr').ProfileMap
  since: number
}

/** GET /api/bundle/thread/<id> */
export interface ThreadBundleResponse {
  event: import('./nostr').FeedEvent | null
  replies: import('./nostr').FeedEvent[]
  reactions: import('./nostr').FeedEvent[]
  reposts: import('./nostr').FeedEvent[]
  zaps: import('./nostr').FeedEvent[]
  profiles: import('./nostr').ProfileMap
}
