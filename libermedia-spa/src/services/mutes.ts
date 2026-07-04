// Silenciar/Bloquear usuário — NIP-51 kind:10000 (mute list, tag `p`). Posts de
// pubkeys silenciados são ocultados no PostCard (retorna null).
import { createNip51List } from '../lib/nip51-list'

export const mutes = createNip51List(10000, 'p', 'libermedia_mutes')
export const ensureMutes = mutes.ensure
export const isMuted = mutes.has
export const useIsMuted = mutes.useHas
