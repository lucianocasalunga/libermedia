// Parser de conteúdo de posts Nostr (kind:1). Porta a lógica de post-renderer.js
// do MPA. CRÍTICO (segurança): renderiza SEMPRE como elementos React (texto
// escapado pelo React) — NUNCA dangerouslySetInnerHTML/innerHTML. URLs de mídia
// são extraídas para uma grade; o resto do texto vira nós inline.
import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { Mention } from '../components/Mention/Mention'
import { curatedEmoji } from './emoji-shortcodes'
import { customEmojiMap } from '../services/custom-emoji'
import { QuotedNote } from '../components/QuotedNote/QuotedNote'
import { NipCard } from '../components/NipCard/NipCard'

// NIP-30: tags ["emoji", <shortcode>, <url>] → mapa shortcode→url. Renderiza :custom: como
// imagem (emoji custom estilo Telegram, interoperável com Damus/Amethyst/etc.).
export function emojiTagMap(tags?: string[][]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const t of tags || []) {
    if (t[0] === 'emoji' && t[1] && t[2] && /^https?:\/\//i.test(t[2])) map[t[1]] = t[2]
  }
  return map
}
// `:word:` — mesmo padrão do emoji-shortcodes; instância local (sem estado global do /g).
const SHORTCODE_RE = /:([a-z0-9_+-]+):/gi

// Resolve um shortcode custom (NIP-30): primeiro pelas tags DO EVENTO (eventEmoji), depois
// pelo mapa de packs CARREGADO do usuário (custom-emoji.ts). O 2º é o que faz render funcionar
// mesmo quando a tag não veio anexada (DM, ou post sem tag) — desde que o VIEWER tenha o pack.
function resolveCustom(code: string, eventEmoji?: Record<string, string>): string | undefined {
  const m = customEmojiMap()
  return (
    eventEmoji?.[code] ?? eventEmoji?.[code.toLowerCase()] ?? m[code] ?? m[code.toLowerCase()]
  )
}

// Renderiza texto resolvendo shortcodes → nós React: :custom: (NIP-30) = <img>; :curado:
// (:rocket:) = unicode; desconhecido = literal. Reutilizado por posts (parseContent) E DM.
// Keys próprias (únicas dentro do array retornado). Sem `:` = devolve o texto puro.
export function renderEmojiText(text: string, eventEmoji?: Record<string, string>): ReactNode[] {
  if (!text) return []
  if (text.indexOf(':') === -1) return [text]
  const re = new RegExp(SHORTCODE_RE.source, 'gi')
  const out: ReactNode[] = []
  let last = 0
  let k = 0
  let mm: RegExpExecArray | null
  while ((mm = re.exec(text)) !== null) {
    const i = mm.index
    if (i > last) out.push(<Fragment key={k++}>{text.slice(last, i)}</Fragment>)
    const code = mm[1]
    const url = resolveCustom(code, eventEmoji)
    if (url) {
      out.push(
        <img
          key={k++}
          className="lm-custom-emoji"
          src={url}
          alt={`:${code}:`}
          title={`:${code}:`}
          loading="lazy"
          draggable={false}
        />,
      )
    } else {
      out.push(<Fragment key={k++}>{curatedEmoji(code) ?? mm[0]}</Fragment>)
    }
    last = i + mm[0].length
  }
  if (last < text.length) out.push(<Fragment key={k++}>{text.slice(last)}</Fragment>)
  return out
}

// "STICKER" (F4 v1): mensagem que é SÓ emoji (custom NIP-30 e/ou unicode), poucos (≤6) →
// renderiza GRANDE, estilo figurinha do Telegram/jumbo do Discord. Interoperável (é só
// emoji). Se sobrar qualquer texto/menção/link → não é sticker.
export function isEmojiOnlyContent(text: string, customEmoji?: Record<string, string>): boolean {
  const t = (text || '').trim()
  if (!t) return false
  let customCount = 0
  // tira os :shortcode: custom que RESOLVEM (tag do evento OU mapa carregado); resto = texto.
  let rest = t.replace(SHORTCODE_RE, (m, c: string) => {
    if (resolveCustom(c, customEmoji)) {
      customCount++
      return ''
    }
    return m
  })
  // tira emoji unicode + VS16 (️) + ZWJ (‍) + tons de pele + espaços
  rest = rest.replace(/[\p{Extended_Pictographic}️‍\u{1F3FB}-\u{1F3FF}\s]/gu, '')
  if (rest.length > 0) return false // sobrou texto real → não é sticker
  const uniCount = (t.match(/\p{Extended_Pictographic}/gu) || []).length
  const total = customCount + uniCount
  return total >= 1 && total <= 6
}

const IMG_RE = /\.(jpe?g|png|gif|webp|avif|bmp|svg|jfif|heic)(\?[^\s]*)?$/i
// Extensões de vídeo que o navegador toca (gama ampla; as não-nativas como avi/wmv
// não entram porque não renderizam).
const VID_RE = /\.(mp4|webm|mov|m4v|ogv|ogg|mkv|3gp|m4s)(\?[^\s]*)?$/i
// Áudio: SÓ extensões inequívocas (.webm/.ogg ficam em VID_RE — contêiner ambíguo).
const AUD_RE = /\.(mp3|m4a|aac|wav|oga|opus|flac)(\?[^\s]*)?$/i

// Embeds de player (YouTube/Vimeo/Facebook/Instagram). Retorna a URL do iframe.
function detectEmbed(url: string): { provider: EmbedProvider; embedSrc: string } | null {
  let m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i)
  if (m) return { provider: 'youtube', embedSrc: `https://www.youtube.com/embed/${m[1]}` }
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i)
  if (m) return { provider: 'vimeo', embedSrc: `https://player.vimeo.com/video/${m[1]}` }
  // Instagram post/reel/tv → iframe oficial /embed/ (sem token; público mostra o card
  // com a mídia, reel costuma exigir clique p/ "ver no Instagram"). 'reels' → 'reel'.
  m = url.match(/instagram\.com\/(reel|reels|p|tv)\/([\w-]+)/i)
  if (m) {
    const kind = m[1].toLowerCase() === 'reels' ? 'reel' : m[1].toLowerCase()
    return { provider: 'instagram', embedSrc: `https://www.instagram.com/${kind}/${m[2]}/embed/` }
  }
  if (/(?:facebook\.com\/(?:[^/\s]+\/videos\/|watch\/?\?v=|reel\/|[^/\s]+\/posts\/)|fb\.watch\/)/i.test(url)) {
    return {
      provider: 'facebook',
      embedSrc: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`,
    }
  }
  return null
}

// Tokens "especiais" no texto: URL | ref nostr | hashtag | magnet (torrent).
const TOKEN_RE =
  /(https?:\/\/[^\s<>"]+)|(nostr:(?:npub1|nprofile1|note1|nevent1|naddr1)[0-9a-z]+)|(#[\p{L}\p{N}_+]+)|(magnet:\?[^\s<>"]+)/giu

/** Nome amigável de um link magnet: o parâmetro `dn` (display name) se houver. */
function magnetLabel(magnet: string): string {
  const m = magnet.match(/[?&]dn=([^&]+)/i)
  if (m) {
    try {
      return decodeURIComponent(m[1].replace(/\+/g, ' '))
    } catch {
      return m[1]
    }
  }
  return 'link magnet'
}

export type EmbedProvider = 'youtube' | 'vimeo' | 'facebook' | 'instagram'

export interface MediaItem {
  type: 'image' | 'video' | 'audio' | 'embed'
  url: string
  provider?: EmbedProvider
  embedSrc?: string // iframe (quando type === 'embed')
}

// Kinds de VÍDEO (NIP-71): 21/22 (novos) e 34235/34236 (horizontal/vertical, legado).
// A URL do vídeo vive nas TAGS (imeta "url ...", ou tag "url"), NÃO no conteúdo — por
// isso o PostCard, que parseia só o conteúdo, mostrava reel repostado/favoritado em branco.
export const VIDEO_KINDS = [21, 22, 34235, 34236]
export function videoKindMedia(tags: string[][]): MediaItem[] {
  const out: MediaItem[] = []
  const seen = new Set<string>()
  const add = (u: string | undefined) => {
    const url = (u || '').trim()
    if (/^https?:\/\//i.test(url) && !seen.has(url)) {
      seen.add(url)
      out.push({ type: 'video', url })
    }
  }
  for (const t of tags || []) {
    if (t[0] === 'url') add(t[1])
    else if (t[0] === 'imeta') {
      const urlPart = t.slice(1).find((s) => typeof s === 'string' && s.startsWith('url '))
      if (urlPart) add(urlPart.slice(4))
    }
  }
  return out
}

export interface ParsedContent {
  /** Nós inline do texto (sem as URLs de mídia, que vão para `media`). */
  body: ReactNode
  /** Imagens, vídeos e players (embeds) extraídos, na ordem de aparição. */
  media: MediaItem[]
  /** URLs comuns (não-mídia, não-embed) para o card de preview (Open Graph). */
  links: string[]
}

function isImage(url: string) {
  return IMG_RE.test(url.split('?')[0]) || IMG_RE.test(url)
}
function isVideo(url: string) {
  return VID_RE.test(url.split('?')[0]) || VID_RE.test(url)
}
function isAudio(url: string) {
  return AUD_RE.test(url.split('?')[0]) || AUD_RE.test(url)
}

// Texto VISÍVEL do post (sem as URLs de mídia — elas viram grade, não contam como
// caractere lido). Usado para o truncamento por contagem de caractere (cada char
// conta: pontuação, espaço, quebra de linha). Não colapsa nada — conta tudo cru.
export function stripMediaUrls(content: string): string {
  return content.replace(/(https?:\/\/[^\s<>"]+)/gi, (url) =>
    isImage(url) || isVideo(url) || isAudio(url) ? '' : url,
  )
}

/** Decodifica nostr:npub/nprofile para hex; nome curto como fallback. */
function decodeMention(token: string): { npub: string; hex?: string } | null {
  const id = token.replace(/^nostr:/, '')
  try {
    const dec = nip19.decode(id)
    if (dec.type === 'npub') return { npub: id, hex: dec.data }
    if (dec.type === 'nprofile') return { npub: nip19.npubEncode(dec.data.pubkey), hex: dec.data.pubkey }
  } catch {
    /* ignora ref malformada */
  }
  return null
}

/** Decodifica nostr:note/nevent → id (hex) + autor/relays (quando nevent). */
function decodeNoteRef(token: string): { id: string; author?: string; relays?: string[] } | null {
  const id = token.replace(/^nostr:/, '')
  try {
    const dec = nip19.decode(id)
    if (dec.type === 'note') return { id: dec.data }
    if (dec.type === 'nevent') return { id: dec.data.id, author: dec.data.author, relays: dec.data.relays }
  } catch {
    /* ref malformada */
  }
  return null
}

/** Decodifica nostr:naddr → evento addressable (kind + autor + identificador d). */
function decodeAddr(
  token: string,
): { naddr: string; kind: number; pubkey: string; identifier: string; relays?: string[] } | null {
  const naddr = token.replace(/^nostr:/, '')
  try {
    const dec = nip19.decode(naddr)
    if (dec.type === 'naddr')
      return { naddr, kind: dec.data.kind, pubkey: dec.data.pubkey, identifier: dec.data.identifier, relays: dec.data.relays }
  } catch {
    /* ref malformada */
  }
  return null
}

export function parseContent(
  content: string,
  resolveName?: (hex: string) => string | undefined,
  customEmoji?: Record<string, string>, // NIP-30 shortcode→url (do event.tags via emojiTagMap)
): ParsedContent {
  const media: ParsedContent['media'] = []
  const links: string[] = []
  const nodes: ReactNode[] = []
  const seenMedia = new Set<string>() // dedup: mesma URL não vira 2 imagens/vídeos
  let lastIndex = 0
  let key = 0

  const pushMedia = (item: ParsedContent['media'][number]) => {
    if (seenMedia.has(item.url)) return
    seenMedia.add(item.url)
    media.push(item)
  }

  // Texto → nós, resolvendo shortcodes (custom via tag+mapa, curado, ou literal). Reusa o
  // renderEmojiText; envolve num Fragment com key própria (as keys internas são isoladas).
  const pushText = (text: string) => {
    if (!text) return
    nodes.push(<Fragment key={key++}>{renderEmojiText(text, customEmoji)}</Fragment>)
  }

  for (const m of content.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0
    pushText(content.slice(lastIndex, idx))
    lastIndex = idx + m[0].length

    const [, url, nostrRef, hashtag, magnet] = m

    if (url) {
      const embed = detectEmbed(url)
      if (embed) {
        pushMedia({ type: 'embed', url, provider: embed.provider, embedSrc: embed.embedSrc })
      } else if (isImage(url)) {
        pushMedia({ type: 'image', url })
      } else if (isAudio(url)) {
        pushMedia({ type: 'audio', url })
      } else if (isVideo(url)) {
        pushMedia({ type: 'video', url })
      } else {
        if (!links.includes(url)) links.push(url)
        nodes.push(
          <a
            key={key++}
            href={url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-[var(--lm-link-ext)] hover:underline break-all"
          >
            {url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </a>,
        )
      }
    } else if (nostrRef) {
      if (nostrRef.startsWith('nostr:npub1') || nostrRef.startsWith('nostr:nprofile1')) {
        const dec = decodeMention(nostrRef)
        if (dec) {
          nodes.push(
            <Mention
              key={key++}
              hex={dec.hex || ''}
              npub={dec.npub}
              fallbackName={dec.hex ? resolveName?.(dec.hex) : undefined}
            />,
          )
        } else {
          pushText(nostrRef)
        }
      } else if (nostrRef.startsWith('nostr:naddr1')) {
        // naddr (evento addressable). kind:30817 = "NIP da comunidade" → card próprio.
        // Demais naddr seguem como referência simples (não temos viewer dedicado).
        const addr = decodeAddr(nostrRef)
        if (addr && addr.kind === 30817) {
          nodes.push(
            <NipCard
              key={key++}
              naddr={addr.naddr}
              kind={addr.kind}
              pubkey={addr.pubkey}
              identifier={addr.identifier}
              relays={addr.relays}
            />,
          )
        } else {
          nodes.push(
            <span key={key++} className="text-[var(--lm-mention)]">
              [evento]
            </span>,
          )
        }
      } else {
        // note/nevent — card embutido da nota citada (quote repost NIP-18).
        const ref = decodeNoteRef(nostrRef)
        if (ref) {
          nodes.push(<QuotedNote key={key++} id={ref.id} author={ref.author} relays={ref.relays} />)
        } else {
          nodes.push(
            <span key={key++} className="text-[var(--lm-mention)]">
              [nota]
            </span>,
          )
        }
      }
    } else if (hashtag) {
      const tag = hashtag.slice(1)
      nodes.push(
        <Link
          key={key++}
          to={`/pesquisar?q=${encodeURIComponent('#' + tag)}`}
          className="text-[var(--lm-accent)] hover:underline"
        >
          {hashtag}
        </Link>,
      )
    } else if (magnet) {
      // Link magnet (torrent) — clicável; o SO abre o cliente de torrent. Rótulo = nome (dn).
      nodes.push(
        <a
          key={key++}
          href={magnet}
          rel="noopener noreferrer nofollow"
          className="break-all text-[var(--lm-link-ext)] hover:underline"
        >
          🧲 {magnetLabel(magnet)}
        </a>,
      )
    }
  }
  pushText(content.slice(lastIndex))

  return { body: nodes, media, links }
}
