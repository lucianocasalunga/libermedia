// AuthProvider — sessão Flask (cookie). Chama /api/auth/check no mount.
// Reimplementa o "User Guard": se a sessão do servidor difere do npub salvo
// no localStorage, limpa os dados do usuário anterior (anti-vazamento entre contas).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { nip19 } from 'nostr-tools'
import { api } from '../services/api'
import { LS } from '../constants'
import { importUserRelaysOnce, heartbeatPublish } from '../services/relays'
import { loadPrefs } from '../services/user-prefs'
import { getSigner } from '../services/signer'
import { autoPublishBadge, hasLocalNsec } from '../services/badge-accept'
import { cachedMe, fetchMe } from '../services/me'
import { seedProfile } from '../services/profiles'
import type { AuthCheckResponse } from '../types/api'

interface AuthState {
  loading: boolean
  loggedIn: boolean // tem sessão Flask (necessária p/ DM server, carteira, etc.)
  readOnly: boolean // identidade só-leitura (npub), sem sessão Flask
  npub: string | null
  pubkeyHex: string | null
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

// Bancos IndexedDB conhecidos na origem (MPA + SPA compartilham media.libernet.app).
// Usado como fallback quando o navegador não suporta indexedDB.databases().
const KNOWN_IDB = ['libermedia-cache', 'liberchat_v1', 'nexus-p2p-cache', 'reels_cache_v1', 'libermedia_dm_v1']

// Apaga TODOS os bancos IndexedDB da origem — enumera de verdade (databases())
// e cai no fallback da lista conhecida. Não trava o logout se algum estiver
// bloqueado por conexão aberta (o reload duro depois fecha tudo).
async function wipeIndexedDB(): Promise<void> {
  let names = KNOWN_IDB
  try {
    if (typeof indexedDB.databases === 'function') {
      const found = (await indexedDB.databases())
        .map((d) => d.name)
        .filter((n): n is string => !!n)
      names = Array.from(new Set([...KNOWN_IDB, ...found]))
    }
  } catch {
    /* sem databases(): usa a lista conhecida */
  }
  await Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve) => {
          try {
            const req = indexedDB.deleteDatabase(name)
            req.onsuccess = () => resolve()
            req.onerror = () => resolve()
            req.onblocked = () => resolve()
          } catch {
            resolve()
          }
        }),
    ),
  )
}

// Limpa o Cache Storage (cascas/assets do Service Worker) — o SW não cacheia
// /api, mas zeramos por garantia para não reusar a casca autenticada.
async function wipeCaches(): Promise<void> {
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    /* noop */
  }
}

function hexFromNpub(npub: string): string | null {
  try {
    const d = nip19.decode(npub)
    if (d.type === 'npub') return d.data
  } catch {
    /* npub malformado */
  }
  return null
}

const AuthContext = createContext<AuthState | null>(null)

// Prefs de dispositivo preservadas ao trocar de usuário (espelha base.html).
const DEVICE_KEYS = [
  'libermedia_theme',
  'libermedia_lang',
  'libermedia_haptic_enabled',
  'libermedia_video_muted',
  'thumbnail_size',
  'nexus_p2p_enabled',
]

function userGuard(sessionNpub: string | null) {
  if (!sessionNpub) return // visitante: nada a fazer
  const stored = localStorage.getItem(LS.npub)
  if (!stored || stored === sessionNpub) {
    localStorage.setItem(LS.npub, sessionNpub)
    return
  }
  // Usuário diferente detectado — limpa tudo menos prefs de dispositivo.
  const snap: Record<string, string> = {}
  DEVICE_KEYS.forEach((k) => {
    const v = localStorage.getItem(k)
    if (v !== null) snap[k] = v
  })
  localStorage.clear()
  sessionStorage.clear()
  Object.entries(snap).forEach(([k, v]) => localStorage.setItem(k, v))
  localStorage.setItem(LS.npub, sessionNpub)
  KNOWN_IDB.forEach((db) => {
    try {
      indexedDB.deleteDatabase(db)
    } catch {
      /* noop */
    }
  })
  console.warn('[SECURITY] Troca de usuário detectada — localStorage limpo.')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [loggedIn, setLoggedIn] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const [npub, setNpub] = useState<string | null>(null)
  const [pubkeyHex, setPubkeyHex] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<AuthCheckResponse>('/api/auth/check')
      if (res.logged_in && res.npub) {
        userGuard(res.npub)
        setLoggedIn(true)
        setReadOnly(false)
        setNpub(res.npub)
        setPubkeyHex(res.pubkey_hex ?? null)
        // O perfil PRÓPRIO nunca deve falhar/atrasar: semeia o cache de perfil com o kind:0
        // já salvo (/api/me) — INSTANTÂNEO do cache local + atualiza do servidor. Sem isto,
        // os posts do próprio usuário no feed/thread passavam pela via lenta (batch + cooldown)
        // e ele se via como npub…/avatar genérico apesar do nome/foto estarem no localStorage.
        const meHex = res.pubkey_hex ?? null
        const cm = cachedMe(res.npub)
        if (meHex && cm) seedProfile(meHex, { name: cm.name, picture: cm.picture, nip05: cm.nip05, lud16: cm.lud16 })
        void fetchMe(res.npub).then((m) => {
          if (m?.pubkey) seedProfile(m.pubkey, { name: m.name, picture: m.picture, nip05: m.nip05, lud16: m.lud16 })
        })
        // Preferências do usuário (tema, idioma, NSFW, etc.) — servidor é a fonte
        // da verdade. Aguardamos antes de liberar o app (loading) para o
        // localStorage já chegar "quente" quando as páginas montarem.
        await loadPrefs()
        // Usuário externo com kind:10002 → essa é a fonte da verdade dos relays
        // dele (não forçamos a nossa lista). Depois, heartbeat republica (pulso).
        void importUserRelaysOnce(res.pubkey_hex ?? null).then(() =>
          heartbeatPublish(res.npub ?? null, res.pubkey_hex ?? null),
        )
        // Badge no perfil AUTOMÁTICA (kind:30008) — silenciosa, só p/ quem tem nsec
        // no aparelho (não dá popup). NIP-07/bunker fazem ao salvar o perfil.
        if (hasLocalNsec(res.npub)) {
          void getSigner(res.npub).then((s) => {
            if (s) void autoPublishBadge(s, res.pubkey_hex ?? null)
          })
        }
        return
      }
      // Sem sessão Flask: pode haver identidade só-leitura salva (npub).
      const roNpub = localStorage.getItem(LS.readonlyNpub)
      if (roNpub) {
        setLoggedIn(false)
        setReadOnly(true)
        setNpub(roNpub)
        setPubkeyHex(hexFromNpub(roNpub))
      } else {
        userGuard(null)
        setLoggedIn(false)
        setReadOnly(false)
        setNpub(null)
        setPubkeyHex(null)
      }
    } catch {
      // Falha de rede → trata como visitante (não bloqueia o app).
      setLoggedIn(false)
      setReadOnly(false)
      setNpub(null)
      setPubkeyHex(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    // 1) Zera o estado IMEDIATAMENTE — antes de qualquer await — para o redirect
    //    de /login não ver loggedIn=true e quicar de volta ao feed (race).
    setLoggedIn(false)
    setReadOnly(false)
    setNpub(null)
    setPubkeyHex(null)

    // 2) Apaga TUDO do navegador: localStorage/sessionStorage (inclui nsec das
    //    contas, lista de contas e prefs), TODOS os IndexedDB e o Cache Storage.
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      /* storage indisponível */
    }
    await wipeIndexedDB()
    await wipeCaches()

    // 3) Encerra a sessão no SERVIDOR. É o cookie HttpOnly que identifica o
    //    usuário — só o servidor consegue matá-lo. Se esta chamada FALHAR
    //    (offline/5xx), NÃO fingimos logout: propagamos o erro para o caller
    //    avisar e o usuário tentar de novo (senão volta logado no próximo boot).
    await api.post('/api/auth/logout')

    // 4) Reload DURO para o /login: fecha conexões IDB pendentes, zera estado em
    //    memória e re-roda o /api/auth/check do zero — agora sem cookie, cai em
    //    visitante. (replace = sem entrada no histórico p/ "voltar" ao app.)
    window.location.replace(`${import.meta.env.BASE_URL}login`)
  }, [])

  useEffect(() => {
    // Busca a sessão Flask no mount. Os setState ocorrem só após o await do
    // fetch (assíncronos, sem cascata) — o lint não enxerga isso.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  const value = useMemo<AuthState>(
    () => ({ loading, loggedIn, readOnly, npub, pubkeyHex, refresh, logout }),
    [loading, loggedIn, readOnly, npub, pubkeyHex, refresh, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
