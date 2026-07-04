// usePrefsLoaded — re-executa um callback quando loadPrefs() termina de trazer as
// preferências do servidor (evento `libermedia:prefs-loaded`). As páginas leem o
// localStorage no mount (useState inicial); como elas montam ANTES do login
// resolver, usam este hook para re-ler os valores do servidor quando chegam.
import { useEffect, useRef } from 'react'
import { PREFS_LOADED_EVENT } from '../services/user-prefs'

export function usePrefsLoaded(cb: () => void): void {
  const ref = useRef(cb)
  useEffect(() => {
    ref.current = cb
  })
  useEffect(() => {
    const handler = () => ref.current()
    window.addEventListener(PREFS_LOADED_EVENT, handler)
    return () => window.removeEventListener(PREFS_LOADED_EVENT, handler)
  }, [])
}
