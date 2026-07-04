// Estado global de não-lido (Jotai) → bolinha no nav (Sidebar + BottomNav).
// Alimentado por useUnreadWatcher; lido pelos navs. Sem servidor novo.
import { atom } from 'jotai'

export interface UnreadState {
  notif: boolean
  dm: boolean
}

export const unreadAtom = atom<UnreadState>({ notif: false, dm: false })
