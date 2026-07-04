// Picker de "presentes" (preços) — define quanto custa desbloquear o conteúdo pago.
// Grade 4×2: 7 presentes (assets em media.libernet.app/static/gifts/) + 1 card "Outro valor"
// (símbolo + campinho), pra fechar a grade sem sobrar linha.
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { GIFTS, giftImg, clampPrice } from '../../services/topsecret'
import './gift-picker.css'

export function GiftPicker({ onPick, onClose }: { onPick: (sats: number) => void; onClose: () => void }) {
  const [custom, setCustom] = useState('')
  const confirmCustom = () => { if (custom) onPick(clampPrice(parseInt(custom, 10))) }
  return createPortal(
    <div className="lm-gift-root" onClick={onClose}>
      <div className="lm-gift" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className="lm-gift-title">Cobrar pelo conteúdo</h3>
        <p className="lm-gift-sub">Quanto custa pra desbloquear? (em sats)</p>

        <div className="lm-gift-grid">
          {GIFTS.map((g) =>
            g.sats > 0 ? (
              <button key={g.sats} type="button" className="lm-gift-cell" onClick={() => onPick(g.sats)}>
                <img src={giftImg(g.img!)} alt="" loading="lazy" />
                <span className="lm-gift-name">{g.nome}</span>
                <span className="lm-gift-sats">{g.sats}</span>
              </button>
            ) : (
              <div key="custom" className="lm-gift-cell lm-gift-custom-cell">
                <span className="lm-gift-sym" aria-hidden>⚡</span>
                <div className="lm-gift-custom-row">
                  <input
                    value={custom}
                    onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ''))}
                    inputMode="numeric"
                    placeholder="sats"
                    aria-label="Outro valor em sats"
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmCustom() }}
                  />
                  <button type="button" disabled={!custom} onClick={confirmCustom} aria-label="Confirmar">→</button>
                </div>
                <span className="lm-gift-name">Outro valor</span>
              </div>
            ),
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
