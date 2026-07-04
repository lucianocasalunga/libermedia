// ThemeProvider — 6 temas via classe em <html>. Persiste em libermedia_theme.
// A classe inicial já é aplicada no index.html (anti-FOIT); aqui mantemos o
// estado em React e sincronizamos as mudanças.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { DEFAULT_THEME, LS, THEMES, type ThemeId } from '../constants'
import { PREFS_LOADED_EVENT, syncPref } from '../services/user-prefs'

interface ThemeState {
  theme: ThemeId
  themes: typeof THEMES
  setTheme: (t: ThemeId) => void
}

const ThemeContext = createContext<ThemeState | null>(null)

const VALID = new Set<string>(THEMES.map((t) => t.id))

function readInitialTheme(): ThemeId {
  const stored = localStorage.getItem(LS.theme)
  return stored && VALID.has(stored) ? (stored as ThemeId) : DEFAULT_THEME
}

function applyThemeClass(theme: ThemeId) {
  const html = document.documentElement
  THEMES.forEach((t) => html.classList.remove(t.id))
  html.classList.add(theme)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(readInitialTheme)

  const setTheme = useCallback((t: ThemeId) => {
    if (!VALID.has(t)) return
    localStorage.setItem(LS.theme, t)
    applyThemeClass(t)
    setThemeState(t)
    void syncPref('theme') // cross-device: persiste no servidor
  }, [])

  // Garante consistência caso o estado divirja da classe aplicada no boot.
  useEffect(() => {
    applyThemeClass(theme)
  }, [theme])

  // Quando loadPrefs() traz o tema do servidor (outro dispositivo), adota-o sem
  // re-persistir (evita eco de PUT). loadPrefs já gravou no localStorage.
  useEffect(() => {
    const onPrefs = () => {
      const stored = localStorage.getItem(LS.theme)
      if (stored && VALID.has(stored)) setThemeState(stored as ThemeId)
    }
    window.addEventListener(PREFS_LOADED_EVENT, onPrefs)
    return () => window.removeEventListener(PREFS_LOADED_EVENT, onPrefs)
  }, [])

  const value = useMemo<ThemeState>(
    () => ({ theme, themes: THEMES, setTheme }),
    [theme, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>')
  return ctx
}
