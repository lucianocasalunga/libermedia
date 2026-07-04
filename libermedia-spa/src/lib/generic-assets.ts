// Avatares (100 SVG "neutros") e banners (49) genéricos do MPA, servidos por URL.
// Escolha DETERMINÍSTICA por seed (pubkey/npub) → cada usuário sempre recebe o
// mesmo genérico (parece estável/pessoal). REGRA: NUNCA o logo do LiberMedia em
// avatar ou banner de usuário — só estes genéricos.
function hashStr(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const N_AVATARS = 100
const N_BANNERS = 49

export function genericAvatar(seed: string): string {
  const n = (hashStr(seed || 'x') % N_AVATARS) + 1
  return `/static/img/avatars/neutro/avatar-${String(n).padStart(3, '0')}.svg`
}

export function genericBanner(seed: string): string {
  const n = (hashStr(seed || 'x') % N_BANNERS) + 1
  return `/static/img/banners/banner-${String(n).padStart(2, '0')}.jpg`
}
