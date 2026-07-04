// Destinos de navegação do radar (sidebar direita). Específico do app, NÃO
// sincronizado: o LiberWallet tem a sua própria versão (abre o LiberMedia em nova
// aba). Aqui (LiberMedia) navega internamente no SPA. Permite que os componentes
// do radar sejam compartilhados 1:1 — a única diferença vive neste arquivo + RadarFooter.
import type { NavigateFunction } from 'react-router-dom'

export function openThread(navigate: NavigateFunction, id: string) {
  navigate(`/thread/${id}`)
}

export function openSearch(navigate: NavigateFunction, term: string) {
  navigate(`/pesquisar?q=${encodeURIComponent(term)}`)
}
