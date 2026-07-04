// Nome amigável e ordenado para arquivos baixados: libermedia_000135.jpg
// Substitui o hash/sha256 "aleatório" sem extensão. Padrão de galeria (contador
// ordinal crescente), consistente entre o feed e a página de Arquivos.

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'weba',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
}

// Descobre a extensão na ordem: mime conhecido → sufixo do nome/URL → submime → 'bin'.
export function extFrom(opts: { mime?: string | null; name?: string | null; url?: string | null }): string {
  const mime = opts.mime?.toLowerCase().split(';')[0].trim()
  if (mime && MIME_EXT[mime]) return MIME_EXT[mime]
  for (const s of [opts.name, opts.url]) {
    if (!s) continue
    const clean = s.split('?')[0].split('#')[0]
    const m = clean.match(/\.([a-z0-9]{2,4})$/i)
    if (m) return m[1].toLowerCase()
  }
  if (mime && mime.includes('/')) {
    const sub = mime.split('/')[1].split('+')[0]
    if (sub && sub.length <= 5) return sub
  }
  return 'bin'
}

// Contador ordinal persistente (por navegador). Cada download pega o próximo número.
export function nextDownloadSeq(): number {
  const KEY = 'lm_dl_seq'
  const n = Number(localStorage.getItem(KEY) || '0') + 1
  try {
    localStorage.setItem(KEY, String(n))
  } catch {
    /* storage cheio/indisponível — usa o número mesmo assim */
  }
  return n
}

// libermedia_000135.jpg
export function downloadName(seq: number, ext: string): string {
  return `libermedia_${String(seq).padStart(6, '0')}.${ext}`
}
