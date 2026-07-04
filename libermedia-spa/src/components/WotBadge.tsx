// Badge de DEBUG do Web of Trust (modo sombra). Mostra o score de confiança ao
// lado do autor do post. Só é renderizado quando localStorage.wot_shadow === '1'
// (ver WOT_SHADOW / PostCard). Não altera a ordem do feed — só exibe o número.
import { useWotScore } from '../services/wot'

// você(0) · anel1(verde) · anel2(azul) · desconhecido(cinza)
const RING_COLOR = ['#a855f7', '#22c55e', '#3b82f6', '#9ca3af']

export function WotBadge({ pubkey }: { pubkey: string }) {
  const wot = useWotScore(pubkey)
  const danger = wot.score < 30 // abaixo do corte de "rebaixar" (Fase 2)
  const color = danger ? '#ef4444' : RING_COLOR[wot.ring]
  return (
    <span
      title={`WoT: ${wot.label} (anel ${wot.ring})`}
      style={{
        marginLeft: 6,
        fontSize: 10,
        fontWeight: 700,
        padding: '1px 5px',
        borderRadius: 6,
        lineHeight: 1.5,
        color: danger ? '#fff' : color,
        background: danger ? '#ef4444' : 'transparent',
        border: `1px solid ${color}`,
      }}
    >
      {wot.score}
    </span>
  )
}
