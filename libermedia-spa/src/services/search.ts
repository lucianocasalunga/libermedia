// Busca de PESSOAS (@usuário) — privilégio LiberMedia: nossos usuários primeiro
// (GET /api/search/users), depois a rede via NIP-50 (kind:0 search em relay.nostr.band).
import { nip19 } from 'nostr-tools'
import type { Filter } from 'nostr-tools'
import { api } from './api'
import { relayManager } from './relay-manager'

// Relays NIP-50 (busca full-text / perfis) — REDUNDÂNCIA contra ponto único de falha.
// Antes era só nostr.band+noswhere(0 resultados)+primal(rejeita o filtro 'search') → quando
// o nostr.band caía, a busca da rede morria (bug recorrente). Agora 4 relays que servem NIP-50
// de verdade (testados ao vivo 27/Jun), mais rápido primeiro; o relayManager faz corrida + dedupe.
// Verificar saúde: ../../scripts/check-search-relays.mjs
export const SEARCH_RELAYS = [
  'wss://nostr.land',        // ~580ms
  'wss://relay.nostr.band',  // melhor quando no ar (cai com frequência)
  'wss://nostr.wine',        // ~1150ms
  'wss://search.nos.today',  // ~1180ms
]

// Busca por HASHTAG (#tag) — usa o filtro '#t', que funciona em QUALQUER relay (NÃO exige
// NIP-50). Antes a busca de hashtag usava só os SEARCH_RELAYS externos → posts dos NOSSOS
// usuários (que vivem no relay.libernet.app) nem entravam no resultado. Pacote dos relays mais
// usados + os nossos. NÃO incluir pool.libernet.app (está em BAD_RELAYS: trava queries sem EOSE).
export const HASHTAG_RELAYS = [
  ...new Set([
    // nossos — relay de origem dos posts da casa
    'wss://relay.libernet.app',
    'wss://nexus.libernet.app',
    // grandes públicos mais usados (alto volume de #hashtags)
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.primal.net',
    'wss://purplepag.es',
    // agregadores (também servem '#t', além do NIP-50)
    ...SEARCH_RELAYS,
  ]),
]

export interface SearchUser {
  pubkey: string
  npub: string
  name: string
  picture?: string
  nip05?: string
  ours: boolean
}

export async function searchUsers(q: string): Promise<SearchUser[]> {
  const term = q.replace(/^@/, '').trim()
  if (term.length < 2) return []
  const out: SearchUser[] = []
  const seen = new Set<string>()

  // 1) NOSSOS primeiro (privilégio LiberMedia).
  try {
    const r = await api.get<{ users: { npub: string; pubkey: string; nip05?: string; name?: string }[] }>(
      `/api/search/users?q=${encodeURIComponent(term)}`,
    )
    for (const u of r.users || []) {
      const pk = (u.pubkey || '').toLowerCase()
      if (!/^[0-9a-f]{64}$/.test(pk) || seen.has(pk)) continue
      seen.add(pk)
      out.push({ pubkey: pk, npub: u.npub, name: u.name || term, nip05: u.nip05, ours: true })
    }
  } catch { /* base indisponível */ }

  // 2) REDE depois (NIP-50 kind:0). Não duplica os nossos.
  try {
    const evs = await relayManager.query(
      [{ kinds: [0], search: term, limit: 20 } as Filter],
      { relays: SEARCH_RELAYS, maxWait: 3000 },
    )
    for (const ev of evs) {
      const pk = ev.pubkey.toLowerCase()
      if (seen.has(pk)) continue
      seen.add(pk)
      let p: { name?: string; display_name?: string; picture?: string; nip05?: string } = {}
      try { p = JSON.parse(ev.content) } catch { /* kind:0 inválido */ }
      let npub = pk
      try { npub = nip19.npubEncode(pk) } catch { /* */ }
      out.push({
        pubkey: pk, npub,
        name: p.display_name?.trim() || p.name?.trim() || `${npub.slice(0, 10)}…`,
        picture: p.picture, nip05: p.nip05, ours: false,
      })
    }
  } catch { /* rede indisponível */ }

  return out
}
