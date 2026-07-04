// @libernet/wallet-core — FONTE ÚNICA da carteira LiberWallet.
// Consumido por:
//   • liberwallet-spa (standalone, wallet.libernet.app) — via useRouterWalletNav + páginas.
//   • libermedia-spa  (embarcado, aba "LiberWallet" da Carteira) — via <EmbeddedWallet>.
// React/Jotai/react-router são peerDependencies (uma instância só, provida pelo app host).

// ── Camada de dados (API client dual-mode) ──
export {
  wallet, WalletApiError, WALLET_API_BASE, isEmbedded,
  setWalletToken, getWalletToken, hasWalletToken, setWalletReauth,
} from './services/wallet'
export type {
  TokenResp, RefreshResp, WalletInfo, UsernameCheck, Rates,
  InvoiceResp, InvoiceStatus, DecodeResp, PayResp, Tx, History,
} from './services/wallet'

// ── Sessão / auth ──
export { WalletAuthProvider, useWallet } from './providers/WalletAuthProvider'

// ── Navegação injetável ──
export { WalletNavProvider, useWalletNav } from './nav'
export type { WalletNav, WalletView } from './nav'
export { useRouterWalletNav } from './router-nav'

// ── Telas (componentes puros; nav vem do contexto) ──
export { WalletPage } from './pages/WalletPage'
export { ReceberPage } from './pages/ReceberPage'
export { EnviarPage } from './pages/EnviarPage'
export { HistoricoPage } from './pages/HistoricoPage'

// ── Carteira embarcada (1 componente, sub-telas por estado interno) ──
export { EmbeddedWallet } from './embedded'

// ── Componentes reutilizáveis ──
export { QrCode } from './components/QrCode/QrCode'
export { Keypad } from './components/Keypad/Keypad'
