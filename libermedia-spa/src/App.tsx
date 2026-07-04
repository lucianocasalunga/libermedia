// App — providers aninhados (acima do Router, para sobreviverem à navegação)
// + roteador. Ordem: Theme → Auth → Relay → Router.
import { ThemeProvider } from './providers/ThemeProvider'
import { AuthProvider } from './providers/AuthProvider'
import { RelayProvider } from './providers/RelayProvider'
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary'
import { AppRouter } from './router'

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <RelayProvider>
            <AppRouter />
          </RelayProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
