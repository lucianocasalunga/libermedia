// Estado de "seguindo" para um perfil + toggle (publica kind:3). Otimista.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../providers/AuthProvider'
import { requireSigner } from '../services/require-signer'
import { fetchContactList, publishContactList, type ContactList } from '../services/follow'

export function useFollow(targetHex: string | null) {
  const { npub, pubkeyHex, loggedIn } = useAuth()
  const [following, setFollowing] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const listRef = useRef<ContactList | null>(null)

  const isOwn = !!targetHex && targetHex === pubkeyHex
  const canFollow = loggedIn && !!targetHex && !isOwn

  useEffect(() => {
    if (!canFollow || !pubkeyHex) return
    let alive = true
    fetchContactList(pubkeyHex).then((list) => {
      if (!alive) return
      listRef.current = list
      setFollowing(list.follows.includes(targetHex!))
    })
    return () => {
      alive = false
    }
  }, [canFollow, pubkeyHex, targetHex])

  const toggle = useCallback(async () => {
    if (!canFollow || busy || !targetHex) return
    const list = listRef.current ?? (await fetchContactList(pubkeyHex!))
    listRef.current = list
    const was = list.follows.includes(targetHex)
    setBusy(true)
    setFollowing(!was) // otimista
    try {
      const signer = await requireSigner(npub)
      if (!signer) throw new Error('sem signer')
      const next = was
        ? list.follows.filter((p) => p !== targetHex)
        : [...list.follows, targetHex]
      await publishContactList(signer, next, list.content)
      listRef.current = { ...list, follows: next }
    } catch {
      setFollowing(was) // reverte
    } finally {
      setBusy(false)
    }
  }, [canFollow, busy, targetHex, pubkeyHex, npub])

  return { following, busy, canFollow, isOwn, toggle }
}
