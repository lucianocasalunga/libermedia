// Navegação injetável da carteira — desacopla as páginas do react-router para
// que os MESMOS componentes funcionem em dois contextos:
//   • standalone (liberwallet-spa): useRouterWalletNav usa o react-router real (rotas /receber etc.).
//   • embarcado (LiberMedia): <EmbeddedWallet> gerencia as sub-telas por estado interno,
//     sem tocar no router do app hospedeiro.
import {
  createContext, useContext, type ReactNode,
} from 'react'

export type WalletView = 'dashboard' | 'receber' | 'enviar' | 'historico'

export interface WalletNav {
  go: (view: WalletView) => void
  back: () => void
}

const NavCtx = createContext<WalletNav | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useWalletNav(): WalletNav {
  const ctx = useContext(NavCtx)
  if (!ctx) throw new Error('useWalletNav exige <WalletNavProvider> (ou <EmbeddedWallet>) na árvore.')
  return ctx
}

export function WalletNavProvider({ nav, children }: { nav: WalletNav; children: ReactNode }) {
  return <NavCtx.Provider value={nav}>{children}</NavCtx.Provider>
}
