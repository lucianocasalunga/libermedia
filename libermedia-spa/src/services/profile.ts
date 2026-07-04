// Publica o perfil (kind:0) — espelha o /editar-perfil do MPA (publica kind:0 real).
import { relayManager } from './relay-manager'
import { writeRelays } from './relays'
import { api } from './api'
import type { Signer } from './signer'
import type { Profile, ProfileLink } from '../types/nostr'

// Checa disponibilidade do NIP-05 (username@libernet.app) no nosso DB. O backend
// devolve {available, message}; "já é seu" também conta como disponível.
export async function checkNip05(username: string): Promise<{ available: boolean; message: string }> {
  try {
    const r = await api.post<{ available?: boolean; message?: string; error?: string }>(
      '/api/nip05/check',
      { username },
    )
    return { available: !!r.available, message: r.message || r.error || '' }
  } catch (e) {
    return { available: false, message: e instanceof Error ? e.message : 'Falha ao checar' }
  }
}

// REGISTRA o NIP-05 no nosso servidor (grava nip05_identifier + verified no DB e
// cria/atualiza a carteira Lightning p/ username@libernet.app). É isto que torna o
// NIP-05 válido no /.well-known/nostr.json — só publicar no kind:0 não basta.
export async function requestNip05(username: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await api.post('/api/nip05/request', { username })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao registrar o NIP-05' }
  }
}


export type ProfileForm = Pick<
  Profile,
  'name' | 'display_name' | 'about' | 'picture' | 'banner' | 'nip05' | 'lud16'
> & {
  // Links nomeados (estilo YouTube). O 1º vira `website` (interop NIP-01); a lista
  // completa vai no campo custom `links` do kind:0.
  links?: ProfileLink[]
}

export async function publishProfile(signer: Signer, data: ProfileForm): Promise<void> {
  // Campos string simples — remove vazios para não poluir o kind:0.
  const content: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (k === 'links') continue
    if (typeof v === 'string' && v.trim()) content[k] = v.trim()
  }
  // Links: normaliza (descarta sem URL), grava em `links[]` + espelha o 1º no `website`
  // (clientes que não leem `links` veem ao menos o principal).
  const links = (data.links ?? [])
    .map((l) => ({ title: (l.title || '').trim(), url: (l.url || '').trim() }))
    .filter((l) => l.url)
  if (links.length) {
    content.links = links
    content.website = links[0].url
  }
  const ev = await signer.signEvent({
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(content),
  })
  await relayManager.publish(ev, writeRelays())

  // Atualiza o cache local usado pela sidebar/compose (mesma convenção do MPA).
  try {
    const npub = localStorage.getItem('libermedia_npub')
    if (npub) {
      const pic = content.picture as string | undefined
      const dn = (content.display_name || content.name) as string | undefined
      if (pic) localStorage.setItem(`${npub}_avatar`, pic)
      if (dn) localStorage.setItem(`${npub}_display_name`, dn)
    }
  } catch {
    /* noop */
  }
}
