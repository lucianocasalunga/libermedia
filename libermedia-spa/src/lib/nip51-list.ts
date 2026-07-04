// Lista replaceable NIP-51 genérica (pin=kind:10001/tag e, mute=kind:10000/tag p).
// Mesma blindagem dos favoritos: busca de TODOS os relays e adota a de created_at
// MAIS ALTO; ao publicar, preserva as outras tags e o content; toggle otimista.
import { useSyncExternalStore } from 'react'
import { relayManager } from '../services/relay-manager'
import { readRelays, writeRelays } from '../services/relays'
import type { EventTemplate, VerifiedEvent } from 'nostr-tools'
import type { Signer } from '../services/signer'

const nowSec = () => Math.floor(Date.now() / 1000)

interface Stored {
  pubkey: string
  created_at: number
  tags: string[][]
  content: string
}

export interface Nip51List {
  ensure(pubkey: string | null): void
  has(value: string): boolean
  values(): string[]
  toggle(signer: Signer, pubkey: string, value: string): Promise<boolean>
  useHas(value: string): boolean
}

export function createNip51List(kind: number, tag: string, lsKey: string): Nip51List {
  let owner: string | null = null
  let items = new Set<string>()
  let latestCreatedAt = 0
  let latestTags: string[][] = []
  let latestContent = ''
  const fetching = new Set<string>()
  const subs = new Set<() => void>()
  const notify = () => subs.forEach((c) => c())

  const readLocal = (pk: string): Stored | null => {
    try {
      const r = JSON.parse(localStorage.getItem(lsKey) || 'null') as Stored | null
      return r && r.pubkey === pk ? r : null
    } catch {
      return null
    }
  }
  const writeLocal = (l: Stored) => {
    try {
      localStorage.setItem(lsKey, JSON.stringify(l))
    } catch {
      /* quota */
    }
  }

  function adopt(l: Stored) {
    if (l.created_at < latestCreatedAt) return
    latestCreatedAt = l.created_at
    latestTags = l.tags
    latestContent = l.content
    items = new Set(l.tags.filter((t) => t[0] === tag && t[1]).map((t) => t[1]))
    owner = l.pubkey
    notify()
  }

  async function fetchList(pk: string) {
    const local = readLocal(pk)
    if (local) adopt(local)
    const relays = [...new Set([...readRelays(), ...writeRelays()])]
    const evs = await relayManager.query([{ kinds: [kind], authors: [pk], limit: 5 }], {
      relays,
      maxWait: 3500,
    })
    const best = evs.find((e) => e.kind === kind)
    if (best && best.created_at >= latestCreatedAt) {
      const l: Stored = { pubkey: pk, created_at: best.created_at, tags: best.tags, content: best.content }
      adopt(l)
      writeLocal(l)
    }
  }

  return {
    ensure(pk) {
      if (!pk) return
      if (owner !== pk) {
        owner = pk
        items = new Set()
        latestCreatedAt = 0
        latestTags = []
        latestContent = ''
        notify()
      }
      if (fetching.has(pk)) return
      fetching.add(pk)
      void fetchList(pk).finally(() => fetching.delete(pk))
    },
    has: (v) => items.has(v),
    values: () => [...items],
    async toggle(signer, pk, value) {
      const had = items.has(value)
      if (had) items.delete(value)
      else items.add(value)
      notify()
      try {
        const base = latestTags.filter((t) => !(t[0] === tag && t[1] === value))
        const tags = had ? base : [...base, [tag, value]]
        const created_at = Math.max(latestCreatedAt + 1, nowSec())
        const tmpl: EventTemplate = { kind, created_at, tags, content: latestContent }
        const ev: VerifiedEvent = await signer.signEvent(tmpl)
        await relayManager.publish(ev, writeRelays())
        const l: Stored = { pubkey: pk, created_at: ev.created_at, tags: ev.tags, content: ev.content }
        adopt(l)
        writeLocal(l)
        return !had
      } catch (e) {
        if (had) items.add(value)
        else items.delete(value)
        notify()
        throw e
      }
    },
    useHas(value) {
      return useSyncExternalStore(
        (c) => {
          subs.add(c)
          return () => subs.delete(c)
        },
        () => items.has(value),
        () => false,
      )
    },
  }
}
