// GIFs via proxy do backend (/api/gif/*), que fala com a Tenor (chave no servidor,
// nunca no cliente). Enquanto a TENOR_API_KEY não estiver no .env, o backend
// responde 503 e o picker mostra "em breve" — sem quebrar.
import { api } from './api'

export interface Gif {
  id: string
  url: string // .gif em tamanho normal (vai pro post)
  preview: string // tinygif (thumbnail do grid)
}

interface GifResponse {
  ok: boolean
  gifs?: Gif[]
}

export async function trendingGifs(): Promise<Gif[]> {
  try {
    const r = await api.get<GifResponse>('/api/gif/trending')
    return r.gifs ?? []
  } catch {
    return []
  }
}

export async function searchGifs(q: string): Promise<Gif[]> {
  const term = q.trim()
  if (!term) return trendingGifs()
  try {
    const r = await api.get<GifResponse>(`/api/gif/search?q=${encodeURIComponent(term)}`)
    return r.gifs ?? []
  } catch {
    return []
  }
}
