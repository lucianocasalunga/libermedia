// Rodapé do radar (sidebar direita). Específico do app, NÃO sincronizado:
// o LiberWallet tem a sua própria versão (links abrem o LiberMedia em nova aba).
import { Link } from 'react-router-dom'

export function RadarFooter() {
  return (
    <>
      <Link to="/sobre">Sobre</Link>
      <Link to="/configuracoes">Configurações</Link>
      <span>© LiberMedia</span>
    </>
  )
}
