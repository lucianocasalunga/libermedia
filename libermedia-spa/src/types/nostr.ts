// Tipos Nostr — reexporta o essencial do nostr-tools e adiciona helpers de domínio.
import type { Event as NostrEvent, Filter } from 'nostr-tools'

export type { NostrEvent, Filter }

/** Link nomeado (estilo YouTube). Campo custom `links` no kind:0 — convenção de-facto
 * (clientes que não conhecem ignoram; o `website` carrega o 1º link p/ interop NIP-01). */
export interface ProfileLink {
  title: string
  url: string
}

/** Perfil (kind:0 content já parseado). */
export interface Profile {
  pubkey: string
  name?: string
  display_name?: string
  about?: string
  picture?: string
  banner?: string
  nip05?: string
  lud16?: string
  lud06?: string
  website?: string
  links?: ProfileLink[]
}

/** Resultado de subscription do RelayManager. */
export interface SubCloser {
  close: () => void
}

/** Evento do feed com perfil do autor embutido (resposta de /api/feed/bundle). */
export interface FeedEvent {
  id: string
  pubkey: string
  kind: number
  content: string
  created_at: number
  tags: string[][]
  sig: string
  profile?: Profile
  // NIP-18: quando um kind:6 é desembrulhado, este passa a ser o evento ORIGINAL e
  // repostedBy guarda o pubkey de quem repostou (pra mostrar "🔁 Fulano repostou").
  repostedBy?: string
}

/** Mapa hex → perfil retornado pelo bundle/batch. */
export type ProfileMap = Record<string, Profile>
