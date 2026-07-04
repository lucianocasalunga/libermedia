// Auto-aceite de badge (sem botão "aceitar"). Publica o kind:30008 (profile_badges)
// do usuário INCLUINDO a badge LiberMedia — assim a badge entra no perfil dele em
// qualquer cliente Nostr, automaticamente. Assinado pela CHAVE DO USUÁRIO (o kind:30008
// cola no perfil dele; não pode ser a chave do sistema). Mescla com as badges que ele
// já tinha (não sobrescreve). Idempotente (flag local por award).
//
// Gatilhos: (1) no login, silencioso, só p/ quem tem nsec no aparelho (não dá popup);
// (2) ao salvar o perfil (editar-perfil), p/ NIP-07/bunker (já há assinatura no ato).
import { relayManager } from './relay-manager'
import { writeRelays, readRelays } from './relays'
import { api } from './api'
import type { Signer } from './signer'

interface MyBadge {
  has_badge?: boolean
  issuer_pubkey?: string
  badge_id?: string // ex: "libermedia-green"
  badge_award_event_id?: string | null
}

const acceptedFlag = (award: string) => `libermedia_badge_accepted_${award}`

// Existe nsec no aparelho para este npub? (assinatura silenciosa, sem popup)
export function hasLocalNsec(npub: string | null): boolean {
  if (!npub) return false
  return !!(
    localStorage.getItem(`libermedia_nsec_${npub}`) ||
    sessionStorage.getItem(`libermedia_nsec_${npub}`)
  )
}

// Publica/atualiza o kind:30008 do usuário incluindo a badge LiberMedia.
// Retorna true se publicou; false se nada a fazer (sem badge, já presente, erro).
export async function autoPublishBadge(signer: Signer, hex: string | null): Promise<boolean> {
  if (!signer || !hex) return false

  let mb: MyBadge
  try {
    mb = await api.get<MyBadge>('/api/badges/my-badges')
  } catch {
    return false
  }
  if (!mb?.has_badge) return false
  const { issuer_pubkey: issuer, badge_id: dtag, badge_award_event_id: award } = mb
  if (!issuer || !dtag || !award) return false

  const coord = `30009:${issuer}:${dtag}`

  // Idempotência local: já publicamos exatamente este award neste aparelho?
  if (localStorage.getItem(acceptedFlag(award))) return false

  // kind:30008 atual do usuário (para MESCLAR — não apagar outras badges).
  const existing = await relayManager.query(
    [{ kinds: [30008], authors: [hex], '#d': ['profile_badges'], limit: 1 }],
    { relays: readRelays(), maxWait: 4000 },
  )
  const latest = existing.sort((a, b) => b.created_at - a.created_at)[0]

  // Coleta os pares (a, e) já existentes.
  const prev = latest?.tags ?? []
  const pairs: { a: string[]; e?: string[] }[] = []
  for (let i = 0; i < prev.length; i++) {
    if (prev[i][0] === 'a') {
      const e = prev[i + 1]?.[0] === 'e' ? prev[i + 1] : undefined
      pairs.push({ a: prev[i], e })
      if (e) i++
    }
  }

  // Já tem a nossa badge com o award certo → só marca a flag e sai.
  if (pairs.some((p) => p.a[1] === coord && p.e?.[1] === award)) {
    localStorage.setItem(acceptedFlag(award), '1')
    return false
  }

  // Monta o novo 30008: preserva as outras badges, remove versão antiga da nossa
  // (mesmo coord) e adiciona a nossa atualizada.
  const tags: string[][] = [['d', 'profile_badges']]
  for (const p of pairs.filter((p) => p.a[1] !== coord)) {
    tags.push(p.a)
    if (p.e) tags.push(p.e)
  }
  tags.push(['a', coord])
  tags.push(['e', award, writeRelays()[0] || ''])

  let ev
  try {
    ev = await signer.signEvent({
      kind: 30008,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: '',
    })
    await relayManager.publish(ev, writeRelays())
  } catch {
    return false // usuário cancelou a assinatura (NIP-07/bunker) ou falha de rede
  }

  // Registra no sistema (badge_profile_event_id) — best-effort (já está nos relays).
  try {
    await api.post('/api/badges/accept', { signed_event: ev })
  } catch {
    /* publicado nos relays de qualquer forma */
  }

  localStorage.setItem(acceptedFlag(award), '1')
  return true
}
