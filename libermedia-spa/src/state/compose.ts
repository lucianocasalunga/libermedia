// Estado global do compositor (Jotai). Aberto por FAB, botão da sidebar ou
// pelo botão Responder de um post (com replyTo preenchido).
import { atom } from 'jotai'
import type { FeedEvent } from '../types/nostr'

export interface ComposeState {
  open: boolean
  replyTo: FeedEvent | null
}

export const composeAtom = atom<ComposeState>({ open: false, replyTo: null })
