// requireSigner — ponte entre uma ação que precisa assinar e o SignerModal.
// Fluxo: tenta getSigner(); se não houver assinador (modo leitura/visitante),
// abre o SignerModal (registrado pelo Layout), espera o usuário conectar um
// assinador real (extensão / bunker / nsec) e então re-resolve o signer.
import { getSigner, type Signer } from './signer'

type Resolver = (npub: string | null) => void
let opener: ((resolve: Resolver) => void) | null = null

// O SignerModal chama isto no mount para registrar como abrir o modal.
export function registerSignerModal(open: (resolve: Resolver) => void): () => void {
  opener = open
  return () => {
    if (opener === open) opener = null
  }
}

// Garante um assinador para o npub atual. Retorna null se o usuário cancelar
// ou se não houver modal montado (ex.: contexto sem UI).
export async function requireSigner(npub: string | null): Promise<Signer | null> {
  const existing = await getSigner(npub)
  if (existing) return existing
  if (!opener) return null
  const loggedNpub = await new Promise<string | null>((resolve) => opener!(resolve))
  if (!loggedNpub) return null
  return getSigner(loggedNpub)
}
