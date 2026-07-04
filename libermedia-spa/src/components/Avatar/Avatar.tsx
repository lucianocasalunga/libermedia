// Avatar. Sem foto (ou se a foto falhar) → avatar GENÉRICO determinístico por seed
// (pubkey/npub; cai no nome se não houver seed). NUNCA o logo. Iniciais só como
// último recurso (sem seed nem nome).
import { useState } from 'react'
import { genericAvatar } from '../../lib/generic-assets'

export function Avatar({
  src,
  name,
  seed,
  size = 40,
  online = false,
}: {
  src?: string
  name?: string
  seed?: string
  size?: number
  online?: boolean // áurea verde em volta (usuário online)
}) {
  const [failed, setFailed] = useState(false) // foto real falhou
  const [genFailed, setGenFailed] = useState(false) // genérico falhou (raro)

  const realOk = !!src && !failed
  const effectiveSeed = seed || name || ''
  const genSrc = effectiveSeed && !genFailed ? genericAvatar(effectiveSeed) : null
  const finalSrc = realOk ? src : genSrc
  const initial = (name?.trim()?.[0] || '?').toUpperCase()

  return (
    <div
      className="flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--lm-bg-input)] text-[var(--lm-text-muted)]"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        // Áurea verde: anel (com folga da cor do fundo) + brilho suave.
        boxShadow: online ? '0 0 0 2px var(--lm-bg-main), 0 0 0 4px #22c55e, 0 0 10px rgba(34,197,94,0.55)' : undefined,
      }}
    >
      {finalSrc ? (
        <img
          src={finalSrc}
          alt={name || 'avatar'}
          width={size}
          height={size}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => (realOk ? setFailed(true) : setGenFailed(true))}
        />
      ) : (
        <span className="font-bold">{initial}</span>
      )}
    </div>
  )
}
