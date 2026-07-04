// Tradução de texto exposto SEM traduzir identificadores/links: URLs, entidades Nostr
// (npub/note/nevent/nprofile/naddr, com ou sem prefixo `nostr:`) e hashtags. Antes o
// conteúdo cru ia inteiro pro Google → ele mangava a npub e o endereço do arquivo (.mp4).
// Estratégia: mascarar os tokens com sentinelas de ÁREA PRIVADA Unicode (U+E000..U+E001),
// que o Google Translate preserva intactas, e restaurá-las no resultado. As sentinelas são
// construídas via String.fromCodePoint (nunca aparecem no texto real do usuário).
import { api } from './api'

const OPEN = String.fromCodePoint(0xe000)
const CLOSE = String.fromCodePoint(0xe001)
const TOKEN_RE =
  /(?:https?:\/\/[^\s]+|wss?:\/\/[^\s]+|(?:nostr:)?n(?:pub|ote|event|profile|addr)1[0-9a-z]+|#[\p{L}\p{N}_]+)/giu
// Restaura tolerando espaço que o tradutor às vezes insere ao redor do número.
const RESTORE_RE = new RegExp(`${OPEN}\\s*(\\d+)\\s*${CLOSE}`, 'g')

// Traduz `text` p/ `target`. Retorna a tradução (com os tokens preservados) ou null se o
// proxy não respondeu. Lança só em erro de rede (o chamador trata como best-effort).
export async function translateText(text: string, target: string): Promise<string | null> {
  const tokens: string[] = []
  const masked = text.replace(TOKEN_RE, (m) => {
    const i = tokens.length
    tokens.push(m)
    return `${OPEN}${i}${CLOSE}`
  })
  const res = await api.post<{ ok: boolean; translated?: string }>('/api/translate', {
    text: masked,
    target,
  })
  if (!res.ok || !res.translated) return null
  return res.translated.replace(RESTORE_RE, (_m, i) => tokens[Number(i)] ?? '')
}
