// Signer — assina eventos Nostr. Ordem de resolução (espelha o modelo do MPA +
// assinador remoto):
//  1. nsec salva em localStorage `libermedia_nsec_${npub}` (mobile/TWA) → finalizeEvent
//  2. NIP-46 / bunker salvo (`libermedia_bunker_${npub}`) → assinatura remota
//  3. extensão NIP-07 `window.nostr` (desktop)
// SEGURANÇA: nsec/chave nunca saem do dispositivo (nsec local) ou nem chegam a ele
// (bunker/NIP-07). Read-only (npub sem nenhum dos acima) → getSigner retorna null.
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { nip19, nip44 } from 'nostr-tools'
import type { EventTemplate, VerifiedEvent } from 'nostr-tools'
import { restoreBunker } from './nip46'

interface Nip07 {
  getPublicKey(): Promise<string>
  signEvent(event: EventTemplate & { pubkey?: string }): Promise<VerifiedEvent>
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>
    decrypt(pubkey: string, ciphertext: string): Promise<string>
  }
}
declare global {
  interface Window {
    nostr?: Nip07
  }
}

// Contrato do assinador. signEvent é universal; nip44Encrypt/Decrypt são o que
// o NIP-17 (DMs) precisa — implementados pelos 3 caminhos (nsec local, NIP-07,
// bunker NIP-46). A chave nunca sai do device (nsec) ou nem chega (NIP-07/bunker).
export interface Signer {
  pubkey: string // hex
  signEvent(t: EventTemplate): Promise<VerifiedEvent>
  nip44Encrypt(peerHex: string, plaintext: string): Promise<string>
  nip44Decrypt(peerHex: string, ciphertext: string): Promise<string>
}

export async function getSigner(npub: string | null): Promise<Signer | null> {
  // 1. nsec salva associada ao npub logado (localStorage = persistente;
  //    sessionStorage = sessão temporária "só nesta aba")
  if (npub) {
    const nsec =
      localStorage.getItem(`libermedia_nsec_${npub}`) ??
      sessionStorage.getItem(`libermedia_nsec_${npub}`)
    if (nsec?.startsWith('nsec1')) {
      try {
        const dec = nip19.decode(nsec)
        if (dec.type === 'nsec') {
          const sk = dec.data
          // Chave de conversa NIP-44 é cacheada por peer (derivação é cara).
          const ckCache = new Map<string, Uint8Array>()
          const ck = (peerHex: string) => {
            let k = ckCache.get(peerHex)
            if (!k) {
              k = nip44.v2.utils.getConversationKey(sk, peerHex)
              ckCache.set(peerHex, k)
            }
            return k
          }
          return {
            pubkey: getPublicKey(sk),
            signEvent: async (t) => finalizeEvent(t, sk),
            nip44Encrypt: async (peerHex, plaintext) => nip44.v2.encrypt(plaintext, ck(peerHex)),
            nip44Decrypt: async (peerHex, ciphertext) => nip44.v2.decrypt(ciphertext, ck(peerHex)),
          }
        }
      } catch {
        /* nsec malformada — tenta NIP-07 */
      }
    }
  }

  // 2. NIP-46 / bunker salvo para este npub (assinatura remota)
  if (npub) {
    const bunker = restoreBunker(npub)
    if (bunker) return bunker
  }

  // 3. extensão NIP-07
  const ext = window.nostr
  if (ext?.signEvent) {
    try {
      const pubkey = await ext.getPublicKey()
      return {
        pubkey,
        signEvent: (t) => ext.signEvent({ ...t, pubkey }),
        nip44Encrypt: async (peerHex, plaintext) => {
          if (!ext.nip44) throw new Error('Sua extensão Nostr não suporta NIP-44 (necessário p/ DMs).')
          return ext.nip44.encrypt(peerHex, plaintext)
        },
        nip44Decrypt: async (peerHex, ciphertext) => {
          if (!ext.nip44) throw new Error('Sua extensão Nostr não suporta NIP-44 (necessário p/ DMs).')
          return ext.nip44.decrypt(peerHex, ciphertext)
        },
      }
    } catch {
      /* usuário recusou ou extensão indisponível */
    }
  }

  return null
}
