// Definições de TEMA — FONTE ÚNICA compartilhada (LiberMedia ↔ LiberWallet).
// A LiberWallet sincroniza este arquivo + styles/themes.css no prebuild
// (scripts/sync-radar.sh). Atualizar aqui reflete nos DOIS apps.
export const THEMES = [
  { id: 'theme-noite', label: 'Noite', dark: true },
  { id: 'theme-abismo', label: 'Abismo', dark: true },
  { id: 'theme-penumbra', label: 'Penumbra', dark: true },
  { id: 'theme-bruma', label: 'Bruma', dark: false },
  { id: 'theme-neve', label: 'Neve', dark: false },
  { id: 'theme-areia', label: 'Areia', dark: false },
] as const

export type ThemeId = (typeof THEMES)[number]['id']
export const DEFAULT_THEME: ThemeId = 'theme-noite'
