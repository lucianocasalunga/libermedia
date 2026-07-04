// Editar perfil (kind:0) — estilo Facebook: banner + avatar com ícone de câmera
// (subir imagem OU colar link + preview), Nome, Bio, NIP-05 com checagem de
// disponibilidade, Lightning (do DB, fixo) e LINKS estilo YouTube (título+URL, "+").
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import { useProfile } from '../hooks/useProfile'
import { TopBar } from '../components/TopBar/TopBar'
import { Avatar } from '../components/Avatar/Avatar'
import { requireSigner } from '../services/require-signer'
import { publishProfile, checkNip05, requestNip05, type ProfileForm } from '../services/profile'
import { autoPublishBadge } from '../services/badge-accept'
import { uploadFile } from '../services/upload'
import { genericBanner } from '../lib/generic-assets'
import type { ProfileLink } from '../types/nostr'

const NIP05_DOMAIN = '@libernet.app'

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

// Botão de câmera com menu: Subir imagem (upload) OU Colar link.
function CameraButton({ onFile, onLink }: { onFile: (f: File) => void; onLink: (url: string) => void }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'menu' | 'link'>('menu')
  const [val, setVal] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Alterar imagem"
        onClick={() => { setOpen((o) => !o); setMode('menu') }}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80"
      >
        <CameraIcon />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-[var(--lm-border)] bg-[var(--lm-bg-card)] p-1 shadow-xl">
            {mode === 'menu' ? (
              <>
                <button type="button" onClick={() => fileRef.current?.click()} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-input)]">
                  📤 Subir imagem
                </button>
                <button type="button" onClick={() => setMode('link')} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-input)]">
                  🔗 Colar link
                </button>
              </>
            ) : (
              <div className="p-1">
                <input
                  autoFocus
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                  placeholder="https://…"
                  className="w-full rounded-lg border border-[var(--lm-border-str)] bg-[var(--lm-bg-input)] px-2 py-1.5 text-sm text-[var(--lm-text-pri)] outline-none"
                />
                <div className="mt-1.5 flex justify-end gap-2">
                  <button type="button" onClick={() => { setOpen(false); setVal('') }} className="px-2 py-1 text-xs text-[var(--lm-text-muted)]">Cancelar</button>
                  <button type="button" onClick={() => { if (val.trim()) onLink(val.trim()); setOpen(false); setVal('') }} className="rounded-full bg-[var(--lm-accent)] px-3 py-1 text-xs font-bold text-[var(--lm-accent-txt)]">Usar</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); setOpen(false); e.target.value = '' }}
      />
    </div>
  )
}

type NipStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

export function EditarPerfilPage() {
  const navigate = useNavigate()
  const { npub } = useAuth()
  const { profile, hex, loading } = useProfile(npub || '')

  const [displayName, setDisplayName] = useState('')
  const [about, setAbout] = useState('')
  const [picture, setPicture] = useState('')
  const [banner, setBanner] = useState('')
  const [nip05User, setNip05User] = useState('')
  const [origNip05, setOrigNip05] = useState('') // p/ detectar se o NIP-05 mudou
  const [nipStatus, setNipStatus] = useState<NipStatus>('idle')
  const [nipMsg, setNipMsg] = useState('')
  const [links, setLinks] = useState<ProfileLink[]>([])
  const [uploading, setUploading] = useState<'banner' | 'picture' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prefilled, setPrefilled] = useState(false)

  // Prefill quando o perfil chega + busca o Lightning real (DB).
  useEffect(() => {
    if (profile && !prefilled) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setDisplayName(profile.display_name || profile.name || '')
      setAbout(profile.about || '')
      setPicture(profile.picture || '')
      setBanner(profile.banner || '')
      const u = (profile.nip05?.split('@')[0] || profile.name || '').replace(/^_$/, '')
      setNip05User(u)
      setOrigNip05(u)
      setLinks(
        profile.links?.length
          ? profile.links
          : profile.website
            ? [{ title: '', url: profile.website }]
            : [],
      )
      setPrefilled(true)
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [profile, prefilled])

  // Lightning = NIP-05 (a carteira do usuário é nip05@libernet.app). Deriva do campo
  // p/ o usuário ENTENDER que são a mesma coisa (resolve a confusão lud16 ≠ nip05).
  const lightning = nip05User.trim() ? `${nip05User.trim()}${NIP05_DOMAIN}` : ''

  async function handleFile(which: 'banner' | 'picture', file: File) {
    setUploading(which)
    setError(null)
    try {
      const up = await uploadFile(file)
      if (which === 'banner') setBanner(up.url)
      else setPicture(up.url)
    } catch {
      setError('Falha no upload da imagem.')
    } finally {
      setUploading(null)
    }
  }

  function onNipChange(v: string) {
    setNip05User(v.toLowerCase().replace(/\s/g, ''))
    setNipStatus('idle')
    setNipMsg('')
  }

  async function checkNip() {
    const u = nip05User.trim().toLowerCase()
    if (u.length < 3) { setNipStatus('invalid'); setNipMsg('Mínimo 3 caracteres.'); return }
    if (!/^[a-z0-9_.-]+$/.test(u)) { setNipStatus('invalid'); setNipMsg('Use letras, números, ponto, _ ou -.'); return }
    setNipStatus('checking'); setNipMsg('')
    const r = await checkNip05(u)
    setNipStatus(r.available ? 'available' : 'taken')
    setNipMsg(r.message)
  }

  function setLink(i: number, field: keyof ProfileLink, v: string) {
    setLinks((ls) => ls.map((l, idx) => (idx === i ? { ...l, [field]: v } : l)))
  }
  const addLink = () => setLinks((ls) => [...ls, { title: '', url: '' }])
  const removeLink = (i: number) => setLinks((ls) => ls.filter((_, idx) => idx !== i))

  async function save() {
    if (busy || uploading) return
    setBusy(true)
    setError(null)
    try {
      const signer = await requireSigner(npub)
      if (!signer) throw new Error('Conecte-se (nsec ou extensão) para editar o perfil.')
      const u = nip05User.trim().toLowerCase()
      // NIP-05 mudou → REGISTRA no servidor antes (grava no DB + ajusta a carteira).
      // Sem isto o NIP-05 ficaria inválido no /.well-known/nostr.json.
      if (u && u !== origNip05) {
        const reg = await requestNip05(u)
        if (!reg.ok) throw new Error(reg.error || 'Não foi possível registrar esse NIP-05.')
        setOrigNip05(u)
      }
      const addr = u ? `${u}${NIP05_DOMAIN}` : undefined
      const form: ProfileForm = {
        display_name: displayName.trim() || undefined,
        name: u || undefined, // o NIP-05 é o identificador → vira o `name`
        about: about.trim() || undefined,
        picture: picture || undefined,
        banner: banner || undefined,
        nip05: addr,
        lud16: addr, // Lightning = NIP-05 → corrige o lud16 legado no kind:0
        links: links.filter((l) => l.url.trim()),
      }
      await publishProfile(signer, form)
      await autoPublishBadge(signer, signer.pubkey)
      navigate(-1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar')
      setBusy(false)
    }
  }

  const bannerImg = banner || genericBanner(hex || npub || 'seed')

  return (
    <div className="mx-auto min-h-svh w-full max-w-[600px] border-x border-[var(--lm-border)]">
      <TopBar>
        <div className="flex w-full items-center justify-between gap-2">
          <h1 className="lm-topbar-title">Editar perfil</h1>
          <button
            type="button"
            onClick={save}
            disabled={busy || !!uploading}
            className="rounded-full bg-[var(--lm-accent)] px-4 py-1.5 text-sm font-bold text-[var(--lm-accent-txt)] disabled:opacity-50"
          >
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </TopBar>

      {loading && !prefilled ? (
        <p className="p-8 text-center text-sm text-[var(--lm-text-muted)]">Carregando…</p>
      ) : (
        <>
          {/* BANNER + AVATAR com câmera */}
          <div className="relative">
            <div
              className="h-40 w-full bg-cover bg-center"
              style={{ backgroundImage: `url("${bannerImg}")`, opacity: uploading === 'banner' ? 0.5 : 1 }}
            >
              <div className="absolute right-3 top-3">
                <CameraButton onFile={(f) => handleFile('banner', f)} onLink={(u) => setBanner(u)} />
              </div>
            </div>
            {/* avatar sobreposto */}
            <div className="absolute -bottom-10 left-4">
              <div className="relative" style={{ opacity: uploading === 'picture' ? 0.5 : 1 }}>
                <div className="rounded-full border-4 border-[var(--lm-bg-main)]">
                  <Avatar src={picture} name={displayName} seed={hex || npub || undefined} size={88} />
                </div>
                <div className="absolute bottom-0 right-0">
                  <CameraButton onFile={(f) => handleFile('picture', f)} onLink={(u) => setPicture(u)} />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5 px-4 pb-8 pt-14">
            {/* NOME */}
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[var(--lm-text-sec)]">Nome</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Seu nome"
                className="w-full rounded-lg border border-[var(--lm-border-str)] bg-[var(--lm-bg-input)] px-3 py-2 text-[var(--lm-text-pri)] outline-none placeholder:text-[var(--lm-text-muted)]"
              />
            </label>

            {/* BIO */}
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[var(--lm-text-sec)]">Sobre você</span>
              <textarea
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                placeholder="Conte um pouco sobre você"
                rows={3}
                className="w-full resize-none rounded-lg border border-[var(--lm-border-str)] bg-[var(--lm-bg-input)] px-3 py-2 text-[var(--lm-text-pri)] outline-none placeholder:text-[var(--lm-text-muted)]"
              />
            </label>

            {/* NIP-05 com checagem */}
            <div className="block">
              <span className="mb-1 block text-sm font-semibold text-[var(--lm-text-sec)]">Endereço Nostr (NIP-05)</span>
              <div className="flex items-stretch gap-2">
                <div className="flex flex-1 items-center rounded-lg border border-[var(--lm-border-str)] bg-[var(--lm-bg-input)] px-3">
                  <input
                    value={nip05User}
                    onChange={(e) => onNipChange(e.target.value)}
                    placeholder="seunome"
                    className="min-w-0 flex-1 bg-transparent py-2 text-[var(--lm-text-pri)] outline-none placeholder:text-[var(--lm-text-muted)]"
                  />
                  <span className="whitespace-nowrap text-sm text-[var(--lm-text-muted)]">{NIP05_DOMAIN}</span>
                </div>
                <button
                  type="button"
                  onClick={checkNip}
                  disabled={nipStatus === 'checking'}
                  className="rounded-lg border border-[var(--lm-border-str)] px-4 text-sm font-semibold text-[var(--lm-text-pri)] hover:bg-[var(--lm-bg-input)] disabled:opacity-50"
                >
                  {nipStatus === 'checking' ? '…' : 'Checar'}
                </button>
              </div>
              {nipMsg && (
                <p className={`mt-1 text-sm ${nipStatus === 'available' ? 'text-green-500' : nipStatus === 'taken' || nipStatus === 'invalid' ? 'text-red-400' : 'text-[var(--lm-text-muted)]'}`}>
                  {nipStatus === 'available' ? '✓ ' : nipStatus === 'taken' || nipStatus === 'invalid' ? '✗ ' : ''}{nipMsg}
                </p>
              )}
            </div>

            {/* LIGHTNING (do DB, fixo) */}
            <div className="block">
              <span className="mb-1 block text-sm font-semibold text-[var(--lm-text-sec)]">⚡ Carteira (Lightning)</span>
              <div className="rounded-lg border border-[var(--lm-border)] bg-[var(--lm-bg-input)] px-3 py-2 text-[var(--lm-text-muted)]">
                {lightning || '— escolha seu NIP-05 acima'}
              </div>
              <p className="mt-1 text-xs text-[var(--lm-text-muted)]">Seu endereço para receber zaps é o mesmo que o seu NIP-05 (definido acima).</p>
            </div>

            {/* LINKS estilo YouTube */}
            <div className="block">
              <span className="mb-1 block text-sm font-semibold text-[var(--lm-text-sec)]">Links e redes</span>
              <div className="space-y-2">
                {links.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={l.title}
                      onChange={(e) => setLink(i, 'title', e.target.value)}
                      placeholder="Título"
                      className="w-32 rounded-lg border border-[var(--lm-border-str)] bg-[var(--lm-bg-input)] px-3 py-2 text-sm text-[var(--lm-text-pri)] outline-none placeholder:text-[var(--lm-text-muted)]"
                    />
                    <input
                      value={l.url}
                      onChange={(e) => setLink(i, 'url', e.target.value)}
                      placeholder="https://…"
                      className="min-w-0 flex-1 rounded-lg border border-[var(--lm-border-str)] bg-[var(--lm-bg-input)] px-3 py-2 text-sm text-[var(--lm-text-pri)] outline-none placeholder:text-[var(--lm-text-muted)]"
                    />
                    <button type="button" aria-label="Remover link" onClick={() => removeLink(i)} className="px-2 text-[var(--lm-text-muted)] hover:text-red-400">✕</button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addLink}
                className="mt-2 flex items-center gap-1.5 rounded-full border border-[var(--lm-border-str)] px-3 py-1.5 text-sm font-semibold text-[var(--lm-accent)] hover:bg-[var(--lm-bg-input)]"
              >
                + Adicionar link
              </button>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        </>
      )}
    </div>
  )
}
