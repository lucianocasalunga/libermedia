// Toast global mínimo — store reativo + helper toast(). O <Toaster/> (montado no
// Layout) renderiza. Substitui o showToast() do MPA.
import { useSyncExternalStore } from 'react'

export type ToastType = 'success' | 'error' | 'info'
export interface ToastItem {
  id: number
  msg: string
  type: ToastType
}

let toasts: ToastItem[] = []
let seq = 1
const subs = new Set<() => void>()
function emit() {
  subs.forEach((c) => c())
}

export function toast(msg: string, type: ToastType = 'info') {
  const id = seq++
  toasts = [...toasts, { id, msg, type }]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, 3000)
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    (c) => {
      subs.add(c)
      return () => subs.delete(c)
    },
    () => toasts,
    () => toasts,
  )
}
