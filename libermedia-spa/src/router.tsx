// Roteamento — basename /spa (Flask serve o SPA em /spa/<path>).
// TODAS as páginas (inclusive /login e /criar-chaves) vivem dentro do <Layout>
// keep-alive, então herdam as duas sidebars + bottom nav (padrão único).
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ROUTER_BASENAME } from './constants'
import { DEFAULT_PATH } from './nav-config'

export function AppRouter() {
  return (
    <BrowserRouter basename={ROUTER_BASENAME}>
      <Routes>
        <Route index element={<Navigate to={DEFAULT_PATH} replace />} />
        {/* Todas as rotas renderizam o mesmo Layout keep-alive (com as 2 sidebars). */}
        <Route path="/*" element={<Layout />} />
      </Routes>
    </BrowserRouter>
  )
}
