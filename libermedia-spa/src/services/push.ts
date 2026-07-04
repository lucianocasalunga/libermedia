// Web Push (Fase 4) — inscreve o device p/ receber o "acorda" opaco do servidor
// (sender-ping). A notificação é genérica (E2E: servidor não vê remetente/conteúdo).
// iOS: só funciona em PWA INSTALADO na tela inicial (16.4+).
import { nip19 } from 'nostr-tools'
import { api } from './api'

export type SocialPushType = 'reaction' | 'repost' | 'zap' | 'reply' | 'mention'

// Sender-ping SOCIAL: quem FAZ a ação (curtir/repostar/zap/responder/mencionar) avisa o
// servidor p/ empurrar o ALVO — recebe a notificação com o app FECHADO. Fire-and-forget:
// NUNCA bloqueia nem quebra a ação. O backend monta o texto (genérico), respeita o
// push_social do alvo e não notifica o próprio autor.
export function notifySocial(targetHexOrNpub: string, type: SocialPushType): void {
  try {
    let npub = targetHexOrNpub
    if (/^[0-9a-f]{64}$/i.test(npub)) {
      try {
        npub = nip19.npubEncode(npub)
      } catch {
        return
      }
    }
    if (!npub.startsWith('npub1')) return
    void api.post('/api/push/social/notify', { target: npub, type }).catch(() => {})
  } catch {
    /* telemetria de push não pode quebrar a ação */
  }
}

function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export type PushState = 'unsupported' | 'denied' | 'default' | 'granted-on' | 'granted-off'

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export async function pushStatus(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'default') return 'default'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub ? 'granted-on' : 'granted-off'
  } catch {
    return 'granted-off'
  }
}

export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('Notificações não suportadas neste dispositivo.')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Permissão de notificação negada.')
  const { public_key } = await api.get<{ public_key: string }>('/api/dm/push/vapid')
  if (!public_key) throw new Error('Servidor sem chave VAPID configurada.')
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(public_key) as BufferSource,
    })
  }
  await api.post('/api/dm/push/subscribe', { subscription: sub.toJSON() })
}

export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
  } catch {
    /* noop — a inscrição morta é podada no servidor no próximo envio */
  }
}

// Sender-ping: avisa o servidor que enviei DM p/ `peerNpub` → ele empurra o peer.
export async function notifyPeer(peerNpub: string): Promise<void> {
  try {
    await api.post('/api/dm/push/notify', { peer: peerNpub })
  } catch {
    /* best-effort: se falhar, o peer ainda recebe ao abrir (poll) */
  }
}

// Fecha as notificações de DM do SISTEMA (tag 'lm-dm') quando o usuário LÊ no app —
// "viu a mensagem → some a notificação". Best-effort (sem SW/permissão = no-op).
export async function clearDmNotifications(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.ready
    const notifs = await reg.getNotifications({ tag: 'lm-dm' })
    notifs.forEach((n) => n.close())
  } catch {
    /* noop */
  }
}
