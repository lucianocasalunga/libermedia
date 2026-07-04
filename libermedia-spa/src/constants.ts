// Constantes globais do LiberMedia SPA — Fase 0

// LibrePool (pool.libernet.app) ELIMINADO em 26/Jun: o agregador travava TODAS as
// queries — nunca enviava EOSE → cada leitura (notificações/DMs/perfil/thread) esperava
// o timeout de 4s. Voltamos ao modelo padrão (conectar direto nos nossos relays sãos),
// igual ao Jumble/Damus/Amethyst. Nossos relays respondem em ~450ms.
export const DEFAULT_RELAYS = ['wss://nexus.libernet.app', 'wss://relay.libernet.app']

// Fallback público.
export const FALLBACK_RELAYS = [
  'wss://nexus.libernet.app',
  'wss://relay.libernet.app',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
]

// Chaves de localStorage (compartilhadas com o app Flask — não renomear).
export const LS = {
  theme: 'libermedia_theme',
  npub: 'libermedia_npub',
  lang: 'libermedia_lang',
  readonlyNpub: 'libermedia_readonly_npub', // identidade só-leitura (sem sessão Flask)
  relays: 'libermedia_relays', // lista de relays do usuário (fonte da verdade)
} as const

// Temas — definições na FONTE ÚNICA compartilhada (sincronizada p/ a LiberWallet).
export { THEMES, DEFAULT_THEME } from './lib/theme-defs'
export type { ThemeId } from './lib/theme-defs'

// Base do router — DERIVA do base do Vite (import.meta.env.BASE_URL).
// build base '/v2.5/' → basename '/v2.5'; build com --base=/ → basename '/'.
// Assim a MESMA fonte serve /v2.5 e a raiz, sem hardcode.
export const ROUTER_BASENAME = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/'
