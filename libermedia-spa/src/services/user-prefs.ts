// UserPrefs — sincroniza as preferências do usuário com o backend (cross-device).
// Porte fiel do static/js/user-prefs.js do MPA. As prefs ficam no banco
// (tabela user_settings, via GET/PUT /api/user/settings) e o localStorage é só
// cache: SERVIDOR = fonte da verdade. No login, loadPrefs() puxa do servidor e
// grava no localStorage; quando o usuário muda algo, a página chama syncPref().
//
// Diferença do MPA: aqui NÃO recarregamos a página. Após gravar o localStorage,
// disparamos o evento `libermedia:prefs-loaded` para os providers re-lerem.
//
// Relays NÃO entram aqui de propósito: a página /relays já sincroniza cross-device
// via NIP-65 (kind:10002) na rede — misturar as duas fontes criaria conflito.
import { api } from './api'
import { THEMES } from '../constants'

export const PREFS_LOADED_EVENT = 'libermedia:prefs-loaded'

interface Codec {
  // valor vindo do servidor → string do localStorage
  toLS: (v: unknown) => string
  // string do localStorage → valor enviado ao servidor (PUT)
  toServer: (raw: string) => unknown
}

// Booleano guardado como '1'/'0' no localStorage (compat. com o resto do app),
// mas como boolean no servidor (compat. com o MPA).
const boolCodec: Codec = {
  toLS: (v) => (v === true || v === 'true' || v === '1' || v === 1 ? '1' : '0'),
  toServer: (raw) => raw === '1',
}

// String simples (tema, idioma, etc.) — guardada igual nos dois lados.
const strCodec: Codec = {
  toLS: (v) => String(v),
  toServer: (raw) => raw,
}

interface PrefEntry {
  backendKey: string
  lsKey: string
  codec: Codec
}

// Mapa chave-backend ↔ chave-localStorage. Adicionar uma linha aqui é tudo o que
// precisa para sincronizar uma nova preferência conforme as páginas nascerem
// (wallpaper do mensageiro, emoji, acessibilidade, carteira, etc.).
const KEY_MAP: PrefEntry[] = [
  { backendKey: 'theme', lsKey: 'libermedia_theme', codec: strCodec },
  { backendKey: 'lang', lsKey: 'libermedia_lang', codec: strCodec },
  { backendKey: 'nsfw_enabled', lsKey: 'libermedia_nsfw_enabled', codec: boolCodec },
  { backendKey: 'push_dm', lsKey: 'libermedia_push_dm', codec: boolCodec },
  { backendKey: 'push_social', lsKey: 'libermedia_push_social', codec: boolCodec },
  { backendKey: 'thumbnail_size', lsKey: 'thumbnail_size', codec: strCodec },
  { backendKey: 'selected_feed', lsKey: 'libermedia_feed_mode', codec: strCodec },
  { backendKey: 'wot_show_score', lsKey: 'libermedia_wot_show_score', codec: boolCodec },
]

const BY_BACKEND = new Map(KEY_MAP.map((e) => [e.backendKey, e]))
const VALID_THEMES = new Set<string>(THEMES.map((t) => t.id))

// Aplica a classe de tema no <html> na hora (sem esperar o React reagir).
function applyThemeImmediate(theme: string) {
  if (!VALID_THEMES.has(theme)) return
  const html = document.documentElement
  THEMES.forEach((t) => html.classList.remove(t.id))
  html.classList.add(theme)
}

// Salva uma ou mais prefs no backend. Uso: savePrefs({ theme: 'theme-abismo' }).
export async function savePrefs(updates: Record<string, unknown>): Promise<void> {
  if (!updates || Object.keys(updates).length === 0) return
  try {
    await api.put('/api/user/settings', updates)
  } catch {
    /* offline / sem sessão → mantém só o localStorage; tenta de novo no próximo load */
  }
}

// Lê o valor ATUAL do localStorage e empurra pro servidor. As páginas gravam o
// localStorage normalmente e depois chamam isto. Espelha o saveFromLocalStorage.
export async function syncPref(backendKey: string): Promise<void> {
  const entry = BY_BACKEND.get(backendKey)
  if (!entry) return
  const raw = localStorage.getItem(entry.lsKey)
  if (raw === null) return
  await savePrefs({ [backendKey]: entry.codec.toServer(raw) })
}

// Carrega todas as prefs do backend → localStorage. Chamada no login (sessão Flask).
export async function loadPrefs(): Promise<void> {
  let data: Record<string, unknown>
  try {
    data = await api.get<Record<string, unknown>>('/api/user/settings')
  } catch {
    return // offline / sem sessão → segue com o localStorage que houver
  }

  // 1) Servidor → localStorage (servidor ganha).
  for (const entry of KEY_MAP) {
    if (!(entry.backendKey in data)) continue
    localStorage.setItem(entry.lsKey, entry.codec.toLS(data[entry.backendKey]))
  }

  // 2) Tema na hora (evita flash até o React reagir ao evento).
  const serverTheme = data.theme
  if (typeof serverTheme === 'string') applyThemeImmediate(serverTheme)

  // 3) Avisa providers/componentes para re-lerem o localStorage já sincronizado.
  window.dispatchEvent(new Event(PREFS_LOADED_EVENT))

  // 4) Sync reverso local→servidor: prefs que existem só no localStorage
  //    (ex: usuário que já usava o app antes desta sincronização existir).
  const missing: Record<string, unknown> = {}
  for (const entry of KEY_MAP) {
    if (entry.backendKey in data) continue
    const raw = localStorage.getItem(entry.lsKey)
    if (raw === null) continue
    missing[entry.backendKey] = entry.codec.toServer(raw)
  }
  if (Object.keys(missing).length > 0) void savePrefs(missing)
}
