// Fixar no perfil — NIP-51 kind:10001 (lista de notas fixadas, tag `e`).
import { createNip51List } from '../lib/nip51-list'

export const pins = createNip51List(10001, 'e', 'libermedia_pins')
export const ensurePins = pins.ensure
export const isPinned = pins.has
export const useIsPinned = pins.useHas
