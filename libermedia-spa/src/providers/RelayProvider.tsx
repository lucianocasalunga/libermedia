// RelayProvider — monta o RelayManager singleton no root, acima do Router.
// As conexões WebSocket sobrevivem à navegação entre páginas. Expõe o manager
// e a lista de relays ativos. As subscriptions são feitas pelas páginas via
// useRelaySubscription (Fase 1+).
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { relayManager } from '../services/relay-manager'
import { readRelays } from '../services/relays'
import { applyGeoRelays } from '../services/geo-relays'

interface RelayState {
  manager: typeof relayManager
  relays: string[]
  setRelays: (relays: string[]) => void
}

const RelayContext = createContext<RelayState | null>(null)

// O app LÊ dos relays de LEITURA do usuário (fonte da verdade da página /relays).
relayManager.setRelays(readRelays())

export function RelayProvider({ children }: { children: ReactNode }) {
  const [relays, setRelaysState] = useState<string[]>(relayManager.getRelays())

  // Fase 2: aplica a geo-distribuição (relay regional p/ leitura) na montagem,
  // sem bloquear o primeiro render. Se falhar, mantém os relays atuais.
  useEffect(() => {
    applyGeoRelays()
      .then(() => setRelaysState(relayManager.getRelays()))
      .catch(() => { /* mantém os relays atuais */ })
  }, [])

  const value = useMemo<RelayState>(
    () => ({
      manager: relayManager,
      relays,
      setRelays: (next: string[]) => {
        relayManager.setRelays(next)
        setRelaysState(relayManager.getRelays())
      },
    }),
    [relays],
  )

  return <RelayContext.Provider value={value}>{children}</RelayContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRelay(): RelayState {
  const ctx = useContext(RelayContext)
  if (!ctx) throw new Error('useRelay deve ser usado dentro de <RelayProvider>')
  return ctx
}
