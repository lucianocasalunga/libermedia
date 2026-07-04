// Rede de segurança: captura QUALQUER exceção de render abaixo dela → em vez da tela
// branca (React desmonta a árvore toda sem boundary), mostra uma tela legível com o erro
// e um botão de recarregar. Estilos INLINE de propósito: funciona mesmo se o CSS/tema
// falhar. O texto do erro fica VISÍVEL p/ o usuário poder relatar (o app não tem console).
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
  info: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Também no console (quando houver) + tenta reportar ao servidor, best-effort.
    console.error('[ErrorBoundary]', error, info)
    this.setState({ info: info.componentStack || '' })
    try {
      const body = JSON.stringify({
        message: String(error?.message || error),
        stack: String(error?.stack || ''),
        component: info.componentStack || '',
        url: location.href,
        ua: navigator.userAgent,
      })
      navigator.sendBeacon?.('/api/client-error', new Blob([body], { type: 'application/json' }))
    } catch {
      /* noop */
    }
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children
    return (
      <div
        style={{
          minHeight: '100svh',
          padding: '24px 16px',
          background: '#0d0d0f',
          color: '#e8e8ea',
          fontFamily: 'system-ui, sans-serif',
          overflowY: 'auto',
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Algo quebrou nesta tela</h1>
        <p style={{ fontSize: 14, color: '#a8a8ad', marginBottom: 16 }}>
          O app se recuperou pra você não ficar na tela branca. Detalhe do erro abaixo:
        </p>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 12,
            background: '#17171b',
            border: '1px solid #2a2a30',
            borderRadius: 10,
            padding: 12,
            color: '#ff9d9d',
            maxHeight: '45vh',
            overflow: 'auto',
          }}
        >
          {String(error.message || error)}
          {'\n\n'}
          {String(error.stack || '')}
          {info ? `\n\n— componente —${info}` : ''}
        </pre>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={() => location.reload()}
            style={{
              padding: '10px 18px',
              borderRadius: 9999,
              border: 'none',
              background: '#7c5cff',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Recarregar
          </button>
          <button
            type="button"
            onClick={() => (location.href = '/')}
            style={{
              padding: '10px 18px',
              borderRadius: 9999,
              border: '1px solid #2a2a30',
              background: 'transparent',
              color: '#e8e8ea',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Ir pro início
          </button>
        </div>
      </div>
    )
  }
}
