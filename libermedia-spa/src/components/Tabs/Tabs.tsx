// Tabs — segmented control PADRÃO do LiberMedia (reutilizável). Indicador
// deslizante (estilo Apple) com leve glow futurista, acessível (role=tablist,
// aria-selected, setas ←/→). Cores 100% do tema (--lm-*). Design base: Mistral.
import type { CSSProperties, KeyboardEvent } from 'react'
import './tabs.css'

export interface TabItem {
  key: string
  label: string
}

export function Tabs({
  items,
  value,
  onChange,
  columns,
}: {
  items: TabItem[]
  value: string
  onChange: (key: string) => void
  /** Força nº de colunas (desktop e mobile). Ex.: 3 → 6 abas viram 3+3 em tudo. */
  columns?: number
}) {
  const activeIndex = Math.max(0, items.findIndex((i) => i.key === value))

  function onKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onChange(items[(index - 1 + items.length) % items.length].key)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      onChange(items[(index + 1) % items.length].key)
    }
  }

  // Grid responsivo: N colunas no desktop, 3 colunas no mobile (6 abas → 3+3).
  // (Trocamos o indicador deslizante por pílula no botão ativo p/ permitir 2 linhas.)
  void activeIndex
  const style = {
    '--lm-tabs-count': columns ?? items.length,
    '--lm-tabs-count-m': columns ?? Math.min(items.length, 3),
  } as CSSProperties

  return (
    <div className="lm-tabs" role="tablist" style={style}>
      {items.map((item, index) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={value === item.key}
          tabIndex={value === item.key ? 0 : -1}
          onClick={() => onChange(item.key)}
          onKeyDown={(e) => onKey(e, index)}
          className={`lm-tabs__trigger${value === item.key ? ' is-active' : ''}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
