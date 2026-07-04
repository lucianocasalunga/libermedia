// Mensagens (DMs NIP-17) — DIAGRAMAÇÃO "jogo de cartas".
// Vive DENTRO da coluna central (sidebars esq/dir intactas). Duas cartas com
// proporção de celular (altura cheia, scroll INTERNO em cada uma):
//   • Carta LISTA — ancorada à esquerda.
//   • Carta CONVERSA — ancorada à direita.
// Desktop: elas se sobrepõem como cartas; a ATIVA fica por cima e 100% visível,
// a outra fica atrás com a beirada exposta sob filtro translúcido (clicar nela a
// traz de volta). Mobile: padrão WhatsApp/Telegram — lista → conversa com efeito
// de passagem (slide), voltar pela seta.
// Cripto/transporte: Fase 2 (NIP-17 via signer); transporte servidor+relay (Fases 3/5).
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { nip19, type Event as NostrEvent } from 'nostr-tools'
import { useAuth } from '../providers/AuthProvider'
import { toast } from '../lib/toast'
import { chatBgStyle, patternStyle, DM_PATTERN_GROUPS } from '../lib/dm-backgrounds'
import { api } from '../services/api'
import { parseRaw, npubToHex, sendDM, sendReaction, sendReceipt, sendNudge, unwrapWithSigner, unwrapForInbox, hasSigner, storePeerForWraps, recoverPendingWraps, isControlKind, DM_RELAYS } from '../services/dm'
import { KIND_DM, KIND_REACTION, KIND_RECEIPT, KIND_NUDGE } from '../services/dm17'
import { pollInbox, getCursor, setCursor, triggerServerSync, fetchServerNow, backfillBatch, getBackfill, setBackfill } from '../services/dm-sync'
import { relayManager } from '../services/relay-manager'
import { getSigner, type Signer } from '../services/signer'
import { TopBar } from '../components/TopBar/TopBar'
import { MensagensIcon, ConfiguracoesIcon } from '../components/icons'
import { Avatar } from '../components/Avatar/Avatar'
import { Tabs } from '../components/Tabs/Tabs'
import { NewChatModal } from '../components/NewChatModal/NewChatModal'
import { ReactionPicker, type AnchorRect } from '../components/ReactionPicker/ReactionPicker'
import { GifPicker } from '../components/GifPicker/GifPicker'
import { quickReactions, recordEmoji } from '../services/emoji'
import { playSendMsg, playRecvMsg, playNudge } from '../lib/sound'
import { uploadFile, uploadFileWithProgress } from '../services/upload'
import { translateText } from '../services/translate'
import { loadConversations, cacheConversations, loadMessages, cacheMessages, removeMessage, lastTextPreviews, markWrapsSeen, seenWrapIds, lastWrapTs, type MediaAttachment } from '../services/dm-db'
import { pushStatus, enablePush, disablePush, clearDmNotifications, type PushState } from '../services/push'
import type { SearchUser } from '../services/search'
import { relativeTime } from '../lib/time'
import { emojifyShortcodes } from '../lib/emoji-shortcodes'
import { renderEmojiText } from '../lib/content-parser'
import { customEmojiMap, useCustomEmojiVersion } from '../services/custom-emoji'
import { useProfileCache, primeProfiles, requestProfiles } from '../services/profiles'
import { useOnline, startHeartbeat, stopHeartbeat, watchPeers, unwatchPeers, pollServerPresence } from '../services/presence'
import { useIsMobile } from '../hooks/useIsMobile'
import { VoicePlayer } from '../components/VoicePlayer/VoicePlayer'
import { MediaViewer } from '../components/MediaViewer/MediaViewer'

// Ícone "nova conversa" (compose / nova mensagem).
function NovaConversaIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  )
}

// Sub-abas das Configurações.
const SETTINGS_TABS = [
  { key: 'baloes', label: 'Balões' },
  { key: 'wallpaper', label: 'Wallpaper' },
  { key: 'biblioteca', label: 'Biblioteca' },
  { key: 'avisos', label: 'Avisos' },
]

// Paleta de cores p/ os balões.
const BUBBLE_PRESETS = ['#0a84ff', '#34c759', '#ff2d55', '#af52de', '#ff9500', '#5e5ce6', '#e11d48', '#0f766e', '#475569', '#1f2937']

// Seção de escolha de cor (Meus balões / Balões do contato).
function BubbleColorSection({ title, value, onChange }: { title: string; value: string; onChange: (c: string) => void }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--lm-text-pri)]">{title}</span>
        {value && (
          <button type="button" onClick={() => onChange('')} className="text-xs text-[var(--lm-text-muted)] hover:underline">
            Padrão
          </button>
        )}
      </div>
      <div className="space-y-2">
        {/* Linha 1: cores SÓLIDAS (+ cor personalizada) */}
        <div className="flex flex-wrap items-center gap-2">
          {BUBBLE_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              aria-label={c}
              className={`h-7 w-7 rounded-full border-2 transition ${value === c ? 'scale-110 border-[var(--lm-text-pri)]' : 'border-transparent'}`}
              style={{ background: c }}
            />
          ))}
          <label
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-[var(--lm-border-str)] text-[var(--lm-text-muted)]"
            title="Cor personalizada"
          >
            <input type="color" value={(value || '#0a84ff').slice(0, 7)} onChange={(e) => onChange(e.target.value)} className="h-0 w-0 opacity-0" />
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
          </label>
        </div>
        {/* Linha 2: MESMAS cores TRANSLÚCIDAS (deixam o wallpaper transparecer no balão).
            Xadrez sutil atrás do swatch p/ a translucidez ficar visível na própria bolinha. */}
        <div className="flex flex-wrap items-center gap-2">
          {BUBBLE_PRESETS.map((c) => {
            const t = c + 'b3' // ~70% opaco (hex8) — "um pouco translúcida"
            return (
              <button
                key={t}
                type="button"
                onClick={() => onChange(t)}
                aria-label={`${c} translúcido`}
                className={`h-7 w-7 rounded-full border-2 transition ${value === t ? 'scale-110 border-[var(--lm-text-pri)]' : 'border-transparent'}`}
                style={{
                  // camada de cima = cor translúcida `t`; abaixo = xadrez sobre branco →
                  // a translucidez fica VISÍVEL na própria bolinha.
                  backgroundColor: '#ffffff',
                  backgroundImage:
                    `linear-gradient(${t},${t}),` +
                    'linear-gradient(45deg,rgba(0,0,0,.18) 25%,transparent 25%,transparent 75%,rgba(0,0,0,.18) 75%),' +
                    'linear-gradient(45deg,rgba(0,0,0,.18) 25%,transparent 25%,transparent 75%,rgba(0,0,0,.18) 75%)',
                  backgroundSize: 'auto,8px 8px,8px 8px',
                  backgroundPosition: '0 0,0 0,4px 4px',
                }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface Conv {
  peerNpub: string
  peerHex: string | null
  lastTs: number
  total: number
  preview: string
}
interface Msg {
  id: string // rumor id
  content: string
  mine: boolean
  ts: number
  eids?: string[] // event_ids dos gift wraps (minha msg tem 2: p/ peer + p/ mim) — p/ deletar
  replyTo?: string // id do rumor respondido
  media?: MediaAttachment // anexo (imagem/vídeo/áudio/arquivo)
  failed?: boolean // envio em background falhou (mostra ⚠ em vez do relógio)
}

// Detecção de anexo: a URL vai no content (interop com clients Nostr) + um tag
// ['media', mime, url] carrega o mime (p/ áudio/voz sem extensão na URL).
const MEDIA_IMG = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/i
const MEDIA_VID = /\.(mp4|webm|mov|m4v|ogv|mkv|3gp)(\?|#|$)/i
const MEDIA_AUD = /\.(mp3|m4a|aac|wav|oga|opus|flac)(\?|#|$)/i
function mediaFromMime(mime: string): MediaAttachment['kind'] {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}
function mediaKindFromUrl(url: string): MediaAttachment['kind'] | null {
  if (MEDIA_IMG.test(url)) return 'image'
  if (MEDIA_VID.test(url)) return 'video'
  if (MEDIA_AUD.test(url)) return 'audio'
  return null
}
// Extrai o anexo de uma msg: tag 'media' (mime confiável) ou content = URL pura.
function detectMedia(content: string, tags: string[][]): MediaAttachment | undefined {
  const mt = (tags || []).find((t) => t[0] === 'media')
  if (mt?.[1] && mt?.[2]) return { url: mt[2], kind: mediaFromMime(mt[1]) }
  const trimmed = content.trim()
  if (/^https?:\/\/\S+$/i.test(trimmed)) {
    const k = mediaKindFromUrl(trimmed)
    if (k) return { url: trimmed, kind: k }
  }
  return undefined
}

// Alguns clientes (ex.: 0xchat) mandam ENVELOPES DE CONTROLE DE GRUPO dentro do
// mesmo gift wrap de DM: JSON com `kind` string ("session_create"/"session_*") e/ou
// conversation_id + member_pubkeys. Não é mensagem de texto — não pode virar balão
// (renderizava o JSON cru e ainda forçava scroll lateral). Detecta com assinatura
// específica p/ NÃO engolir texto legítimo (kind do Nostr é número, não string).
function isGroupControlPayload(content: string): boolean {
  const t = content.trim()
  if (t.length < 2 || t[0] !== '{' || t[t.length - 1] !== '}') return false
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(t)
  } catch {
    return false
  }
  if (!obj || typeof obj !== 'object') return false
  if (typeof obj.kind === 'string' && /^session[_-]/i.test(obj.kind)) return true
  if (typeof obj.conversation_id === 'string' && Array.isArray(obj.member_pubkeys)) return true
  return false
}

// Rótulo curto da última mensagem p/ a prévia da lista (estilo WhatsApp/Telegram):
// mídia vira "📷 Foto" etc.; texto é o próprio texto (truncado no CSS).
function mediaLabel(kind: MediaAttachment['kind']): string {
  return kind === 'image' ? '📷 Foto' : kind === 'video' ? '🎥 Vídeo' : kind === 'audio' ? '🎤 Áudio' : '📎 Arquivo'
}
function previewText(content: string, media?: MediaAttachment): string {
  if (media) return mediaLabel(media.kind)
  const t = (content || '').trim()
  return t || '[mensagem]'
}

// "Jumbomoji" estilo WhatsApp: mensagem que é UM ÚNICO emoji (e nada mais) sobe grande,
// sem balão, como figurinha. Usa Intl.Segmenter p/ contar grafemas → sequências ZWJ
// (👨‍👩‍👧) e tom de pele (👍🏽) contam como 1. Exige exatamente 1 cluster e que seja pictográfico.
function isSingleEmoji(s: string): boolean {
  const t = (s || '').trim()
  if (!t) return false
  try {
    const seg = new Intl.Segmenter('en', { granularity: 'grapheme' })
    const graphemes = [...seg.segment(t)]
    if (graphemes.length !== 1) return false
    return /\p{Extended_Pictographic}/u.test(graphemes[0].segment)
  } catch {
    // Fallback (sem Segmenter): tudo são chars de emoji E há ao menos 1 pictográfico.
    const onlyEmoji = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|️|‍|[\u{1F3FB}-\u{1F3FF}])+$/u.test(t)
    return onlyEmoji && /\p{Extended_Pictographic}/u.test(t)
  }
}

// Dedup: por event-id (duplicata real do relay = mesmo rumor id) + remove o
// OTIMISTA (local-…) quando o real correspondente chega (mesmo autor+conteúdo a ≤90s).
// NÃO colapsa duas mensagens reais de mesmo texto (ex.: "ok" + "ok") — ambas ficam.
// BLINDAGEM: rumores legados (MPA) podem decriptar SEM `id` → coage p/ string e dá
// fallback estável, senão `m.id.startsWith` estoura e derruba TODAS as mensagens.
const isLocalMsg = (m: Msg) => String(m.id || '').startsWith('local-')
function dedupMsgs(list: Msg[]): Msg[] {
  const byId = new Map<string, Msg>()
  for (const raw of list) {
    const m: Msg = raw.id ? raw : { ...raw, id: `noid-${raw.ts}-${(raw.content || '').slice(0, 12)}` }
    const ex = byId.get(m.id)
    if (ex) {
      // mesmo rumor (2 wraps) → mescla os event_ids p/ deletar ambos
      const eids = Array.from(new Set([...(ex.eids || []), ...(m.eids || [])]))
      byId.set(m.id, { ...ex, ...m, eids: eids.length ? eids : undefined })
    } else {
      byId.set(m.id, m)
    }
  }
  const all = [...byId.values()].sort((a, b) => a.ts - b.ts)
  const reals = all.filter((m) => !isLocalMsg(m))
  return all.filter((m) => {
    if (!isLocalMsg(m)) return true
    return !reals.some((r) => r.mine === m.mine && r.content === m.content && Math.abs(r.ts - m.ts) <= 90)
  })
}

// Reação agregada: chave externa = id da msg-alvo; interna = id do rumor de
// reação (dedup) → {emoji, mine}.
type ReactionMap = Record<string, Record<string, { emoji: string; mine: boolean }>>
// Recibo por mensagem MINHA: 'delivered' (✓✓) → 'read' (✓✓ azul). 'read' vence.
type ReceiptMap = Record<string, 'delivered' | 'read'>

// Rumor decodificado genérico (texto / reação / recibo).
interface Decoded {
  id: string
  content: string
  mine: boolean
  ts: number
  kind: number
  tags: string[][]
  eids?: string[]
  replyTo?: string
}

// Separa rumores decodificados em texto (vira Msg) / reações / recibos.
function splitRumors(items: Decoded[]) {
  const texts: Msg[] = []
  const reacts: { target: string; id: string; emoji: string; mine: boolean }[] = []
  const recs: { targets: string[]; status: 'delivered' | 'read'; mine: boolean }[] = []
  for (const it of items) {
    if (it.kind === KIND_REACTION) {
      const target = it.tags.find((t) => t[0] === 'e')?.[1]
      if (target && it.content) reacts.push({ target, id: it.id, emoji: it.content, mine: it.mine })
    } else if (it.kind === KIND_RECEIPT) {
      const status = it.tags.find((t) => t[0] === 'status')?.[1]
      const targets = it.tags.filter((t) => t[0] === 'e').map((t) => t[1])
      if ((status === 'delivered' || status === 'read') && targets.length) recs.push({ targets, status, mine: it.mine })
    } else if (it.kind === KIND_NUDGE) {
      // "Chamar a atenção" (zumbido): controle, NUNCA vira balão. No histórico só é ignorado.
    } else if (!isGroupControlPayload(it.content)) {
      // QUALQUER outro rumor = texto. Padrão NIP-17 é kind:14, mas histórico legado
      // (MPA "kind:4-em-1059" e variações) decripta p/ outro kind — NÃO filtrar por
      // kind aqui, senão conversas antigas somem ("Sem mensagens"). Só 7/1314 são especiais.
      // Envelopes de controle de grupo (session_create…) são descartados (não viram balão).
      texts.push({ id: it.id, content: it.content, mine: it.mine, ts: it.ts, eids: it.eids, replyTo: it.replyTo, media: detectMedia(it.content, it.tags) })
    }
  }
  return { texts, reacts, recs }
}

// Mescla reações novas no mapa (imutável). Dedup pelo id do rumor de reação.
function mergeReactions(prev: ReactionMap, list: { target: string; id: string; emoji: string; mine: boolean }[]): ReactionMap {
  if (!list.length) return prev
  const next: ReactionMap = { ...prev }
  for (const r of list) next[r.target] = { ...(next[r.target] || {}), [r.id]: { emoji: r.emoji, mine: r.mine } }
  return next
}

// Aplica recibos do PEER sobre as MINHAS mensagens (mine=false = o peer confirmou).
function mergeReceipts(prev: ReceiptMap, list: { targets: string[]; status: 'delivered' | 'read'; mine: boolean }[]): ReceiptMap {
  let next = prev
  let changed = false
  for (const r of list) {
    if (r.mine) continue // recibo que EU emiti (cópia) — não conta p/ meus ticks
    for (const id of r.targets) {
      const cur = next[id]
      if (cur === 'read' || cur === r.status) continue // 'read' não rebaixa
      if (!changed) {
        next = { ...prev }
        changed = true
      }
      next[id] = r.status
    }
  }
  return next
}

// Agrega reações de uma msg por emoji: [{emoji, count, mine}].
function aggregateReactions(byId: Record<string, { emoji: string; mine: boolean }> | undefined): { emoji: string; count: number; mine: boolean }[] {
  if (!byId) return []
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>()
  for (const r of Object.values(byId)) {
    const e = map.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false }
    e.count++
    e.mine = e.mine || r.mine
    map.set(r.emoji, e)
  }
  return [...map.values()]
}

// Horário (HH:MM) e rótulo de dia (Hoje/Ontem/data) — estilo WhatsApp.
function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function dayLabel(ts: number): string {
  const that = new Date(ts * 1000)
  that.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - that.getTime()) / 86400000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  return new Date(ts * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
}
function sameDay(a: number, b: number): boolean {
  const da = new Date(a * 1000)
  const db = new Date(b * 1000)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}
// Duração m:ss (gravação de voz).
function fmtDur(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
function copyMsg(text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast('Mensagem copiada', 'success'))
    .catch(() => toast('Erro ao copiar', 'error'))
}

// Resposta LEGADA do MPA: a citação vinha embutida no texto como
// [[reply:{"id","author","preview"}]]. A v2.5 (NIP-17) usa a tag `reply`, então
// aqui só extraímos pra renderizar o bloco e LIMPAR o texto (senão aparece cru).
const LEGACY_REPLY_RE = /\[\[reply:(\{[\s\S]*?\})\]\]/
function parseLegacyReply(content: string): { reply?: { author: string; preview: string }; text: string } {
  const m = content.match(LEGACY_REPLY_RE)
  if (!m) return { text: content }
  let reply: { author: string; preview: string } | undefined
  try {
    const j = JSON.parse(m[1])
    reply = { author: String(j.author || ''), preview: String(j.preview || '') }
  } catch {
    /* marcador corrompido — só remove */
  }
  return { reply, text: content.replace(LEGACY_REPLY_RE, '').trim() }
}

// Tique de status da MINHA mensagem: relógio (enviando) → ✓ (enviado) →
// ✓✓ cinza (entregue) → ✓✓ azul (lido). Estilo WhatsApp.
function MsgTicks({ pending, failed, status }: { pending: boolean; failed?: boolean; status?: 'delivered' | 'read' }) {
  if (failed) {
    return (
      <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="#ef4444" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-label="não enviada">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
    )
  }
  if (pending) {
    return (
      <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M12 8v4l2.5 2.5" />
      </svg>
    )
  }
  if (status === 'delivered' || status === 'read') {
    // 2 checks PARALELOS (lado a lado, mesma forma) — BRANCOS=entregue / AZUIS=lido.
    const color = status === 'read' ? '#34b7f1' : 'currentColor'
    return (
      <svg viewBox="0 0 28 18" width={18} height={12} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-label={status === 'read' ? 'lida' : 'entregue'}>
        <path d="M2 9.5l3.5 3.5L13 5" />
        <path d="M13 9.5l3.5 3.5L24 5" />
      </svg>
    )
  }
  // enviado = 1 check BRANCO
  return (
    <svg viewBox="0 0 16 18" width={11} height={12} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-label="enviada">
      <path d="M3 9.5l3.5 3.5L13 5" />
    </svg>
  )
}

// Render de um anexo na bolha (imagem/vídeo/áudio/arquivo).
function Attachment({ media }: { media: MediaAttachment }) {
  const lastTap = useRef(0)
  // Imagem aberta em tela cheia no lightbox interno (MediaViewer tem X de fechar + Esc + swipe).
  const [viewing, setViewing] = useState(false)
  // Tela cheia: requestFullscreen (Android/desktop) ou webkitEnterFullscreen (vídeo iOS).
  const toFullscreen = (el: HTMLVideoElement) => {
    const v = el as HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitRequestFullscreen?: () => void }
    if (v.requestFullscreen) void v.requestFullscreen().catch(() => v.webkitEnterFullscreen?.())
    else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen()
    else v.webkitRequestFullscreen?.()
  }
  if (media.kind === 'image') {
    const name = media.url.split('/').pop()?.split('?')[0] || 'imagem'
    return (
      <>
        <button type="button" onClick={() => setViewing(true)} className="block" aria-label="Abrir imagem">
          <img src={media.url} alt="anexo" loading="lazy" className="max-h-72 max-w-full rounded-lg object-cover" />
        </button>
        {viewing && (
          <MediaViewer
            items={[{ id: 0, name, mime_type: 'image/*', url: media.url }]}
            index={0}
            onClose={() => setViewing(false)}
            onIndex={() => {}}
          />
        )}
      </>
    )
  }
  if (media.kind === 'video') {
    return (
      <video
        src={media.url}
        controls
        playsInline
        onDoubleClick={(e) => toFullscreen(e.currentTarget)}
        onClick={(e) => {
          // Duplo TOQUE (mobile) → tela cheia. <300ms entre toques. Toque simples
          // continua usando os controles nativos (play/pause).
          const now = Date.now()
          const el = e.currentTarget
          if (now - lastTap.current < 300) {
            lastTap.current = 0
            toFullscreen(el)
          } else {
            lastTap.current = now
          }
        }}
        // Só o vídeo, MAIOR (altura até 60vh), mantendo a proporção — sem largura forçada
        // nem fundo (nada de "caixa" atrás; o balão é só a sombra tênue do mediaOnly).
        className="block max-h-[60vh] max-w-full rounded-lg"
      />
    )
  }
  if (media.kind === 'audio') {
    return <VoicePlayer src={media.url} />
  }
  return (
    <a
      href={media.url}
      target="_blank"
      rel="noreferrer"
      download
      className="mt-1 flex items-center gap-2 rounded-lg bg-black/15 px-3 py-2 text-sm underline"
    >
      <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </svg>
      Baixar arquivo
    </a>
  )
}

// Estilo das "bolinhas/pílulas" flutuantes das barras da conversa (voltar/nome no topo;
// clipe/input/áudio embaixo): cor do TEMA, TRANSLÚCIDO + blur → legível sobre qualquer
// wallpaper; no desktop o hover REDUZ a translucidez (fica mais opaco). Borda fininha.
const CHIP =
  'border border-[var(--lm-border-str)] bg-[var(--lm-bg-main)]/60 shadow-lg backdrop-blur-md transition-colors hover:bg-[var(--lm-bg-main)]/85'
// Alturas das barrinhas do visualizador do modal de gravação (pulsam via animate-pulse).
const REC_WAVE = [40, 70, 52, 88, 60, 80, 46, 76, 56, 90, 64, 50, 82, 58, 92, 44, 72, 54, 84, 62]
// Variante MAIS translúcida p/ as peças do TOPO (voltar + nome) — blur segura a leitura.
const CHIP_TOP =
  'border border-[var(--lm-border-str)] bg-[var(--lm-bg-main)]/40 shadow-lg backdrop-blur-md transition-colors hover:bg-[var(--lm-bg-main)]/75'

// Linha da lista de conversas. Lê nome/avatar do CACHE INSTANTÂNEO compartilhado
// (profiles.ts, localStorage) → aparece na hora p/ quem já foi visto (feed/DM antes)
// e resolve em background o resto (re-renderiza sozinho quando chega). Sem cascata.
function ConvRow({ conv, selected, onClick }: { conv: Conv; selected: boolean; onClick: () => void }) {
  const prof = useProfileCache(conv.peerHex)
  const name = prof?.display_name?.trim() || prof?.name?.trim() || `${conv.peerNpub.slice(0, 12)}…`
  const mobile = useIsMobile() // mobile = alvo de toque maior (avatar/linha/fonte)
  const online = useOnline(conv.peerHex)
  useCustomEmojiVersion() // repinta a prévia quando o mapa de emoji custom carrega (async pós-login)
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3.5 border-b border-[var(--lm-border)] px-4 py-4 text-left transition hover:bg-[var(--lm-bg-card)] md:gap-3 md:py-3 ${
        selected ? 'bg-[var(--lm-bg-card)]' : ''
      }`}
    >
      <Avatar src={prof?.picture} name={name} size={mobile ? 54 : 44} online={online} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[17px] font-bold text-[var(--lm-text-pri)] md:text-[15px]">{name}</span>
          <span className="flex-shrink-0 text-xs text-[var(--lm-text-muted)]">{relativeTime(conv.lastTs)}</span>
        </div>
        <p className="truncate text-[15px] text-[var(--lm-text-muted)] md:text-sm">{renderEmojiText(conv.preview)}</p>
      </div>
    </button>
  )
}

// Miniatura de wallpaper: usa o THUMB do servidor (400px, já trata HEIC+EXIF e blurhash)
// em vez do original (foto de câmera 4-12MB) → grade rápida, sem "aos poucos". Resolve o
// /api/thumb_url 1x por URL (cache de módulo) e cai no original se não houver thumb
// (imagem estática da biblioteca ou upload sem thumbnail). O FUNDO aplicado segue no
// original (nitidez em tela cheia) — só a MINIATURA usa o thumb.
const wpThumbCache = new Map<string, string>()
function WpThumbImg({ url }: { url: string }) {
  const [src, setSrc] = useState<string>(() => wpThumbCache.get(url) || url)
  useEffect(() => {
    if (wpThumbCache.has(url)) {
      setSrc(wpThumbCache.get(url)!)
      return
    }
    let alive = true
    void api
      .get<{ thumb_url?: string }>(`/api/thumb_url?url=${encodeURIComponent(url)}`)
      .then((r) => {
        const t = r?.thumb_url || url
        wpThumbCache.set(url, t)
        if (alive) setSrc(t)
      })
      .catch(() => wpThumbCache.set(url, url))
    return () => {
      alive = false
    }
  }, [url])
  return (
    <img
      src={src}
      loading="lazy"
      decoding="async"
      alt=""
      onLoad={(e) => { e.currentTarget.style.opacity = '1' }}
      ref={(el) => { if (el?.complete) el.style.opacity = '1' }}
      className="h-full w-full object-cover opacity-0 transition-opacity duration-300"
    />
  )
}

export function MensagensPage() {
  const { npub, pubkeyHex, loggedIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Página fica montada mesmo fora de /mensagens (Layout não desmonta). Pausa os
  // polls de presença/sync quando não está ativa — senão rodam 8s/30s pra sempre.
  const msgActive = location.pathname.startsWith('/mensagens')
  // Reatividade: re-renderiza os balões quando o mapa de emoji custom carrega async (pós-login),
  // senão o :shortcode: resolvido pelo mapa (loneCustom / renderEmojiText) ficaria texto.
  useCustomEmojiVersion()
  const [convs, setConvs] = useState<Conv[]>([])
  const [loading, setLoading] = useState(!!loggedIn)
  const [convNonce, setConvNonce] = useState(0) // bump → re-busca a lista de conversas
  const [peer, setPeer] = useState<string | null>(null) // npub do peer aberto
  const [front, setFront] = useState<'list' | 'chat'>('list') // qual carta está por cima
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [shake, setShake] = useState(false) // "chamar a atenção": treme a carta da conversa
  const [draft, setDraft] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false) // modal do clipe: Arquivos / GIFs
  const [showGif, setShowGif] = useState(false)
  const [emojiAnchor, setEmojiAnchor] = useState<AnchorRect | null>(null)
  const [showNewChat, setShowNewChat] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState('baloes')
  // Escopo da config aberta: 'global' (padrão de todas) ou o npub do peer (override só daquela conversa).
  const [settingsScope, setSettingsScope] = useState<'global' | string>('global')
  // Preferências de aparência das DMs — ISOLADAS por npub (anti-vazamento entre contas).
  const [bubbleMine, setBubbleMine] = useState('')
  const [bubbleTheirs, setBubbleTheirs] = useState('')
  const [wallpaper, setWallpaper] = useState('')
  // Overrides POR CONVERSA (hierarquia): conv_themes[peerNpub] vence o global.
  type ConvTheme = { bubbleMine?: string; bubbleTheirs?: string; wallpaper?: string }
  const [convThemes, setConvThemes] = useState<Record<string, ConvTheme>>({})
  const [wpUploading, setWpUploading] = useState(false)
  const [wpPreview, setWpPreview] = useState<string | null>(null) // preview otimista do upload (objectURL, transitório)
  const [wpGallery, setWpGallery] = useState<string[]>([]) // "Meus wallpapers" — mantém TODOS os que o usuário subiu
  const wpInputRef = useRef<HTMLInputElement>(null)
  const [pushState, setPushState] = useState<PushState>('default')
  const [pushBusy, setPushBusy] = useState(false)
  const [libThemes, setLibThemes] = useState<{ key: string; label: string; urls: string[] }[]>([])
  const [libTheme, setLibTheme] = useState('')
  // Seleção PENDENTE da Biblioteca: clicar só MARCA; "Aplicar" é que grava (global ou conversa)
  // e fecha. null = nada pendente (mostra o wallpaper já aplicado como marcado).
  const [pendingWp, setPendingWp] = useState<string | null>(null)
  // Sub-aba dentro de "Padrão" (padrões CSS): 'Escuros' | 'Claros'.
  const [patternGroup, setPatternGroup] = useState('Escuros')
  const [msgMenu, setMsgMenu] = useState<{ msg: Msg; x: number; y: number } | null>(null)
  // Tradução por mensagem (proxy /api/translate, Google — mesmo padrão do feed).
  // `msgTrans` = cache id→texto traduzido; `msgTransOn` = ids exibindo a tradução (toggle).
  const [msgTrans, setMsgTrans] = useState<Record<string, string>>({})
  const [msgTransOn, setMsgTransOn] = useState<Set<string>>(new Set())
  const [msgTranslating, setMsgTranslating] = useState<Set<string>>(new Set()) // buscando a tradução
  // Reações (kind:7) e recibos (kind:1314) — rederivados do histórico ao abrir +
  // acumulados ao vivo pelo poll. Não persistem no IndexedDB (rederivam do servidor).
  const [reactions, setReactions] = useState<ReactionMap>({})
  const [receipts, setReceipts] = useState<ReceiptMap>({})
  const [readReceipts, setReadReceipts] = useState(true) // confirmação de leitura (tique azul)
  const [showOnline, setShowOnline] = useState(true) // aparecer online (áurea verde + heartbeat)
  const showOnlineRef = useRef(showOnline) // p/ o heartbeat ler a pref sem re-assinar
  useEffect(() => {
    showOnlineRef.current = showOnline
  }, [showOnline])
  // PRESENÇA (fonte Nostr): publica meu heartbeat kind:20000 enquanto logado (só se a
  // pref "Aparecer online" estiver ligada — lida via ref, sem re-assinar no toggle).
  useEffect(() => {
    if (!loggedIn || !pubkeyHex) return
    startHeartbeat(signer, () => showOnlineRef.current)
    return () => stopHeartbeat()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, pubkeyHex])
  // Assina a presença dos contatos; re-assina quando a lista de conversas muda.
  const presencePeerKey = convs.map((c) => c.peerHex).filter(Boolean).join(',')
  useEffect(() => {
    if (!loggedIn || !msgActive) return
    const peers = convs.map((c) => c.peerHex).filter(Boolean) as string[]
    watchPeers(peers) // fonte 1 (Nostr)
    void pollServerPresence(peers) // fonte 2 (servidor) — agora + a cada 30s
    const iv = setInterval(() => void pollServerPresence(peers), 30000)
    return () => {
      unwatchPeers()
      clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, presencePeerKey, msgActive])
  const [reactFor, setReactFor] = useState<{ msg: Msg; anchor: AnchorRect } | null>(null)
  const [attaching, setAttaching] = useState<number | null>(null) // % do upload de anexo (null = ocioso)
  const attachInputRef = useRef<HTMLInputElement>(null)
  const [recording, setRecording] = useState(false)
  const [recSecs, setRecSecs] = useState(0)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Gravar áudio exige SEGURAR 2s (anti-disparo acidental). micHolding = feedback visual.
  const [micHolding, setMicHolding] = useState(false)
  const micHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Mensagens já confirmadas (p/ não reenviar recibo a cada poll). Set = só da SESSÃO.
  const ackRef = useRef<{ delivered: Set<string>; read: Set<string> }>({ delivered: new Set(), read: new Set() })
  // Marca d'água de recibo PERSISTIDA por peer: { d: maior ts entregue, r: maior ts lido }.
  // Sobrevive ao reload (o Set acima não) → conversa antiga não re-acka a cada sessão.
  const ackHwmRef = useRef<Record<string, { d: number; r: number }>>({})
  const ackHwmNpubRef = useRef('') // npub dono da hwm carregada (p/ salvar na chave certa)

  // Carrega a biblioteca de wallpapers (manifesto estático) ao abrir a aba.
  useEffect(() => {
    if (showSettings && settingsTab === 'biblioteca' && libThemes.length === 0) {
      fetch('/static/img/wallpapers.json')
        .then((r) => r.json())
        .then((d) => {
          const themes = d.themes || []
          setLibThemes(themes)
          if (themes[0]) setLibTheme((t) => t || themes[0].key)
        })
        .catch(() => {})
    }
  }, [showSettings, settingsTab, libThemes.length])
  const [replyingTo, setReplyingTo] = useState<Msg | null>(null)

  // Status do push quando a aba Avisos abre.
  useEffect(() => {
    if (showSettings && settingsTab === 'avisos') void pushStatus().then(setPushState)
  }, [showSettings, settingsTab])

  async function togglePush() {
    setPushBusy(true)
    try {
      if (pushState === 'granted-on') {
        await disablePush()
        setPushState('granted-off')
      } else {
        await enablePush()
        setPushState('granted-on')
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Falha nas notificações')
    } finally {
      setPushBusy(false)
    }
  }

  // Carrega o tema das DMs (formato v2.0, RESTAURA o que já existia):
  //  • GLOBAL  ← chat_theme {bubble_color, bubble_recv_color, bg}
  //  • POR CONVERSA ← conv_themes {<peerHex>: {balloon_mine, balloon_other, wallpaper}}
  //  • confirmação de leitura ← dm_prefs.readReceipts (a v2.0 não tinha)
  // localStorage = instantâneo; servidor = verdade cross-device (aplica por cima).
  useEffect(() => {
    if (!npub) {
      setBubbleMine('')
      setBubbleTheirs('')
      setWallpaper('')
      setReadReceipts(true)
      setConvThemes({})
      setWpGallery([])
      return
    }
    type CT = { bubble_color?: string; bubble_recv_color?: string; bg?: string }
    type CV = Record<string, { balloon_mine?: string; balloon_other?: string; wallpaper?: string }>
    const applyGlobal = (ct?: CT) => {
      if (!ct) return
      setBubbleMine(ct.bubble_color || '')
      setBubbleTheirs(ct.bubble_recv_color || '')
      setWallpaper(ct.bg || '')
    }
    const applyConv = (raw?: CV) => {
      if (!raw) return
      const norm: Record<string, ConvTheme> = {}
      for (const [hex, t] of Object.entries(raw)) {
        norm[hex] = { bubbleMine: t.balloon_mine || undefined, bubbleTheirs: t.balloon_other || undefined, wallpaper: t.wallpaper || undefined }
      }
      setConvThemes(norm)
    }
    try {
      const c = JSON.parse(localStorage.getItem(`libermedia_dm_theme_${npub}`) || '{}')
      applyGlobal(c.chat_theme)
      applyConv(c.conv_themes)
      if (c.dm_prefs) {
        setReadReceipts(c.dm_prefs.readReceipts !== false)
        setShowOnline(c.dm_prefs.showOnline !== false)
        if (Array.isArray(c.dm_prefs.wallpapers)) setWpGallery(c.dm_prefs.wallpapers)
      }
    } catch {
      /* cache corrompido — ignora */
    }
    let alive = true
    api
      .get<{ chat_theme?: CT; conv_themes?: CV; dm_prefs?: { readReceipts?: boolean; showOnline?: boolean; wallpapers?: string[] } }>('/api/user/settings')
      .then((s) => {
        if (!alive || !s) return
        applyGlobal(s.chat_theme)
        applyConv(s.conv_themes)
        if (s.dm_prefs && typeof s.dm_prefs === 'object') {
          setReadReceipts(s.dm_prefs.readReceipts !== false)
          setShowOnline(s.dm_prefs.showOnline !== false)
          setWpGallery(Array.isArray(s.dm_prefs.wallpapers) ? s.dm_prefs.wallpapers : [])
        }
        try {
          localStorage.setItem(`libermedia_dm_theme_${npub}`, JSON.stringify({ chat_theme: s.chat_theme, conv_themes: s.conv_themes, dm_prefs: s.dm_prefs }))
        } catch {
          /* quota */
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [npub])

  // Persiste o tema GLOBAL no chat_theme (formato v2.0 → compat MPA + cross-device).
  function persistGlobalTheme(next: { bubbleMine?: string; bubbleTheirs?: string; wallpaper?: string }) {
    if (!npub) return
    void api
      .put('/api/user/settings', {
        chat_theme: {
          bubble_color: next.bubbleMine ?? bubbleMine,
          bubble_recv_color: next.bubbleTheirs ?? bubbleTheirs,
          bg: next.wallpaper ?? wallpaper,
        },
      })
      .catch(() => {})
  }
  function persistReadReceipts(v: boolean) {
    if (!npub) return
    void api.put('/api/user/settings', { dm_prefs: { readReceipts: v } }).catch(() => {})
  }
  function persistShowOnline(v: boolean) {
    if (!npub) return
    void api.put('/api/user/settings', { dm_prefs: { showOnline: v } }).catch(() => {})
  }
  // Galeria pessoal: guarda TODAS as imagens que o usuário subiu (array de URLs em
  // dm_prefs — o servidor faz MERGE, não apaga readReceipts/showOnline). Cross-device,
  // cap de 50. Aparecem na hora na aba Wallpaper; remover daqui NÃO apaga o arquivo.
  function rememberWallpaper(url: string) {
    if (!url || !/^https?:/.test(url)) return
    setWpGallery((prev) => {
      const next = [url, ...prev.filter((u) => u !== url)].slice(0, 50)
      if (npub) void api.put('/api/user/settings', { dm_prefs: { wallpapers: next } }).catch(() => {})
      return next
    })
  }
  function removeWallpaper(url: string) {
    setWpGallery((prev) => {
      const next = prev.filter((u) => u !== url)
      if (npub) void api.put('/api/user/settings', { dm_prefs: { wallpapers: next } }).catch(() => {})
      return next
    })
  }
  // Override POR CONVERSA no conv_themes (chave = hex do peer; servidor faz MERGE,
  // não apaga o tema de outras conversas). Campo vazio = volta ao global.
  function setConvTheme(peerHex: string, patch: ConvTheme) {
    if (!npub || !peerHex) return
    setConvThemes((prev) => {
      const merged: ConvTheme = { ...prev[peerHex], ...patch }
      const next = { ...prev, [peerHex]: merged }
      const v20 = {
        ...(merged.bubbleMine ? { balloon_mine: merged.bubbleMine } : {}),
        ...(merged.bubbleTheirs ? { balloon_other: merged.bubbleTheirs } : {}),
        ...(merged.wallpaper ? { wallpaper: merged.wallpaper } : {}),
      }
      void api.put('/api/user/settings', { conv_themes: { [peerHex]: v20 } }).catch(() => {})
      return next
    })
  }

  // Escopo da config aberta → valores/setters efetivos (global OU override do peer).
  const scopeIsGlobal = settingsScope === 'global'
  const scopeHex = scopeIsGlobal ? null : npubToHex(settingsScope)
  const uiBubbleMine = scopeIsGlobal ? bubbleMine : (scopeHex && convThemes[scopeHex]?.bubbleMine) || ''
  const uiBubbleTheirs = scopeIsGlobal ? bubbleTheirs : (scopeHex && convThemes[scopeHex]?.bubbleTheirs) || ''
  const uiWallpaper = scopeIsGlobal ? wallpaper : (scopeHex && convThemes[scopeHex]?.wallpaper) || ''
  const setUiBubbleMine = (c: string) => {
    if (scopeIsGlobal) {
      setBubbleMine(c)
      persistGlobalTheme({ bubbleMine: c })
    } else if (scopeHex) setConvTheme(scopeHex, { bubbleMine: c })
  }
  const setUiBubbleTheirs = (c: string) => {
    if (scopeIsGlobal) {
      setBubbleTheirs(c)
      persistGlobalTheme({ bubbleTheirs: c })
    } else if (scopeHex) setConvTheme(scopeHex, { bubbleTheirs: c })
  }
  const setUiWallpaper = (w: string) => {
    if (scopeIsGlobal) {
      setWallpaper(w)
      persistGlobalTheme({ wallpaper: w })
    } else if (scopeHex) setConvTheme(scopeHex, { wallpaper: w })
  }
  // Wallpaper EXIBIDO como marcado na Biblioteca: a seleção pendente vence o aplicado.
  const selWp = pendingWp ?? uiWallpaper
  // Miniatura da config: o preview otimista do upload (blob local) vence o aplicado.
  const dispWallpaper = wpPreview ?? uiWallpaper
  // "Aplicar": grava a seleção pendente no escopo certo (global = padrão de todas, sem
  // tocar nas conversas que já têm wallpaper próprio; conversa = override só dela), fecha
  // e volta — global p/ a lista, conversa p/ a própria conversa (já está atrás).
  function applyPendingWp() {
    if (pendingWp === null) return
    setUiWallpaper(pendingWp)
    setPendingWp(null)
    setShowSettings(false)
    if (scopeIsGlobal) setFront('list')
  }

  async function onWallpaperPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    // Preview OTIMISTA: mostra o arquivo local NA HORA (blob, sem esperar a rede).
    const local = URL.createObjectURL(f)
    setWpPreview(local)
    setWpUploading(true)
    try {
      const up = await uploadFile(f) // vai pra Arquivos do usuário + devolve a URL
      // Aquece o cache do browser antes do swap → troca sem flash branco.
      const img = new Image()
      img.src = up.url
      await img.decode().catch(() => {})
      setUiWallpaper(up.url) // aplica + persiste (global ou conversa)
      rememberWallpaper(up.url) // galeria pessoal (mantém TODOS os que subi)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha no upload do wallpaper')
    } finally {
      setWpUploading(false)
      setWpPreview(null)
      // revoga só no próximo frame → sem piscada entre tirar o preview e pintar a URL remota
      requestAnimationFrame(() => URL.revokeObjectURL(local))
    }
  }
  const endRef = useRef<HTMLDivElement>(null)
  const scrollBoxRef = useRef<HTMLDivElement>(null) // container rolável das mensagens
  const contentRef = useRef<HTMLDivElement>(null) // wrapper do conteúdo (altura observada)
  const convCardRef = useRef<HTMLDivElement>(null) // carta da conversa (containing block)
  const headRef = useRef<HTMLDivElement>(null) // barra de cima flutuante
  const inputBarRef = useRef<HTMLDivElement>(null) // barra de baixo flutuante (cresce)
  const stickBottomRef = useRef(true) // grudar no fim? (false quando o usuário rola p/ cima)
  // Ids de mensagens já vistas (qualquer fonte: cache/histórico/poll/live). O som de
  // recebimento só toca p/ id INÉDITO → re-sync/reprocessamento não dispara "chuva".
  const seenIdsRef = useRef<Set<string>>(new Set())
  // MARCA D'ÁGUA SONORA persistente (localStorage): maior `ts` de mensagem já VISTA/ouvida.
  // O som só toca p/ mensagem mais nova que isso → mensagem lida NUNCA mais soa, mesmo
  // após reload/reabrir (o seenIds é só da sessão; isto sobrevive). Avança ao ver msgs.
  const soundHwmRef = useRef(0)
  const bumpSoundHwm = useCallback(
    (ts: number) => {
      if (ts > soundHwmRef.current) {
        soundHwmRef.current = ts
        try {
          localStorage.setItem('lm_dm_snd_hwm_' + (npub || ''), String(ts))
        } catch {
          /* quota — ignora */
        }
      }
    },
    [npub],
  )
  // Carrega a marca d'água ao logar/trocar de conta.
  useEffect(() => {
    soundHwmRef.current = Number(localStorage.getItem('lm_dm_snd_hwm_' + (npub || '')) || 0) || 0
  }, [npub])
  // Persiste a marca d'água de recibo. Chave por conta; lê o npub de um ref p/ ackMessages
  // (deps []) poder salvar sem se reamarrar a cada troca de conta.
  const persistAckHwm = useCallback(() => {
    try {
      localStorage.setItem('lm_dm_ack_hwm_' + ackHwmNpubRef.current, JSON.stringify(ackHwmRef.current))
    } catch {
      /* quota — ignora */
    }
  }, [])
  useEffect(() => {
    ackHwmNpubRef.current = npub || ''
    try {
      ackHwmRef.current = JSON.parse(localStorage.getItem('lm_dm_ack_hwm_' + (npub || '')) || '{}') || {}
    } catch {
      ackHwmRef.current = {}
    }
  }, [npub])
  // Cola no fim instantâneo (mais confiável que scrollIntoView com 200 itens + mídia).
  const scrollToBottom = useCallback(() => {
    const el = scrollBoxRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])
  // Se o usuário rolou p/ cima (>80px do fim), para de grudar; ao voltar ao fim, volta a grudar.
  const onMsgsScroll = useCallback(() => {
    const el = scrollBoxRef.current
    if (el) stickBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])
  // Sempre que a lista muda E estamos grudados no fim, vai pro fim (após o layout).
  useLayoutEffect(() => {
    if (stickBottomRef.current) scrollToBottom()
  }, [msgs, scrollToBottom])
  // RE-ANCORA NO FIM quando a ALTURA do conteúdo muda (imagens/vídeos/GIF/avatares
  // carregam DEPOIS do render e empurram o conteúdo). O setTimeout fixo de 250ms não
  // bastava no WebView do Android (TWA): o layout estabilizava depois → a conversa abria
  // mostrando mensagens anteriores. O ResizeObserver reage ao layout REAL, qualquer que
  // seja o atraso. Só puxa se o usuário está grudado no fim (não atrapalha quem rolou p/ cima).
  useEffect(() => {
    const content = contentRef.current
    const box = scrollBoxRef.current
    if (!content || !box || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (stickBottomRef.current) box.scrollTop = box.scrollHeight
    })
    ro.observe(content)
    return () => ro.disconnect()
  }, [])
  // Barras (head/input) são absolutas e flutuam sobre o wallpaper; o scroll passa por
  // TRÁS delas. Aqui medimos a altura REAL de cada barra (input cresce; safe-area varia)
  // e damos ao scroll o padding vertical exato → 1ª/última mensagem nunca ficam atrás
  // das barras. Sem loop (medimos as barras, não o scroll). Re-ancora ao fim se grudado.
  useEffect(() => {
    const box = scrollBoxRef.current
    const card = convCardRef.current
    if (!box || !card || typeof ResizeObserver === 'undefined') return
    const apply = () => {
      const cr = card.getBoundingClientRect()
      const head = headRef.current
      const input = inputBarRef.current
      if (head) box.style.paddingTop = `${head.getBoundingClientRect().bottom - cr.top + 6}px`
      if (input) box.style.paddingBottom = `${cr.bottom - input.getBoundingClientRect().top + 6}px`
      if (stickBottomRef.current) box.scrollTop = box.scrollHeight
    }
    const ro = new ResizeObserver(apply)
    ro.observe(card)
    if (headRef.current) ro.observe(headRef.current)
    if (inputBarRef.current) ro.observe(inputBarRef.current)
    apply()
    return () => ro.disconnect()
  }, [peer])
  const emojiBtnRef = useRef<HTMLButtonElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null) // campo multi-linha (cresce)
  // Reseta a altura do textarea quando o rascunho esvazia (após enviar/limpar).
  useEffect(() => {
    if (draft === '' && textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [draft])
  const signerRef = useRef<Signer | null>(null)
  const peerRef = useRef<string | null>(null) // peer aberto (p/ o poll saber se a msg é da conversa atual)
  const cursorRef = useRef(0) // cursor de received_at do sync incremental
  const readReceiptsRef = useRef(readReceipts) // evita closure velho no loop do poll
  useEffect(() => {
    readReceiptsRef.current = readReceipts
  }, [readReceipts])
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null) // long-press → menu (mobile)
  const menuFired = useRef(false) // long-press já abriu o menu → o swipe no up NÃO vira reply
  const lastPointerType = useRef<string>('') // blinda o contextmenu no toque (Android abre aos ~500ms)
  useEffect(() => {
    peerRef.current = peer
  }, [peer])

  // MOBILE: conversa aberta = esconde as DUAS barras globais (topbar de cima + nav de
  // baixo) via classe no body. CSS faz o resto (só no celular). Limpa ao sair/voltar.
  useEffect(() => {
    // Só trava quando o mensageiro É a página ativa (rota /mensagens). Ao ir pro /perfil
    // ou /thread (overlay por cima, MensagensPage segue montada com front='chat'), a trava
    // SAI → a página de destino rola normal. Ao voltar p/ /mensagens, religa.
    const on = front === 'chat' && location.pathname.startsWith('/mensagens')
    document.body.classList.toggle('lm-dm-fullchat', on)
    document.documentElement.classList.toggle('lm-dm-fullchat', on) // trava o scroll da página (iOS)
    return () => {
      document.body.classList.remove('lm-dm-fullchat')
      document.documentElement.classList.remove('lm-dm-fullchat')
    }
  }, [front, location.pathname])

  function openEmoji() {
    const r = emojiBtnRef.current?.getBoundingClientRect()
    setEmojiAnchor(r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null)
    setShowEmoji(true)
  }

  // Resolve o signer (nsec local / NIP-07 / bunker) UMA vez por npub.
  async function signer(): Promise<Signer | null> {
    if (!signerRef.current) signerRef.current = await getSigner(npub)
    return signerRef.current
  }
  useEffect(() => {
    signerRef.current = null
  }, [npub])

  const canDM = hasSigner(npub)

  // Confirma (entregue/lido) as mensagens do peer — manda recibo cifrado de volta.
  // Só envia o que ainda não foi confirmado (evita reenvio a cada poll).
  const ackMessages = useCallback(
    async (peerHex: string, items: { id: string; ts: number }[], status: 'delivered' | 'read') => {
      const set = ackRef.current[status]
      const hwmKey = status === 'read' ? 'r' : 'd'
      const hwm = ackHwmRef.current[peerHex]?.[hwmKey] || 0
      // Só confirma o que é GENUINAMENTE novo: id inédito na sessão E mais recente que a
      // marca d'água PERSISTIDA deste peer. Sem essa marca, cada sessão nova re-ackava até
      // 200 msgs velhas ao abrir a conversa → cada recibo vira um wrap com created_at≈agora
      // → o servidor (E2E, cego ao kind, ordena por MAX(created_at)) empurrava a conversa
      // PARADA pro topo dos dois lados, "sem ninguém falar nada".
      const fresh = items.filter((it) => it.id && !it.id.startsWith('local-') && !set.has(it.id) && it.ts > hwm)
      if (!fresh.length) return
      fresh.forEach((it) => set.add(it.id))
      if (status === 'read') {
        fresh.forEach((it) => ackRef.current.delivered.add(it.id)) // lido implica entregue
        void clearDmNotifications() // viu a mensagem → some a notificação do sistema
      }
      try {
        const sg = await signer()
        await sendReceipt(
          sg,
          peerHex,
          fresh.map((it) => it.id),
          status,
        )
        // avança a marca d'água persistida (sobrevive ao reload → não re-acka o histórico)
        const maxTs = Math.max(...fresh.map((it) => it.ts))
        const cur = ackHwmRef.current[peerHex] || { d: 0, r: 0 }
        cur.d = Math.max(cur.d, maxTs)
        if (status === 'read') cur.r = Math.max(cur.r, maxTs) // lido implica entregue → só sobe d tb
        ackHwmRef.current[peerHex] = cur
        persistAckHwm()
      } catch {
        fresh.forEach((it) => set.delete(it.id)) // falhou → permite re-tentar
      }
    },
    // signer() é estável (ref); ackRef/ackHwmRef são refs; persistAckHwm é estável (deps [])
    [persistAckHwm],
  )

  // ── "Chamar a atenção" (zumbido MSN) ──────────────────────────────────────────
  // Dispara o efeito local: som + tremor da carta + vibração (Android; iOS bloqueia
  // vibração por JS → fica só som+tremor). Recepção tem marca d'água persistente (toca 1×
  // e some, nunca re-dispara ao reabrir); envio é estrangulado a 8s p/ não virar spam.
  const lastNudgeSentRef = useRef(0)
  // Vibração FORTE (Android). iOS/Safari/PWA bloqueia vibrate por JS → no iPhone fica só som+tremor.
  const buzzNudge = useCallback(() => {
    try {
      ;(navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.([350, 120, 350, 120, 450])
    } catch {
      /* iOS bloqueia — sem vibração possível via web */
    }
  }, [])
  const triggerNudge = useCallback(() => {
    setShake(true)
    window.setTimeout(() => setShake(false), 650) // dura o tempo da animação
    playNudge()
    buzzNudge()
  }, [buzzNudge])
  // Envia o zumbido pro peer (com feedback local imediato + anti-spam de 8s).
  const doNudge = useCallback(
    async (peerNpub: string) => {
      const now = Date.now()
      if (now - lastNudgeSentRef.current < 8000) return
      lastNudgeSentRef.current = now
      const ph = npubToHex(peerNpub)
      if (!ph) return
      triggerNudge() // a tua própria janela também treme (igual MSN)
      try {
        await sendNudge(await signer(), ph)
      } catch {
        /* sem chave / rede — silencioso (o feedback local já aconteceu) */
      }
    },
    // signer() é estável (ref); triggerNudge é estável
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [triggerNudge],
  )

  // Lista de conversas.
  useEffect(() => {
    if (!loggedIn) return
    let alive = true
    // 1) INSTANTÂNEO do IndexedDB (antes do servidor).
    loadConversations(npub || '').then((cached) => {
      if (alive && cached.length) {
        setConvs(cached.map((c) => ({ peerNpub: c.peerNpub, peerHex: c.peerHex, lastTs: c.lastTs, total: c.total, preview: c.preview })))
        setLoading(false)
        // Resolve nome/avatar já AGORA (cache instantâneo + background) — não espera o servidor.
        requestProfiles(cached.map((c) => c.peerHex))
      }
    })
    // 2) Servidor (fonte da verdade) — atualiza e regrava no cache.
    api
      .get<{ conversations: { peer_npub: string; total: number; last_ts: number; last_event: unknown }[] }>(
        '/api/dm/conversations',
      )
      .then(async (res) => {
        if (!alive) return
        const sg = await signer()
        // Prévia da última mensagem de TEXTO/mídia (do cache) por conversa — o último
        // EVENTO do servidor costuma ser recibo/reação (viraria "[mensagem]").
        const prevMap = await lastTextPreviews(npub || '')
        const list: Conv[] = await Promise.all(
          (res.conversations ?? []).map(async (c) => {
            let preview = '[mensagem]'
            // ORDENAÇÃO pela data REAL da última MENSAGEM (rumor), não pelo carimbo do WRAP
            // que o servidor guarda (kind:1059): esse é jitterado pelo NIP-59 e "renovado"
            // por cada recibo/reação → punha conversa parada no topo. c.last_ts é só fallback
            // (conversa que ESTE device nunca abriu → sem cache local p/ saber a data real).
            let lastTs = c.last_ts
            const cachedPrev = prevMap[c.peer_npub]
            if (cachedPrev) {
              preview = previewText(cachedPrev.content, cachedPrev.media)
              lastTs = cachedPrev.ts // última msg de texto/mídia do cache = verdade
            } else {
              const raw = parseRaw(c.last_event)
              const dec = raw ? await unwrapWithSigner(sg, raw) : null
              if (dec) {
                if (dec.kind === KIND_REACTION) preview = `reagiu ${emojifyShortcodes(dec.content)}`
                else if (dec.kind === KIND_RECEIPT) preview = '[mensagem]'
                else if (isGroupControlPayload(dec.content)) preview = '[mensagem]'
                else {
                  preview = previewText(dec.content, detectMedia(dec.content, dec.tags))
                  lastTs = dec.created_at // last_event é mensagem real → data do rumor (real)
                }
              } else if (typeof raw?._plaintext === 'string' && !isGroupControlPayload(raw._plaintext as string)) {
                preview = previewText(raw._plaintext as string)
              }
            }
            return {
              peerNpub: c.peer_npub,
              peerHex: npubToHex(c.peer_npub),
              lastTs,
              total: c.total,
              preview: preview.slice(0, 80),
            }
          }),
        )
        if (!alive) return
        // Reordena pela data REAL (o servidor devolve por MAX(created_at) do wrap = impreciso).
        list.sort((a, b) => b.lastTs - a.lastTs)
        setConvs(list)
        setLoading(false)
        void cacheConversations(npub || '', list)
        // Resolve via cache compartilhado (profiles.ts): instantâneo p/ conhecidos +
        // background p/ o resto, e o feed reaproveita (mesmo "cérebro" de perfis).
        requestProfiles(list.map((c) => c.peerHex))
      })
      .catch(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [loggedIn, npub, convNonce])

  // Recupera conversas "sumidas" cross-device: wraps sincronizados com peer_npub NULL
  // (o servidor não decripta → não sabia de quem eram). Decripta e grava o peer; se
  // recuperou algo, re-busca a lista (convNonce) p/ as conversas aparecerem.
  useEffect(() => {
    if (!loggedIn || !npub) return
    let alive = true
    void (async () => {
      const sg = await signer()
      if (!sg || !alive) return
      const n = await recoverPendingWraps(sg, pubkeyHex)
      if (alive && n > 0) setConvNonce((x) => x + 1)
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, npub, pubkeyHex])

  // Sync incremental (Fase 3): poll por received_at a cada 12s + ao focar a aba.
  // Mensagens novas entram sem refetch. Na Fase 4 o push dispara o mesmo doPoll.
  useEffect(() => {
    if (!loggedIn || !npub || !pubkeyHex) return
    // Cursor: usa o salvo. Se não há, ANCORA no relógio do SERVIDOR (não no Date.now()
    // do aparelho — divergência de relógio travava o poll: received_at > cursor nunca
    // casava → mensagem nova não chegava). needBaseline = busca server_now no 1º poll.
    const saved = getCursor(npub)
    cursorRef.current = saved > 0 ? saved : 0
    let needBaseline = saved <= 0

    let alive = true
    let busy = false
    let lastSync = 0
    // Gate do som: aquecimento inicial (o sync+poll inicial despejam histórico) e EOSE
    // da live sub (o backfill de 48h chega ANTES do EOSE → entra mudo). Ver applyIncoming.
    let liveReady = false
    const warmupUntil = Date.now() + 2500

    // Dispara o sync server-side (servidor puxa DM dos relays → cache), estrangulado
    // a 15s p/ respeitar o rate-limit (5/min). É o que traz DM de TERCEIROS.
    const maybeSync = async (deep = false) => {
      const now = Date.now()
      if (!deep && now - lastSync < 15000) return
      lastSync = now
      try {
        await triggerServerSync(undefined, deep)
      } catch {
        /* 429/rede — tenta no próximo */
      }
    }

    type In = { id: string; content: string; mine: boolean; ts: number; peerHex: string; kind: number; tags: string[][]; eids?: string[]; replyTo?: string }
    const applyIncoming = (items: In[], allowSound = true) => {
      if (!items.length) return
      // Roteia (preciso do peerHex por item → não uso splitRumors aqui).
      const texts: (Msg & { peerHex: string })[] = []
      const reacts: { target: string; id: string; emoji: string; mine: boolean }[] = []
      const recs: { targets: string[]; status: 'delivered' | 'read'; mine: boolean }[] = []
      const nudgeFrom: string[] = [] // peerHex de quem me chamou a atenção (zumbido)
      let maxNudgeTs = 0 // created_at do zumbido mais novo recebido (p/ marca d'água)
      for (const it of items) {
        if (it.kind === KIND_REACTION) {
          const target = it.tags.find((t) => t[0] === 'e')?.[1]
          if (target && it.content) reacts.push({ target, id: it.id, emoji: it.content, mine: it.mine })
        } else if (it.kind === KIND_RECEIPT) {
          const status = it.tags.find((t) => t[0] === 'status')?.[1]
          const targets = it.tags.filter((t) => t[0] === 'e').map((t) => t[1])
          if ((status === 'delivered' || status === 'read') && targets.length) recs.push({ targets, status, mine: it.mine })
        } else if (it.kind === KIND_NUDGE) {
          if (!it.mine) { nudgeFrom.push(it.peerHex); if (it.ts > maxNudgeTs) maxNudgeTs = it.ts } // só o zumbido do OUTRO me chama
        } else if (!isGroupControlPayload(it.content)) {
          // QUALQUER outro rumor = texto (ver nota em splitRumors). Envelopes de
          // controle de grupo (session_create…) são descartados (não viram balão).
          texts.push({ id: it.id, content: it.content, mine: it.mine, ts: it.ts, eids: it.eids, replyTo: it.replyTo, peerHex: it.peerHex, media: detectMedia(it.content, it.tags) })
        }
      }
      // Zumbido ("chamar a atenção"): dispara UMA vez e NUNCA MAIS — marca d'água persistente
      // por conta (`lm_dm_nudge_hwm_<npub>`). O que já tocou não re-toca ao reabrir o app. Só
      // dispara se for RECENTE (≤2min): zumbido antigo no catch-up é só MARCADO (avança a marca),
      // não buzina. Treme a tela só se a conversa do chamador estiver ABERTA; senão é só som+vibração.
      if (allowSound && maxNudgeTs > 0) {
        const hwmKey = `lm_dm_nudge_hwm_${npub}`
        const hwm = Number(localStorage.getItem(hwmKey) || 0)
        if (maxNudgeTs > hwm) {
          localStorage.setItem(hwmKey, String(maxNudgeTs)) // marca → não dispara de novo, nunca
          const recent = Math.floor(Date.now() / 1000) - maxNudgeTs < 120
          if (recent && Date.now() >= warmupUntil) {
            const open = peerRef.current ? npubToHex(peerRef.current) : null
            if (open && nudgeFrom.includes(open)) triggerNudge()
            else { playNudge(); buzzNudge() }
          }
        }
      }
      if (reacts.length) setReactions((prev) => mergeReactions(prev, reacts))
      if (recs.length) setReceipts((prev) => mergeReceipts(prev, recs))
      if (!texts.length) return
      // Som de RECEBIMENTO: só p/ NOVIDADE REAL — mensagem de OUTRO, id INÉDITO (sessão),
      // mais nova que a MARCA D'ÁGUA persistente (lida → nunca mais soa, mesmo após reload),
      // fora do aquecimento e fora do backfill da live sub (allowSound). playRecvMsg ainda
      // coalesce rajada em 1 som. Marca como vista SEMPRE e avança a marca d'água p/ TODAS
      // (mesmo mudas) → reabrir/recarregar não re-dispara o som das já vistas.
      const hasNew = texts.some((t) => !t.mine && !seenIdsRef.current.has(t.id) && t.ts > soundHwmRef.current)
      if (allowSound && hasNew && Date.now() >= warmupUntil) playRecvMsg()
      for (const t of texts) seenIdsRef.current.add(t.id)
      bumpSoundHwm(Math.max(0, ...texts.map((t) => t.ts)))

      setConvs((prev) => {
        const map = new Map(prev.map((c) => [c.peerNpub, c]))
        for (const it of texts) {
          let pnpub: string
          try {
            pnpub = nip19.npubEncode(it.peerHex)
          } catch {
            continue
          }
          const ex = map.get(pnpub)
          const conv: Conv = ex ? { ...ex } : { peerNpub: pnpub, peerHex: it.peerHex, lastTs: 0, total: 0, preview: '' }
          if (it.ts >= conv.lastTs) {
            conv.lastTs = it.ts
            conv.preview = previewText(it.content, it.media).slice(0, 80)
          }
          conv.total = (conv.total || 0) + 1
          map.set(pnpub, conv)
        }
        return [...map.values()].sort((a, b) => b.lastTs - a.lastTs)
      })

      // PLANO_DM Fase 1 — PERSISTE TODA mensagem no IndexedDB por peer (não só a conversa
      // ABERTA). Bug raiz: msg de conversa FECHADA atualizava só a PRÉVIA da lista e
      // NÃO era gravada → ao abrir depois, loadMessages não a tinha e o /api/dm/history do
      // servidor não traz wrap com peer_npub NULL → "aparece na prévia, some dentro". Com o
      // device guardando TUDO que decifra (ele sempre sabe o peer), a conversa abre completa.
      const byPeerCache = new Map<string, { id: string; content: string; mine: boolean; ts: number; eids?: string[]; replyTo?: string; media?: MediaAttachment }[]>()
      for (const it of texts) {
        let pnpub: string
        try { pnpub = nip19.npubEncode(it.peerHex) } catch { continue }
        const arr = byPeerCache.get(pnpub) || []
        arr.push({ id: it.id, content: it.content, mine: it.mine, ts: it.ts, eids: it.eids, replyTo: it.replyTo, media: it.media })
        byPeerCache.set(pnpub, arr)
      }
      for (const [pnpub, arr] of byPeerCache) void cacheMessages(npub, pnpub, arr)

      // A conversa ABERTA também entra na lista em memória (UI) na hora.
      const openPeer = peerRef.current
      const openHex = openPeer ? npubToHex(openPeer) : null
      if (openPeer) {
        const forOpen = texts
          .filter((it) => it.peerHex === openHex)
          .map((it) => ({ id: it.id, content: it.content, mine: it.mine, ts: it.ts, eids: it.eids, replyTo: it.replyTo, media: it.media }))
        if (forOpen.length) {
          setMsgs((prev) => dedupMsgs([...prev, ...forOpen]))
          // scroll pro fim é tratado pelo useLayoutEffect (respeita se rolou p/ cima)
        }
      }

      // Auto-recibo das mensagens recebidas do peer: entregue sempre; lido se a
      // conversa do peer está aberta e visível e a pref estiver ligada.
      const visible = typeof document !== 'undefined' && !document.hidden
      const byPeer = new Map<string, { id: string; ts: number }[]>()
      for (const t of texts) {
        if (t.mine) continue
        const a = byPeer.get(t.peerHex) || []
        a.push({ id: t.id, ts: t.ts })
        byPeer.set(t.peerHex, a)
      }
      for (const [ph, items] of byPeer) {
        void ackMessages(ph, items, 'delivered')
        if (visible && readReceiptsRef.current && ph === openHex) void ackMessages(ph, items, 'read')
      }
    }

    const doPoll = async () => {
      if (busy || !alive || document.hidden) return
      busy = true
      try {
        const sg = await signer()
        if (!sg) return
        // 1ª vez sem cursor salvo: ancora no relógio do SERVIDOR (não no do aparelho).
        // Mensagens já existentes vêm pelo histórico/recoverPendingWraps; o poll cuida
        // das NOVAS daqui pra frente. (finally reseta busy; próximo tick já poll normal.)
        if (needBaseline) {
          const sn = await fetchServerNow()
          if (sn > 0) {
            cursorRef.current = sn
            setCursor(npub, sn)
          }
          needBaseline = false
          return
        }
        void maybeSync() // servidor puxa novos wraps dos relays (estrangulado)
        const { events, cursor } = await pollInbox(cursorRef.current)
        if (!alive) return
        if (events.length) {
          // rede de segurança (poll) também alimenta a âncora/dedup do relay-as-truth
          void markWrapsSeen(npub, events.map((e) => ({ id: String((e as { id?: unknown }).id || ''), ts: Number((e as { created_at?: unknown }).created_at) || 0 })))
          const backfill: { wrap: Record<string, unknown>; peerHex: string }[] = []
          const decoded = (
            await Promise.all(
              events.map(async (e) => {
                const r = await unwrapForInbox(sg, e, pubkeyHex)
                if (r?.peerHex) backfill.push({ wrap: e, peerHex: r.peerHex })
                return r ? ({ ...r, eids: e.id ? [String(e.id)] : undefined } as In) : null
              }),
            )
          ).filter((x): x is In => x !== null)
          if (backfill.length) void storePeerForWraps(backfill) // grava o peer no servidor (cross-device)
          if (alive && decoded.length) applyIncoming(decoded)
        }
        if (cursor > cursorRef.current) {
          cursorRef.current = cursor
          setCursor(npub, cursor)
        }
      } catch {
        /* rede/sessão — tenta no próximo tick */
      } finally {
        busy = false
      }
    }

    // PLANO_DM Fase 1 — RELAY = fonte da verdade: puxa kind:1059 #p=eu DIRETO do relay,
    // decifra LOCAL e persiste no IndexedDB (markWrapsSeen). since = (último wrap local) − 48h
    // (janela anti-jitter NIP-59); sem histórico local OU gap > 48h → varredura completa. Dedup
    // persistente por event.id (seenWrapIds) não re-decifra todo boot. O poll/sync do servidor
    // segue como REDE DE SEGURANÇA (dual-read) até validarmos em 2 aparelhos.
    const relayHistory = async () => {
      if (!alive) return
      try {
        const sg = await signer()
        if (!sg || !alive) return
        const last = await lastWrapTs(npub)
        const now = Math.floor(Date.now() / 1000)
        const wide = !last || now - last > 48 * 3600
        const filter = wide
          ? { kinds: [1059], '#p': [pubkeyHex], limit: 500 }
          : { kinds: [1059], '#p': [pubkeyHex], since: last - 48 * 3600 }
        const evs = await relayManager.query([filter], { relays: DM_RELAYS, maxWait: 6000 })
        if (!alive || !evs.length) return
        const seen = await seenWrapIds(npub)
        const fresh = evs.filter((e) => e.id && !seen.has(e.id))
        // marca TODOS (mesmo os que não decifrarem) → não re-tenta o mesmo wrap todo boot
        await markWrapsSeen(npub, evs.map((e) => ({ id: String(e.id), ts: e.created_at })))
        if (!fresh.length || !alive) return
        const decoded: In[] = []
        for (const e of fresh) {
          const r = await unwrapForInbox(sg, e, pubkeyHex)
          if (r) decoded.push({ ...r, eids: e.id ? [String(e.id)] : undefined })
        }
        if (alive && decoded.length) applyIncoming(decoded, false) // histórico = mudo
      } catch {
        /* rede/relay — poll/sync do servidor cobre (dual-read) */
      }
    }

    // BACKFILL HISTÓRICO — recupera o histórico antigo num aparelho novo/limpo (o
    // relayHistory traz só ~2-3 dias de wraps por causa do volume; o poll, só NOVAS).
    // Pagina o cold storage do mais NOVO p/ o mais ANTIGO, em LOTES PEQUENOS com FOLGA
    // entre eles → NÃO trava o celular. Recente-primeiro (o usuário já vê as últimas; o
    // antigo preenche por cima progressivamente). Idempotente: dedup por event.id +
    // cursor `oldest` por dono. Por sessão limita os lotes (MAX_BATCHES) e RETOMA no
    // próximo boot até `done`. kind:4 legado decifra → null aqui (Fase B, separada).
    const backfillHistory = async () => {
      if (!alive) return
      const st = getBackfill(npub)
      if (st.done) return // histórico já varrido inteiro neste aparelho
      const sg = await signer()
      if (!sg || !alive) return
      const BATCH = 150
      const GAP = 700 // ms entre lotes (não trava a UI)
      const MAX_BATCHES = 80 // teto por sessão (~12k eventos); retoma no próximo boot
      // Cursor COMPOSTO (received_at, event_id): segundos da migração têm milhares de wraps
      // no mesmo received_at → cursor só por tempo pularia/travaria.
      let before = st.oldest > 0 ? st.oldest : await fetchServerNow()
      let beforeId = st.oldestId || ''
      if (!before) before = Math.floor(Date.now() / 1000)
      for (let n = 0; n < MAX_BATCHES && alive; n++) {
        let batch: { events: Record<string, unknown>[]; oldest: number; oldestId: string; done: boolean }
        try {
          batch = await backfillBatch(before, beforeId, BATCH)
        } catch {
          return // rede/relay — retoma no próximo boot (cursor persistido)
        }
        if (!alive) return
        if (!batch.events.length) {
          setBackfill(npub, before, beforeId, true)
          return
        }
        const seen = await seenWrapIds(npub)
        const fresh = batch.events.filter((e) => {
          const id = String((e as { id?: unknown }).id || '')
          return id && !seen.has(id)
        })
        await markWrapsSeen(
          npub,
          batch.events.map((e) => ({
            id: String((e as { id?: unknown }).id || ''),
            ts: Number((e as { created_at?: unknown }).created_at) || 0,
          })),
        )
        if (fresh.length) {
          const decoded: In[] = []
          for (const e of fresh) {
            const r = await unwrapForInbox(sg, e, pubkeyHex) // kind:4 → null (Fase B)
            if (r) decoded.push({ ...r, eids: e.id ? [String(e.id)] : undefined })
          }
          if (alive && decoded.length) applyIncoming(decoded, false) // histórico = mudo
        }
        before = batch.oldest
        beforeId = batch.oldestId
        setBackfill(npub, before, beforeId, batch.done)
        if (batch.done) return
        await new Promise((r) => setTimeout(r, GAP)) // folga p/ não travar o celular
      }
    }

    void relayHistory() // RELAY primeiro (fonte da verdade)
    void maybeSync(true) // deep sync no início (rede de segurança: DM de terceiros pendentes)
    void doPoll()
    void backfillHistory() // histórico antigo em background, lotes pequenos
    const iv = setInterval(doPoll, 8000)
    const onVis = () => {
      if (!document.hidden) {
        openLive() // reabre a live-sub caso o WS tenha caído em background
        void relayHistory()
        void maybeSync()
        void doPoll()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    // Troca de rede (WiFi↔4G) derruba o WS sem visibilitychange → reabrir aqui também.
    const onOnline = () => {
      openLive()
      void doPoll()
    }
    window.addEventListener('online', onOnline)
    // Push → sync instantâneo: o SW posta 'lm-dm-sync' ao receber push → puxa já.
    const onSwMsg = (ev: MessageEvent) => {
      if ((ev.data as { type?: string } | null)?.type === 'lm-dm-sync') {
        openLive() // push chegou → garante a live-sub viva antes de puxar
        void maybeSync()
        void doPoll()
      }
    }
    navigator.serviceWorker?.addEventListener('message', onSwMsg)

    // ── ENTREGA AO VIVO ── assina o relay p/ kind:1059 #p=eu → mensagem nova cai na
    // conversa em ~1s, sem depender do poll (8s) nem do push (sender-ping). O poll/
    // sync continua como rede de segurança (histórico + cross-device + remetente externo
    // sem push). Gift wrap (NIP-59) tem created_at ALEATÓRIO até 48h no passado, então
    // `since` recua 48h p/ não perder wrap novo com timestamp antigo; o dedup (por id do
    // rumor em applyIncoming/dedupMsgs e por event.id na própria subscription) absorve o
    // que o histórico já trouxe.
    const onWrap = async (ev: NostrEvent) => {
      if (!alive) return
      try {
        const sg = await signer()
        if (!sg || !alive) return
        const r = await unwrapForInbox(sg, ev, pubkeyHex)
        if (!r || !alive) return
        void markWrapsSeen(npub, [{ id: String(ev.id), ts: ev.created_at }]) // âncora do since avança
        if (r.peerHex) void storePeerForWraps([{ wrap: ev as unknown as Record<string, unknown>, peerHex: r.peerHex, isControl: isControlKind(r.kind) }])
        // allowSound = liveReady: o backfill (48h) chega ANTES do EOSE → entra MUDO;
        // só wrap genuinamente ao vivo (pós-EOSE) pode soar.
        applyIncoming([{ ...r, eids: ev.id ? [String(ev.id)] : undefined }], liveReady)
      } catch {
        /* decifra falhou / rede — o poll pega no próximo ciclo */
      }
    }
    // A live-sub morre CALADA quando o WebSocket cai (tela apaga, WiFi↔4G, TWA em
    // background, relay reinicia) — o SimplePool não reconecta (enableReconnect=false no
    // nostr-tools). Sem reabrir, a entrega degrada pro poll (8s, e só com aba visível):
    // é a causa raiz do "chega rápido no começo, depois atrasa" e do celular ficar pior
    // que o desktop. openLive() REABRE a sub; é chamada em visibilitychange→visível,
    // 'online' e push. since recua 48h (anti-jitter NIP-59); o dedup (seenWrapIds +
    // dedupMsgs) absorve o reenvio. Debounce de 15s evita rajada de resubscribe.
    let liveSub: ReturnType<typeof relayManager.subscribe> | null = null
    let lastLiveOpen = 0
    const openLive = () => {
      const now = Date.now()
      if (now - lastLiveOpen < 15000) return
      lastLiveOpen = now
      try { liveSub?.close() } catch { /* noop */ }
      liveReady = false
      const since = Math.floor(Date.now() / 1000) - 48 * 3600
      liveSub = relayManager.subscribe(
        [{ kinds: [1059], '#p': [pubkeyHex], since }],
        (ev) => {
          void onWrap(ev)
        },
        // DM tem INBOX DEDICADO (NIP-17): ler dos MESMOS relays onde escrevemos (DM_RELAYS,
        // origin), NÃO do conjunto geo/regional — senão device no IL lê do relay-il (que pode
        // não ter o wrap) e perde mensagem que outro device (no origin) vê.
        { relays: DM_RELAYS, onEose: () => { liveReady = true } },
      )
    }
    openLive()

    return () => {
      alive = false
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
      window.removeEventListener('online', onOnline)
      navigator.serviceWorker?.removeEventListener('message', onSwMsg)
      try { liveSub?.close() } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, npub, pubkeyHex])

  // Abre conversa → carrega histórico.
  const openConv = useCallback(
    async (peerNpub: string) => {
      stickBottomRef.current = true // abrir conversa = grudar no fim (última mensagem)
      const owner = npub || ''
      // 1) Carrega o cache ANTES de trocar o visual → o wallpaper (da conversa) e as
      //    mensagens aparecem JUNTOS, sem o flash de wallpaper vazio antes das mensagens.
      const cached = await loadMessages(owner, peerNpub).catch(() => [])
      const cachedMsgs: Msg[] = cached.map((c) => ({ id: c.id, content: c.content, mine: c.mine, ts: c.ts, eids: c.eids, replyTo: c.replyTo, media: c.media }))
      setPeer(peerNpub)
      setMsgs(cachedMsgs)
      for (const m of cachedMsgs) seenIdsRef.current.add(m.id)
      bumpSoundHwm(Math.max(0, ...cachedMsgs.filter((m) => !m.mine).map((m) => m.ts)))
      setLoadingMsgs(cachedMsgs.length === 0)

      // 2) Servidor → decodifica TUDO (texto/reação/recibo) → roteia → cache.
      const myHex = pubkeyHex
      try {
        const sg = await signer()
        // RAIZ DA RECEPÇÃO: o sync do servidor guarda os gift wraps de TERCEIROS com
        // peer_npub=NULL (E2E — o servidor não decripta). O /api/dm/history filtra por
        // peer, então NÃO traz os NULL; e o poll incremental pode pulá-los (cursor por
        // received_at). Decifrar os pendentes AQUI, antes do histórico, dá o peer a eles
        // e os coloca na conversa certa — independente do poll. (Era a pendência aberta.)
        await recoverPendingWraps(sg, myHex)
        // until=agora → o servidor devolve as 200 mais RECENTES (created_at < until
        // ORDER BY DESC). Sem until ele mandava as 200 mais ANTIGAS e cortava hoje.
        // (jitter do NIP-59 só RECUA o created_at, então now+1d cobre tudo.)
        const until = Math.floor(Date.now() / 1000) + 86400
        const res = await api.get<{ events: Record<string, unknown>[] }>(
          `/api/dm/history?peer=${encodeURIComponent(peerNpub)}&until=${until}&limit=200`,
        )
        const decoded: Decoded[] = (
          await Promise.all(
            (res.events ?? []).map(async (ev) => {
              const dec = await unwrapWithSigner(sg, ev)
              if (dec) {
                return {
                  id: dec.id || (ev.id ? String(ev.id) : ''), // rumor legado pode vir sem id
                  content: dec.content,
                  mine: dec.pubkey === myHex,
                  ts: dec.created_at,
                  kind: dec.kind,
                  tags: dec.tags,
                  eids: ev.id ? [String(ev.id)] : undefined,
                  replyTo: dec.replyTo,
                } as Decoded
              }
              // Legado com _plaintext (não decriptado). Só dá p/ saber o LADO no NIP-04
              // (kind:4), onde ev.pubkey é o remetente real. Gift wrap (1059) não
              // decriptado tem pubkey EFÊMERO → não dá p/ atribuir → pula (a cópia que
              // decripta já mostra a mensagem do lado certo). Evita embaralhar + duplicar.
              const pt = typeof ev._plaintext === 'string' ? ev._plaintext : ''
              if (!pt || Number(ev.kind) !== 4) return null
              return {
                id: String(ev.id ?? ''),
                content: pt,
                mine: typeof ev.pubkey === 'string' && ev.pubkey === myHex,
                ts: Number(ev.created_at) || 0,
                kind: KIND_DM,
                tags: [],
                eids: ev.id ? [String(ev.id)] : undefined,
              } as Decoded
            }),
          )
        ).filter((d): d is Decoded => d !== null)

        const { texts, reacts, recs } = splitRumors(decoded)
        const merged = dedupMsgs([...cachedMsgs, ...texts])
        setMsgs(merged)
        for (const m of merged) seenIdsRef.current.add(m.id)
        // Abrir a conversa = VER as mensagens → avança a marca d'água (não re-soam depois).
        bumpSoundHwm(Math.max(0, ...merged.filter((m) => !m.mine).map((m) => m.ts)))
        void cacheMessages(owner, peerNpub, merged)
        setReactions((prev) => mergeReactions(prev, reacts))
        setReceipts((prev) => mergeReceipts(prev, recs))
        // Confirma as mensagens do peer: entregue sempre + lido se a pref estiver ligada.
        const peerHex = npubToHex(peerNpub)
        if (peerHex) {
          const peerItems = texts.filter((m) => !m.mine).map((m) => ({ id: m.id, ts: m.ts }))
          void ackMessages(peerHex, peerItems, 'delivered')
          if (readReceipts) void ackMessages(peerHex, peerItems, 'read')
        }
      } catch (e) {
        // NÃO engolir em silêncio (foi o que escondeu o bug do dedup por horas).
        console.error('[DM] openConv falhou:', e)
      } finally {
        setLoadingMsgs(false)
        // Rede de segurança p/ layout tardio (imagens/vídeos empurram o conteúdo).
        if (stickBottomRef.current) setTimeout(scrollToBottom, 250)
      }
    },
    [npub, pubkeyHex, readReceipts, ackMessages, scrollToBottom],
  )

  // Seleciona uma conversa → traz a carta CONVERSA pra frente.
  const selectConv = useCallback(
    (peerNpub: string) => {
      setFront('chat')
      void openConv(peerNpub)
    },
    [openConv],
  )

  // Abre a conversa quando chega de OUTRA página via navigate('/mensagens',{state:{peer}})
  // — usado pelo botão Mensagem do perfil e pelo ícone das notificações. Limpa o state
  // depois pra não reabrir em re-render/volta.
  useEffect(() => {
    const peerNpub = (location.state as { peer?: string } | null)?.peer
    if (!peerNpub) return
    selectConv(peerNpub)
    navigate('.', { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  // Nova conversa: registra o perfil da pessoa buscada (p/ nome/avatar) e abre a conversa.
  const startChatWith = useCallback(
    (u: SearchUser) => {
      primeProfiles({ [u.pubkey]: { pubkey: u.pubkey, name: u.name, display_name: u.name, picture: u.picture, nip05: u.nip05 } })
      setShowNewChat(false)
      selectConv(u.npub)
    },
    [selectConv],
  )

  // Núcleo de envio (texto OU anexo). Anexo: a URL vai no content (interop) + tag
  // ['media', mime, url] (mime confiável p/ render, mesmo sem extensão na URL).
  async function deliver(text: string, opts?: { replyId?: string; media?: MediaAttachment; mime?: string }) {
    const peerHex = peer ? npubToHex(peer) : null
    const content = text.trim()
    if (!content || !peerHex) return
    // 1) OTIMISTA imediato — a mensagem aparece na HORA (relógio = enviando).
    const localId = 'local-' + Date.now() + '-' + Math.floor(Math.random() * 1e6)
    const optimistic: Msg = {
      id: localId,
      content,
      mine: true,
      ts: Math.floor(Date.now() / 1000),
      replyTo: opts?.replyId,
      media: opts?.media,
    }
    stickBottomRef.current = true // enviei → desce pro fim
    setMsgs((m) => [...m, optimistic])
    playSendMsg() // som de envio (gesto do usuário → destrava o áudio no mobile)
    const convPeer = peer
    if (convPeer) void cacheMessages(npub || '', convPeer, [optimistic])
    // 2) Assina/cifra/publica em BACKGROUND (não trava a UI). O evento real volta pelo
    //    poll e o dedup funde (relógio → ✓). Se falhar, marca a mensagem como não enviada.
    try {
      const sg = await signer()
      const extraTags = opts?.media && opts.mime ? [['media', opts.mime, opts.media.url]] : undefined
      await sendDM(sg, peerHex, content, opts?.replyId, extraTags)
    } catch (e) {
      setMsgs((m) => m.map((x) => (x.id === localId ? { ...x, failed: true } : x)))
      toast(e instanceof Error ? e.message : 'Falha ao enviar', 'error')
    }
  }

  function send() {
    const text = draft.trim()
    if (!text || !peer) return
    const replyId = replyingTo?.id
    setDraft('') // limpa o input JÁ
    setReplyingTo(null)
    void deliver(text, { replyId }) // otimista + envio em background
  }

  // Anexa arquivos: sobe c/ progresso → envia a URL como mensagem (com tag media).
  async function onAttachPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length || !peer) return
    for (const f of files) {
      setAttaching(0)
      try {
        const up = await uploadFileWithProgress(f, (p) => setAttaching(p))
        setAttaching(100)
        const mime = up.mime || f.type || ''
        await deliver(up.url, { media: { url: up.url, kind: mediaFromMime(mime) }, mime })
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Falha ao enviar anexo')
      } finally {
        setAttaching(null)
      }
    }
  }

  // Grava áudio (MediaRecorder) → envia como anexo de áudio (mesma via do 6d-3).
  async function startRec() {
    if (!canDM || recording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data)
      }
      recRef.current = mr
      mr.start()
      setRecording(true)
      setRecSecs(0)
      recTimerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000)
    } catch {
      alert('Não foi possível acessar o microfone. Verifique a permissão do navegador.')
    }
  }

  // SEGURAR 2s p/ gravar (anti-disparo acidental). Soltar/sair antes → cancela.
  const startMicHold = () => {
    if (!canDM || attaching !== null || micHoldTimer.current) return
    setMicHolding(true)
    micHoldTimer.current = setTimeout(() => {
      micHoldTimer.current = null
      setMicHolding(false)
      void startRec()
    }, 800)
  }
  const cancelMicHold = () => {
    if (micHoldTimer.current) {
      clearTimeout(micHoldTimer.current)
      micHoldTimer.current = null
    }
    setMicHolding(false)
  }

  async function finishRec(sendIt: boolean) {
    const mr = recRef.current
    if (!mr) return
    if (recTimerRef.current) clearInterval(recTimerRef.current)
    setRecording(false)
    const mime = mr.mimeType || 'audio/webm'
    await new Promise<void>((res) => {
      mr.onstop = () => {
        mr.stream.getTracks().forEach((t) => t.stop())
        res()
      }
      mr.stop()
    })
    recRef.current = null
    const chunks = chunksRef.current
    chunksRef.current = []
    if (!sendIt || !peer) return
    const blob = new Blob(chunks, { type: mime })
    if (!blob.size) return
    const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm'
    const file = new File([blob], `voz-${Date.now()}.${ext}`, { type: mime })
    setAttaching(0)
    try {
      const up = await uploadFileWithProgress(file, (p) => setAttaching(p))
      setAttaching(100)
      // Voz é sempre áudio (o magic-byte do servidor pode confundir webm com vídeo).
      // up.mime = mime do SERVIDOR (após transcodificar webm→mp3 p/ tocar no iOS).
      // FORÇA mime de ÁUDIO na tag: se o servidor devolver video/* (webm confundido),
      // a prévia da lista relê a tag via detectMedia e mostrava "🎥 Vídeo". Como voz é
      // sempre áudio, garantimos um audio/* na tag (o subtipo só importa p/ classificar).
      const tagMime = up.mime && up.mime.startsWith('audio/') ? up.mime : 'audio/mp4'
      await deliver(up.url, { media: { url: up.url, kind: 'audio' }, mime: tagMime })
    } catch {
      alert('Falha ao enviar o áudio.')
    } finally {
      setAttaching(null)
    }
  }

  // Limpa a gravação se desmontar no meio.
  useEffect(() => {
    return () => {
      if (recTimerRef.current) clearInterval(recTimerRef.current)
      try {
        recRef.current?.stream.getTracks().forEach((t) => t.stop())
      } catch {
        /* noop */
      }
    }
  }, [])

  // Reage a uma mensagem (kind:7). Otimista; reverte se o envio falhar.
  async function reactTo(target: Msg, emoji: string) {
    setReactFor(null)
    setMsgMenu(null)
    const peerHex = peer ? npubToHex(peer) : null
    if (!peerHex) return
    recordEmoji(emoji)
    const optimisticId = 'localr-' + Date.now()
    setReactions((prev) => mergeReactions(prev, [{ target: target.id, id: optimisticId, emoji, mine: true }]))
    try {
      const sg = await signer()
      await sendReaction(sg, peerHex, target.id, emoji)
    } catch (e) {
      setReactions((prev) => {
        const t = { ...(prev[target.id] || {}) }
        delete t[optimisticId]
        return { ...prev, [target.id]: t }
      })
      alert(e instanceof Error ? e.message : 'Falha ao reagir')
    }
  }

  // Abre o menu da mensagem PERTO do ponto clicado (não estoura pra direita).
  function placeMenu(m: Msg, x: number, y: number) {
    const menuW = 180
    const menuH = 150
    const lx = x + menuW > window.innerWidth - 8 ? Math.max(8, x - menuW) : x
    const ly = Math.min(y, window.innerHeight - menuH)
    setMsgMenu({ msg: m, x: lx, y: Math.max(8, ly) })
  }

  // Gestos MOBILE do balão:
  //  • arrastar no sentido CONTRÁRIO à origem = RESPONDER esta mensagem (estilo WhatsApp).
  //    Recebida (esquerda) → arrasta p/ direita; própria (direita) → arrasta p/ esquerda.
  //    O balão desliza com rubber-band; ao passar o limite e soltar, entra no modo responder.
  //  • segurar ~0,6s (long-press) = abre o modal de opções (⋮). Cancelado só em gesto REAL
  //    (swipe/scroll); o tremor do dedo parado é tolerado — 8px + 2s cancelava sempre (bug).
  // Restrito a toque (no desktop: botão ⋮ no hover + clique-direito).
  const swipeRef = useRef<{ x0: number; y0: number; el: HTMLElement; dir: number; swiping: boolean } | null>(null)
  const SWIPE_OPEN = 56 // px p/ disparar o "responder" (curso confortável de uma mão)

  function onBubblePointerDown(e: React.PointerEvent<HTMLElement>, m: Msg) {
    lastPointerType.current = e.pointerType
    if (e.pointerType === 'mouse') return // desktop: ⋮ no hover + clique-direito
    const el = e.currentTarget
    menuFired.current = false
    swipeRef.current = { x0: e.clientX, y0: e.clientY, el, dir: m.mine ? -1 : 1, swiping: false }
    try { el.setPointerCapture(e.pointerId) } catch { /* sem suporte */ }
    const x = e.clientX, y = e.clientY
    if (lpTimer.current) clearTimeout(lpTimer.current)
    // Segurar ~0,6s abre o modal de opções. 2s era a CAUSA do bug: exigia o dedo parado
    // por 2s dentro de 8px (inviável) → o tremor cancelava sempre. Vibra ao disparar.
    lpTimer.current = setTimeout(() => {
      menuFired.current = true
      navigator.vibrate?.(20)
      placeMenu(m, x, y)
    }, 600)
  }

  function onBubblePointerMove(e: React.PointerEvent<HTMLElement>) {
    const s = swipeRef.current
    if (!s) return
    const dx = e.clientX - s.x0
    const dy = e.clientY - s.y0
    // Cancela o long-press só em gesto REAL (scroll vertical > 12px OU swipe horizontal),
    // tolerando o tremor do dedo parado. 8px cancelava cedo demais → menu nunca abria.
    if (lpTimer.current && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
      clearTimeout(lpTimer.current)
      lpTimer.current = null
    }
    if (dx * s.dir > 6 && Math.abs(dx) > Math.abs(dy)) {
      s.swiping = true
      if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null } // swipe engatou → não é long-press
      const raw = Math.abs(dx)
      // Curso mais longo com rubber-band: o balão segue o dedo até MAX e depois
      // resiste (sensação de "puxar"). Opacidade progride com o arrasto.
      const MAX = 110
      const eased = raw <= MAX ? raw : MAX + (raw - MAX) * 0.3
      const p = Math.min(raw / SWIPE_OPEN, 1)
      s.el.style.transition = 'none'
      s.el.style.transform = `translateX(${eased * s.dir}px)`
      s.el.style.opacity = String(1 - p * 0.25)
    }
  }

  function onBubblePointerUp(e: React.PointerEvent<HTMLElement>, m: Msg) {
    const s = swipeRef.current
    if (lpTimer.current) clearTimeout(lpTimer.current)
    if (s) {
      const dx = e.clientX - s.x0
      s.el.style.transition = 'transform 0.2s ease, opacity 0.2s ease'
      s.el.style.transform = ''
      s.el.style.opacity = ''
      try { s.el.releasePointerCapture(e.pointerId) } catch { /* noop */ }
      if (s.swiping && dx * s.dir > SWIPE_OPEN && !menuFired.current) {
        setReplyingTo(m) // arrastar = RESPONDER esta mensagem
        navigator.vibrate?.(12)
      }
    }
    swipeRef.current = null
  }

  // Traduz a mensagem para o idioma do app (best-effort). Se já traduzida, faz
  // toggle original ↔ tradução (cache na 1ª vez). Fecha o menu ao acionar.
  async function translateMsg(m: Msg) {
    setMsgMenu(null)
    if (msgTrans[m.id]) {
      setMsgTransOn((prev) => {
        const n = new Set(prev)
        if (n.has(m.id)) n.delete(m.id)
        else n.add(m.id)
        return n
      })
      return
    }
    const src = (m.content || '').trim()
    if (!src) return
    if (msgTranslating.has(m.id)) return
    setMsgTranslating((prev) => new Set(prev).add(m.id))
    try {
      const lang = localStorage.getItem('libermedia_lang') || 'pt'
      // translateText protege npub/URL/hashtag da tradução (Google só mexe no texto exposto).
      const out = await translateText(src, lang)
      if (out) {
        setMsgTrans((prev) => ({ ...prev, [m.id]: out }))
        setMsgTransOn((prev) => new Set(prev).add(m.id))
      } else {
        toast('Não foi possível traduzir', 'error')
      }
    } catch {
      toast('Não foi possível traduzir', 'error')
    } finally {
      setMsgTranslating((prev) => {
        const n = new Set(prev)
        n.delete(m.id)
        return n
      })
    }
  }

  // Apaga uma mensagem (esconde os gift wraps no servidor → sincroniza nos MEUS
  // devices). "Apagar p/ mim": o destinatário ainda tem a cópia dele.
  async function deleteMsg(m: Msg) {
    setMsgMenu(null)
    setMsgs((prev) => prev.filter((x) => x.id !== m.id))
    if (peer) void removeMessage(npub || '', m.id)
    const eids = m.eids || []
    if (eids.length) {
      await Promise.allSettled(eids.map((eid) => api.del(`/api/dm/message/${encodeURIComponent(eid)}`)))
    }
    toast('Mensagem apagada', 'success')
  }

  const peerProfile = useProfileCache(peer ? npubToHex(peer) : null)
  const peerName =
    peerProfile?.display_name?.trim() || peerProfile?.name?.trim() || (peer ? `${peer.slice(0, 12)}…` : '')

  // Tema EFETIVO da conversa aberta: override por-conversa (conv_themes) vence o global.
  const openHex = peer ? npubToHex(peer) : null
  const ovr = openHex ? convThemes[openHex] : undefined
  const effBubbleMine = ovr?.bubbleMine || bubbleMine
  const effBubbleTheirs = ovr?.bubbleTheirs || bubbleTheirs
  const effWallpaper = wpPreview ?? (ovr?.wallpaper || wallpaper) // preview do upload aparece no fundo na hora

  if (!loggedIn) {
    return (
      <div className="flex h-svh flex-col">
        <TopBar>
          <span className="flex items-center gap-2">
            <MensagensIcon className="h-5 w-5 flex-shrink-0" />
            <h1 className="lm-topbar-title">Mensagens</h1>
          </span>
        </TopBar>
        <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">Entre para ver suas mensagens.</p>
      </div>
    )
  }

  const listFront = front === 'list'
  const chatFront = front === 'chat'
  // Carta-base: proporção celular (altura cheia), scroll interno. Desktop = duas
  // cartas sobrepostas ancoradas nos cantos; mobile = tela cheia que desliza.
  const cardBase =
    'absolute inset-0 flex flex-col overflow-hidden bg-[var(--lm-bg-main)] transform-gpu will-change-transform transition-transform duration-300 ease-out ' +
    'md:inset-y-2 md:w-[78%] md:rounded-2xl md:border md:border-[var(--lm-border)] md:shadow-2xl'

  return (
    <div className={`flex h-svh flex-col md:pb-0 ${front === 'chat' ? '' : 'pb-[60px]'}`}>
      <TopBar>
        <span className="flex flex-1 items-center gap-2">
          <MensagensIcon className="h-5 w-5 flex-shrink-0" />
          <h1 className="lm-topbar-title">Mensagens</h1>
          <span className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setShowNewChat(true)}
              aria-label="Nova conversa"
              title="Nova conversa"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--lm-text-muted)] transition hover:bg-[var(--lm-bg-input)] hover:text-[var(--lm-text-pri)]"
            >
              <NovaConversaIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingsScope('global')
                setSettingsTab('baloes')
                setPendingWp(null)
                setShowSettings(true)
              }}
              aria-label="Configurações gerais"
              title="Configurações (todas as conversas)"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--lm-text-muted)] transition hover:bg-[var(--lm-bg-input)] hover:text-[var(--lm-text-pri)]"
            >
              <ConfiguracoesIcon className="h-5 w-5" />
            </button>
          </span>
        </span>
      </TopBar>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* ───── CARTA ESQUERDA — lista de conversas ───── */}
        <div
          className={`${cardBase} origin-left md:left-0 md:right-auto ${
            listFront
              ? 'z-20 translate-x-0 md:scale-100'
              : 'z-10 -translate-x-full md:translate-x-0 md:scale-[0.96]'
          }`}
        >
          <div className="flex-1 overflow-y-auto">
            {loading && <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">Carregando…</p>}
            {!loading && convs.length === 0 && (
              <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">Nenhuma conversa ainda.</p>
            )}
            {convs.map((c) => (
              <ConvRow key={c.peerNpub} conv={c} selected={c.peerNpub === peer} onClick={() => selectConv(c.peerNpub)} />
            ))}
          </div>
          {/* Beirada exposta + filtro quando está ATRÁS (só desktop). Clicar traz pra frente. */}
          {!listFront && (
            <button
              type="button"
              onClick={() => setFront('list')}
              aria-label="Voltar à lista de conversas"
              className="absolute inset-0 hidden cursor-pointer bg-black/45 backdrop-blur-[1px] transition md:block md:rounded-2xl"
            />
          )}
        </div>

        {/* ───── CARTA DIREITA — fluxo da conversa ─────
            MOBILE + aberta = TELA CHEIA (fixed z-[200]) cobrindo TopBar(20) e BottomNav(150):
            na conversa o usuário só conversa e volta pela seta. Desktop = carta normal. */}
        <div
          ref={convCardRef}
          className={`${cardBase} origin-right md:right-0 md:left-auto ${shake ? 'lm-nudge-shake ' : ''}${
            chatFront
              ? 'z-20 translate-x-0 md:scale-100'
              : 'z-10 translate-x-full md:translate-x-0 md:scale-[0.96]'
          }`}
          /* Wallpaper cobre a CARTA INTEIRA (topo→base); as barras (head/input) flutuam
             por cima. O scroll fica transparente p/ o fundo aparecer atrás delas. */
          style={chatBgStyle(effWallpaper)}
        >
          {!peer ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[var(--lm-text-muted)]">
              <MensagensIcon className="h-10 w-10 opacity-40" />
              <p className="text-sm">Selecione uma conversa</p>
            </div>
          ) : (
            <>
              {/* Cabeçalho da conversa. Seta de voltar sozinha à esquerda; avatar + nome
                  CENTRALIZADOS, e tocá-los abre as CONFIGURAÇÕES desta conversa (a engrenagem
                  saiu). No mobile (lm-dm-head) vira barra FLUTUANTE fixa — ver index.css. */}
              {/* Banda TRANSPARENTE (pointer-events-none p/ deixar o scroll passar atrás);
                  só as bolinhas/pílula capturam toque. */}
              <div
                ref={headRef}
                className="lm-dm-head pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-center px-3 py-2"
              >
                {/* Voltar — bolinha À PARTE, à esquerda */}
                <button
                  type="button"
                  onClick={() => setFront('list')}
                  aria-label="Voltar"
                  className={`pointer-events-auto absolute left-3 flex h-10 w-10 items-center justify-center rounded-full text-[var(--lm-text-pri)] ${CHIP_TOP}`}
                >
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                {/* Pílula central ADAPTÁVEL [avatar│nome] → Configurações DESTA conversa.
                    inline (encolhe p/ "ana", cresce p/ "tecotelecoteco"), centralizada. */}
                <button
                  type="button"
                  onClick={() => {
                    if (!peer) return
                    setSettingsScope(peer)
                    setSettingsTab('baloes')
                    setPendingWp(null)
                    setShowSettings(true)
                  }}
                  aria-label="Configurações desta conversa"
                  title="Personalizar esta conversa"
                  className={`pointer-events-auto flex min-w-0 max-w-[70%] items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[var(--lm-text-pri)] ${CHIP_TOP}`}
                >
                  <Avatar src={peerProfile?.picture} name={peerName} size={32} />
                  <span className="min-w-0 truncate text-base font-semibold">{peerName}</span>
                </button>
                {/* "Chamar a atenção" (zumbido MSN) — bolinha À PARTE, à DIREITA, espelhando o Voltar */}
                <button
                  type="button"
                  onClick={() => { if (peer) void doNudge(peer) }}
                  disabled={!canDM}
                  aria-label="Chamar a atenção"
                  title="Chamar a atenção"
                  className={`pointer-events-auto absolute right-3 flex h-10 w-10 items-center justify-center rounded-full text-[var(--lm-text-pri)] disabled:opacity-40 ${CHIP_TOP}`}
                >
                  <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    <path d="M4 2C2.8 3.7 2 5.7 2 8" />
                    <path d="M22 8c0-2.3-.8-4.3-2-6" />
                  </svg>
                </button>
              </div>

              {/* Mensagens (scroll interno) */}
              <div
                ref={scrollBoxRef}
                onScroll={onMsgsScroll}
                className="lm-dm-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-20 pt-16"
                /* fundo vem da CARTA (full-screen); o scroll é transparente e passa POR
                   TRÁS das barras (head/input absolutas). pt/pb fallback; o efeito ajusta
                   o padding vertical à altura REAL das barras (input cresce). */
              >
                <div ref={contentRef} className="space-y-2">
                {loadingMsgs && <p className="text-center text-sm text-[var(--lm-text-muted)]">Carregando…</p>}
                {!loadingMsgs && msgs.length === 0 && (
                  <p className="text-center text-sm text-[var(--lm-text-muted)]">
                    {canDM ? 'Sem mensagens.' : '⚠️ Entre com sua chave (nsec, extensão ou bunker) para ler/enviar DMs.'}
                  </p>
                )}
                {msgs.map((m, i) => {
                  const prev = i > 0 ? msgs[i - 1] : null
                  const showDate = !prev || !sameDay(prev.ts, m.ts)
                  const pending = m.id.startsWith('local-') && !m.failed
                  const replied = m.replyTo ? msgs.find((x) => x.id === m.replyTo) : null
                  const rawStatus = m.mine ? receipts[m.id] : undefined
                  // Recíproco: leitura desligada → não exibe 'read' (cai p/ 'delivered').
                  const status = !readReceipts && rawStatus === 'read' ? 'delivered' : rawStatus
                  const reacts = aggregateReactions(reactions[m.id])
                  // Resposta legada do MPA embutida no texto → extrai bloco + limpa o texto.
                  const { reply: legacyReply, text: bodyText } = m.media ? { reply: undefined, text: m.content } : parseLegacyReply(m.content)
                  // Legenda da mídia: só mostra se o texto for diferente da própria URL.
                  const caption = m.media && m.content.trim() && m.content.trim() !== m.media.url ? m.content : ''
                  // Mídia "limpa" (foto/vídeo SEM legenda nem resposta) = renderiza SEM balão,
                  // estilo Telegram/WhatsApp: só a mídia arredondada + hora sobreposta (scrim).
                  const mediaOnly =
                    !!m.media && (m.media.kind === 'image' || m.media.kind === 'video') && !caption && !m.replyTo && !legacyReply
                  // Áudio/voz: largura FIXA (= padrão do balão), e a hora+ticks vão DENTRO
                  // do player (canto inf. dir. da trilha), não no rodapé normal do balão.
                  const isAudio = m.media?.kind === 'audio'
                  // Jumbomoji: emoji único, sem mídia/resposta/legenda → sobe grande, sem balão.
                  // Jumbo p/ emoji ÚNICO nativo OU um único emoji custom (:code: que resolve).
                  const loneCustom = (() => {
                    const s = bodyText.trim()
                    const mm = /^:([a-z0-9_+-]+):$/i.exec(s)
                    if (!mm) return false
                    const map = customEmojiMap()
                    return !!(map[mm[1]] ?? map[mm[1].toLowerCase()])
                  })()
                  const emojiOnly =
                    !m.media && !m.replyTo && !legacyReply && (isSingleEmoji(bodyText) || loneCustom)
                  const menuBtn = (
                    <button
                      type="button"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect()
                        placeMenu(m, r.left, r.bottom + 4)
                      }}
                      aria-label="Opções da mensagem"
                      title="Opções"
                      className="hidden h-7 w-7 flex-shrink-0 items-center justify-center self-center rounded-full text-[var(--lm-text-muted)] opacity-0 transition hover:bg-[var(--lm-bg-card)] hover:text-[var(--lm-text-pri)] group-hover/msg:opacity-100 md:flex"
                    >
                      <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor">
                        <circle cx="12" cy="5" r="1.7" />
                        <circle cx="12" cy="12" r="1.7" />
                        <circle cx="12" cy="19" r="1.7" />
                      </svg>
                    </button>
                  )
                  return (
                    <Fragment key={m.id}>
                      {showDate && (
                        <div className="my-3 flex justify-center">
                          <span className="rounded-full bg-[var(--lm-bg-card)] px-3 py-0.5 text-xs text-[var(--lm-text-muted)] shadow-sm">
                            {dayLabel(m.ts)}
                          </span>
                        </div>
                      )}
                      <div className={`group/msg flex min-w-0 items-end gap-1 [-webkit-touch-callout:none] [@media(hover:none)]:select-none ${m.mine ? 'justify-end' : 'justify-start'}`}>
                        {m.mine && menuBtn}
                        <div className={`flex min-w-0 flex-col gap-0.5 ${isAudio ? 'w-[80%]' : 'max-w-[80%]'} ${m.mine ? 'items-end' : 'items-start'}`}>
                          <div
                            className={`${
                              emojiOnly
                                ? `cursor-default ${m.mine ? 'items-end text-right' : 'items-start text-left'}`
                                : mediaOnly
                                  ? 'relative cursor-default overflow-hidden rounded-2xl shadow-sm'
                                  : `cursor-default rounded-2xl px-3 py-2 text-[15px] shadow-sm ${isAudio ? 'w-full' : ''}`
                            } ${msgMenu?.msg.id === m.id ? `lm-msg-active ${m.mine ? 'lm-msg-active-mine' : ''}` : ''}`}
                            style={
                              mediaOnly || emojiOnly
                                ? undefined
                                : {
                                    background: m.mine ? effBubbleMine || 'var(--lm-accent)' : effBubbleTheirs || 'var(--lm-bg-card)',
                                    color: m.mine ? (effBubbleMine ? '#fff' : 'var(--lm-accent-txt)') : effBubbleTheirs ? '#fff' : 'var(--lm-text-pri)',
                                  }
                            }
                            onPointerDown={(e) => onBubblePointerDown(e, m)}
                            onPointerMove={onBubblePointerMove}
                            onPointerUp={(e) => onBubblePointerUp(e, m)}
                            onPointerCancel={(e) => onBubblePointerUp(e, m)}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              // Android dispara contextmenu no toque longo (~500ms); deixamos
                              // o long-press de 2s cuidar do menu. Só clique-direito (mouse) abre.
                              if (lastPointerType.current !== 'touch') placeMenu(m, e.clientX, e.clientY)
                            }}
                          >
                            {(m.replyTo || legacyReply) && (
                              <div className="mb-1 overflow-hidden rounded-md border-l-2 border-current/60 bg-black/15 px-2 py-1 text-xs opacity-90">
                                <span className="block font-semibold">
                                  {m.replyTo ? (replied ? (replied.mine ? 'Você' : peerName) : '') : legacyReply?.author || ''}
                                </span>
                                <span className="block truncate">
                                  {m.replyTo ? (replied ? (replied.content || '').slice(0, 60) || 'mensagem' : 'mensagem') : legacyReply?.preview || 'mensagem'}
                                </span>
                              </div>
                            )}
                            {m.media ? (
                              isAudio ? (
                                <>
                                  <VoicePlayer
                                    src={m.media.url}
                                    footer={
                                      <>
                                        {fmtTime(m.ts)}
                                        {m.mine && <MsgTicks pending={pending} failed={m.failed} status={status} />}
                                      </>
                                    }
                                  />
                                  {caption && (
                                    <span className="mt-1 block overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere]">{msgTransOn.has(m.id) && msgTrans[m.id] ? msgTrans[m.id] : m.content}</span>
                                  )}
                                </>
                              ) : (
                                <>
                                  <Attachment media={m.media} />
                                  {caption && (
                                    <span className="mt-1 block overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere]">{msgTransOn.has(m.id) && msgTrans[m.id] ? msgTrans[m.id] : m.content}</span>
                                  )}
                                </>
                              )
                            ) : emojiOnly ? (
                              <span className="lm-jumbo-emoji block leading-none">{renderEmojiText(bodyText)}</span>
                            ) : (
                              bodyText && (
                                <span className="block overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere]">
                                  {renderEmojiText(msgTransOn.has(m.id) && msgTrans[m.id] ? msgTrans[m.id] : bodyText)}
                                  {msgTranslating.has(m.id) && (
                                    <span className="mt-0.5 flex items-center gap-1 text-[10px] italic opacity-70">
                                      <svg className="animate-spin" viewBox="0 0 24 24" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M12 3a9 9 0 1 0 9 9" /></svg>
                                      traduzindo…
                                    </span>
                                  )}
                                  {msgTransOn.has(m.id) && msgTrans[m.id] && (
                                    <span className="mt-0.5 block text-[10px] italic opacity-60">traduzido</span>
                                  )}
                                </span>
                              )
                            )}
                            {/* Áudio carrega a hora+ticks DENTRO do player → sem rodapé aqui. */}
                            {!isAudio &&
                              (emojiOnly ? (
                                <span
                                  className={`mt-0.5 flex items-center gap-0.5 text-[10px] text-[var(--lm-text-muted)] ${m.mine ? 'justify-end' : 'justify-start'}`}
                                >
                                  {fmtTime(m.ts)}
                                  {m.mine && <MsgTicks pending={pending} failed={m.failed} status={status} />}
                                </span>
                              ) : mediaOnly ? (
                                /* hora sobreposta na mídia (scrim escuro), sem balão */
                                <span className="pointer-events-none absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                  {fmtTime(m.ts)}
                                  {m.mine && <MsgTicks pending={pending} failed={m.failed} status={status} />}
                                </span>
                              ) : (
                                <span className="float-right ml-2 mt-1 flex translate-y-0.5 items-center gap-0.5 text-[10px] opacity-70">
                                  {fmtTime(m.ts)}
                                  {m.mine && <MsgTicks pending={pending} failed={m.failed} status={status} />}
                                </span>
                              ))}
                          </div>
                          {reacts.length > 0 && (
                            <div className={`flex flex-wrap gap-1 ${m.mine ? 'justify-end' : 'justify-start'}`}>
                              {reacts.map((r) => (
                                <span
                                  key={r.emoji}
                                  className={`inline-flex items-center gap-0.5 rounded-full bg-[var(--lm-bg-card)] px-1.5 py-0.5 text-xs shadow-sm ${
                                    r.mine ? 'ring-1 ring-[var(--lm-accent)]' : 'border border-[var(--lm-border)]'
                                  }`}
                                >
                                  <span>{emojifyShortcodes(r.emoji)}</span>
                                  {r.count > 1 && <span className="text-[var(--lm-text-muted)]">{r.count}</span>}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {!m.mine && menuBtn}
                      </div>
                    </Fragment>
                  )
                })}
                <div ref={endRef} />
                </div>
              </div>

              {/* Barra inferior (prévia de resposta + progresso de anexo + campo de envio).
                  No mobile (lm-dm-input) vira barra FLUTUANTE fixa, largura de input — ver index.css. */}
              {/* Banda TRANSPARENTE; só os elementos (clipe/input/áudio) capturam toque. */}
              <div
                ref={inputBarRef}
                className="lm-dm-input pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 py-2"
              >
              {/* Prévia da resposta (acima do input) — chip flutuante */}
              {replyingTo && (
                <div className={`pointer-events-auto mb-2 flex items-center gap-2 rounded-2xl px-3 py-2 ${CHIP}`}>
                  <div className="w-1 self-stretch rounded-full bg-[var(--lm-accent)]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[var(--lm-accent)]">{replyingTo.mine ? 'Você' : peerName}</p>
                    <p className="truncate text-sm text-[var(--lm-text-muted)]">{replyingTo.content}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    aria-label="Cancelar resposta"
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[var(--lm-text-muted)] hover:bg-[var(--lm-bg-main)]"
                  >
                    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              )}

              {/* Progresso do upload de anexo — chip flutuante */}
              {attaching !== null && (
                <div className={`pointer-events-auto mb-2 rounded-2xl px-3 py-2 ${CHIP}`}>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--lm-bg-input)]">
                    <div className="h-full bg-[var(--lm-accent)] transition-all" style={{ width: `${attaching}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--lm-text-muted)]">Enviando anexo… {attaching}%</p>
                </div>
              )}

              {/* Campo de envio (alinhado embaixo p/ o textarea crescer pra cima).
                  py-1 + barra arredondada = pílula fininha colada no input. */}
              <div className="pointer-events-none flex items-end gap-2">
                <input
                  ref={attachInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip"
                  onChange={onAttachPicked}
                />
                  <>
                    <button
                      type="button"
                      onClick={() => setShowAttachMenu(true)}
                      disabled={!canDM || attaching !== null}
                      aria-label="Anexar (imagens ou GIFs)"
                      title="Imagens e GIFs"
                      className={`pointer-events-auto flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[var(--lm-text-muted)] disabled:opacity-50 ${CHIP}`}
                    >
                      <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49" />
                      </svg>
                    </button>
                    {/* Input central: raio FIXO 22px → pílula com 1 linha (44px = 2×raio) e,
                        ao crescer, cantos suaves tipo balão (rounded-full numa caixa alta vira
                        semicírculo gigante que esconde o texto nas laterais). */}
                    <div className={`pointer-events-auto relative flex min-w-0 flex-1 items-end rounded-[22px] ${CHIP}`}>
                      <textarea
                        ref={textareaRef}
                        value={draft}
                        onChange={(e) => {
                          setDraft(e.target.value)
                          const el = e.currentTarget
                          el.style.height = 'auto'
                          el.style.height = Math.min(el.scrollHeight, 120) + 'px'
                        }}
                        onKeyDown={(e) => {
                          // Enter envia; Shift+Enter quebra linha (padrão WhatsApp/Telegram desktop).
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            send()
                          }
                        }}
                        rows={1}
                        placeholder={canDM ? 'Mensagem…' : 'Entre com sua chave para conversar'}
                        disabled={!canDM}
                        className="max-h-[120px] min-h-[44px] w-full resize-none rounded-[22px] bg-transparent py-2.5 pl-4 pr-11 text-base leading-snug text-[var(--lm-text-pri)] outline-none placeholder:text-[var(--lm-text-muted)] disabled:opacity-50"
                      />
                      <button
                        ref={emojiBtnRef}
                        type="button"
                        onClick={openEmoji}
                        disabled={!canDM}
                        aria-label="Emoji"
                        className="absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full text-[var(--lm-text-muted)] hover:text-[var(--lm-text-pri)] disabled:opacity-50"
                      >
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    </div>
                    {draft.trim() ? (
                      // Enviar = bolinha À PARTE com avião de papel (estilo Telegram/WhatsApp).
                      <button
                        type="button"
                        onClick={send}
                        disabled={!canDM}
                        aria-label="Enviar"
                        className={`pointer-events-auto flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[var(--lm-accent)] disabled:opacity-50 ${CHIP}`}
                      >
                        <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                        </svg>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onPointerDown={startMicHold}
                        onPointerUp={cancelMicHold}
                        onPointerLeave={cancelMicHold}
                        onPointerCancel={cancelMicHold}
                        onContextMenu={(e) => e.preventDefault()}
                        disabled={!canDM || attaching !== null}
                        aria-label="Segure para gravar áudio"
                        title="Segure para gravar"
                        style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
                        className={`pointer-events-auto flex h-11 w-11 flex-shrink-0 select-none items-center justify-center rounded-full text-[var(--lm-accent)] transition-transform disabled:opacity-50 ${micHolding ? 'scale-110 animate-pulse ring-2 ring-[var(--lm-accent)]' : ''} ${CHIP}`}
                      >
                        <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
                        </svg>
                      </button>
                    )}
                  </>
              </div>
              </div>
            </>
          )}
          {/* Beirada exposta + filtro quando está ATRÁS (só desktop). */}
          {!chatFront && (
            <button
              type="button"
              onClick={() => setFront('chat')}
              aria-label="Abrir conversa"
              className="absolute inset-0 hidden cursor-pointer bg-black/45 backdrop-blur-[1px] transition md:block md:rounded-2xl"
            />
          )}
        </div>

        {/* ───── MODAL DE GRAVAÇÃO de voz (flutuante, separado da barra) ───── */}
        {recording &&
          createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-4 backdrop-blur-[2px] sm:items-center">
              <div className="mb-24 w-full max-w-xs rounded-3xl border border-[var(--lm-border-str)] bg-[var(--lm-bg-main)] p-6 shadow-2xl sm:mb-0">
                <div className="flex flex-col items-center gap-5">
                  {/* Indicador + timer */}
                  <div className="flex items-center gap-2.5">
                    <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
                    <span className="text-3xl font-semibold tabular-nums text-[var(--lm-text-pri)]">{fmtDur(recSecs)}</span>
                  </div>
                  {/* Visualizador (barras pulsando) */}
                  <div className="flex h-8 items-center gap-1">
                    {REC_WAVE.map((h, i) => (
                      <span
                        key={i}
                        className="w-1 animate-pulse rounded-full bg-[var(--lm-accent)]"
                        style={{ height: `${h}%`, animationDelay: `${(i % 6) * 90}ms`, animationDuration: '900ms' }}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-[var(--lm-text-muted)]">Gravando áudio…</p>
                  {/* Ações: cancelar · enviar (sem cancelar ao tocar fora p/ não perder a gravação) */}
                  <div className="flex items-center gap-10">
                    <button
                      type="button"
                      onClick={() => finishRec(false)}
                      aria-label="Cancelar gravação"
                      title="Cancelar"
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--lm-border-str)] text-[var(--lm-danger,#ef4444)] hover:bg-[var(--lm-bg-card)]"
                    >
                      <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H6a1 1 0 01-1-1V6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => finishRec(true)}
                      aria-label="Enviar áudio"
                      className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--lm-accent)] text-[var(--lm-accent-txt)] shadow-lg"
                    >
                      <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )}

        {/* ───── CONFIGURAÇÕES — aba DENTRO da página (sub-abas no padrão Tabs) ───── */}
        {showSettings && (
          <div className="absolute inset-0 z-40 flex flex-col bg-[var(--lm-bg-main)]" style={chatBgStyle(uiWallpaper)}>
            <div className="lm-dm-settings-head flex items-center gap-2 px-3 py-2">
              {/* Voltar — bolinha À PARTE, à esquerda (mesmo padrão da conversa) */}
              <button
                type="button"
                onClick={() => {
                  setPendingWp(null)
                  setShowSettings(false)
                }}
                aria-label="Voltar"
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[var(--lm-text-pri)] ${CHIP_TOP}`}
              >
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              {/* Pílula central ADAPTÁVEL, centralizada (balanceada pelo espaçador à direita). */}
              <div className="flex min-w-0 flex-1 justify-center">
                {scopeIsGlobal ? (
                  <span className={`inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 font-semibold text-[var(--lm-text-pri)] ${CHIP_TOP}`}>
                    <ConfiguracoesIcon className="h-5 w-5 flex-shrink-0" />
                    <span className="truncate">Configurações</span>
                  </span>
                ) : (
                  /* Avatar + nome do contato → toca e vai pro PERFIL dele. */
                  <button
                    type="button"
                    onClick={() => peer && navigate(`/perfil/${peer}`)}
                    title="Ver perfil"
                    className={`inline-flex min-w-0 max-w-full items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[var(--lm-text-pri)] ${CHIP_TOP}`}
                  >
                    <Avatar src={peerProfile?.picture} name={peerName} size={32} />
                    <span className="min-w-0 truncate text-base font-semibold text-[var(--lm-text-pri)]">{peerName}</span>
                  </button>
                )}
              </div>
              {/* Espaçador = largura da bolinha → centro real do nome */}
              <span className="h-10 w-10 flex-shrink-0" aria-hidden="true" />
            </div>
            {!scopeIsGlobal && (
              <p className="border-b border-[var(--lm-border)] bg-[var(--lm-bg-main)]/80 px-3 py-2 text-xs text-[var(--lm-text-muted)] backdrop-blur-md">
                Personalização só desta conversa — vence a configuração geral. Deixe um item no padrão p/ herdar do geral.
              </p>
            )}
            <div className="border-b border-[var(--lm-border)] bg-[var(--lm-bg-main)]/80 px-3 py-3 backdrop-blur-md">
              <Tabs
                items={scopeIsGlobal ? SETTINGS_TABS : SETTINGS_TABS.filter((t) => t.key !== 'avisos')}
                value={settingsTab}
                onChange={setSettingsTab}
                columns={2}
              />
            </div>
            {/* Superfície de leitura translúcida sobre o wallpaper (legibilidade dos campos). */}
            <div className="flex-1 overflow-y-auto bg-[var(--lm-bg-main)]/85 p-5 backdrop-blur-md">
              {/* ── BALÕES ── */}
              {settingsTab === 'baloes' && (
                <div className="space-y-6">
                  {/* prévia ao vivo */}
                  <div
                    className="space-y-2 rounded-2xl border border-[var(--lm-border)] p-3"
                    style={chatBgStyle(uiWallpaper)}
                  >
                    <div className="flex justify-start">
                      <div className="rounded-2xl px-3 py-2 text-[15px] shadow-sm" style={{ background: uiBubbleTheirs || 'var(--lm-bg-card)', color: uiBubbleTheirs ? '#fff' : 'var(--lm-text-pri)' }}>
                        Olá! 👋
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="rounded-2xl px-3 py-2 text-[15px] shadow-sm" style={{ background: uiBubbleMine || 'var(--lm-accent)', color: uiBubbleMine ? '#fff' : 'var(--lm-accent-txt)' }}>
                        Oi! Tudo bem?
                      </div>
                    </div>
                  </div>
                  <BubbleColorSection title="Meus balões" value={uiBubbleMine} onChange={setUiBubbleMine} />
                  <BubbleColorSection title="Balões do contato" value={uiBubbleTheirs} onChange={setUiBubbleTheirs} />
                </div>
              )}

              {/* ── WALLPAPER (upload do usuário) ── */}
              {settingsTab === 'wallpaper' && (
                <div className="space-y-4">
                  <p className="text-sm text-[var(--lm-text-muted)]">
                    Envie uma imagem no <b className="text-[var(--lm-text-pri)]">formato vertical</b> (ex.: 1080×1920,
                    proporção 9:16) — ela fica salva nos seus <b className="text-[var(--lm-text-pri)]">Arquivos</b> como seu wallpaper.
                  </p>
                  {dispWallpaper && (
                    <div
                      className="mx-auto w-40 overflow-hidden rounded-xl border border-[var(--lm-border)]"
                      style={{ aspectRatio: '9/16', ...chatBgStyle(dispWallpaper) }}
                    />
                  )}
                  <input ref={wpInputRef} type="file" accept="image/*" className="hidden" onChange={onWallpaperPicked} />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={wpUploading}
                      onClick={() => wpInputRef.current?.click()}
                      className="rounded-full bg-[var(--lm-accent)] px-4 py-2 text-sm font-bold text-[var(--lm-accent-txt)] disabled:opacity-50"
                    >
                      {wpUploading ? 'Enviando…' : uiWallpaper ? 'Trocar wallpaper' : 'Enviar wallpaper'}
                    </button>
                    {uiWallpaper && (
                      <button
                        type="button"
                        onClick={() => setUiWallpaper('')}
                        className="rounded-full border border-[var(--lm-border-str)] px-4 py-2 text-sm text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)]"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                  {/* ── MEUS WALLPAPERS ── todos os que o usuário subiu, na hora, cross-device ── */}
                  {wpGallery.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <p className="text-xs font-semibold text-[var(--lm-text-muted)]">Meus wallpapers</p>
                      <div className="grid grid-cols-3 gap-2">
                        {wpGallery.map((url) => {
                          const active = dispWallpaper === url
                          return (
                            <div
                              key={url}
                              className="relative overflow-hidden rounded-lg border-2 transition"
                              style={{ aspectRatio: '9/16', borderColor: active ? 'var(--lm-accent)' : 'transparent' }}
                            >
                              <button type="button" onClick={() => setUiWallpaper(url)} className="block h-full w-full">
                                <WpThumbImg url={url} />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeWallpaper(url)}
                                title="Remover da galeria"
                                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white opacity-80"
                              >
                                <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                              </button>
                              {active && (
                                <span className="pointer-events-none absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--lm-accent)] text-[var(--lm-accent-txt)]">
                                  <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── BIBLIOTECA (wallpapers da LiberMedia, por tema) ── */}
              {settingsTab === 'biblioteca' && (
                <div className="space-y-4">
                  {libThemes.length === 0 ? (
                    <p className="py-8 text-center text-sm text-[var(--lm-text-muted)]">Carregando imagens…</p>
                  ) : (
                    <>
                      {/* sub-abas: Geral, depois "Padrão" (padrões CSS), depois os temas-imagem.
                          flex-wrap: quebra em 2 linhas se não couber. */}
                      <div className="flex flex-wrap gap-1.5">
                        {libThemes.flatMap((t) => {
                          const themeBtn = (
                            <button
                              key={t.key}
                              type="button"
                              onClick={() => setLibTheme(t.key)}
                              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                                libTheme === t.key
                                  ? 'bg-[var(--lm-accent)] text-[var(--lm-accent-txt)]'
                                  : 'bg-[var(--lm-bg-card)] text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-input)]'
                              }`}
                            >
                              {t.label}
                            </button>
                          )
                          // "Padrão" entra logo DEPOIS do "Geral" (chat-bg).
                          if (t.key !== 'chat-bg') return [themeBtn]
                          return [
                            themeBtn,
                            <button
                              key="padrao"
                              type="button"
                              onClick={() => setLibTheme('padrao')}
                              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                                libTheme === 'padrao'
                                  ? 'bg-[var(--lm-accent)] text-[var(--lm-accent-txt)]'
                                  : 'bg-[var(--lm-bg-card)] text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-input)]'
                              }`}
                            >
                              Padrão
                            </button>,
                          ]
                        })}
                      </div>

                      {libTheme === 'padrao' ? (
                        /* ── PADRÃO: sub-abas Claros/Escuros + grade de padrões CSS ── */
                        <div className="space-y-3">
                          <div className="flex gap-1.5">
                            {DM_PATTERN_GROUPS.map((g) => (
                              <button
                                key={g.group}
                                type="button"
                                onClick={() => setPatternGroup(g.group)}
                                className={`rounded-full px-4 py-1 text-xs font-semibold transition ${
                                  patternGroup === g.group
                                    ? 'bg-[var(--lm-accent)] text-[var(--lm-accent-txt)]'
                                    : 'bg-[var(--lm-bg-card)] text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-input)]'
                                }`}
                              >
                                {g.group}
                              </button>
                            ))}
                          </div>
                          <div className="grid grid-cols-5 gap-2">
                            {(DM_PATTERN_GROUPS.find((g) => g.group === patternGroup)?.items || []).map((p) => {
                              const val = `pattern:${p.id}`
                              const active = selWp === val
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  title={p.label}
                                  onClick={() => setPendingWp(val)}
                                  className={`relative overflow-hidden rounded-lg border-2 transition ${active ? 'border-[var(--lm-accent)]' : 'border-transparent hover:border-[var(--lm-border-str)]'}`}
                                  style={{ aspectRatio: '9/16', ...patternStyle(p) }}
                                >
                                  {active && (
                                    <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--lm-accent)] text-[var(--lm-accent-txt)]">
                                      <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>
                                    </span>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ) : (
                        /* grade de wallpapers-imagem do tema (vertical, tipo celular) */
                        <div className="grid grid-cols-3 gap-2">
                          {(libThemes.find((t) => t.key === libTheme)?.urls || []).map((url) => {
                            const active = selWp === url
                            return (
                              <button
                                key={url}
                                type="button"
                                onClick={() => setPendingWp(url)}
                                className={`relative overflow-hidden rounded-lg border-2 transition ${active ? 'border-[var(--lm-accent)]' : 'border-transparent hover:border-[var(--lm-border-str)]'}`}
                                style={{ aspectRatio: '9/16' }}
                              >
                                <img
                                  src={url}
                                  loading="lazy"
                                  decoding="async"
                                  alt=""
                                  onLoad={(e) => { e.currentTarget.style.opacity = '1' }}
                                  ref={(el) => { if (el?.complete) el.style.opacity = '1' }}
                                  className="h-full w-full object-cover opacity-0 transition-opacity duration-300"
                                />
                                {active && (
                                  <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--lm-accent)] text-[var(--lm-accent-txt)]">
                                    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </>
                  )}
                  {pendingWp !== null && pendingWp !== uiWallpaper && (
                    <div className="sticky bottom-0 -mx-5 -mb-5 mt-1 border-t border-[var(--lm-border)] bg-[var(--lm-bg-main)]/90 px-5 py-3 backdrop-blur-md">
                      <button
                        type="button"
                        onClick={applyPendingWp}
                        className="w-full rounded-full bg-[var(--lm-accent)] px-4 py-2.5 text-sm font-bold text-[var(--lm-accent-txt)]"
                      >
                        {scopeIsGlobal ? 'Aplicar a todas as conversas' : 'Aplicar nesta conversa'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── AVISOS (notificações push) ── */}
              {settingsTab === 'avisos' && (
                <div className="space-y-4">
                  <p className="text-sm text-[var(--lm-text-muted)]">
                    Receba um aviso quando chegar mensagem nova, mesmo com o app fechado. A notificação é
                    <b className="text-[var(--lm-text-pri)]"> genérica</b> (sem remetente nem prévia) — o conteúdo
                    só aparece ao abrir, porque é criptografado ponta-a-ponta.
                  </p>
                  {pushState === 'unsupported' && (
                    <p className="text-sm text-[var(--lm-text-muted)]">
                      Este navegador não suporta notificações. No iPhone, instale o app na tela inicial primeiro.
                    </p>
                  )}
                  {pushState === 'denied' && (
                    <p className="text-sm text-[var(--lm-danger,#ef4444)]">
                      Permissão bloqueada — libere as notificações nas configurações do navegador.
                    </p>
                  )}
                  {pushState !== 'unsupported' && pushState !== 'denied' && (
                    <button
                      type="button"
                      disabled={pushBusy}
                      onClick={togglePush}
                      className={`rounded-full px-4 py-2 text-sm font-bold disabled:opacity-50 ${
                        pushState === 'granted-on'
                          ? 'border border-[var(--lm-border-str)] text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)]'
                          : 'bg-[var(--lm-accent)] text-[var(--lm-accent-txt)]'
                      }`}
                    >
                      {pushBusy ? 'Aguarde…' : pushState === 'granted-on' ? 'Desativar notificações' : 'Ativar notificações'}
                    </button>
                  )}

                  {/* Confirmação de leitura (tique azul) — recíproco como no WhatsApp. */}
                  <div className="border-t border-[var(--lm-border)] pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="block text-sm font-semibold text-[var(--lm-text-pri)]">Confirmação de leitura</span>
                        <span className="block text-xs text-[var(--lm-text-muted)]">
                          Mostra o tique azul quando você lê. Desligado, você também deixa de ver o dos outros.
                        </span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={readReceipts}
                        onClick={() => {
                          const v = !readReceipts
                          setReadReceipts(v)
                          persistReadReceipts(v)
                        }}
                        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${readReceipts ? 'bg-[var(--lm-accent)]' : 'bg-[var(--lm-border-str)]'}`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${readReceipts ? 'left-[22px]' : 'left-0.5'}`} />
                      </button>
                    </div>
                  </div>
                  {/* Aparecer online (áurea verde) — recíproco: desligado, você some E deixa de marcar presença. */}
                  <div className="border-t border-[var(--lm-border)] pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="block text-sm font-semibold text-[var(--lm-text-pri)]">Aparecer online</span>
                        <span className="block text-xs text-[var(--lm-text-muted)]">
                          Mostra a áurea verde quando você está ativo. Desligado, você não aparece online para ninguém.
                        </span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={showOnline}
                        onClick={() => {
                          const v = !showOnline
                          setShowOnline(v)
                          persistShowOnline(v)
                        }}
                        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${showOnline ? 'bg-[var(--lm-accent)]' : 'bg-[var(--lm-border-str)]'}`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${showOnline ? 'left-[22px]' : 'left-0.5'}`} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} onPick={startChatWith} />}

      {showEmoji && (
        <ReactionPicker
          quick={quickReactions(5)}
          current={null}
          anchor={emojiAnchor}
          onPick={(em) => {
            setDraft((d) => d + em)
            setShowEmoji(false)
          }}
          onClose={() => setShowEmoji(false)}
        />
      )}

      {/* Seletor de reação (a partir do menu da mensagem) */}
      {reactFor && (
        <ReactionPicker
          quick={quickReactions(6)}
          current={null}
          anchor={reactFor.anchor}
          onPick={(em) => reactTo(reactFor.msg, em)}
          onClose={() => setReactFor(null)}
        />
      )}

      {/* Modal do clipe: Arquivos | GIFs (bottom sheet) */}
      {showAttachMenu &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40"
            onClick={() => setShowAttachMenu(false)}
          >
            <div
              className="mx-3 w-full max-w-sm overflow-hidden rounded-2xl bg-[var(--lm-bg-card)] shadow-2xl"
              style={{ marginBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  setShowAttachMenu(false)
                  attachInputRef.current?.click()
                }}
                className="flex w-full items-center gap-3 px-5 py-4 text-left text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-input)]"
              >
                <svg className="h-6 w-6 flex-shrink-0 text-[var(--lm-text-muted)]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49" />
                </svg>
                <span className="font-semibold">Arquivos</span>
              </button>
              <div className="border-t border-[var(--lm-border)]" />
              <button
                type="button"
                onClick={() => {
                  setShowAttachMenu(false)
                  setShowGif(true)
                }}
                className="flex w-full items-center gap-3 px-5 py-4 text-left text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-input)]"
              >
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border border-[var(--lm-text-muted)] text-[10px] font-bold text-[var(--lm-text-muted)]">
                  GIF
                </span>
                <span className="font-semibold">GIFs</span>
              </button>
            </div>
          </div>,
          document.body,
        )}

      {/* Seletor de GIF (GIPHY) → envia como mídia (image/gif) */}
      {showGif && (
        <GifPicker
          onPick={(url) => {
            setShowGif(false)
            if (peer) void deliver(url, { media: { url, kind: 'image' }, mime: 'image/gif' })
          }}
          onClose={() => setShowGif(false)}
        />
      )}

      {/* Menu de mensagem (⋮ / toque longo): Responder + Copiar + Apagar.
          Via PORTAL no body — senão o `.lm-page`/carta (com transform) vira containing
          block do fixed e o menu vai parar na extrema direita. */}
      {msgMenu &&
        createPortal(
        <div
          className="fixed inset-0 z-[140]"
          style={{ touchAction: 'manipulation' }}
          onClick={() => setMsgMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault()
            setMsgMenu(null)
          }}
        >
          <div
            className="lm-menu-pop absolute min-w-[170px] overflow-hidden rounded-xl border border-[var(--lm-border-str)] bg-[var(--lm-bg-sidebar)] py-1 shadow-2xl"
            style={{ left: msgMenu.x, top: msgMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setReactFor({ msg: msgMenu.msg, anchor: { x: msgMenu.x, y: msgMenu.y, width: 0, height: 0 } })
                setMsgMenu(null)
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)]"
            >
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.83 14.83a4 4 0 0 1-5.66 0M9 10h.01M15 10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
              </svg>
              Reagir
            </button>
            <button
              type="button"
              onClick={() => {
                setReplyingTo(msgMenu.msg)
                setMsgMenu(null)
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)]"
            >
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 17l-5-5 5-5M4 12h11a5 5 0 0 1 5 5v1" />
              </svg>
              Responder
            </button>
            <button
              type="button"
              onClick={() => {
                copyMsg(msgMenu.msg.content)
                setMsgMenu(null)
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)]"
            >
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8}>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </svg>
              Copiar
            </button>
            {msgMenu.msg.content.trim() && (
              <button
                type="button"
                onClick={() => translateMsg(msgMenu.msg)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)]"
              >
                <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h7M9 3v2c0 4.418-2.239 8-5 8M5 9c0 2.144 2.952 3.908 6.7 4M12 20l4-9 4 9M19.1 18h-6.2" />
                </svg>
                {msgTransOn.has(msgMenu.msg.id) ? 'Ver original' : 'Traduzir'}
              </button>
            )}
            {msgMenu.msg.mine && (
              <button
                type="button"
                onClick={() => deleteMsg(msgMenu.msg)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--lm-danger,#ef4444)] hover:bg-[var(--lm-bg-card)]"
              >
                <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H6a1 1 0 01-1-1V6M10 11v6M14 11v6" />
                </svg>
                Apagar
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
