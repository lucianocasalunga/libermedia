// Total real de posts do autor (contador "Posts" do perfil). Busca no feed-engine
// (strfry scan --count). Enquanto não chega, o chamador usa posts.length de fallback.
import { useEffect, useState } from 'react'
import { fetchPostCount } from '../services/post-count'

export function usePostCount(hex: string | null) {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    setCount(null)
    if (!hex) return
    let alive = true
    void fetchPostCount(hex).then((c) => {
      if (alive) setCount(c)
    })
    return () => {
      alive = false
    }
  }, [hex])
  return count
}
