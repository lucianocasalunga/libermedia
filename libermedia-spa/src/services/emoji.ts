// Reações por emoji (NIP-25). Fila do usuário: 1ª vez = sugestão padrão; depois,
// os 5 mais usados. Histórico LOCAL por ora (cross-device fica p/ depois — evita
// conflitar com a estrutura de emoji_freq do MPA).

// Sugestão padrão (1ª vez): coração, joinha + 3.
export const DEFAULT_REACTIONS = ['❤️', '👍', '😂', '😮', '🔥']

const FREQ_KEY = 'libermedia_emoji_freq'
const RECENT_KEY = 'libermedia_emoji_recent'

function readFreq(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(FREQ_KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// Registra o uso de um emoji (incrementa frequência + entra nos recentes).
// SÓ emoji nativo (pictográfico) — reagir/inserir com emoji CUSTOM (:shortcode:) NÃO entra
// na barra rápida (ela renderiza via Twemoji, que não conhece custom → mostraria as letras
// ":shortcode:"). Também barra codepoints crus. Evita poluir a quick-row.
export function recordEmoji(emoji: string): void {
  if (!emoji || !/\p{Extended_Pictographic}/u.test(emoji)) return
  const freq = readFreq()
  freq[emoji] = (freq[emoji] || 0) + 1
  localStorage.setItem(FREQ_KEY, JSON.stringify(freq))
  const recent = [emoji, ...readRecent().filter((e) => e !== emoji)].slice(0, 30)
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
}

// Uma chave do mapa de frequência pode estar em 2 formatos:
//  • SPA atual: a própria string do emoji ("❤️").
//  • LEGADO do MPA (herdado via localStorage na migração v2.0→v2.5): o CODEPOINT hex como
//    chave ("1f600", "1f1e7-1f1f7"), com os caracteres reais guardados à parte em freq['_map'].
// Sem normalizar, a aba Favoritos renderizava as CHAVES cruas → "números e letras"
// ("1f600", "_map"…) — era ESTE o bug, não a fonte. Devolve sempre o CARACTERE; null = descartar.
function freqKeyToEmoji(key: string, legacyMap: Record<string, string>): string | null {
  if (!key || key === '_map') return null
  if (/^[0-9a-f]+(-[0-9a-f]+)*$/i.test(key)) return legacyMap[key] || codeToEmoji(key)
  return key
}

// Força APRESENTAÇÃO EMOJI: símbolos BMP de 1 codepoint (❤ U+2764, ☀, ➡…) renderizam no
// estilo TEXTO (pequenos, colados à esquerda na baseline) sem o seletor U+FE0F. Os emojis
// astrais (👍 U+1F44D…) já são emoji. Aqui garantimos o FE0F nos BMP → todos alinham igual.
// (FE0F num codepoint que já é emoji é inofensivo.) Era a causa do ❤ "destoando" no picker.
function ensureEmojiPresentation(e: string): string {
  const cps = [...e]
  if (cps.length !== 1) return e // multi-codepoint (ZWJ, já com FE0F, pele…) → deixa
  const cp = cps[0].codePointAt(0) || 0
  return cp >= 0x2000 && cp <= 0x2bff ? e + '️' : e
}

// Emojis usados (mais → menos frequente), já normalizados e dedup. Tolera o legado do MPA.
function usedEmojis(): string[] {
  const freq = readFreq() as Record<string, unknown>
  const legacyMap =
    freq['_map'] && typeof freq['_map'] === 'object'
      ? (freq['_map'] as Record<string, string>)
      : {}
  const ordered = Object.entries(freq)
    .filter(([k, v]) => k !== '_map' && typeof v === 'number')
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .map(([k]) => {
      const e = freqKeyToEmoji(k, legacyMap)
      return e ? ensureEmojiPresentation(e) : null
    })
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of ordered) {
    // Só emoji nativo na barra rápida (Twemoji não renderiza custom/codepoint → viraria
    // "letras"). Filtro no READ limpa históricos JÁ poluídos (:shortcode:, "1f600"…).
    if (e && /\p{Extended_Pictographic}/u.test(e) && !seen.has(e)) {
      seen.add(e)
      out.push(e)
    }
  }
  return out
}

// Os N emojis mais usados; completa com a sugestão padrão sem repetir.
export function quickReactions(n = 5): string[] {
  const out = usedEmojis()
  for (const d of DEFAULT_REACTIONS) if (!out.includes(d)) out.push(d)
  return out.slice(0, n)
}

// Favoritos do usuário (TODOS por frequência) + SEMPRE os padrões (❤️👍😂😮🔥) ao final,
// sem repetir. Assim o coração e os reativos padrão nunca somem da aba Favoritos, mesmo
// depois que o usuário acumula histórico de outros emojis.
export function favoriteEmojis(): string[] {
  const out = usedEmojis()
  for (const d of DEFAULT_REACTIONS) if (!out.includes(d)) out.push(d)
  return out
}

// ── Dataset categorizado (estilo WhatsApp), reusado do v2.0 ──
export interface EmojiItem {
  e: string // caractere
  n: string // nome
  c: string // codepoint
}
export interface EmojiCategory {
  name: string
  icon: string // codepoint do ícone da aba
  emojis: EmojiItem[]
}

// Codepoint ('1f600' ou '1f1e7-1f1f7') → caractere.
export function codeToEmoji(code: string): string {
  try {
    return String.fromCodePoint(...code.split('-').map((h) => parseInt(h, 16)))
  } catch {
    return '❓'
  }
}

// Categoria CORAÇÕES (muito pedida) — não vem no dataset. Montada por codepoints (sem
// char invisível no código). Inserida no EmojiPicker logo após Favoritos.
const HEART_CODES = [
  '2764-fe0f', '1f9e1', '1f49b', '1f49a', '1f499', '1f49c', '1f5a4', '1f90d', '1f90e',
  '2764-fe0f-200d-1f525', '2764-fe0f-200d-1fa79', '1f494', '2763-fe0f', '1f495', '1f49e',
  '1f493', '1f497', '1f496', '1f498', '1f49d', '1f49f', '2665-fe0f', '1f48c',
]
export const HEARTS_CATEGORY: EmojiCategory = {
  name: 'Corações',
  icon: '2764-fe0f',
  emojis: HEART_CODES.map((c) => ({ e: codeToEmoji(c), n: 'coração', c })),
}

let _cats: EmojiCategory[] | null = null
let _loadingCats: Promise<EmojiCategory[]> | null = null
export function loadEmojiCategories(): Promise<EmojiCategory[]> {
  if (_cats) return Promise.resolve(_cats)
  if (!_loadingCats) {
    _loadingCats = fetch('/static/data/emoji-data.json')
      .then((r) => r.json())
      .then((d: { categories?: EmojiCategory[] }) => {
        _cats = d.categories ?? []
        return _cats
      })
      .catch(() => {
        _cats = []
        return _cats
      })
  }
  return _loadingCats
}

// content do kind:7 → emoji exibível. '+'/'' = like (coração), '-' = joinha p/ baixo.
export function normalizeReaction(content: string): string {
  const c = (content || '').trim()
  if (c === '' || c === '+') return '❤️'
  if (c === '-') return '👎'
  return c
}

// Conjunto amplo para o picker expandido (⋯).
export const EMOJI_SET: string[] = [
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❤️‍🔥',
  '👍', '👎', '👏', '🙌', '🙏', '🤝', '💪', '✊', '👊', '🤙',
  '😂', '🤣', '😅', '😊', '😍', '🥰', '😘', '😎', '🤩', '🥳',
  '😮', '😯', '😲', '🤯', '😱', '😳', '🥺', '😢', '😭', '😤',
  '😡', '🤬', '🤔', '🤨', '😏', '😬', '🙄', '😴', '🤮', '🥶',
  '🔥', '⚡', '💯', '✨', '🌟', '⭐', '💥', '🎉', '🎊', '🏆',
  '🚀', '💸', '💰', '🪙', '₿', '🟠', '💎', '🤝', '🫡', '🫶',
  '👀', '🧠', '💀', '👻', '🤖', '🦾', '🛡️', '⚔️', '🗝️', '🔑',
  '🌹', '🌈', '☀️', '🌙', '🍻', '☕', '🍕', '🍿', '🎵', '📌',
]
