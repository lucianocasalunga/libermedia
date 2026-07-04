// Compositor — PÁGINA (rota /compose), replicando a estrutura do compose.html
// do MPA original:
//  • Header: seta voltar + logo LiberMedia + "Compose" + Postar (à esq. do hambúrguer)
//  • Barra de ferramentas (7): GIF · Enquete · Emoj · Up · Agendar · NSFW · Cobrar
//    (Up = ação principal: maior e no CENTRO, preenchido c/ a cor de destaque)
//  • Avatar no topo + textarea na linha de baixo (largura total)
//  • Rodapé: Relays · Pré-visualizar · contador 0/5000
// Funções ainda sem implementação (Emoj/Cobrar/Relays/Preview) mostram "Em breve".
// Renderiza na área principal do shell; o feed segue montado por baixo.
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { useAuth } from '../providers/AuthProvider'
import { TopBar } from '../components/TopBar/TopBar'
import { requireSigner } from '../services/require-signer'
import { publishNote } from '../services/post'
import { publishPoll } from '../services/poll'
import { schedulePost } from '../services/schedule'
import { uploadFileWithProgress, type Uploaded } from '../services/upload'
import { UploadTank } from '../components/UploadTank/UploadTank'
import { feedBus } from '../lib/feed-bus'
import { Avatar } from '../components/Avatar/Avatar'
import { EmojiPicker } from '../components/EmojiPicker/EmojiPicker'
import { GifPicker } from '../components/GifPicker/GifPicker'
import { GiftPicker } from '../components/GiftPicker/GiftPicker'
import { prepare as tsPrepare, linkEvent as tsLinkEvent } from '../services/topsecret'
import { useIdentityHeader } from '../hooks/useIdentityHeader'
import type { FeedEvent } from '../types/nostr'

const MAX = 5000

export function ComposePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const st = location.state as { replyTo?: FeedEvent; quoteOf?: FeedEvent; initialText?: string } | null
  const replyTo = st?.replyTo ?? null
  const quoteOf = st?.quoteOf ?? null
  const { npub, pubkeyHex, loggedIn } = useAuth()
  const [text, setText] = useState(st?.initialText ?? '')
  const [media, setMedia] = useState<Uploaded[]>([])
  const [cw, setCw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploads, setUploads] = useState<{ id: number; preview?: string; pct: number }[]>([]) // tanques de upload
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showGif, setShowGif] = useState(false)
  const [showGift, setShowGift] = useState(false)
  const [paidPrice, setPaidPrice] = useState<number | null>(null) // conteúdo pago (sats)
  const [pollMode, setPollMode] = useState(false)
  const [pollOptions, setPollOptions] = useState<string[]>(['', ''])
  const [pollDays, setPollDays] = useState(1)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('') // datetime-local
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const t = setTimeout(() => taRef.current?.focus(), 60)
    return () => {
      clearTimeout(t)
      clearTimeout(noticeTimer.current)
    }
  }, [])

  const soon = (label: string) => {
    setNotice(`${label} — em breve`)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 1800)
  }

  // Avatar/nome do usuário: kind:0 dos relays (useIdentityHeader) + fallback no
  // localStorage (convenção do MPA). Antes ficava a "bolinha" vazia sem o cache.
  const header = useIdentityHeader(pubkeyHex)
  const myAvatar =
    header.avatar || (npub ? localStorage.getItem(`${npub}_avatar`) || undefined : undefined)
  const myName =
    header.name ||
    (npub
      ? localStorage.getItem(`${npub}_display_name`) || localStorage.getItem(`${npub}_nome`) || undefined
      : undefined)

  const replyName =
    replyTo &&
    (replyTo.profile?.display_name?.trim() ||
      replyTo.profile?.name?.trim() ||
      `${nip19.npubEncode(replyTo.pubkey).slice(0, 12)}…`)

  const quoteName =
    quoteOf &&
    (quoteOf.profile?.display_name?.trim() ||
      quoteOf.profile?.name?.trim() ||
      `${nip19.npubEncode(quoteOf.pubkey).slice(0, 12)}…`)

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    setError(null)
    setUploading(true)
    await Promise.allSettled(
      files.map((file) => {
        const id = Date.now() + Math.random()
        const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
        setUploads((prev) => [...prev, { id, preview, pct: 0 }])
        return uploadFileWithProgress(file, (pct) =>
          setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, pct } : u))),
        )
          .then((up) => {
            // enche 100%, deixa a thumbnail nítida por um instante, depois entra no grid de mídia
            setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, pct: 100 } : u)))
            setMedia((prev) => [...prev, up])
            setTimeout(() => {
              setUploads((prev) => prev.filter((u) => u.id !== id))
              if (preview) URL.revokeObjectURL(preview)
            }, 450)
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : 'Falha no upload')
            setUploads((prev) => prev.filter((u) => u.id !== id))
            if (preview) URL.revokeObjectURL(preview)
          })
      }),
    )
    setUploading(false)
  }

  // Insere o emoji na posição do cursor do textarea.
  function insertEmoji(emoji: string) {
    setShowEmoji(false)
    const ta = taRef.current
    if (!ta) {
      setText((t) => t + emoji)
      return
    }
    const start = ta.selectionStart ?? text.length
    const end = ta.selectionEnd ?? text.length
    setText(text.slice(0, start) + emoji + text.slice(end))
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + emoji.length
      ta.setSelectionRange(pos, pos)
    })
  }

  const validPollOptions = pollOptions.map((o) => o.trim()).filter(Boolean)
  const canPost =
    !busy &&
    !uploading &&
    (pollMode
      ? !!text.trim() && validPollOptions.length >= 2
      : !!text.trim() || media.length > 0 || !!quoteOf)

  async function publish() {
    if (!canPost) return
    setBusy(true)
    setError(null)
    try {
      const signer = await requireSigner(npub)
      if (!signer) {
        setError('Você precisa estar conectado (nsec salva ou extensão) para postar.')
        setBusy(false)
        return
      }
      if (pollMode) {
        const post = await publishPoll(signer, text, pollOptions, pollDays)
        feedBus.emit(post)
      } else if (scheduleAt) {
        const ts = Math.floor(new Date(scheduleAt).getTime() / 1000)
        if (!ts || ts < Date.now() / 1000 + 30) {
          setError('Escolha uma data/hora no futuro.')
          setBusy(false)
          return
        }
        const content = [text.trim(), ...media.map((m) => m.url)].filter(Boolean).join('\n\n')
        await schedulePost(signer, content, ts, { contentWarning: cw, replyTo })
        // Não entra no feed agora — vai ao ar na hora marcada.
      } else if (paidPrice && media.length) {
        // Conteúdo PAGO (Top Secret): registra a 1ª mídia como gated; publica a THUMBNAIL
        // psicodélica (a mídia real fica no servidor) + tag ts-file, e vincula o evento.
        const m = media[0]
        if (!m.sha256) { setError('Mídia sem hash — reenvie o arquivo.'); setBusy(false); return }
        const prep = await tsPrepare(m.sha256, paidPrice, m.mime)
        const content = [text.trim(), prep.thumbnail_url].filter(Boolean).join('\n\n')
        const post = await publishNote(signer, content, replyTo, {
          contentWarning: cw, quoteOf,
          extraTags: [['ts-file', prep.file_id, String(paidPrice)]],
        })
        try { await tsLinkEvent(prep.file_id, post.id) } catch { /* link best-effort */ }
        feedBus.emit(post)
      } else {
        const content = [text.trim(), ...media.map((m) => m.url)].filter(Boolean).join('\n\n')
        const post = await publishNote(signer, content, replyTo, { contentWarning: cw, quoteOf })
        feedBus.emit(post)
      }
      navigate(-1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao publicar')
      setBusy(false)
    }
  }

  const topBtn =
    'flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)] transition'
  const topLabel = 'text-[10px] font-medium'
  // Up = ação principal: pílula preenchida com a cor de destaque, maior que os demais.
  const upBtn =
    'flex flex-col items-center justify-center gap-0.5 rounded-xl bg-[var(--lm-accent)] px-3 py-1.5 text-[var(--lm-accent-txt)] shadow-md transition hover:brightness-110'

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[600px] flex-col border-x border-[var(--lm-border)]">
      <TopBar>
        <span className="flex items-center gap-2">
          <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <h1 className="lm-topbar-title">Compose</h1>
        </span>
        {/* Postar — na barra superior, empurrado p/ a direita → assenta à esquerda do hambúrguer */}
        <button
          type="button"
          onClick={publish}
          disabled={!canPost}
          className="ml-auto flex-shrink-0 rounded-full bg-[var(--lm-accent)] px-4 py-1.5 text-sm font-bold text-[var(--lm-accent-txt)] transition disabled:opacity-40"
        >
          {busy ? 'Publicando…' : scheduleAt ? 'Agendar' : quoteOf ? 'Repostar' : replyTo ? 'Responder' : 'Postar'}
        </button>
      </TopBar>

      {/* Linha de contexto: "Em resposta a…/Repostando…" — só quando há reply/quote */}
      {(replyTo || quoteOf) && (
        <div className="border-b border-[var(--lm-border)] px-4 py-2">
          <span className="min-w-0 truncate text-sm text-[var(--lm-text-muted)]">
            {replyTo && (
              <>
                Em resposta a <span className="font-medium text-[var(--lm-accent)]">{replyName}</span>
              </>
            )}
            {quoteOf && (
              <>
                Repostando <span className="font-medium text-[var(--lm-accent)]">{quoteName}</span>
              </>
            )}
          </span>
        </div>
      )}

      {/* Barra de ferramentas — GIF · Enquete · Emoj · Up · Agendar · NSFW · Cobrar.
          O Up (4º de 7 = centro exato) é a AÇÃO PRINCIPAL: maior e preenchido c/ destaque. */}
      <div className="flex items-center border-b border-[var(--lm-border)] px-3 py-2">
        <div className="flex flex-1 items-center justify-between">
        <button type="button" className={topBtn} title="GIF" onClick={() => setShowGif(true)}>
          <span className="flex h-5 items-center justify-center rounded border border-current px-1 text-[9px] font-bold leading-none">
            GIF
          </span>
          <span className={topLabel}>GIF</span>
        </button>

        <button
          type="button"
          className={`${topBtn} ${pollMode ? 'text-[var(--lm-accent)]' : ''}`}
          title="Enquete"
          aria-pressed={pollMode}
          onClick={() => setPollMode((v) => !v)}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
            <path d="M4 6h10M4 12h7M4 18h13" />
          </svg>
          <span className={topLabel}>Enquete</span>
        </button>

        <button type="button" className={topBtn} title="Emoji" onClick={() => setShowEmoji(true)}>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className={topLabel}>Emoj</span>
        </button>

        {/* Up — AÇÃO PRINCIPAL: no centro, maior (ícone 28px) e preenchido c/ a cor de destaque */}
        <label className={`${upBtn} cursor-pointer ${uploading ? 'opacity-50' : ''}`} title="Imagem ou Vídeo">
          <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-[11px] font-semibold">Up</span>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={onPickFiles} />
        </label>

        <button
          type="button"
          className={`${topBtn} ${showSchedule || scheduleAt ? 'text-[var(--lm-accent)]' : ''}`}
          title="Agendar"
          aria-pressed={showSchedule || !!scheduleAt}
          onClick={() => setShowSchedule((v) => !v)}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="17" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18M12 14v3l2 1" />
          </svg>
          <span className={topLabel}>Agendar</span>
        </button>

        <button
          type="button"
          className={`${topBtn} ${cw ? 'text-[var(--lm-accent)]' : ''}`}
          title="Conteúdo Sensível (+18)"
          aria-pressed={cw}
          onClick={() => setCw((v) => !v)}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[9px] font-bold">
            18
          </span>
          <span className={topLabel}>NSFW</span>
        </button>

        <button
          type="button"
          className={topBtn}
          title={paidPrice ? `Conteúdo pago: ${paidPrice} sats (toque p/ alterar)` : 'Cobrar pelo conteúdo'}
          onClick={() => setShowGift(true)}
          style={paidPrice ? { color: 'var(--lm-accent)' } : undefined}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className={topLabel}>{paidPrice ? `${paidPrice} sats` : 'Cobrar'}</span>
        </button>

        </div>
      </div>

      {/* Agendar: escolher data/hora (publicar-depois) */}
      {showSchedule && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--lm-border)] px-4 py-2 text-sm">
          <span className="text-[var(--lm-text-muted)]">Publicar em:</span>
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={(e) => setScheduleAt(e.target.value)}
            className="rounded-lg border border-[var(--lm-border-str)] bg-[var(--lm-bg-input)] px-3 py-1.5 text-[var(--lm-text-pri)] outline-none"
          />
          {scheduleAt && (
            <button
              type="button"
              onClick={() => {
                setScheduleAt('')
                setShowSchedule(false)
              }}
              className="text-[var(--lm-text-muted)] hover:text-[var(--lm-text-pri)]"
            >
              limpar
            </button>
          )}
        </div>
      )}

      {/* Avatar no topo + textarea na linha de baixo (largura total) */}
      <div className="flex flex-1 flex-col p-4 pb-2">
        <div className="mb-3">
          <Avatar src={myAvatar} name={myName} size={40} />
        </div>
        <textarea
          ref={taRef}
          value={text}
          maxLength={MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            pollMode
              ? 'Faça uma pergunta…'
              : quoteOf
                ? 'Adicione um comentário…'
                : replyTo
                  ? 'Escreva sua resposta…'
                  : 'O que você está pensando?'
          }
          className={`w-full resize-none bg-transparent text-[17px] leading-relaxed text-[var(--lm-text-pri)] outline-none placeholder:text-[var(--lm-text-muted)] ${pollMode ? 'min-h-[80px]' : 'min-h-[24svh] flex-1'}`}
        />

        {/* Nota sendo repostada (citação) — preview compacto */}
        {quoteOf && (
          <div className="mt-3 rounded-xl border border-[var(--lm-border)] p-3">
            <div className="mb-1 flex items-center gap-2">
              <Avatar src={quoteOf.profile?.picture} name={quoteName || ''} seed={quoteOf.pubkey} size={20} />
              <span className="text-sm font-semibold text-[var(--lm-text-pri)]">{quoteName}</span>
            </div>
            <p className="line-clamp-4 whitespace-pre-wrap text-sm text-[var(--lm-text-muted)]">
              {quoteOf.content}
            </p>
          </div>
        )}

        {/* Editor de enquete (NIP-88): 2-4 opções + duração */}
        {pollMode && (
          <div className="mt-2 space-y-2">
            {pollOptions.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={opt}
                  maxLength={80}
                  onChange={(e) =>
                    setPollOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))
                  }
                  placeholder={`Opção ${i + 1}`}
                  className="flex-1 rounded-full border border-[var(--lm-border-str)] bg-[var(--lm-bg-input)] px-4 py-2 text-sm text-[var(--lm-text-pri)] outline-none placeholder:text-[var(--lm-text-muted)]"
                />
                {pollOptions.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Remover opção"
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[var(--lm-text-muted)] hover:bg-[var(--lm-bg-card)]"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              {pollOptions.length < 4 ? (
                <button
                  type="button"
                  onClick={() => setPollOptions((prev) => [...prev, ''])}
                  className="text-sm font-semibold text-[var(--lm-accent)]"
                >
                  + Adicionar opção
                </button>
              ) : (
                <span />
              )}
              <label className="flex items-center gap-2 text-sm text-[var(--lm-text-muted)]">
                Duração
                <select
                  value={pollDays}
                  onChange={(e) => setPollDays(Number(e.target.value))}
                  className="rounded-lg border border-[var(--lm-border-str)] bg-[var(--lm-bg-input)] px-2 py-1 text-sm text-[var(--lm-text-pri)] outline-none"
                >
                  <option value={1}>1 dia</option>
                  <option value={3}>3 dias</option>
                  <option value={7}>7 dias</option>
                </select>
              </label>
            </div>
          </div>
        )}

        {uploads.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {uploads.map((u) => (
              <UploadTank key={u.id} pct={u.pct} preview={u.preview} done={u.pct >= 100} />
            ))}
          </div>
        )}
        {paidPrice && media.length > 0 && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--lm-accent)] bg-[color-mix(in_srgb,var(--lm-accent)_12%,transparent)] px-3 py-2 text-sm">
            <span>🔒</span>
            <span className="flex-1 text-[var(--lm-text-pri)]">Conteúdo pago: <b>{paidPrice} sats</b> para desbloquear (a 1ª mídia).</span>
            <button type="button" className="text-[var(--lm-text-muted)] underline" onClick={() => setPaidPrice(null)}>remover</button>
          </div>
        )}
        {!pollMode && media.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {media.map((m, i) => (
              <div key={i} className="relative overflow-hidden rounded-xl border border-[var(--lm-border)]">
                {m.isVideo ? (
                  <video src={m.url} className="h-32 w-full object-cover" />
                ) : (
                  <img src={m.url} alt="" className="h-32 w-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => setMedia((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
                  aria-label="Remover"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        {notice && <p className="mt-2 text-sm text-[var(--lm-text-muted)]">{notice}</p>}
        {!loggedIn && (
          <p className="mt-2 text-sm text-[var(--lm-text-muted)]">Entre para publicar no Nostr.</p>
        )}
      </div>

      {/* Rodapé: Relays · Pré-visualizar · contador */}
      <div className="flex items-center gap-2 border-t border-[var(--lm-border)] px-4 py-2">
        <button
          type="button"
          onClick={() => soon('Selecionar relays')}
          aria-label="Relays"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--lm-accent)] hover:bg-[color-mix(in_srgb,var(--lm-accent)_12%,transparent)]"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="6" rx="1.5" />
            <rect x="3" y="14" width="18" height="6" rx="1.5" />
            <path strokeLinecap="round" d="M7 7h.01M7 17h.01" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => soon('Pré-visualizar')}
          aria-label="Pré-visualizar"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--lm-accent)] hover:bg-[color-mix(in_srgb,var(--lm-accent)_12%,transparent)]"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12S5.5 5.5 12 5.5 21.5 12 21.5 12 18.5 18.5 12 18.5 2.5 12 2.5 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
        <div className="flex-1" />
        <span className="text-sm tabular-nums text-[var(--lm-text-muted)]">
          {text.length}
          <span className="opacity-50">/{MAX}</span>
        </span>
      </div>

      {showEmoji && <EmojiPicker onPick={insertEmoji} onClose={() => setShowEmoji(false)} />}
      {showGif && (
        <GifPicker
          onPick={(url) => {
            setMedia((prev) => [...prev, { url, mime: 'image/gif', isVideo: false }])
            setShowGif(false)
          }}
          onClose={() => setShowGif(false)}
        />
      )}
      {showGift && (
        <GiftPicker
          onPick={(sats) => { setPaidPrice(sats); setShowGift(false) }}
          onClose={() => setShowGift(false)}
        />
      )}
    </div>
  )
}
