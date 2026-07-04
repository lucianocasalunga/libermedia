// Modal de troca de contas — aberto pelo botão "Contas" da Sidebar.
// Lista as contas salvas (libermedia_accounts); cada linha resolve o perfil
// (kind:0) via useProfile. Clicar numa conta inativa chama switchAccount.
import { useState } from 'react'
import { Avatar } from '../Avatar/Avatar'
import { useProfile } from '../../hooks/useProfile'
import { useAuth } from '../../providers/AuthProvider'
import { getAccounts, switchAccount, addAccount, hasNsec, type Account } from '../../services/accounts'

function AccountRow({
  account,
  active,
  onSwitch,
}: {
  account: Account
  active: boolean
  onSwitch: (npub: string) => void
}) {
  const { profile } = useProfile(account.npub)
  const name =
    profile?.display_name?.trim() || profile?.name?.trim() || `${account.npub.slice(0, 12)}…`
  const noKey = !active && !hasNsec(account.npub)

  return (
    <button
      type="button"
      disabled={active}
      onClick={() => !active && onSwitch(account.npub)}
      className={`flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-[var(--lm-bg-card)] ${
        active ? 'cursor-default opacity-60' : ''
      }`}
    >
      <Avatar src={profile?.picture} name={name} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--lm-text-pri)]">{name}</p>
        <p className="truncate text-xs text-[var(--lm-text-muted)]">
          {noKey ? 'Sem chave local — refazer login' : `${account.npub.slice(0, 16)}…`}
        </p>
      </div>
      {active && (
        <svg className="h-5 w-5 flex-shrink-0 text-[var(--lm-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  )
}

export function AccountSwitcher({ onClose }: { onClose: () => void }) {
  const { npub: activeNpub } = useAuth()
  const accounts = getAccounts()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSwitch(npub: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await switchAccount(npub) // recarrega a página em caso de sucesso
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao trocar de conta.')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--lm-border)] bg-[var(--lm-bg-main)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--lm-border)] px-5 py-4">
          <h3 className="text-lg font-bold text-[var(--lm-text-pri)]">Contas</h3>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-[var(--lm-text-muted)] hover:text-[var(--lm-text-pri)]">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-72 divide-y divide-[var(--lm-border)] overflow-y-auto">
          {accounts.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--lm-text-muted)]">Nenhuma conta salva</p>
          ) : (
            accounts.map((acc) => (
              <AccountRow key={acc.npub} account={acc} active={acc.npub === activeNpub} onSwitch={onSwitch} />
            ))
          )}
        </div>

        {error && <p className="px-5 pt-3 text-center text-xs text-red-400">{error}</p>}

        <div className="border-t border-[var(--lm-border)] px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void addAccount()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--lm-accent)] py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {busy ? 'Aguarde…' : 'Adicionar conta'}
          </button>
        </div>
      </div>
    </div>
  )
}
