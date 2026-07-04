// QR Code com o logo "L" no centro (correção de erro alta p/ caber o logo).
// Sempre preto-no-branco (escaneável em qualquer tema). Logo é best-effort:
// se a imagem não carregar, o QR aparece limpo.
import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

export function QrCode({
  value, size = 240, logo = '/static/img/logo.jpg',
}: { value: string; size?: number; logo?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !value) return
    QRCode.toCanvas(canvas, value, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: size,
      color: { dark: '#000000', light: '#ffffff' },
    }, (err) => {
      if (err) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const img = new Image()
      img.onload = () => {
        const s = size * 0.2
        const x = (size - s) / 2
        const y = (size - s) / 2
        const pad = s * 0.14
        ctx.fillStyle = '#ffffff'
        if (typeof (ctx as any).roundRect === 'function') {
          ctx.beginPath()
          ;(ctx as any).roundRect(x - pad, y - pad, s + 2 * pad, s + 2 * pad, 8)
          ctx.fill()
        } else {
          ctx.fillRect(x - pad, y - pad, s + 2 * pad, s + 2 * pad)
        }
        ctx.drawImage(img, x, y, s, s)
      }
      img.src = logo
    })
  }, [value, size, logo])

  return <canvas ref={ref} width={size} height={size} className="rounded-lg" />
}
