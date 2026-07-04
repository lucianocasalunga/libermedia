// Garante que os dados NSFW carregaram e re-renderiza quando prontos.
import { useEffect, useState } from 'react'
import { loadNsfw } from '../services/nsfw'

let loaded = false

export function useNsfw(): boolean {
  const [ready, setReady] = useState(loaded)
  useEffect(() => {
    if (loaded) return
    let alive = true
    loadNsfw().then(() => {
      loaded = true
      if (alive) setReady(true)
    })
    return () => {
      alive = false
    }
  }, [])
  return ready
}
