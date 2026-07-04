// Login Nostr (NIP-98 challenge-response, espelha o fluxo do MPA):
//  1. POST /api/auth/challenge → { challenge } (nonce na sessão Flask)
//  2. assina um evento kind:27235 com content=nonce (NIP-07 ou nsec)
//  3. POST /api/auth/verify { signed_event } → { success, npub }
import { finalizeEvent } from 'nostr-tools/pure'
import { nip19 } from 'nostr-tools'
import type { EventTemplate, VerifiedEvent } from 'nostr-tools'
import { api } from './api'
import { LS } from '../constants'
import { connectBunker } from './nip46'

async function challengeVerify(
  sign: (t: EventTemplate) => Promise<VerifiedEvent>,
): Promise<{ npub: string }> {
  const { challenge } = await api.post<{ challenge: string }>('/api/auth/challenge')
  const evt = await sign({
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: challenge,
  })
  const res = await api.post<{
    success?: boolean
    npub?: string
    user?: { npub?: string }
    error?: string
  }>('/api/auth/verify', { signed_event: evt })
  // O backend retorna o npub dentro de `user` (não no topo). Aceita ambos.
  const npub = res.npub ?? res.user?.npub
  if (!res.success || !npub) throw new Error(res.error || 'Falha na verificação')
  return { npub }
}

export async function loginWithNip07(): Promise<{ npub: string }> {
  const ext = window.nostr
  if (!ext?.signEvent) throw new Error('Nenhuma extensão Nostr (NIP-07) encontrada neste navegador.')
  const pubkey = await ext.getPublicKey()
  return challengeVerify((t) => ext.signEvent({ ...t, pubkey }))
}

// persist=false → sessão temporária: assina com a nsec só nesta sessão (memória),
// sem gravar no localStorage (bom para computador compartilhado).
export async function loginWithNsec(
  nsecInput: string,
  opts: { persist?: boolean } = {},
): Promise<{ npub: string }> {
  const raw = nsecInput.trim()
  const dec = nip19.decode(raw)
  if (dec.type !== 'nsec') throw new Error('nsec inválida (deve começar com nsec1).')
  const sk = dec.data
  const result = await challengeVerify(async (t) => finalizeEvent(t, sk))
  if (opts.persist !== false) {
    // Salva a nsec local (mesma convenção do MPA) para assinar posts/curtidas depois.
    localStorage.setItem(`libermedia_nsec_${result.npub}`, raw)
  } else {
    // Sessão temporária: só nesta aba, some ao fechar (bom p/ PC compartilhado).
    sessionStorage.setItem(`libermedia_nsec_${result.npub}`, raw)
  }
  localStorage.setItem(LS.npub, result.npub)
  localStorage.removeItem(LS.readonlyNpub) // deixou de ser só-leitura
  return result
}

// NIP-46 / bunker: conecta no assinador remoto e autentica a sessão Flask
// assinando o desafio remotamente. A chave do usuário nunca entra no navegador.
export async function loginWithBunker(input: string): Promise<{ npub: string }> {
  const { signer } = await connectBunker(input)
  const result = await challengeVerify((t) => signer.signEvent(t))
  localStorage.setItem(LS.npub, result.npub)
  localStorage.removeItem(LS.readonlyNpub)
  return result
}

// Somente leitura: identidade client-side (sem sessão Flask, sem assinar).
// Navega como o npub; ao tentar agir, o SignerModal pede um assinador real.
export function loginReadOnly(npubInput: string): { npub: string; pubkeyHex: string } {
  const raw = npubInput.trim()
  const dec = nip19.decode(raw)
  if (dec.type === 'npub') {
    const npub = raw
    localStorage.setItem(LS.readonlyNpub, npub)
    localStorage.setItem(LS.npub, npub)
    return { npub, pubkeyHex: dec.data }
  }
  if (dec.type === 'nprofile') {
    const npub = nip19.npubEncode(dec.data.pubkey)
    localStorage.setItem(LS.readonlyNpub, npub)
    localStorage.setItem(LS.npub, npub)
    return { npub, pubkeyHex: dec.data.pubkey }
  }
  throw new Error('npub inválido (deve começar com npub1).')
}
