// Presença ONLINE dos usuários (áurea verde no avatar).
//
// ESTADO ATUAL: só o bot do sistema é tratado como SEMPRE online. O real-time (heartbeat
// efêmero kind:20000 publish/subscribe) será ligado numa próxima etapa — quando entrar,
// alimenta `onlineStore` e o `isOnline`/`useOnline` já refletem (API pronta, sem mexer na UI).
import { useSyncExternalStore } from 'react'
import { relayManager } from './relay-manager'
import { api } from './api'
import type { Signer } from './signer'

// Bot do sistema (mensageiro). Sempre online.
export const SOFIA_HEX = '7743592826e561da7d40f109dbbdc66ac1b15eaf1335165dd11d42344ec75693'

// Pubkeys vistas online recentemente (preenchido pelo real-time — vazio por ora).
const onlineStore = new Set<string>()
const subscribers = new Set<() => void>()
function notify() {
  subscribers.forEach((cb) => cb())
}

// Marca/atualiza presença (chamado pelo real-time futuro). expira sozinho lá.
export function setOnline(hex: string, online: boolean): void {
  const had = onlineStore.has(hex)
  if (online) onlineStore.add(hex)
  else onlineStore.delete(hex)
  if (had !== online) notify()
}

export function isOnline(hex: string | null | undefined): boolean {
  if (!hex) return false
  return hex === SOFIA_HEX || onlineStore.has(hex)
}

// Hook reativo: re-renderiza quando a presença daquele hex muda.
export function useOnline(hex: string | null | undefined): boolean {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
    () => isOnline(hex),
    () => isOnline(hex),
  )
}

// ───────────────────────────────────────────────────────────────────────────
// FONTE 1 — Nostr: heartbeat efêmero (kind:20000). O relay NÃO guarda, só repassa
// a quem está inscrito → presença ao vivo. Publico a minha (se "Aparecer online"
// ligado) e assino a dos contatos. TTL: offline se não vier batida em ~90s.
// ───────────────────────────────────────────────────────────────────────────
const PRESENCE_KIND = 20000
const HEARTBEAT_MS = 30_000
const ONLINE_TTL_MS = 90_000
const lastSeen = new Map<string, number>() // hex → ts (ms) da última batida

let _hbTimer: ReturnType<typeof setInterval> | null = null
let _gcTimer: ReturnType<typeof setInterval> | null = null
let _liveSub: { close: () => void } | null = null

function gc() {
  const now = Date.now()
  for (const [hex, ts] of lastSeen) {
    if (now - ts > ONLINE_TTL_MS) {
      lastSeen.delete(hex)
      setOnline(hex, false)
    }
  }
}

// Publica a MINHA presença periodicamente (só enquanto `enabled()` = pref "Aparecer online").
export function startHeartbeat(signer: () => Promise<Signer | null>, enabled: () => boolean) {
  stopHeartbeat()
  const beat = async () => {
    if (!enabled()) return
    try {
      const sg = await signer()
      if (!sg) return
      const ev = await sg.signEvent({ kind: PRESENCE_KIND, created_at: Math.floor(Date.now() / 1000), tags: [], content: '' })
      await relayManager.publish(ev).catch(() => {}) // best-effort (efêmero)
    } catch {
      /* sem signer/rede — tenta no próximo */
    }
  }
  void beat()
  _hbTimer = setInterval(() => void beat(), HEARTBEAT_MS)
  _gcTimer = setInterval(gc, HEARTBEAT_MS)
}

export function stopHeartbeat() {
  if (_hbTimer) clearInterval(_hbTimer)
  if (_gcTimer) clearInterval(_gcTimer)
  _hbTimer = _gcTimer = null
}

// (Re)assina a presença dos contatos (hexes). Cada batida → online + renova o TTL.
export function watchPeers(peers: string[]) {
  _liveSub?.close()
  _liveSub = null
  if (!peers.length) return
  _liveSub = relayManager.subscribe(
    [{ kinds: [PRESENCE_KIND], authors: peers, since: Math.floor(Date.now() / 1000) - 90 }],
    (ev) => {
      lastSeen.set(ev.pubkey, Date.now())
      setOnline(ev.pubkey, true)
    },
  )
}

export function unwatchPeers() {
  _liveSub?.close()
  _liveSub = null
}

// ───────────────────────────────────────────────────────────────────────────
// FONTE 2 — nosso SERVIDOR: quem está logado/ativo (last_active <90s) E com a pref
// "Aparecer online" ligada. UNIÃO com a fonte Nostr via `lastSeen` (renova o TTL).
// Só ADICIONA presença — o gc() é quem expira; não desliga quem a fonte Nostr marcou.
// ───────────────────────────────────────────────────────────────────────────
export async function pollServerPresence(peers: string[]) {
  if (!peers.length) return
  try {
    const r = await api.post<{ online?: string[] }>('/api/dm/presence', { pubkeys: peers })
    const now = Date.now()
    for (const hex of r.online || []) {
      lastSeen.set(hex, now)
      setOnline(hex, true)
    }
  } catch {
    /* rede — tenta no próximo ciclo */
  }
}
