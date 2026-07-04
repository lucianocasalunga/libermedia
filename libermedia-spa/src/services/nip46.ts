// NIP-46 — assinador remoto (bunker / nostr connect). A chave privada mora num
// app separado (Amber, nsec-bunker, etc); cada assinatura é aprovada lá. A nsec
// NUNCA toca este navegador — só trafega o par efêmero cliente↔bunker.
//
// Persistência: salvamos a clientSecretKey (par efêmero deste device) + o
// BunkerPointer + o pubkey resolvido em localStorage, para reconstruir a sessão
// após reload sem precisar reconectar pelo bunker:// de novo.
import { BunkerSigner, parseBunkerInput, type BunkerPointer } from 'nostr-tools/nip46'
import { generateSecretKey } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import { nip19 } from 'nostr-tools'
import type { EventTemplate, VerifiedEvent } from 'nostr-tools'
import type { Signer } from './signer'

// Pool dedicado aos canais NIP-46 (separado do relayManager do feed).
const pool = new SimplePool()

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
const unhex = (h: string) => new Uint8Array(h.match(/.{1,2}/g)?.map((x) => parseInt(x, 16)) ?? [])

interface StoredBunker {
  clientSk: string // hex do par efêmero deste device
  bp: BunkerPointer // relays + pubkey do bunker + secret (one-time)
  pubkey: string // hex da chave pública REAL do usuário (resolvida no connect)
}

const key = (npub: string) => `libermedia_bunker_${npub}`

function save(npub: string, data: StoredBunker) {
  localStorage.setItem(key(npub), JSON.stringify(data))
}
function load(npub: string): StoredBunker | null {
  const raw = localStorage.getItem(key(npub))
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredBunker
  } catch {
    return null
  }
}
export function forgetBunker(npub: string) {
  localStorage.removeItem(key(npub))
}

// Embrulha um BunkerSigner no nosso contrato Signer, com connect preguiçoso
// (só conecta de fato na primeira assinatura) e pubkey já resolvido.
function wrap(bunker: BunkerSigner, pubkey: string): Signer {
  let connected = false
  const ensure = async () => {
    if (!connected) {
      await bunker.connect()
      connected = true
    }
  }
  return {
    pubkey,
    signEvent: async (t: EventTemplate): Promise<VerifiedEvent> => {
      await ensure()
      return bunker.signEvent(t)
    },
    nip44Encrypt: async (peerHex: string, plaintext: string): Promise<string> => {
      await ensure()
      return bunker.nip44Encrypt(peerHex, plaintext)
    },
    nip44Decrypt: async (peerHex: string, ciphertext: string): Promise<string> => {
      await ensure()
      return bunker.nip44Decrypt(peerHex, ciphertext)
    },
  }
}

// Conecta a um bunker via string `bunker://...` ou NIP-05 (name@domain).
// Resolve o pubkey REAL, persiste a sessão e devolve o signer + identidade.
export async function connectBunker(
  input: string,
): Promise<{ signer: Signer; pubkey: string; npub: string }> {
  const bp = await parseBunkerInput(input.trim())
  if (!bp) throw new Error('Endereço de bunker inválido (esperado bunker://… ou nome@dominio).')

  const clientSk = generateSecretKey()
  const bunker = BunkerSigner.fromBunker(clientSk, bp, {
    pool,
    onauth: (url) => {
      // Alguns bunkers pedem aprovação via página web — abre numa aba.
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  })
  await bunker.connect()
  const pubkey = await bunker.getPublicKey()
  const npub = nip19.npubEncode(pubkey)

  save(npub, { clientSk: hex(clientSk), bp, pubkey })
  return { signer: wrap(bunker, pubkey), pubkey, npub }
}

// Reconstrói o signer NIP-46 salvo (após reload). Não conecta ainda — o wrap
// conecta na primeira assinatura. Retorna null se não houver sessão salva.
export function restoreBunker(npub: string): Signer | null {
  const data = load(npub)
  if (!data?.clientSk || !data.bp || !data.pubkey) return null
  try {
    const bunker = BunkerSigner.fromBunker(unhex(data.clientSk), data.bp, {
      pool,
      onauth: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
    })
    return wrap(bunker, data.pubkey)
  } catch {
    return null
  }
}
