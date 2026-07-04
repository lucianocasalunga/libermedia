// Web of Trust PESSOAL — score de confiança por pubkey, baseado na rede social do
// usuário (anel 1 = quem ele segue / kind:3; anel 2 = follows-of-follows; reforço
// por co-follows). Substitui blocklist global (que bane) por ranking pessoal (que
// rebaixa). FASE 1 = MODO SOMBRA: só calcula e expõe; o feed NÃO é reordenado.
// Ligue o badge de debug no PostCard com  localStorage.wot_shadow = '1'.
import { useEffect, useState } from 'react'
import type { Event as NostrEvent } from 'nostr-tools'
import { relayManager } from './relay-manager'
import { readRelays } from './relays'
import { fetchContactList } from './follow'
import { mutes } from './mutes'
import { PREFS_LOADED_EVENT } from './user-prefs'

// Pesos (score 0-100): anel 1 = você segue · anel 2 = amigo de amigo · resto = desconhecido.
const RING1 = 80
const RING2 = 40
const UNKNOWN = 10
const REINFORCE_MAX = 20 // teto do reforço (co-follows). Mantém anel 2 sempre < anel 1.

// Estado em memória (preenchido por initWoT). foafCount: pubkey do anel 2 → quantos
// dos MEUS seguidos também o seguem (co-follows).
let myHexCur = ''
let myFollows = new Set<string>()
let foafCount = new Map<string, number>()
let ready = false

const subs = new Set<() => void>()
const notify = () => subs.forEach((c) => c())

export interface WotResult {
  score: number
  ring: 0 | 1 | 2 | 3
  label: string
}

// Score síncrono — usa o estado atual em memória + a mute list do usuário (sinal
// negativo mais forte). Enquanto o anel 2 não carregou, o fallback trata como
// desconhecido (o score sobe sozinho quando o background termina → notify).
export function wotScore(pubkey: string): WotResult {
  if (pubkey === myHexCur) return { score: 100, ring: 0, label: 'você' }
  if (mutes.has(pubkey)) return { score: 0, ring: 3, label: 'silenciado por você' }

  const n = myFollows.size
  // Cold start: rede pequena demais p/ ser representativa → não esconder o mundo.
  if (n === 0) return { score: 100, ring: 3, label: 'sem rede (WoT off)' }
  if (myFollows.has(pubkey)) return { score: RING1, ring: 1, label: 'você segue' }
  if (n < 4) return { score: 50, ring: 3, label: 'rede pequena' }

  const co = foafCount.get(pubkey) ?? 0
  const reinforce = co > 0 ? Math.min(1, Math.log2(1 + co) / Math.log2(1 + n)) * REINFORCE_MAX : 0

  if (foafCount.has(pubkey)) {
    return { score: Math.round(RING2 + reinforce), ring: 2, label: `amigo de ${co}` }
  }
  // Desconhecido. Boost no cold start "morno" (4-9 follows) p/ não esconder demais.
  const base = n <= 9 ? UNKNOWN + 20 : UNKNOWN
  return { score: Math.round(base + reinforce), ring: 3, label: 'desconhecido' }
}

export function wotReady(): boolean {
  return ready
}

// ---- Cache IndexedDB (mesmo padrão de dm-db) — evita re-buscar o anel 2 a cada sessão.
const DB_NAME = 'libermedia_wot_v1'
const DB_VERSION = 1
const STORE = 'foaf'
const TTL = 6 * 60 * 60 * 1000 // 6h

interface CacheRow {
  myHex: string
  follows: string[]
  foaf: [string, number][]
  ts: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'myHex' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function loadCache(myHex: string): Promise<CacheRow | null> {
  try {
    const d = await openDB()
    return await new Promise((resolve) => {
      const rq = d.transaction(STORE, 'readonly').objectStore(STORE).get(myHex)
      rq.onsuccess = () => resolve((rq.result as CacheRow) ?? null)
      rq.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

async function saveCache(row: CacheRow): Promise<void> {
  try {
    const d = await openDB()
    d.transaction(STORE, 'readwrite').objectStore(STORE).put(row)
  } catch {
    /* cache é best-effort */
  }
}

// Constrói o mapa de co-follows a partir dos kind:3 de um lote de seguidos.
function tallyFoaf(events: NostrEvent[], into: Map<string, number>): void {
  // 1 kind:3 por autor (o mais recente) — relays devolvem versões antigas também.
  const latestByAuthor = new Map<string, NostrEvent>()
  for (const e of events) {
    const prev = latestByAuthor.get(e.pubkey)
    if (!prev || e.created_at > prev.created_at) latestByAuthor.set(e.pubkey, e)
  }
  for (const e of latestByAuthor.values()) {
    for (const t of e.tags) {
      if (t[0] === 'p' && t[1] && t[1] !== myHexCur && !myFollows.has(t[1])) {
        into.set(t[1], (into.get(t[1]) ?? 0) + 1)
      }
    }
  }
}

let initInFlight: Promise<void> | null = null

// Carrega a rede de confiança do usuário. Anel 1 (kind:3 dele) é rápido; o anel 2
// (kind:3 dos seguidos) roda em lotes no fundo, atualizando o score incremental.
export function initWoT(myHex: string | null): Promise<void> {
  if (!myHex) return Promise.resolve()
  if (myHex === myHexCur && (ready || initInFlight)) return initInFlight ?? Promise.resolve()
  myHexCur = myHex
  ready = false
  initInFlight = (async () => {
    const cached = await loadCache(myHex)
    if (cached && Date.now() - cached.ts < TTL) {
      myFollows = new Set(cached.follows)
      foafCount = new Map(cached.foaf)
      ready = true
      notify()
      return
    }

    const cl = await fetchContactList(myHex)
    myFollows = new Set(cl.follows)
    foafCount = new Map()
    notify() // anel 1 já pontua

    const follows = cl.follows
    const fc = new Map<string, number>()
    const BATCH = 20
    for (let i = 0; i < follows.length; i += BATCH) {
      const chunk = follows.slice(i, i + BATCH)
      const evs = await relayManager.query([{ kinds: [3], authors: chunk }], {
        relays: readRelays(),
        maxWait: 4000,
      })
      tallyFoaf(evs, fc)
      foafCount = new Map(fc) // snapshot imutável p/ o hook reagir
      notify()
    }

    ready = true
    notify()
    await saveCache({ myHex, follows: [...myFollows], foaf: [...fc], ts: Date.now() })
  })()
  return initInFlight
}

// Hook reativo — re-renderiza quando o anel 2 termina de carregar (notify).
export function useWotScore(pubkey: string): WotResult {
  const [, force] = useState(0)
  useEffect(() => {
    const c = () => force((x) => x + 1)
    subs.add(c)
    return () => {
      subs.delete(c)
    }
  }, [])
  return wotScore(pubkey)
}

// Flag de modo sombra (badge de debug no PostCard). Liga/desliga pela URL
// (?wot_shadow=1 ou =0, persiste em localStorage) p/ não precisar do console no
// celular. Lido 1x no load.
function resolveShadow(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('wot_shadow')
    if (q === '1') localStorage.setItem('wot_shadow', '1')
    else if (q === '0') localStorage.removeItem('wot_shadow')
    return localStorage.getItem('wot_shadow') === '1'
  } catch {
    return false
  }
}
export const WOT_SHADOW = resolveShadow()

// ---- Preferência do usuário: MOSTRAR o selinho de pontuação no feed ----
// Opt-in, default DESLIGADO (a maioria não quer ver número/cor; quem quiser, liga
// em Configurações). Reativo: a toggle vale na hora, sem recarregar o app.
const WOT_SCORE_KEY = 'libermedia_wot_show_score'
let wotShowScore = (() => {
  try { return localStorage.getItem(WOT_SCORE_KEY) === '1' } catch { return false }
})()
const scoreSubs = new Set<() => void>()

export function getWotShowScore(): boolean {
  return wotShowScore
}
export function setWotShowScore(on: boolean): void {
  wotShowScore = on
  try {
    if (on) localStorage.setItem(WOT_SCORE_KEY, '1')
    else localStorage.removeItem(WOT_SCORE_KEY)
  } catch { /* localStorage indisponível — mantém em memória */ }
  scoreSubs.forEach((c) => c())
}
export function useWotShowScore(): boolean {
  const [, force] = useState(0)
  useEffect(() => {
    const c = () => force((x) => x + 1)
    scoreSubs.add(c)
    return () => { scoreSubs.delete(c) }
  }, [])
  return wotShowScore
}

// Cross-device: no login (ou em outro dispositivo) o loadPrefs puxa a pref do servidor
// e grava no localStorage; aqui re-lemos esse valor e avisamos o feed, sem reload. É o
// que faz a Pontuação de Confiança VOLTAR ligada após o logout (que limpa o localStorage).
function refreshWotShowScoreFromLS() {
  let next = false
  try { next = localStorage.getItem(WOT_SCORE_KEY) === '1' } catch { next = false }
  if (next === wotShowScore) return
  wotShowScore = next
  scoreSubs.forEach((c) => c())
}
if (typeof window !== 'undefined') {
  window.addEventListener(PREFS_LOADED_EVENT, refreshWotShowScoreFromLS)
}

// ---- FASE 2: APLICAÇÃO no feed de descoberta (não é mais só sombra) ----
// Abaixo deste score, o autor COLAPSA no feed de descoberta (com "mostrar mesmo
// assim"). Bot novo = ninguém da sua rede o segue = score 10 < 15 = some sozinho,
// SEM blocklist global. Só vale no feed de DESCOBERTA (home/busca/hashtag) — nunca
// em perfil/thread/favoritos (lá você abriu de propósito).
export const WOT_HIDE_BELOW = 15

// Liga a aplicação p/ TODOS os usuários. Ligado (ativo) — o desconhecido
// (score < 15) colapsa no feed de descoberta pra base inteira; amigo (80) e amigo-de-amigo
// (40–60) seguem visíveis. Cold-start protegido: rede < 4 = WoT off; 4–9 = desconhecido 30
// (não esconde). Reversível: voltar p/ false e redeployar. Complementado pela assinatura
// criminal (services/spam.ts) que pega o anúncio de droga mesmo quando o autor é foaf (48).
const WOT_APPLY_GLOBAL = true

// Opt-in por device (?wot_apply=1 liga, =0 desliga; persiste em localStorage). Lido 1x.
function resolveApply(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('wot_apply')
    if (q === '1') localStorage.setItem('wot_apply', '1')
    else if (q === '0') localStorage.removeItem('wot_apply')
    return localStorage.getItem('wot_apply') === '1'
  } catch {
    return false
  }
}
const WOT_APPLY_OPTIN = resolveApply()

// Operadores autorizados a ver o modo sombra (badge): admins do sistema. Mesmo com o
// flag ligado, o badge só aparece se o usuário LOGADO for um destes.
const WOT_OPERATORS = new Set([
  '9b31915dd140b34774cb60c42fc0e015d800cde7f5e4f82a5f2d4e21d72803e4', // admin operator
  '7743592826e561da7d40f109dbbdc66ac1b15eaf1335165dd11d42344ec75693', // system bot
])
export function isWotOperator(hex: string | null | undefined): boolean {
  return !!hex && WOT_OPERATORS.has(hex)
}

// A aplicação no feed está ativa p/ este usuário? Global OU opt-in OU operador.
export function wotApplyActive(myHex?: string | null): boolean {
  return WOT_APPLY_GLOBAL || WOT_APPLY_OPTIN || isWotOperator(myHex)
}
