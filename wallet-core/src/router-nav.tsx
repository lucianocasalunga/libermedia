// Adaptador de navegação para o modo STANDALONE (liberwallet-spa): mapeia o
// WalletNav para o react-router real. Mantém as rotas /wallet, /receber,
// /enviar, /historico funcionando como antes da extração.
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { WalletNav } from './nav'

// eslint-disable-next-line react-refresh/only-export-components
export function useRouterWalletNav(): WalletNav {
  const navigate = useNavigate()
  return useMemo<WalletNav>(
    () => ({
      go: (v) => navigate(v === 'dashboard' ? '/wallet' : `/${v}`),
      back: () => navigate(-1),
    }),
    [navigate],
  )
}
