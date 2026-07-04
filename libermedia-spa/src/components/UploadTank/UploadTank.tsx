// "Tanque" de upload — réplica do v2.0: a água sobe (progresso real), com onda na
// superfície e o preview local ao fundo; ao completar, a água enche e o preview
// aparece nítido. Some quando a thumbnail real entra no grid.
import './upload-tank.css'

export function UploadTank({ pct, preview, done }: { pct: number; preview?: string; done?: boolean }) {
  return (
    <div className="lm-tank-frame">
      {preview && (
        <div className="lm-tank-thumb" style={{ backgroundImage: `url(${preview})`, opacity: done ? 1 : 0.25 }} />
      )}
      <div className="lm-tank-water" style={{ height: `${Math.min(100, Math.max(0, pct))}%` }}>
        <div className="lm-tank-wave" />
      </div>
      {!done && <div className="lm-tank-pct">{Math.round(pct)}%</div>}
    </div>
  )
}
