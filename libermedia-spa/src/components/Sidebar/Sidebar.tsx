// Sidebar esquerda (desktop) — ÚNICA, compartilhada por todas as páginas.
// Fonte única: editar aqui/no nav-config reflete em todo o app. Replica a
// estrutura da sidebar canônica do MPA: logo + perfil + Novo Post + nav + Apoiar.
import { useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { nip19 } from 'nostr-tools'
import { SIDEBAR_ITEMS } from '../../nav-config'
import { unreadAtom } from '../../state/unread'
import { useAuth } from '../../providers/AuthProvider'
import { Avatar } from '../Avatar/Avatar'
import { LmButton } from '../LmButton'
import { ContasIcon, SairIcon } from '../icons'
import { AccountSwitcher } from '../AccountSwitcher/AccountSwitcher'
import { registerCurrent } from '../../services/accounts'
import { useIdentityHeader } from '../../hooks/useIdentityHeader'
import { cachedMe, fetchMe, type Me } from '../../services/me'
import { toast } from '../../lib/toast'
import './sidebar.css'

// Botão editável injetado no slot, por página. (Feed = Novo Post.)
// `to` = navega para a rota; `event` = dispara um evento global (ação na própria página).
// Outras páginas: adicionar aqui conforme necessário; sem entrada = slot vazio.
const PAGE_BUTTONS: Record<string, { label: string; to?: string; event?: string }> = {
  '/feed': { label: 'Novo Post', to: '/compose' },
  '/arquivos': { label: 'Enviar', event: 'lm:arquivos-upload' },
}

export function Sidebar({
  drawer = false,
  onNavigate,
}: { drawer?: boolean; onNavigate?: () => void } = {}) {
  const { loggedIn, readOnly, npub, pubkeyHex, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const slotButton = PAGE_BUTTONS[pathname]
  const close = () => onNavigate?.()
  const [showAccounts, setShowAccounts] = useState(false)
  const [copied, setCopied] = useState(false)
  const unread = useAtomValue(unreadAtom)
  const hasDot = (path: string) =>
    (path === '/notificacoes' && unread.notif) || (path === '/mensagens' && unread.dm)

  // Registra a conta logada na lista multi-conta (idempotente).
  useEffect(() => {
    if (loggedIn && npub && pubkeyHex) registerCurrent(npub, pubkeyHex)
  }, [loggedIn, npub, pubkeyHex])

  // Identidade INSTANTÂNEA do nosso servidor (/api/me): nome/avatar na hora, sem relay.
  const [me, setMe] = useState<Me | null>(() => cachedMe(npub))
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMe(cachedMe(npub))
    let alive = true
    void fetchMe(npub).then((m) => {
      if (alive && m) setMe(m)
    })
    return () => {
      alive = false
    }
  }, [npub])

  // Avatar + nome: relay (kind:0, fresco) > /api/me (instantâneo) > cache local.
  const header = useIdentityHeader(pubkeyHex)
  const avatar =
    header.avatar || me?.picture || (npub ? localStorage.getItem(`${npub}_avatar`) || undefined : undefined)
  const name =
    header.name ||
    me?.name ||
    (npub ? localStorage.getItem(`${npub}_display_name`) || localStorage.getItem(`${npub}_nome`) || undefined : undefined) ||
    'Usuário'
  const myNpub = pubkeyHex ? (() => { try { return nip19.npubEncode(pubkeyHex) } catch { return npub } })() : npub
  const shortNpub = myNpub ? `${myNpub.slice(0, 12)}…${myNpub.slice(-6)}` : ''

  function copyNpub() {
    if (!myNpub) return
    void navigator.clipboard.writeText(myNpub).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <aside className={drawer ? 'lm-sidebar lm-sidebar--drawer' : 'lm-sidebar hidden md:flex'}>
      {/* Logo → feed (como todos os logos do LiberMedia) */}
      <Link to="/feed" className="lm-sidebar-brand" onClick={close}>
        <span className="lm-sidebar-logo">Liber</span>
        <span className="lm-sidebar-logo-accent">Media</span>
      </Link>

      {/* Perfil — mostra identidade quando há npub (sessão OU somente leitura) */}
      {npub ? (
        <div className="lm-sidebar-profile-box">
          <Link to={`/perfil/${myNpub}`} onClick={close} className="lm-sidebar-avatar-link" aria-label="Meu perfil">
            <Avatar src={avatar} name={name} size={40} />
          </Link>
          <div className="lm-sidebar-profile-info">
            {/* Linha 1: nome + nossa badge */}
            <Link to={`/perfil/${myNpub}`} onClick={close} className="lm-sidebar-name-row">
              <span className="lm-sidebar-profile-name">{name}</span>
              {header.ourBadge && (
                <img src={header.ourBadge.image} alt="" title={header.ourBadge.name} className="lm-sidebar-badge" />
              )}
            </Link>
            {/* Linha 2 (só se houver): badges externas */}
            {header.externalBadges.length > 0 && (
              <div className="lm-sidebar-ext-badges">
                {header.externalBadges.map((b, i) => (
                  <img key={i} src={b.image} alt="" title={b.name} className="lm-sidebar-badge" />
                ))}
              </div>
            )}
            {/* Última linha: npub (com reticências) + copiar npub completa */}
            <div className="lm-sidebar-npub-row">
              <span className="lm-sidebar-profile-npub">{readOnly ? '👁 ' : ''}{shortNpub}</span>
              <button
                type="button"
                className={`lm-sidebar-copy${copied ? ' copied' : ''}`}
                title="Copiar npub"
                aria-label="Copiar npub"
                onClick={copyNpub}
              >
                {copied ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <rect x="9" y="9" width="11" height="11" rx="2" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15V5a2 2 0 012-2h10" />
                  </svg>
                )}
              </button>
              {copied && <span className="lm-sidebar-copied">Copiado!</span>}
            </div>
          </div>
        </div>
      ) : (
        <NavLink to="/login" onClick={close} className="lm-sidebar-profile">
          <Avatar name="?" size={40} />
          <div className="min-w-0">
            <p className="lm-sidebar-profile-name">Visitante</p>
            <p className="lm-sidebar-profile-npub">Entrar</p>
          </div>
        </NavLink>
      )}

      {/* Slot do botão editável (injetado por página). Vazio se a página não define. */}
      <div className="lm-sidebar-slot">
        {slotButton && (
          <LmButton
            onClick={() => {
              if (slotButton.event) window.dispatchEvent(new Event(slotButton.event))
              else if (slotButton.to) navigate(slotButton.to)
              close()
            }}
          >
            {slotButton.label}
          </LmButton>
        )}
      </div>

      {/* Navegação */}
      <nav className="lm-sidebar-nav">
        {SIDEBAR_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={close}
            className={({ isActive }) => `lm-sidebar-item${isActive ? ' active' : ''}`}
          >
            <span className="lm-nav-icon-wrap">
              {item.icon}
              {hasDot(item.path) && <span className="lm-nav-dot" />}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Rodapé: Contas + Sair */}
      <div className="lm-sidebar-foot">
        <button type="button" className="lm-sidebar-item" onClick={() => setShowAccounts(true)}>
          <ContasIcon />
          <span>Contas</span>
        </button>
        {(loggedIn || npub) && (
          <button
            type="button"
            className="lm-sidebar-item lm-sidebar-exit"
            onClick={async () => {
              // logout() faz reload duro p/ /login em caso de sucesso. Se a
              // chamada ao servidor falhar (offline/5xx), ele LANÇA — não dá
              // pra garantir que o cookie morreu, então avisamos e ficamos.
              try {
                await logout()
              } catch {
                toast('Não foi possível encerrar a sessão (sem conexão?). Tente de novo.', 'error')
              }
            }}
          >
            <SairIcon />
            <span>{readOnly ? 'Sair da leitura' : 'Sair'}</span>
          </button>
        )}
      </div>

      {/* Crédito */}
      <p className="lm-sidebar-credit">by LiberNet · Beta v2.5</p>

      {showAccounts && <AccountSwitcher onClose={() => setShowAccounts(false)} />}
    </aside>
  )
}
