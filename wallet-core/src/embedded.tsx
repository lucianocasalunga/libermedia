// <EmbeddedWallet> — a carteira como UM componente, para embutir na página
// Carteira do LiberMedia (aba "LiberWallet"). Gerencia as sub-telas
// (dashboard / receber / enviar / histórico) por estado interno, SEM usar o
// react-router do app hospedeiro. A autenticação (token) é provida pelo host
// via <WalletAuthProvider> + handoff de signer (ver F2).
import { useMemo, useState } from 'react'
import { WalletNavProvider, type WalletNav, type WalletView } from './nav'
import { WalletPage } from './pages/WalletPage'
import { ReceberPage } from './pages/ReceberPage'
import { EnviarPage } from './pages/EnviarPage'
import { HistoricoPage } from './pages/HistoricoPage'

export function EmbeddedWallet() {
  const [view, setView] = useState<WalletView>('dashboard')
  const nav: WalletNav = useMemo(
    () => ({ go: (v) => setView(v), back: () => setView('dashboard') }),
    [],
  )
  return (
    <WalletNavProvider nav={nav}>
      {view === 'dashboard' && <WalletPage />}
      {view === 'receber' && <ReceberPage />}
      {view === 'enviar' && <EnviarPage />}
      {view === 'historico' && <HistoricoPage />}
    </WalletNavProvider>
  )
}
