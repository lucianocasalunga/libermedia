// Estado de navegação dos Reels.
// reelsReturnPathAtom: última rota que NÃO era /reels (feed, perfil, thread, pesquisa…).
// O Layout alimenta este atom a cada troca de rota; o botão X dos Reels usa ele para
// voltar EXATAMENTE para onde o usuário estava antes de abrir os Reels.
import { atom } from 'jotai'

export const reelsReturnPathAtom = atom('/feed')
