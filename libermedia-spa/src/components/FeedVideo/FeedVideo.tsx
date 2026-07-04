// Vídeo do feed — comportamento X/Twitter:
//  • autoplay MUDO ao entrar na viewport, em LOOP;
//  • SÓ UM vídeo toca por vez — o mais visível (ver lib/active-video, o coordenador);
//    todos os outros ficam pausados → mata o vazamento de áudio (vários tocando juntos).
//  • mute GLOBAL compartilhado (ver lib/video-mute): desmutou um, todos desmutam.
//  `gated` = vídeo sob canva de proteção (NSFW não revelado / TopSecret bloqueado):
//  enquanto true, NUNCA toca (reportado como gated → o coordenador nunca o elege).
import { useEffect, useRef } from 'react'
import { getVideoMuted, setVideoMuted, useVideoMuted } from '../../lib/video-mute'
import { registerVideo, type VideoHandle } from '../../lib/active-video'

export function FeedVideo({
  src,
  className,
  gated = false,
}: {
  src: string
  className?: string
  gated?: boolean
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const globalMuted = useVideoMuted()
  const handleRef = useRef<VideoHandle | null>(null)
  const ratioRef = useRef(0)
  const gatedRef = useRef(gated)

  // Registra no coordenador e observa a visibilidade. O play/pause NÃO é decidido
  // aqui — só reportamos o ratio; quem toca é o coordenador (exclusividade global).
  useEffect(() => {
    const v = ref.current
    if (!v) return
    v.muted = getVideoMuted() // mudo antes de qualquer play (autoplay exige)
    const handle = registerVideo(v)
    handleRef.current = handle
    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0]
        ratioRef.current = e.isIntersecting ? e.intersectionRatio : 0
        handle.update(ratioRef.current, gatedRef.current)
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    )
    obs.observe(v)
    return () => {
      obs.disconnect()
      handle.unregister()
      handleRef.current = null
    }
  }, [])

  // gated mudou → re-reporta com o ratio atual; o coordenador reavalia quem toca.
  useEffect(() => {
    gatedRef.current = gated
    handleRef.current?.update(ratioRef.current, gated)
  }, [gated])

  // Sincroniza o mute do elemento com o estado global (sem mexer no play/pause).
  useEffect(() => {
    const v = ref.current
    if (v && v.muted !== globalMuted) v.muted = globalMuted
  }, [globalMuted])

  return (
    <video
      ref={ref}
      className={className}
      src={src}
      loop
      playsInline
      preload="metadata"
      controls
      onVolumeChange={(e) => {
        // Usuário mexeu no mute (controles nativos) → propaga p/ TODOS os vídeos.
        const v = e.currentTarget
        if (v.muted !== getVideoMuted()) setVideoMuted(v.muted)
      }}
    />
  )
}
