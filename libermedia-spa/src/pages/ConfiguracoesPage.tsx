// Configurações — 3 abas (segmented Tabs): Gerais (lista de links + toggles),
// Tema (6 temas), Acessibilidade. Espelha a configuracoes.html do MPA.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../providers/ThemeProvider'
import { TopBar } from '../components/TopBar/TopBar'
import { Tabs } from '../components/Tabs/Tabs'
import { LS } from '../constants'
import { syncPref, savePrefs } from '../services/user-prefs'
import { usePrefsLoaded } from '../hooks/usePrefsLoaded'
import { enablePush, disablePush } from '../services/push'
import { getWotShowScore, setWotShowScore } from '../services/wot'
import { toast } from '../lib/toast'

type ConfigTab = 'gerais' | 'tema' | 'acessibilidade'
const CONFIG_TABS = [
  { key: 'gerais', label: 'Gerais' },
  { key: 'tema', label: 'Tema' },
  { key: 'acessibilidade', label: 'Acessibilidade' },
]

const NSFW_KEY = 'libermedia_nsfw_enabled'
const PUSH_DM_KEY = 'libermedia_push_dm'
const PUSH_SOCIAL_KEY = 'libermedia_push_social'
const LANGS = [
  { value: 'pt', label: '🇧🇷 Português' },
  { value: 'en', label: '🇺🇸 English' },
  { value: 'es', label: '🇪🇸 Español' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[var(--lm-border)] px-4 py-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--lm-text-muted)]">
        {title}
      </h2>
      {children}
    </section>
  )
}

// Ícone de linha (path único, herda a cor).
function I({ d }: { d: string }) {
  return (
    <svg className="h-5 w-5 flex-shrink-0 text-[var(--lm-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
  )
}

// Switch padrão (on/off).
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${checked ? 'bg-[var(--lm-accent)]' : 'bg-[var(--lm-bg-input)]'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

// Linha que leva a uma página (chevron à direita).
function NavRow({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-[var(--lm-border)] px-4 py-3.5 text-left transition last:border-b-0 hover:bg-[var(--lm-bg-card)]"
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-[var(--lm-text-pri)]">{title}</span>
        {desc && <span className="block text-xs text-[var(--lm-text-muted)]">{desc}</span>}
      </span>
      <svg className="h-5 w-5 flex-shrink-0 text-[var(--lm-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}

// Linha com switch (e rótulo opcional de estado).
function ToggleRow({ icon, title, desc, checked, onChange, valueLabel }: { icon: React.ReactNode; title: string; desc?: string; checked: boolean; onChange: () => void; valueLabel?: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--lm-border)] px-4 py-3.5 last:border-b-0">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-[var(--lm-text-pri)]">{title}</span>
        {desc && <span className="block text-xs text-[var(--lm-text-muted)]">{desc}</span>}
      </span>
      <div className="flex flex-col items-end gap-0.5">
        <Toggle checked={checked} onChange={onChange} />
        {valueLabel && <span className="text-[10px] font-medium text-[var(--lm-text-muted)]">{valueLabel}</span>}
      </div>
    </div>
  )
}

const ICONS = {
  edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  relays: 'M4 7c0-1.657 3.582-3 8-3s8 1.343 8 3-3.582 3-8 3-8-1.343-8-3zM4 7v10c0 1.657 3.582 3 8 3s8-1.343 8-3V7M4 12c0 1.657 3.582 3 8 3s8-1.343 8-3',
  wallet: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
  globe: 'M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129',
  star: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
  eye: 'M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
  chat: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
  bell: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  users: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  plan: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
} as const

export function ConfiguracoesPage() {
  const navigate = useNavigate()
  const { theme, themes, setTheme } = useTheme()
  // PADRÃO UNIVERSAL: direita = ligado, esquerda = desligado. Tudo chega LIGADO
  // por padrão (primeira vez). NSFW = FILTRO: ligado (padrão) = bloqueia todo +18.
  // O filtro está ativo quando NSFW_KEY ≠ '1' (inclui ausente = padrão de fábrica).
  const [nsfwFilter, setNsfwFilter] = useState(() => localStorage.getItem(NSFW_KEY) !== '1')
  const [pushDm, setPushDm] = useState(() => localStorage.getItem(PUSH_DM_KEY) !== '0')
  const [pushSocial, setPushSocial] = useState(() => localStorage.getItem(PUSH_SOCIAL_KEY) !== '0')
  const [lang, setLang] = useState(() => localStorage.getItem(LS.lang) || 'pt')
  const [wotScore, setWotScore] = useState(() => getWotShowScore())
  const [tab, setTab] = useState<ConfigTab>('gerais')

  // Quando as prefs do servidor chegam (outro dispositivo), re-lê os valores.
  usePrefsLoaded(() => {
    setNsfwFilter(localStorage.getItem(NSFW_KEY) !== '1')
    setPushDm(localStorage.getItem(PUSH_DM_KEY) !== '0')
    setPushSocial(localStorage.getItem(PUSH_SOCIAL_KEY) !== '0')
    setLang(localStorage.getItem(LS.lang) || 'pt')
    setWotScore(getWotShowScore())
  })

  function toggleNsfwFilter() {
    const next = !nsfwFilter
    setNsfwFilter(next)
    // Filtro ligado (next=true) → NSFW bloqueado → nsfw_enabled = '0'.
    localStorage.setItem(NSFW_KEY, next ? '0' : '1')
    void syncPref('nsfw_enabled')
  }
  // Liga/desliga uma pref de push E garante a INSCRIÇÃO real do device: ligar qualquer
  // aviso pede permissão + inscreve (enablePush); desligar quando AMBOS ficam off
  // desinscreve. Sem isso, a toggle só salvava a pref e o push nunca chegava.
  async function applyPushToggle(
    which: 'dm' | 'social',
    next: boolean,
    otherStillOn: boolean,
  ) {
    const set = which === 'dm' ? setPushDm : setPushSocial
    const key = which === 'dm' ? PUSH_DM_KEY : PUSH_SOCIAL_KEY
    set(next)
    localStorage.setItem(key, next ? '1' : '0')
    void syncPref(which === 'dm' ? 'push_dm' : 'push_social')
    try {
      if (next) await enablePush()
      else if (!otherStillOn) await disablePush()
    } catch (e) {
      // reverte e mostra o MOTIVO REAL (permissão negada, não suportado, SW, VAPID…)
      set(false)
      localStorage.setItem(key, '0')
      void syncPref(which === 'dm' ? 'push_dm' : 'push_social')
      toast(e instanceof Error ? e.message : 'Não consegui ativar as notificações.', 'error')
    }
  }
  function togglePushDm() {
    void applyPushToggle('dm', !pushDm, pushSocial)
  }
  function togglePushSocial() {
    void applyPushToggle('social', !pushSocial, pushDm)
  }
  function toggleWotScore() {
    const next = !wotScore
    setWotScore(next)
    setWotShowScore(next) // reativo: feed reflete na hora (sem reload)
    void savePrefs({ wot_show_score: next }) // cross-device: salva no servidor (sobrevive ao logout)
  }
  function pickLang(v: string) {
    setLang(v)
    localStorage.setItem(LS.lang, v)
    void syncPref('lang')
  }

  return (
    <div className="mx-auto min-h-svh w-full max-w-[600px] border-x border-[var(--lm-border)]">
      <TopBar>
        <span className="flex items-center gap-2">
          <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h1 className="lm-topbar-title">Configurações</h1>
        </span>
      </TopBar>

      {/* Seletor de abas padrão (segmented control) */}
      <div className="p-4 pb-2">
        <Tabs items={CONFIG_TABS} value={tab} onChange={(k) => setTab(k as ConfigTab)} />
      </div>

      {/* ===== TEMA ===== */}
      {tab === 'tema' && (
        <Section title="Tema">
          <div className="grid grid-cols-3 gap-2">
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  theme === t.id
                    ? 'border-[var(--lm-accent)] text-[var(--lm-accent)]'
                    : 'border-[var(--lm-border-str)] text-[var(--lm-text-sec)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* ===== GERAIS ===== */}
      {tab === 'gerais' && (
        <div className="p-4">
          <div className="overflow-hidden rounded-xl border border-[var(--lm-border)]">
            <NavRow icon={<I d={ICONS.edit} />} title="Editar Perfil Nostr" onClick={() => navigate('/editar-perfil')} />
            <NavRow icon={<I d={ICONS.relays} />} title="Relays" onClick={() => navigate('/relays')} />
            <NavRow icon={<I d={ICONS.wallet} />} title="Carteira Lightning" onClick={() => navigate('/carteira')} />

            {/* Idioma (seletor) */}
            <div className="flex items-center gap-3 border-b border-[var(--lm-border)] px-4 py-3.5">
              <I d={ICONS.globe} />
              <span className="min-w-0 flex-1 font-medium text-[var(--lm-text-pri)]">Idioma</span>
              <select
                value={lang}
                onChange={(e) => pickLang(e.target.value)}
                className="rounded-lg border border-[var(--lm-border-str)] bg-[var(--lm-bg-input)] px-3 py-1.5 text-sm text-[var(--lm-text-pri)] outline-none"
              >
                {LANGS.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>

            <ToggleRow
              icon={<I d={ICONS.eye} />}
              title="Filtro de Conteúdo Adulto"
              desc="À direita (ativo): bloqueia todo conteúdo +18 em todos os feeds"
              checked={nsfwFilter}
              onChange={toggleNsfwFilter}
              valueLabel={nsfwFilter ? 'Ativo' : 'Desativado'}
            />
            <ToggleRow
              icon={<I d={ICONS.chat} />}
              title="Notificações de Mensagens"
              desc="Receber alertas de novas mensagens diretas"
              checked={pushDm}
              onChange={togglePushDm}
              valueLabel={pushDm ? 'Ligado' : 'Desligado'}
            />
            <ToggleRow
              icon={<I d={ICONS.bell} />}
              title="Notificações do Sistema"
              desc="Curtidas, respostas, ZAPs e novos seguidores"
              checked={pushSocial}
              onChange={togglePushSocial}
              valueLabel={pushSocial ? 'Ligado' : 'Desligado'}
            />
            <ToggleRow
              icon={<I d={ICONS.users} />}
              title="Pontuação de Confiança"
              desc="À direita: mostra a nota (rede de confiança) ao lado de quem posta no feed"
              checked={wotScore}
              onChange={toggleWotScore}
              valueLabel={wotScore ? 'Mostrando' : 'Oculta'}
            />
            <NavRow icon={<I d={ICONS.plan} />} title="Assinar Plano" onClick={() => navigate('/assinatura')} />
          </div>
        </div>
      )}

      {/* ===== ACESSIBILIDADE ===== */}
      {tab === 'acessibilidade' && (
        <Section title="Mais opções">
          <p className="text-sm text-[var(--lm-text-muted)]">
            Tamanho de fonte, contraste e redução de movimento chegam em breve.
          </p>
        </Section>
      )}
    </div>
  )
}
