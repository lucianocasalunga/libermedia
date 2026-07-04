// Menu do post (⋯) — réplica do v2.0 (menos "favoritos", que já está na barra de
// ações). Seções: [mídia] · copiar · ações · (próprio: fixar/NSFW/deletar |
// outro: denunciar/bloquear). Ações que assinam usam o signer; feedback via toast.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { nip19 } from 'nostr-tools'
import { useAuth } from '../../providers/AuthProvider'
import { requireSigner } from '../../services/require-signer'
import { parseContent } from '../../lib/content-parser'
import { toast } from '../../lib/toast'
import { extFrom, nextDownloadSeq, downloadName } from '../../lib/download-name'
import { hidePost } from '../../lib/hidden-posts'
import { loadRelays } from '../../services/relays'
import { pins } from '../../services/pins'
import { mutes } from '../../services/mutes'
import { deletePost, reportPost, republishToRelay, markNsfw } from '../../services/post-actions'
import type { FeedEvent } from '../../types/nostr'
import './post-menu.css'

const REPORT_REASONS = [
  { value: 'bot', label: 'Bot / Spam automático' },
  { value: 'spam', label: 'Spam / Conteúdo repetitivo' },
  { value: 'nsfw', label: 'Conteúdo adulto (NSFW)' },
  { value: 'illegal', label: 'Conteúdo ilegal' },
  { value: 'impersonation', label: 'Personificação' },
  { value: 'other', label: 'Outro' },
]

function copy(text: string, msg: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast(msg, 'success'),
    () => toast('Erro ao copiar', 'error'),
  )
}

async function download(url: string) {
  try {
    const r = await fetch(url)
    const blob = await r.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = downloadName(nextDownloadSeq(), extFrom({ mime: blob.type, url }))
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 30000)
    toast('Download iniciado', 'success')
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
    toast('Abrindo em nova aba — salve manualmente', 'info')
  }
}

type View = 'menu' | 'raw' | 'report' | 'republish' | 'confirm'
interface ConfirmCfg {
  title: string
  msg: string
  btn: string
  danger?: boolean
  run: () => void | Promise<void>
}

export function PostMenu({ event, onClose }: { event: FeedEvent; onClose: () => void }) {
  const { npub: myNpub, pubkeyHex: myHex } = useAuth()
  const [view, setView] = useState<View>('menu')
  const [confirmCfg, setConfirmCfg] = useState<ConfirmCfg | null>(null)
  const [reason, setReason] = useState('spam')
  const [details, setDetails] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (view === 'menu' ? onClose() : setView('menu'))
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, view])

  const isOwn = !!myHex && myHex === event.pubkey
  const pinned = pins.useHas(event.id)
  const muted = mutes.useHas(event.pubkey)

  const note = useMemo(() => {
    try {
      return nip19.noteEncode(event.id)
    } catch {
      return event.id
    }
  }, [event.id])
  const authorNpub = useMemo(() => {
    try {
      return nip19.npubEncode(event.pubkey)
    } catch {
      return event.pubkey
    }
  }, [event.pubkey])

  // Mídia baixável: imagens (qualquer) + vídeos do nosso host (CORS ok).
  const { images, videos } = useMemo(() => {
    const media = parseContent(event.content || '').media
    return {
      images: media.filter((m) => m.type === 'image').map((m) => m.url),
      videos: media
        .filter((m) => m.type === 'video' && m.url.includes('media.libernet.app'))
        .map((m) => m.url),
    }
  }, [event.content])

  async function withSigner(run: (signer: Awaited<ReturnType<typeof requireSigner>>) => Promise<void>) {
    const signer = await requireSigner(myNpub)
    if (!signer) {
      toast('Entre com chave privada ou extensão para assinar', 'error')
      return
    }
    await run(signer)
  }

  // ---- Ações ----
  function doDelete() {
    setConfirmCfg({
      title: 'Deletar postagem',
      msg: 'Envia um pedido de deleção (kind:5) aos relays. Posts já propagados podem não sair de todos.',
      btn: 'Deletar',
      danger: true,
      run: () =>
        withSigner(async (s) => {
          await deletePost(s!, event.id)
          hidePost(event.id)
          toast('Postagem deletada dos relays', 'success')
          onClose()
        }),
    })
    setView('confirm')
  }
  function doNsfw() {
    setConfirmCfg({
      title: 'Marcar como NSFW',
      msg: 'Deleta este post e republica com aviso de conteúdo sensível. O novo post terá um ID diferente (curtidas/zaps/replies do original se perdem).',
      btn: 'Marcar NSFW',
      run: () =>
        withSigner(async (s) => {
          await markNsfw(s!, event)
          hidePost(event.id)
          toast('Republicado como NSFW', 'success')
          onClose()
        }),
    })
    setView('confirm')
  }
  function doMute() {
    if (muted) {
      void withSigner(async (s) => {
        await mutes.toggle(s!, myHex!, event.pubkey)
        toast('Usuário desbloqueado', 'success')
        onClose()
      })
      return
    }
    setConfirmCfg({
      title: 'Bloquear usuário',
      msg: 'Os posts deste usuário serão ocultados e sua lista de bloqueados (kind:10000) será publicada no Nostr.',
      btn: 'Bloquear',
      danger: true,
      run: () =>
        withSigner(async (s) => {
          await mutes.toggle(s!, myHex!, event.pubkey)
          toast('Usuário bloqueado', 'success')
          onClose()
        }),
    })
    setView('confirm')
  }
  function doPin() {
    void withSigner(async (s) => {
      const nowPinned = await pins.toggle(s!, myHex!, event.id)
      toast(nowPinned ? 'Fixado no perfil' : 'Desafixado do perfil', 'success')
      onClose()
    })
  }
  function submitReport() {
    void withSigner(async (s) => {
      await reportPost(s!, event, reason, details.trim())
      toast('Denúncia enviada', 'success')
      onClose()
    })
  }

  // ---- Itens do menu ----
  interface Item {
    label: string
    icon: ReactNode
    run: () => void
    danger?: boolean
    accent?: string
  }
  const sections: Item[][] = []

  const mediaItems: Item[] = []
  images.forEach((url, i) =>
    mediaItems.push({
      label: images.length > 1 ? `Baixar imagem ${i + 1}` : 'Baixar imagem',
      icon: <IconDownload />,
      run: () => {
        void download(url)
        onClose()
      },
    }),
  )
  videos.forEach((url, i) =>
    mediaItems.push({
      label: videos.length > 1 ? `Baixar vídeo ${i + 1}` : 'Baixar vídeo',
      icon: <IconDownload />,
      run: () => {
        void download(url)
        onClose()
      },
    }),
  )
  if (mediaItems.length) sections.push(mediaItems)

  sections.push([
    { label: 'Copiar ID do evento', icon: <IconCopy />, run: () => { copy(note, 'ID do evento copiado!'); onClose() } },
    { label: 'Copiar ID do usuário', icon: <IconCopy />, run: () => { copy(authorNpub, 'ID do usuário copiado!'); onClose() } },
    { label: 'Copiar link de compartilhamento', icon: <IconCopy />, run: () => { copy(`https://njump.me/${note}`, 'Link copiado!'); onClose() } },
    { label: 'Copiar conteúdo da nota', icon: <IconCopy />, run: () => { copy(event.content || '', 'Conteúdo copiado!'); onClose() } },
  ])

  sections.push([
    { label: 'Ver evento bruto', icon: <IconEye />, run: () => setView('raw') },
    { label: 'Republicar em…', icon: <IconRepublish />, run: () => setView('republish') },
  ])

  sections.push(
    isOwn
      ? [
          { label: pinned ? 'Desafixar do perfil' : 'Fixar no perfil', icon: <IconPin />, run: doPin, accent: '#a78bfa' },
          { label: 'Marcar como NSFW', icon: <IconShield />, run: doNsfw, accent: '#f59e0b' },
          { label: 'Deletar postagem', icon: <IconTrash />, run: doDelete, danger: true },
        ]
      : [
          { label: 'Denunciar', icon: <IconReport />, run: () => setView('report'), danger: true },
          { label: muted ? 'Desbloquear usuário' : 'Bloquear usuário', icon: <IconBlock />, run: doMute, danger: true },
        ],
  )

  return createPortal(
    <div
      className="lm-postmenu-root"
      onClick={(e) => {
        e.stopPropagation()
        if (view === 'menu') onClose()
        else setView('menu')
      }}
    >
      <div className="lm-postmenu" role="menu" onClick={(e) => e.stopPropagation()}>
        {view === 'menu' && (
          <>
            {sections.map((sec, si) => (
              <div key={si}>
                {si > 0 && <div className="lm-postmenu-divider" />}
                {sec.map((it) => (
                  <button
                    key={it.label}
                    type="button"
                    role="menuitem"
                    className={`lm-postmenu-item${it.danger ? ' is-danger' : ''}`}
                    style={it.accent ? { color: it.accent } : undefined}
                    onClick={it.run}
                  >
                    <span className="lm-postmenu-ico">{it.icon}</span>
                    <span>{it.label}</span>
                  </button>
                ))}
              </div>
            ))}
            {/* Cancelar — só no mobile (no desktop fecha clicando fora) */}
            <button type="button" className="lm-postmenu-cancel" onClick={onClose}>
              Cancelar
            </button>
          </>
        )}

        {view === 'raw' && (
          <div className="p-2">
            <div className="mb-2 px-2 text-base font-bold text-[var(--lm-text-pri)]">Evento bruto</div>
            <pre className="max-h-[60vh] overflow-auto rounded-lg border border-[var(--lm-border)] bg-[var(--lm-bg-input)] p-3 text-xs whitespace-pre-wrap break-all text-[var(--lm-text-sec)] select-text">
              {JSON.stringify(event, null, 2)}
            </pre>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="lm-postmenu-btn" onClick={() => setView('menu')}>Fechar</button>
              <button type="button" className="lm-postmenu-btn is-primary" onClick={() => copy(JSON.stringify(event, null, 2), 'JSON copiado!')}>Copiar JSON</button>
            </div>
          </div>
        )}

        {view === 'republish' && (
          <div className="p-2">
            <div className="mb-2 px-2 text-base font-bold text-[var(--lm-text-pri)]">Republicar em…</div>
            {loadRelays().map((url) => (
              <button
                key={url}
                type="button"
                className="lm-postmenu-item"
                onClick={() => {
                  void republishToRelay(event, url).then(
                    () => toast(`Republicado em ${url.replace('wss://', '')}`, 'success'),
                    () => toast('Erro ao republicar', 'error'),
                  )
                  onClose()
                }}
              >
                <span className="lm-postmenu-ico"><IconRepublish /></span>
                <span className="break-all">{url.replace('wss://', '')}</span>
              </button>
            ))}
            <div className="mt-2 flex justify-end">
              <button type="button" className="lm-postmenu-btn" onClick={() => setView('menu')}>Voltar</button>
            </div>
          </div>
        )}

        {view === 'report' && (
          <div className="p-3">
            <div className="mb-2 text-base font-bold text-[var(--lm-text-pri)]">Denunciar publicação</div>
            <div className="space-y-1">
              {REPORT_REASONS.map((r) => (
                <label key={r.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-input)]">
                  <input type="radio" name="reportReason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
                  {r.label}
                </label>
              ))}
            </div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Detalhes adicionais (opcional)"
              className="mt-2 w-full resize-none rounded-lg border border-[var(--lm-border-str)] bg-[var(--lm-bg-input)] p-2 text-sm text-[var(--lm-text-pri)] outline-none"
              rows={2}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="lm-postmenu-btn" onClick={() => setView('menu')}>Cancelar</button>
              <button type="button" className="lm-postmenu-btn is-danger" onClick={submitReport}>Denunciar</button>
            </div>
          </div>
        )}

        {view === 'confirm' && confirmCfg && (
          <div className="p-3">
            <div className="mb-2 text-base font-bold text-[var(--lm-text-pri)]">{confirmCfg.title}</div>
            <p className="text-sm text-[var(--lm-text-sec)]">{confirmCfg.msg}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="lm-postmenu-btn" onClick={() => setView('menu')}>Cancelar</button>
              <button
                type="button"
                className={`lm-postmenu-btn ${confirmCfg.danger ? 'is-danger' : 'is-primary'}`}
                onClick={() => void confirmCfg.run()}
              >
                {confirmCfg.btn}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

// ---- Ícones (inline currentColor, padrão do v2.5) ----
const sv = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 } as const
const IconCopy = () => (<svg {...sv}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>)
const IconDownload = () => (<svg {...sv}><path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>)
const IconEye = () => (<svg {...sv}><path d="M2.5 12S5.5 5.5 12 5.5 21.5 12 21.5 12 18.5 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></svg>)
const IconRepublish = () => (<svg {...sv}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.01M4 9a8 8 0 0114.9-2M20 20v-5h-.01M20 15a8 8 0 01-14.9 2" /></svg>)
const IconPin = () => (<svg {...sv}><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17H19V15L14 9V3H10V9L5 15V17Z" /></svg>)
const IconShield = () => (<svg {...sv}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>)
const IconTrash = () => (<svg {...sv}><path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /></svg>)
const IconReport = () => (<svg {...sv}><path d="M4 22V4a1 1 0 01.4-.8A6 6 0 018 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0120 4v10a1 1 0 01-.4.8A6 6 0 0116 16c-3 0-5-2-8-2a6 6 0 00-4 1.528" /></svg>)
const IconBlock = () => (<svg {...sv}><circle cx="12" cy="12" r="9" /><line x1="5.6" y1="5.6" x2="18.4" y2="18.4" /></svg>)
