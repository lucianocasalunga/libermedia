// Compositor de posts (kind:1) e respostas. Overlay modal acionado pelo FAB,
// botão da sidebar ou Responder. Publica de verdade e prependa no feed na hora.
import { useEffect, useRef, useState } from 'react'
import { useAtom } from 'jotai'
import { nip19 } from 'nostr-tools'
import { composeAtom } from '../../state/compose'
import { useAuth } from '../../providers/AuthProvider'
import { requireSigner } from '../../services/require-signer'
import { publishNote } from '../../services/post'
import { feedBus } from '../../lib/feed-bus'
import './compose-modal.css'

export function ComposeModal() {
  const [{ open, replyTo }, setCompose] = useAtom(composeAtom)
  const { npub, loggedIn } = useAuth()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Foca o textarea ao abrir.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => taRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open])

  if (!open) return null

  const close = () => {
    setText('')
    setError(null)
    setBusy(false)
    setCompose({ open: false, replyTo: null })
  }

  const replyName =
    replyTo &&
    (replyTo.profile?.display_name?.trim() ||
      replyTo.profile?.name?.trim() ||
      `${nip19.npubEncode(replyTo.pubkey).slice(0, 12)}…`)

  async function publish() {
    const content = text.trim()
    if (!content || busy) return
    setBusy(true)
    setError(null)
    try {
      const signer = await requireSigner(npub)
      if (!signer) {
        setError('Você precisa estar conectado (nsec salva ou extensão) para postar.')
        setBusy(false)
        return
      }
      const post = await publishNote(signer, content, replyTo)
      // Garante o profile do autor (eu) no card, se disponível.
      feedBus.emit(post)
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao publicar')
      setBusy(false)
    }
  }

  return (
    <div className="lm-compose-overlay" onClick={close}>
      <div className="lm-compose-box" onClick={(e) => e.stopPropagation()}>
        <div className="lm-compose-head">
          <button type="button" className="lm-compose-cancel" onClick={close}>
            Cancelar
          </button>
          <button
            type="button"
            className="lm-compose-send"
            disabled={!text.trim() || busy}
            onClick={publish}
          >
            {busy ? 'Publicando…' : replyTo ? 'Responder' : 'Postar'}
          </button>
        </div>

        {replyTo && (
          <div className="lm-compose-replyctx">Respondendo a {replyName}</div>
        )}

        <textarea
          ref={taRef}
          className="lm-compose-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={replyTo ? 'Escreva sua resposta…' : 'O que está acontecendo?'}
          rows={5}
        />

        {error && <div className="lm-compose-error">{error}</div>}
        {!loggedIn && (
          <div className="lm-compose-hint">Entre para publicar no Nostr.</div>
        )}
      </div>
    </div>
  )
}
