// Arquivos — gerenciador de mídia. Abas PADRÃO (Tabs) 3+3 (mobile e desktop): Todos/
// Favoritos/Fotos/Vídeos/Áudio/Documentos. Lixeira = ícone na barra superior (área especial).
// Seletor de tamanho = quadradinho que cresce (S→X), sem texto. Tamanho persistido em prefs.
// Cada miniatura tem menu ⋮ (canto sup. direito, convenção Material/Drive): Favoritar/Baixar/
// Compartilhar/Copiar link/Informações/Mover p/ lixeira (lixeira: Restaurar/Excluir p/ sempre).
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import { api } from '../services/api'
import { extFrom, nextDownloadSeq, downloadName } from '../lib/download-name'
import { uploadFile } from '../services/upload'
import { toast } from '../lib/toast'
import { TopBar } from '../components/TopBar/TopBar'
import { Tabs } from '../components/Tabs/Tabs'
import { ArquivosIcon } from '../components/icons'
import { MediaViewer } from '../components/MediaViewer/MediaViewer'
import { syncPref } from '../services/user-prefs'
import { usePrefsLoaded } from '../hooks/usePrefsLoaded'

interface FileItem {
  id: number
  name: string
  size: number
  mime_type: string
  sha256: string
  short_code?: string | null
  thumbnail?: string | null
  is_favorite?: boolean
  created_at?: string | null
}

type CatKey = 'todos' | 'favoritos' | 'lixeira' | 'image' | 'video' | 'document' | 'audio'

const TABS = [
  { key: 'todos', label: 'Todos' },
  { key: 'favoritos', label: 'Favoritos' },
  { key: 'image', label: 'Fotos' },
  { key: 'video', label: 'Vídeos' },
  { key: 'audio', label: 'Áudio' },
  { key: 'document', label: 'Documentos' },
]

const SIZES: { key: string; tag: string; cols: string; box: number }[] = [
  { key: 'min', tag: 'S', cols: 'grid-cols-6', box: 9 },
  { key: 'pequeno', tag: 'P', cols: 'grid-cols-5', box: 12 },
  { key: 'medio', tag: 'M', cols: 'grid-cols-4', box: 15 },
  { key: 'grande', tag: 'G', cols: 'grid-cols-3', box: 19 },
  { key: 'max', tag: 'X', cols: 'grid-cols-2', box: 23 },
]

function endpoint(cat: CatKey): string {
  if (cat === 'lixeira') return '/api/files/trash?limit=200'
  if (cat === 'favoritos') return '/api/files?favorites=1&limit=200'
  if (cat === 'todos') return '/api/files?limit=200'
  return `/api/files?type=${cat}&limit=200`
}

function publicLink(f: FileItem): string {
  const origin = window.location.origin
  if (f.short_code) {
    const ext = (f.name.split('.').pop() || 'bin').toLowerCase()
    return `${origin}/s/${f.short_code}.${ext}`
  }
  return `${origin}/${f.sha256}`
}

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`
}

// Ícones do menu (16px, stroke do tema)
const I = (d: string) => (
  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)
const icDownload = I('M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2')
const icShare = I('M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13')
const icLink = I('M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1')
const icInfo = I('M12 16v-4m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z')
const icTrash = I('M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H6a1 1 0 01-1-1V6M10 11v6M14 11v6')
const icRestore = I('M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8m0 0V4m0 4h4')
const icSelect = I('M9 11l3 3L20 5M21 12v6a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3h9')
const icStar = (filled?: boolean) => (
  <svg viewBox="0 0 24 24" width={16} height={16} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
    <path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18.8 6.2 21.8l1.1-6.5L2.6 9.8l6.5-.9z" />
  </svg>
)

// Ícone de fallback por tipo (quando a thumbnail 404 — ex.: áudio sem equalizer gerado).
function fileTypeIcon(mime?: string) {
  const common = { viewBox: '0 0 24 24', width: 30, height: 30, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (mime?.startsWith('audio/')) return <svg {...common}><path d="M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM21 16a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
  if (mime?.startsWith('video/')) return <svg {...common}><path d="M23 7l-7 5 7 5V7zM1 5h15v14H1z" /></svg>
  if (mime?.startsWith('image/')) return <svg {...common}><path d="M3 3h18v18H3zM3 15l5-5 4 4 4-4 5 5" /><circle cx="9" cy="9" r="1.5" /></svg>
  return <svg {...common}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
}

export function ArquivosPage() {
  const { loggedIn, loading: authLoading } = useAuth()
  const [cat, setCat] = useState<CatKey>('todos')
  const [size, setSize] = useState<string>(() => localStorage.getItem('thumbnail_size') || 'medio')
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [menuId, setMenuId] = useState<number | null>(null)
  // Posição do menu ⋮ (canto inf-dir do botão) p/ portar com posição fixed clampada na viewport
  // — senão, nas miniaturas da coluna esquerda o menu (w-44) estoura a borda esquerda da tela.
  const [menuAnchor, setMenuAnchor] = useState<{ right: number; top: number } | null>(null)
  const [info, setInfo] = useState<FileItem | null>(null)
  const [viewer, setViewer] = useState<number | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [thumbFailed, setThumbFailed] = useState<Set<number>>(new Set()) // thumb 404 → ícone por tipo
  const gridRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const lp = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean; x: number; y: number }>({ timer: null, fired: false, x: 0, y: 0 })

  usePrefsLoaded(() => {
    const s = localStorage.getItem('thumbnail_size')
    if (s) setSize(s)
  })

  // Espera a sessão Flask antes de buscar — a página é keep-alive e monta no boot,
  // antes de /api/auth/check resolver; sem este gate o 1º fetch saía sem sessão e
  // /api/files devolvia 401 → "Todos" abria vazia até trocar de aba (corrida de boot).
  // Reagir a loggedIn faz o re-fetch acontecer assim que a sessão fica pronta.
  useEffect(() => {
    if (authLoading) return
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setMenuId(null)
    setViewer(null)
    setSelecting(false)
    setSelected(new Set())
    if (!loggedIn) {
      setFiles([])
      setLoading(false)
      return () => { alive = false }
    }
    api
      .get<{ files: FileItem[] }>(endpoint(cat))
      .then((res) => { if (alive) { setFiles(res.files ?? []); setLoading(false) } })
      .catch(() => alive && setLoading(false))
    return () => { alive = false }
  }, [cat, loggedIn, authLoading])

  // Botão "Enviar" da sidebar (slot padrão) abre o seletor de arquivos via evento global
  // — mesma ação do "+" da barra; um caminho único para acionar o upload de qualquer lugar.
  useEffect(() => {
    const open = () => fileInputRef.current?.click()
    window.addEventListener('lm:arquivos-upload', open)
    return () => window.removeEventListener('lm:arquivos-upload', open)
  }, [])

  // Recarrega a lista da aba atual (após upload). Fora do effect p/ reusar.
  function refetch() {
    api
      .get<{ files: FileItem[] }>(endpoint(cat))
      .then((res) => setFiles(res.files ?? []))
      .catch(() => { /* mantém lista atual */ })
  }

  async function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files
    if (!picked || picked.length === 0) return
    const list = Array.from(picked)
    e.target.value = '' // permite re-selecionar o mesmo arquivo depois
    toast(`Enviando ${list.length} arquivo${list.length > 1 ? 's' : ''}…`, 'info')
    const results = await Promise.allSettled(list.map((f) => uploadFile(f)))
    const ok = results.filter((r) => r.status === 'fulfilled').length
    const fail = results.length - ok
    if (ok) toast(`${ok} arquivo${ok > 1 ? 's' : ''} enviado${ok > 1 ? 's' : ''}`, 'success')
    if (fail) toast(`${fail} ${fail > 1 ? 'falharam' : 'falhou'}`, 'error')
    if (ok) refetch()
  }

  // Fecha o menu ao clicar fora.
  useEffect(() => {
    if (menuId == null) return
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-file-menu]')) setMenuId(null)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuId])

  function pickSize(k: string) {
    setSize(k)
    localStorage.setItem('thumbnail_size', k)
    void syncPref('thumbnail_size')
  }

  const cols = SIZES.find((s) => s.key === size)?.cols ?? 'grid-cols-4'
  const isTrash = cat === 'lixeira'

  // Ações do menu
  async function actFavorite(f: FileItem) {
    setMenuId(null)
    try {
      const r = await api.post<{ is_favorite: boolean }>(`/api/files/${f.id}/favorite`)
      setFiles((prev) =>
        cat === 'favoritos' && !r.is_favorite
          ? prev.filter((x) => x.id !== f.id)
          : prev.map((x) => (x.id === f.id ? { ...x, is_favorite: r.is_favorite } : x)),
      )
      toast(r.is_favorite ? 'Adicionado aos favoritos' : 'Removido dos favoritos', 'success')
    } catch { toast('Erro ao favoritar', 'error') }
  }
  // Baixa via blob (não link direto): o /f/<id> manda Content-Disposition com o hash,
  // que em same-origin pode sobrescrever o a.download. Com blob o nome amigável sempre vence.
  async function actDownload(f: FileItem) {
    setMenuId(null)
    const fname = downloadName(nextDownloadSeq(), extFrom({ mime: f.mime_type, name: f.name }))
    try {
      const r = await fetch(`/f/${f.id}`, { credentials: 'include' })
      const blob = await r.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = fname
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 30000)
    } catch {
      // Fallback: link direto (o nome pode vir do servidor, mas ao menos baixa).
      const a = document.createElement('a')
      a.href = `/f/${f.id}`
      a.download = fname
      a.click()
    }
  }
  async function actCopy(f: FileItem) {
    setMenuId(null)
    try { await navigator.clipboard.writeText(publicLink(f)); toast('Link copiado', 'success') }
    catch { toast('Erro ao copiar', 'error') }
  }
  async function actShare(f: FileItem) {
    setMenuId(null)
    const url = publicLink(f)
    if (navigator.share) { try { await navigator.share({ title: f.name, url }) } catch { /* cancelado */ } }
    else { try { await navigator.clipboard.writeText(url); toast('Link copiado', 'success') } catch { toast('Erro', 'error') } }
  }
  async function actTrash(f: FileItem) {
    setMenuId(null)
    try { await api.del(`/api/files/${f.id}`); setFiles((p) => p.filter((x) => x.id !== f.id)); toast('Movido para a lixeira', 'success') }
    catch { toast('Erro ao mover', 'error') }
  }
  async function actRestore(f: FileItem) {
    setMenuId(null)
    try { await api.post(`/api/files/${f.id}/restore`); setFiles((p) => p.filter((x) => x.id !== f.id)); toast('Arquivo restaurado', 'success') }
    catch { toast('Erro ao restaurar', 'error') }
  }
  async function actDeleteForever(f: FileItem) {
    setMenuId(null)
    if (!window.confirm(`Excluir "${f.name}" para sempre? Esta ação não pode ser desfeita.`)) return
    try { await api.del(`/api/files/${f.id}/permanent`); setFiles((p) => p.filter((x) => x.id !== f.id)); toast('Excluído para sempre', 'success') }
    catch { toast('Erro ao excluir', 'error') }
  }

  // ── Seleção múltipla ──
  function enterSelect(f: FileItem) { setMenuId(null); setSelecting(true); setSelected(new Set([f.id])) }
  function exitSelect() { setSelecting(false); setSelected(new Set()) }
  function toggleSel(id: number) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }
  const selFiles = () => files.filter((f) => selected.has(f.id))

  // Toque longo (mobile/desktop) entra no modo seleção.
  function lpStart(e: React.PointerEvent, f: FileItem) {
    if (selecting) return
    lp.current.fired = false
    lp.current.x = e.clientX
    lp.current.y = e.clientY
    lp.current.timer = setTimeout(() => { lp.current.fired = true; enterSelect(f) }, 500)
  }
  function lpMove(e: React.PointerEvent) {
    if (!lp.current.timer) return
    if (Math.abs(e.clientX - lp.current.x) > 10 || Math.abs(e.clientY - lp.current.y) > 10) lpCancel()
  }
  function lpCancel() {
    if (lp.current.timer) { clearTimeout(lp.current.timer); lp.current.timer = null }
  }

  async function selCopy() {
    const links = selFiles().map(publicLink).join('\n')
    try { await navigator.clipboard.writeText(links); toast(`${selected.size} link(s) copiado(s)`, 'success') }
    catch { toast('Erro ao copiar', 'error') }
    exitSelect()
  }
  function selShareAsPost() {
    const links = selFiles().map(publicLink).join('\n')
    if (!links) return
    navigate('/compose', { state: { initialText: `${links}\n` } })
    exitSelect()
  }
  async function selTrash() {
    const list = selFiles()
    await Promise.allSettled(list.map((f) => api.del(`/api/files/${f.id}`)))
    const ids = new Set(list.map((f) => f.id))
    setFiles((p) => p.filter((x) => !ids.has(x.id)))
    toast(`${list.length} movido(s) para a lixeira`, 'success')
    exitSelect()
  }
  async function selRestore() {
    const list = selFiles()
    await Promise.allSettled(list.map((f) => api.post(`/api/files/${f.id}/restore`)))
    const ids = new Set(list.map((f) => f.id))
    setFiles((p) => p.filter((x) => !ids.has(x.id)))
    toast(`${list.length} restaurado(s)`, 'success')
    exitSelect()
  }
  async function selDeleteForever() {
    const n = selected.size
    if (!window.confirm(`Excluir ${n} arquivo(s) para sempre? Esta ação não pode ser desfeita.`)) return
    const list = selFiles()
    await Promise.allSettled(list.map((f) => api.del(`/api/files/${f.id}/permanent`)))
    const ids = new Set(list.map((f) => f.id))
    setFiles((p) => p.filter((x) => !ids.has(x.id)))
    toast(`${n} excluído(s)`, 'success')
    exitSelect()
  }

  return (
    <div className="mx-auto min-h-svh w-full max-w-[600px] border-x border-[var(--lm-border)]">
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFilesPicked} />
      <TopBar>
        {selecting ? (
          <span className="flex flex-1 items-center gap-2">
            <button type="button" onClick={exitSelect} aria-label="Cancelar seleção" className="flex-shrink-0 rounded-full p-1.5 text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-card)]">
              <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <h1 className="lm-topbar-title min-w-0 flex-1 truncate">{selected.size} selecionado{selected.size === 1 ? '' : 's'}</h1>
            {selected.size > 0 && (
              <span className="flex flex-shrink-0 items-center gap-0.5">
                <BarBtn icon={icLink} label="Copiar link" onClick={selCopy} />
                {isTrash ? (
                  <>
                    <BarBtn icon={icRestore} label="Restaurar" onClick={selRestore} />
                    <BarBtn icon={icTrash} label="Excluir para sempre" danger onClick={selDeleteForever} />
                  </>
                ) : (
                  <>
                    <BarBtn icon={icShare} label="Compartilhar como post" onClick={selShareAsPost} />
                    <BarBtn icon={icTrash} label="Excluir" danger onClick={selTrash} />
                  </>
                )}
              </span>
            )}
          </span>
        ) : (
          <span className="flex flex-1 items-center justify-between">
            <span className="flex items-center gap-2">
              <ArquivosIcon className="h-5 w-5 flex-shrink-0" />
              <h1 className="lm-topbar-title">Arquivos</h1>
            </span>
            <button
              type="button"
              onClick={() => setCat((c) => (c === 'lixeira' ? 'todos' : 'lixeira'))}
              aria-label="Lixeira"
              aria-pressed={isTrash}
              className={`rounded-full p-1.5 transition ${
                isTrash ? 'bg-[var(--lm-accent)] text-[var(--lm-accent-txt)]' : 'text-[var(--lm-text-sec)] hover:bg-[var(--lm-bg-card)]'
              }`}
            >
              {icTrash}
            </button>
          </span>
        )}
      </TopBar>

      <div className="border-b border-[var(--lm-border)] px-3 py-3">
        <Tabs items={TABS} value={cat} onChange={(k) => setCat(k as CatKey)} columns={3} />
        <div className="mt-2 flex items-center justify-between gap-1">
          {/* Enviar arquivo — na extrema esquerda da linha (substitui o FAB flutuante). */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Enviar arquivo"
            aria-label="Enviar arquivo"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-[var(--lm-accent)] text-[var(--lm-accent-txt)] transition hover:opacity-90"
          >
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <div className="flex items-center gap-1">
            {SIZES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => pickSize(s.key)}
                title={s.tag}
                aria-label={`Tamanho ${s.tag}`}
                aria-pressed={size === s.key}
                className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
                  size === s.key ? 'bg-[var(--lm-accent)]/15' : 'hover:bg-[var(--lm-bg-card)]'
                }`}
              >
                <span className="block rounded-sm" style={{ width: s.box, height: s.box, background: size === s.key ? 'var(--lm-accent)' : 'var(--lm-text-muted)' }} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-2">
        {loading ? (
          <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">Carregando…</p>
        ) : files.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">{isTrash ? 'Lixeira vazia.' : 'Nenhum arquivo aqui.'}</p>
        ) : (
          <div ref={gridRef} className={`grid gap-1 ${cols}`}>
            {files.map((f, idx) => {
              const isVideo = f.mime_type?.startsWith('video/')
              const open = menuId === f.id
              const sel = selected.has(f.id)
              return (
                <div key={f.id} className="group relative">
                  <a
                    href={`/f/${f.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (lp.current.fired) { e.preventDefault(); lp.current.fired = false; return }
                      e.preventDefault()
                      if (selecting) { toggleSel(f.id); return }
                      setViewer(idx)
                    }}
                    onPointerDown={(e) => lpStart(e, f)}
                    onPointerMove={lpMove}
                    onPointerUp={lpCancel}
                    onPointerLeave={lpCancel}
                    onPointerCancel={lpCancel}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`relative block aspect-square overflow-hidden rounded-md bg-[var(--lm-bg-input)] ${sel ? 'ring-2 ring-[var(--lm-accent)]' : ''}`}
                    title={f.name}
                  >
                    {selecting && <span className={`absolute inset-0 z-10 ${sel ? 'bg-[var(--lm-accent)]/25' : 'bg-black/10'}`} />}
                    {thumbFailed.has(f.id) ? (
                      <span className="flex h-full w-full items-center justify-center text-[var(--lm-text-muted)]">{fileTypeIcon(f.mime_type)}</span>
                    ) : (
                      <img
                        src={`/thumb/${f.id}`}
                        alt={f.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                        onError={() => setThumbFailed((s) => new Set(s).add(f.id))}
                      />
                    )}
                    {isVideo && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <svg viewBox="0 0 24 24" width="28" height="28" fill="white" opacity="0.9"><path d="M8 5v14l11-7z" /></svg>
                      </span>
                    )}
                    {f.is_favorite && (
                      <span className="absolute left-1 top-1 text-[var(--lm-accent)] drop-shadow [&>svg]:h-4 [&>svg]:w-4">
                        {icStar(true)}
                      </span>
                    )}
                  </a>

                  {selecting ? (
                    /* Marcador de seleção */
                    <span
                      className={`pointer-events-none absolute right-1 top-1 z-20 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                        sel ? 'border-[var(--lm-accent)] bg-[var(--lm-accent)] text-[var(--lm-accent-txt)]' : 'border-white/90 bg-black/35'
                      }`}
                    >
                      {sel && <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>}
                    </span>
                  ) : (
                    /* Botão ⋮ — canto superior direito (Material/Drive) */
                    <button
                      type="button"
                      data-file-menu
                      onClick={(e) => {
                        e.stopPropagation()
                        const r = e.currentTarget.getBoundingClientRect()
                        setMenuAnchor({ right: r.right, top: r.bottom })
                        setMenuId(open ? null : f.id)
                      }}
                      aria-label="Opções"
                      className={`absolute right-1 top-1 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition md:opacity-0 md:group-hover:opacity-100 ${open ? 'opacity-100' : ''}`}
                    >
                      <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
                    </button>
                  )}

                  {!selecting && open && menuAnchor && createPortal(
                    <div
                      data-file-menu
                      onClick={(e) => e.stopPropagation()}
                      className="fixed z-[200] w-44 overflow-y-auto rounded-xl border border-[var(--lm-border-str)] bg-[var(--lm-bg-sidebar)] py-1 shadow-2xl"
                      style={{
                        left: Math.max(8, Math.min(menuAnchor.right - 176, window.innerWidth - 184)),
                        top: Math.max(8, Math.min(menuAnchor.top + 4, window.innerHeight - 332)),
                        maxHeight: '70vh',
                      }}
                    >
                      <MenuItem icon={icSelect} label="Selecionar" onClick={() => enterSelect(f)} />
                      <div className="my-1 h-px bg-[var(--lm-border)]" />
                      {!isTrash && (
                        <MenuItem icon={icStar(f.is_favorite)} label={f.is_favorite ? 'Desfavoritar' : 'Favoritos'} onClick={() => actFavorite(f)} />
                      )}
                      <MenuItem icon={icDownload} label="Baixar" onClick={() => actDownload(f)} />
                      <MenuItem icon={icShare} label="Compartilhar" onClick={() => actShare(f)} />
                      <MenuItem icon={icLink} label="Copiar link" onClick={() => actCopy(f)} />
                      <MenuItem icon={icInfo} label="Informações" onClick={() => { setMenuId(null); setInfo(f) }} />
                      <div className="my-1 h-px bg-[var(--lm-border)]" />
                      {isTrash ? (
                        <>
                          <MenuItem icon={icRestore} label="Restaurar" onClick={() => actRestore(f)} />
                          <MenuItem icon={icTrash} label="Excluir para sempre" danger onClick={() => actDeleteForever(f)} />
                        </>
                      ) : (
                        <MenuItem icon={icTrash} label="Mover para lixeira" danger onClick={() => actTrash(f)} />
                      )}
                    </div>,
                    document.body,
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Visualizador de mídia (lightbox) */}
      {viewer != null && files[viewer] && (
        <MediaViewer items={files} index={viewer} onClose={() => setViewer(null)} onIndex={setViewer} />
      )}

      {/* Modal Informações */}
      {info && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" onClick={() => setInfo(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-[var(--lm-border-str)] bg-[var(--lm-bg-sidebar)] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="break-all font-bold text-[var(--lm-text-pri)]">{info.name}</h2>
              <button type="button" aria-label="Fechar" onClick={() => setInfo(null)} className="flex-shrink-0 rounded-full p-1 text-[var(--lm-text-muted)] hover:bg-[var(--lm-bg-card)]">✕</button>
            </div>
            <dl className="space-y-2 text-sm">
              <Row k="Tipo" v={info.mime_type || '—'} />
              <Row k="Tamanho" v={fmtSize(info.size)} />
              {info.created_at && <Row k="Enviado" v={new Date(info.created_at).toLocaleString('pt-BR')} />}
              <Row k="Hash" v={`${info.sha256.slice(0, 12)}…`} />
            </dl>
            <button
              type="button"
              onClick={() => { void navigator.clipboard.writeText(publicLink(info)); toast('Link copiado', 'success') }}
              className="mt-4 w-full rounded-lg bg-[var(--lm-accent)] py-2 text-sm font-bold text-[var(--lm-accent-txt)]"
            >
              Copiar link
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-[var(--lm-bg-card)] ${
        danger ? 'text-[var(--lm-danger,#ef4444)]' : 'text-[var(--lm-text-pri)]'
      }`}
    >
      <span className="flex-shrink-0">{icon}</span>
      {label}
    </button>
  )
}

function BarBtn({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-[var(--lm-bg-card)] ${
        danger ? 'text-[var(--lm-danger,#ef4444)]' : 'text-[var(--lm-text-pri)]'
      }`}
    >
      {icon}
    </button>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--lm-text-muted)]">{k}</dt>
      <dd className="break-all text-right text-[var(--lm-text-pri)]">{v}</dd>
    </div>
  )
}
