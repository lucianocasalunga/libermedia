// Cache de perfil INSTANTÂNEO. Persistido em localStorage (aparece na hora ao
// reabrir) + busca em lote no /api/profiles/batch. O SERVIDOR é a única autoridade
// de resolução (cache + indexadores + NIP-65 em background) — o cliente nunca fala
// com relay p/ perfil. Store reativo (useSyncExternalStore) → componentes re-renderizam
// quando o nome/avatar chega. Resolve as npubs em qualquer lugar com só o hex.
import { useEffect, useSyncExternalStore } from 'react'
import { api } from './api'
import type { ProfileMap } from '../types/nostr'

export interface CachedProfile {
  name?: string
  display_name?: string
  picture?: string
  nip05?: string
  lud16?: string // endereço Lightning (Zap) — o cache antes DESCARTAVA isso → Zap dos
  lud06?: string // reels falhava ("sem endereço") mesmo com o autor tendo lud16.
  ts: number
}

// v2: passou a guardar lud16/lud06 → bump força re-fetch (cache antigo não os tinha).
const LS_KEY = 'libermedia_profiles_v2'
let store: Record<string, CachedProfile> = {}
let loaded = false
const subscribers = new Set<() => void>()
const inflight = new Set<string>()
const queue: string[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
// Cache NEGATIVO: pubkeys já tentadas (resolvidas OU não) ganham um cooldown. Sem isso,
// um perfil que não resolve (miss de cache+relay, ou 429) nunca entra no store → os
// componentes re-renderizam e re-pedem o mesmo a cada 150ms → ENXURRADA de
// /api/profiles/batch → 429 → estoura o rate-limit por IP (derruba carteira/lnurl junto).
const attempted = new Map<string, number>()
const ATTEMPT_TTL = 30 * 60 * 1000  // 30 min até re-tentar um que não resolveu (anti-flood: o feed
// fica MONTADO em segundo plano — keep-alive — então re-pedir perfil que não resolve a cada 5min
// virava um churn constante que sufocava o app inteiro, inclusive o mensageiro)
// PENDING: o servidor respondeu que está resolvendo o perfil em background (indexadores +
// relay do alvo). Em vez do cooldown de 5min, re-perguntamos rápido (poucas vezes) até o
// cache encher — aí o nome/avatar "aparece sozinho". Sem martelar: cap de tentativas.
const pendingTries = new Map<string, number>()
const PENDING_RETRY_MS = 12000
const PENDING_MAX_TRIES = 2
// Re-ask de pendentes em cadência controlada: UM timer só, acumulando o conjunto.
// (Antes, cada flush agendava seu próprio setTimeout + o re-render re-enfileirava os
// pendentes → ENXURRADA de /api/profiles/batch estourando o rate-limit 60/min.)
const pendingRetry = new Set<string>()
let retryTimer: ReturnType<typeof setTimeout> | null = null
function scheduleRetry() {
  if (retryTimer || !pendingRetry.size) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    const batch = [...pendingRetry]
    pendingRetry.clear()
    batch.forEach((h) => attempted.delete(h)) // libera só agora p/ re-perguntar
    if (batch.length) requestProfiles(batch)
  }, PENDING_RETRY_MS)
}
// true se a pubkey foi tentada há menos de ATTEMPT_TTL (cooldown anti-flood). Limpa expirados.
function recentlyAttempted(h: string): boolean {
  const t = attempted.get(h)
  if (t === undefined) return false
  if (Date.now() - t >= ATTEMPT_TTL) {
    attempted.delete(h)
    return false
  }
  return true
}

function load() {
  if (loaded) return
  try {
    store = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}
  } catch {
    store = {}
  }
  loaded = true
}
function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(store))
  } catch {
    /* quota — ignora */
  }
}
function notify() {
  subscribers.forEach((cb) => cb())
}

export function getProfile(hex: string): CachedProfile | undefined {
  load()
  return store[hex]
}

// Alimenta o cache com perfis já resolvidos (ex.: o feed já buscou) → evita o
// UserName/Mention re-buscarem o que já temos.
export function primeProfiles(map: ProfileMap) {
  load()
  const now = Date.now()
  let changed = false
  for (const [hex, p] of Object.entries(map)) {
    if (!store[hex] && (p.name || p.display_name || p.picture)) {
      store[hex] = {
        name: p.name,
        display_name: p.display_name,
        picture: p.picture,
        nip05: p.nip05,
        lud16: p.lud16,
        lud06: p.lud06,
        ts: now,
      }
      changed = true
    }
  }
  if (changed) {
    persist()
    notify()
  }
}

// Semeia/ATUALIZA à força um perfil (sobrescreve o existente — ao contrário do
// primeProfiles). Uso principal: o perfil PRÓPRIO no login (nome/avatar/nip05 já vêm de
// /api/me e NUNCA devem falhar/atrasar como um estranho). Tira do cooldown negativo.
export function seedProfile(hex: string | null | undefined, p: Partial<CachedProfile>) {
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) return
  if (!(p.name || p.display_name || p.picture || p.nip05 || p.lud16)) return
  load()
  attempted.delete(hex)
  const ex = store[hex]
  store[hex] = {
    name: p.name ?? ex?.name,
    display_name: p.display_name ?? ex?.display_name,
    picture: p.picture ?? ex?.picture,
    nip05: p.nip05 ?? ex?.nip05,
    lud16: p.lud16 ?? ex?.lud16,
    lud06: p.lud06 ?? ex?.lud06,
    ts: Date.now(),
  }
  persist()
  notify()
}

// Agenda a resolução (debounce 150ms) das pubkeys que faltam.
export function requestProfiles(hexes: (string | null | undefined)[]) {
  load()
  for (const h of hexes) {
    if (h && /^[0-9a-f]{64}$/i.test(h) && !store[h] && !inflight.has(h) && !queue.includes(h) && !recentlyAttempted(h)) {
      queue.push(h)
    }
  }
  if (queue.length && !flushTimer) flushTimer = setTimeout(flush, 400)
}

async function flush() {
  flushTimer = null
  const batch = queue.splice(0, 100)
  if (!batch.length) return
  batch.forEach((h) => inflight.add(h))
  let pending: string[] = []
  let failed = false
  try {
    const res = await api.post<{ profiles: ProfileMap; pending?: string[] }>('/api/profiles/batch', { pubkeys: batch })
    if (res.profiles) {
      const now = Date.now()
      for (const [hex, p] of Object.entries(res.profiles)) {
        store[hex] = {
          name: p.name,
          display_name: p.display_name,
          picture: p.picture,
          nip05: p.nip05,
          lud16: p.lud16,
          lud06: p.lud06,
          ts: now,
        }
      }
      persist()
      notify()
    }
    const got = new Set(Object.keys(res.profiles || {}))
    // PENDING = misses que o SERVIDOR está resolvendo em background (indexadores + NIP-65 do
    // alvo). O servidor é a ÚNICA autoridade de resolução de perfil — o cliente NÃO fala com
    // relay (não vaza o IP do usuário pros indexadores, não há tempestade de WS por dispositivo).
    // Re-perguntamos rápido (abaixo) até o cache do servidor encher e o nome/avatar aparecer.
    pending = (res.pending || []).filter((h) => !got.has(h))
  } catch {
    failed = true // rede/429 — NÃO é "perfil não existe"
  } finally {
    // Cooldown anti-flood: resolvido/desistido entra no cooldown de 30min. Os PENDING (servidor
    // resolvendo) NÃO entram no cooldown — re-perguntamos rápido até PENDING_MAX_TRIES, aí o
    // perfil "aparece sozinho" quando o cache do servidor enche.
    const t = Date.now()
    const pendingSet = new Set(pending)
    batch.forEach((h) => {
      if (failed) {
        // Erro de rede/429 ≠ "perfil não existe": JAMAIS condenar por 30min (um 429 apagava
        // 100 perfis por meia hora = "muitas vezes nem carregam"). Cooldown só até o retry
        // controlado (12s): o attempted evita re-enfileirar no re-render (anti-flood) e o
        // retryTimer limpa e re-pergunta. Não mexe em quem já resolveu.
        if (!store[h]) {
          attempted.set(h, t)
          pendingRetry.add(h)
        }
      } else if (pendingSet.has(h) && !store[h]) {
        const tries = (pendingTries.get(h) || 0) + 1
        if (tries <= PENDING_MAX_TRIES) {
          pendingTries.set(h, tries)
          // CRÍTICO p/ não floodar: pendente entra no cooldown enquanto espera, então
          // o re-render NÃO re-enfileira. Só o retryTimer (cadência controlada) re-pergunta.
          attempted.set(h, t)
          pendingRetry.add(h)
        } else {
          attempted.set(h, t)               // desistiu de esperar → cooldown normal
          pendingTries.delete(h)
        }
      } else {
        attempted.set(h, t)
        pendingTries.delete(h)
      }
      inflight.delete(h)
    })
    scheduleRetry()
    if (queue.length && !flushTimer) flushTimer = setTimeout(flush, 400)
  }
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb)
  return () => {
    subscribers.delete(cb)
  }
}

// Hook: perfil do cache (instantâneo) + dispara a busca em background se faltar.
export function useProfileCache(hex: string | null): CachedProfile | undefined {
  const snap = useSyncExternalStore(
    subscribe,
    () => (hex ? getProfile(hex) : undefined),
    () => undefined,
  )
  useEffect(() => {
    if (hex) requestProfiles([hex])
  }, [hex])
  return snap
}
