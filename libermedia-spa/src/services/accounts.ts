// Multi-conta — espelha o static/js/multi-account.js do MPA.
// Lista de contas em `libermedia_accounts` (JSON [{npub, pubkey}]); a nsec de
// cada conta fica em `libermedia_nsec_${npub}` (mesma convenção do signer).
//
// SEGURANÇA: a troca faz logout ANTES de re-autenticar. Com a sessão Flask
// vazia, o userGuard (que limpa o localStorage quando sessão≠stored) sai cedo
// e NÃO apaga as nsec das outras contas. Só então re-logamos com a nova nsec
// (challenge-response), deixando sessão=stored novamente.
import { api } from './api'
import { loginWithNsec } from './login'

export interface Account {
  npub: string
  pubkey: string
}

const KEY = 'libermedia_accounts'

export function getAccounts(): Account[] {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function save(arr: Account[]) {
  localStorage.setItem(KEY, JSON.stringify(arr))
}

/** Registra a conta logada na lista (idempotente). */
export function registerCurrent(npub: string | null, pubkey: string | null): void {
  if (!npub || !pubkey) return
  const list = getAccounts()
  if (!list.find((c) => c.npub === npub)) {
    list.push({ npub, pubkey })
    save(list)
  }
}

export function hasNsec(npub: string): boolean {
  return !!localStorage.getItem(`libermedia_nsec_${npub}`)
}

/**
 * Troca para outra conta salva. Requer a nsec local da conta-alvo.
 * Faz logout → re-login com a nova nsec → reload limpo.
 */
export async function switchAccount(npub: string): Promise<void> {
  const nsec = localStorage.getItem(`libermedia_nsec_${npub}`)
  if (!nsec) {
    throw new Error('Chave privada não encontrada para essa conta. Faça login novamente.')
  }
  await api.post('/api/auth/logout').catch(() => {})
  sessionStorage.clear()
  await loginWithNsec(nsec) // grava libermedia_npub + nsec_<npub>, sessão = nova conta
  window.location.reload()
}

/**
 * Adiciona uma conta nova: guarda a atual na lista, encerra a sessão e leva
 * ao /login (NIP-07 ou nsec). Ao logar, registerCurrent re-registra.
 */
export async function addAccount(): Promise<void> {
  await api.post('/api/auth/logout').catch(() => {})
  sessionStorage.clear()
  window.location.assign(`${import.meta.env.BASE_URL}login`)
}
