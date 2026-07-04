import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// LiberMedia SPA
// PÚBLICO (Beta): media.libernet.app/v2.5 (Flask serve o build, sem gate).
// Dev local: localhost:5173/v2.5/ → proxy /api para a produção.
// Quando o SPA substituir o MPA na raiz, rebuildar com base '/'.
export default defineConfig({
  base: '/v2.5/',
  plugins: [react(), tailwindcss()],
  resolve: {
    // Carteira = fonte única @libernet/wallet-core (alias-para-fonte → plugin-react
    // transforma o TSX; dedupe garante UMA instância de React/router no bundle).
    alias: {
      '@libernet/wallet-core': fileURLToPath(new URL('../wallet-core/src/index.ts', import.meta.url)),
    },
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  server: {
    port: 5173,
    proxy: {
      // Em dev, encaminha as chamadas de API para a produção para que o SPA
      // converse com o backend Flask real (cookies de sessão incluídos).
      '/api': {
        target: 'https://media.libernet.app',
        changeOrigin: true,
        secure: true,
        cookieDomainRewrite: 'localhost',
      },
    },
  },
})
