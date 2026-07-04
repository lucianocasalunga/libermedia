// RelayManager — pool WebSocket único para todo o app (unifica relay-pool.js +
// o pool do feed-v2.js do MPA). Montado uma vez no RelayProvider, sobrevive à
// navegação entre páginas. Cada página assina via useRelaySubscription.
import { SimplePool } from 'nostr-tools/pool'
import type { Event as NostrEvent, Filter } from 'nostr-tools'
import { DEFAULT_RELAYS } from '../constants'
import type { SubCloser } from '../types/nostr'

// pool.libernet.app (LibrePool) NUNCA pode entrar no conjunto ativo de relays: ele não
// envia EOSE, então qualquer querySync que o inclua espera o timeout inteiro (4–6s) e a
// tela trava. O bundle remove o pool dos defaults, MAS o geo (setGeo) e o NIP-65 do
// usuário poderiam reinjetá-lo em runtime — esta é a barreira ÚNICA que fecha essa porta.
const BAD_RELAYS = ['pool.libernet.app']
const isUsableRelay = (r: string): boolean =>
  r.startsWith('ws') && !BAD_RELAYS.some((bad) => r.includes(bad))

export interface SubscribeOptions {
  /** Chamado no EOSE (fim do histórico armazenado). */
  onEose?: () => void
  /** Relays específicos para esta subscription (default: relays do manager). */
  relays?: string[]
}

class RelayManager {
  private pool = new SimplePool()
  private relays: string[] = [...DEFAULT_RELAYS]      // LEITURA pesada (query) — relay regional quando geo ativo
  private fallbackRelays: string[] = []               // origem/descoberta — usado se a query regional vier vazia
  private liveRelays: string[] = [...DEFAULT_RELAYS]   // TEMPO REAL (subscribe) + publish — inclui origem (cross-região)
  private geoActive = false

  getRelays(): string[] {
    return [...this.relays]
  }

  setRelays(relays: string[]): void {
    this.relays = [...new Set(relays.filter(isUsableRelay))]
    if (!this.geoActive) this.liveRelays = [...this.relays]
  }

  // Geo-distribuição (Fase 2): LEITURA pesada (query/scroll) vai pro relay REGIONAL (primary),
  // aliviando o relay de origem; TEMPO REAL (subscribe) e publish incluem o origem (fallback)
  // para não perder eventos cross-região — o sync entre repetidores tem lag (~5min). Se a query
  // regional vier vazia, cai pro fallback (robustez). Sem geo → comportamento original intacto.
  setGeo(primary: string[], fallback: string[]): void {
    const p = [...new Set(primary.filter(isUsableRelay))]
    if (!p.length) return
    this.relays = p
    this.fallbackRelays = [...new Set(fallback.filter(isUsableRelay))]
    this.liveRelays = [...new Set([...p, ...this.fallbackRelays])]
    this.geoActive = true
  }

  /**
   * Assina filtros nos relays. Faz dedup por event.id dentro desta subscription
   * (o mesmo evento chega por múltiplos relays). Retorna um closer idempotente.
   */
  subscribe(
    filters: Filter[],
    onEvent: (event: NostrEvent) => void,
    opts: SubscribeOptions = {},
  ): SubCloser {
    const seen = new Set<string>()
    // tempo real usa liveRelays (regional + origem) p/ não perder eventos cross-região
    const relays = opts.relays?.length ? opts.relays : this.liveRelays

    // nostr-tools 2.23 aceita um Filter por subscription; abrimos uma por filtro
    // e compartilhamos o dedup. O EOSE dispara quando todos terminam o backfill.
    let eosePending = filters.length
    const subs = filters.map((filter) =>
      this.pool.subscribe(relays, filter, {
        onevent(event) {
          if (seen.has(event.id)) return
          seen.add(event.id)
          onEvent(event)
        },
        oneose() {
          eosePending -= 1
          if (eosePending === 0) opts.onEose?.()
        },
      }),
    )

    let closed = false
    return {
      close() {
        if (closed) return
        closed = true
        subs.forEach((s) => s.close())
        seen.clear()
      },
    }
  }

  /**
   * Consulta one-shot (espera EOSE) — ideal para paginação (until=).
   * Faz dedup por id entre os filtros/relays. Retorna ordenado desc por created_at.
   */
  async query(
    filters: Filter[],
    opts: { relays?: string[]; maxWait?: number } = {},
  ): Promise<NostrEvent[]> {
    const relays = opts.relays?.length ? opts.relays : this.relays
    const maxWait = opts.maxWait ?? 4000
    const results = await Promise.all(
      filters.map((f) =>
        this.pool.querySync(relays, f, { maxWait }).catch(() => [] as NostrEvent[]),
      ),
    )
    const seen = new Set<string>()
    const merged: NostrEvent[] = []
    for (const arr of results) {
      for (const ev of arr) {
        if (seen.has(ev.id)) continue
        seen.add(ev.id)
        merged.push(ev)
      }
    }
    // Geo: se o relay regional não retornou nada, cai pro fallback (origem) — robustez.
    if (!merged.length && !opts.relays?.length && this.fallbackRelays.length) {
      const fb = await Promise.all(
        this.fallbackRelays.length
          ? filters.map((f) =>
              this.pool.querySync(this.fallbackRelays, f, { maxWait }).catch(() => [] as NostrEvent[]),
            )
          : [],
      )
      for (const arr of fb) {
        for (const ev of arr) {
          if (seen.has(ev.id)) continue
          seen.add(ev.id)
          merged.push(ev)
        }
      }
    }
    return merged.sort((a, b) => b.created_at - a.created_at)
  }

  /** Publica um evento já assinado. Default: regional + origem (propaga cross-região). */
  async publish(event: NostrEvent, relays?: string[]): Promise<void> {
    const targets = relays?.length ? relays : [...new Set([...this.relays, ...this.fallbackRelays])]
    const results = await Promise.allSettled(this.pool.publish(targets, event))
    // Exige que PELO MENOS UM relay tenha dado OK. Sem isso, um evento rejeitado/expirado
    // (carga, rate-limit, oscilação) "passava" silenciosamente → DM se perdia sem aviso.
    if (!results.some((r) => r.status === 'fulfilled')) {
      throw new Error('Nenhum relay aceitou o evento')
    }
  }

  /** Fecha todas as conexões (raramente usado — o pool vive enquanto o app vive). */
  destroy(): void {
    this.pool.close(this.relays)
  }
}

// Singleton — importado pelo RelayProvider e pelos hooks.
export const relayManager = new RelayManager()
