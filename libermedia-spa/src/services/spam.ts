// Filtro anti-bot/spam — porte FIEL do static/js/spam-filter.js do MPA.
// LiberMedia é cliente, não censor: pornografia fica nos relays; aqui só bot/spam
// estruturado. Heurística de CONTEÚDO → pega bot NOVO que ainda não está na
// blacklist (que só conhece pubkey já banida). Pareado com isBlacklisted().
import type { FeedEvent } from '../types/nostr'

const SPAM_CONTENT_PATTERNS: RegExp[] = [
  /https?:\/\/bit\.ly\//i,
  /https?:\/\/tinyurl\.com\//i,
  /https?:\/\/t\.me\/\+/i, // links de grupos Telegram
  /join\s+(my|our)\s+(group|channel|telegram)/i,
  /earn\s+\d+\s*(btc|sat|usdt|usd)\s*(per|a)\s*(day|week|hour)/i,
  /\b(airdrop|giveaway).{0,30}(click|join|register|sign\s*up)/i,
  // Telemetria de bots mesh (Waku, libp2p, zone_presence)
  /"type"\s*:\s*"zone_presence"/,
  /"swarm"\s*:\s*"\d+\.\d+\.\d+\.\d+/,
  /"hostPlatform"\s*:\s*"(unknown|android|ios)"/,
  /"serviceVersion"\s*:\s*"\d+\.\d+\.\d+"/,
  /"cpuPct"\s*:\s*[\d.]+/,
  // Formato nlogpost (bot de log)
  /^nlogpost:\d+:/,
  // Formato broadcast mesh (libp2p/Waku broadcast)
  /^\[broadcast:/,
  /^\[relay:/,
  /^\[direct:/,
  // Campanha drift.gits.net (bots sp_)
  /^sp_[0-9a-f]+\.[0-9a-f]+\.\d+\.[A-Z0-9]+\.drift\.gits\.net$/,
  /drift\.gits\.net/i,
]

// Rede de bots japoneses — armas + drogas.
// Padrões ultra-específicos — não afetam usuários legítimos japoneses.
const JAPANESE_BOT_KEYWORDS = [
  '在庫あり',
  '世界各国への発送',
  '世界中への発送',
  'ご興味のある方',
  'メッセージにてご連絡',
  'トリアゾラム',
  'セボフルラン',
  '意識を失わせ',
  '媚薬',
  '口径',
  'グロック',
  'ピストル',
  '発送が可能',
]

// ASSINATURA de anúncio de droga de estupro/incapacitação.
// Por COMBINAÇÃO, não palavra exata — o keyword-exato acima já foi driblado (o bot mudou
// '在庫あり'→'在庫数に限りがあります' e usou 'デートレイプドラッグ', fora da lista). Regra: um
// termo de DROGA (ou INTENÇÃO de estupro/incapacitação) + um termo COMERCIAL na mesma nota.
// Neutro de idioma (JP/EN/PT). Esconde só a NOTA (não bane o autor). Um anúncio SEMPRE tem
// termo comercial (preço/estoque/contato) → exigi-lo mata o falso-positivo de notícia/alerta.
const CRIM_DRUG_RE =
  /\bGHB\b|ヒドロキシ酪酸|フルニトラゼパム|ロヒプノール|rohypnol|flunitrazepam|トリアゾラム|triazolam|セボフルラン|sevoflurane|クロロホルム|chloroform|burundanga|escopolamina|scopolamine/i
const CRIM_INTENT_RE =
  /デートレイプ|服従水|迷姦|睡眠姦|昏睡|意識を失|date[\s-]?rape|knock[\s-]?out\s*drug|droga.{0,15}(estupro|submiss)|estupro.{0,15}(droga|bebida|drink)|violaç[ãa]o\s*sexual/i
const CRIM_SALE_RE =
  /価格|在庫|販売|発送|ご連絡|連絡ください|個別に|お問い合わせ|注文|preç|à\s*venda|\bvendo\b|encomend|estoque|\bstock\b|for\s*sale|\bDM\b|privado|\d+\s*U\b|USDT/i
// True = a nota é um anúncio de droga de estupro/incapacitação (droga|intenção + comercial).
export function isCriminalAd(content: string): boolean {
  if (!CRIM_SALE_RE.test(content)) return false
  return CRIM_DRUG_RE.test(content) || CRIM_INTENT_RE.test(content)
}

export function isSpamEvent(event: FeedEvent): boolean {
  const content = event.content || ''
  const tags = event.tags || []
  const kind = event.kind

  // Kind:6 (repost NIP-18) e kind:9735 (zap NIP-57): conteúdo não é nota → nunca spam.
  if (kind === 6 || kind === 9735) return false

  // Anúncio de droga de estupro/incapacitação — assinatura por combinação → some do feed.
  if (isCriminalAd(content)) return true

  for (const pattern of SPAM_CONTENT_PATTERNS) {
    if (pattern.test(content)) return true
  }

  for (const kw of JAPANESE_BOT_KEYWORDS) {
    if (content.includes(kw)) return true
  }

  // Excesso de hashtags (> 8 = spam típico de bot)
  const hashtagCount = tags.filter((t) => t[0] === 't').length
  if (hashtagCount > 8) return true

  const trimmed = content.trim()
  // Conteúdo é JSON puro (bots publicando dados estruturados como nota)
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      JSON.parse(trimmed)
      return true
    } catch {
      /* não é JSON */
    }
  }

  // Conteúdo é base64 puro (> 60 chars, sem espaços)
  if (trimmed.length > 60 && /^[A-Za-z0-9+/=]{60,}$/.test(trimmed)) return true

  return false
}
