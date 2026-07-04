// Upload de mídia. Arquivo PEQUENO (≤20MB): POST único /api/upload (FormData).
// Arquivo GRANDE (>20MB): upload CHUNKED em pedaços de 1MB → /api/upload/chunk
// (com retry por pedaço) → /api/upload/finalize. Isso contorna o limite rígido de
// ~100MB por requisição do Cloudflare Tunnel (e o timeout curto): cada pedaço de 1MB
// passa folgado. Porte fiel do static/js/upload.js do MPA. A URL volta como
// /s/{short_code} ou /{sha256} e é embutida no conteúdo do post (padrão Nostr).
// NÃO usa o wrapper api.ts: FormData exige Content-Type multipart automático.

const EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
}

// >20MB → chunked (igual MPA: resiliente em conexão móvel + contorna o teto do Cloudflare).
const CHUNK_THRESHOLD = 20 * 1024 * 1024
// 1MB por pedaço — "compatível com timeout 30s do Cloudflare Tunnel" (decisão herdada do MPA).
const CHUNK_SIZE = 1 * 1024 * 1024
const CHUNK_RETRIES = 3
const CHUNK_TIMEOUT_MS = 120000 // 2min por pedaço de 1MB (~0,07 Mbps mínimo)

export interface Uploaded {
  url: string
  mime: string
  isVideo: boolean
  sha256?: string // hash do arquivo — necessário p/ conteúdo pago (Top Secret /prepare)
}

export async function uploadFile(file: File): Promise<Uploaded> {
  if (file.size > CHUNK_THRESHOLD) return uploadChunked(file)

  const fd = new FormData()
  fd.append('file', file)
  fd.append('folder', '')

  const res = await fetch('/api/upload', {
    method: 'POST',
    credentials: 'include',
    body: fd,
  })
  if (!res.ok) {
    let msg = `Upload falhou (HTTP ${res.status})`
    try {
      const e = await res.json()
      if (e?.message || e?.error) msg = e.message || e.error
    } catch {
      /* mantém msg padrão */
    }
    throw new Error(msg)
  }

  const data = await res.json()
  return buildUploaded(data?.file)
}

// Monta o Uploaded a partir do `file` da resposta do servidor.
function buildUploaded(f: any): Uploaded {
  if (!f || (!f.short_code && !f.sha256)) throw new Error('Resposta de upload inválida')
  const ext = EXT[f.mime_type] || ''
  const url = f.short_code
    ? `https://media.libernet.app/s/${f.short_code}${ext}`
    : `https://media.libernet.app/${f.sha256}${ext}`
  return { url, mime: f.mime_type || '', isVideo: (f.mime_type || '').startsWith('video/'), sha256: f.sha256 || undefined }
}

// Upload com PROGRESSO real (XHR) — alimenta o "tanque" do compose.
export function uploadFileWithProgress(file: File, onProgress: (pct: number) => void): Promise<Uploaded> {
  if (file.size > CHUNK_THRESHOLD) return uploadChunked(file, onProgress)

  return new Promise((resolve, reject) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder', '')
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 95)) // 95%; 100% no fim
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(buildUploaded(JSON.parse(xhr.responseText)?.file)) }
        catch (err) { reject(err instanceof Error ? err : new Error('Resposta de upload inválida')) }
      } else reject(new Error(`Upload falhou (HTTP ${xhr.status})`))
    })
    xhr.addEventListener('error', () => reject(new Error('Falha de rede')))
    xhr.addEventListener('timeout', () => reject(new Error('Timeout no upload')))
    xhr.timeout = 300000
    xhr.open('POST', '/api/upload')
    xhr.withCredentials = true
    xhr.send(fd)
  })
}

// Upload CHUNKED de arquivo grande. Pedaços de 1MB com retry; depois finaliza no servidor
// (que junta os pedaços em streaming e devolve o mesmo `file` do upload normal).
async function uploadChunked(file: File, onProgress?: (pct: number) => void): Promise<Uploaded> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
  const uploadId = chunkUploadId()
  let uploadedBytes = 0

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE
    const chunk = file.slice(start, Math.min(start + CHUNK_SIZE, file.size))
    await sendChunkWithRetry(chunk, uploadId, i, totalChunks, file.name)
    uploadedBytes += chunk.size
    onProgress?.(Math.min(95, Math.round((uploadedBytes / file.size) * 95))) // 95%; 100% no fim
  }

  // Finaliza: o servidor junta os pedaços e cria o arquivo final (pode demorar p/ vídeo grande).
  const ctrl = new AbortController()
  const t = window.setTimeout(() => ctrl.abort(), 300000) // 5min p/ juntar no servidor
  try {
    const res = await fetch('/api/upload/finalize', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId, fileName: file.name, fileSize: file.size, totalChunks, folder: '' }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      let msg = `Finalização do upload falhou (HTTP ${res.status})`
      try {
        const e = await res.json()
        if (e?.message || e?.error) msg = e.message || e.error
      } catch {
        /* mantém msg padrão */
      }
      throw new Error(msg)
    }
    const data = await res.json()
    return buildUploaded(data?.file)
  } finally {
    window.clearTimeout(t)
  }
}

// Envia um pedaço com até CHUNK_RETRIES tentativas (backoff linear). Timeout por pedaço.
async function sendChunkWithRetry(
  chunk: Blob,
  uploadId: string,
  index: number,
  total: number,
  fileName: string,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController()
    const t = window.setTimeout(() => ctrl.abort(), CHUNK_TIMEOUT_MS)
    try {
      const fd = new FormData()
      fd.append('chunk', chunk)
      fd.append('uploadId', uploadId)
      fd.append('chunkIndex', String(index))
      fd.append('totalChunks', String(total))
      fd.append('fileName', fileName)
      const res = await fetch('/api/upload/chunk', {
        method: 'POST',
        credentials: 'include',
        body: fd,
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error(`Pedaço ${index + 1}/${total} falhou (HTTP ${res.status})`)
      return
    } catch (e) {
      if (attempt >= CHUNK_RETRIES) {
        throw e instanceof Error ? e : new Error(`Falha ao enviar o pedaço ${index + 1}/${total}`)
      }
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
    } finally {
      window.clearTimeout(t)
    }
  }
}

// id de upload sanitizado p/ o backend (regex ^[a-zA-Z0-9_-]+$). randomUUID já casa.
function chunkUploadId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  }
}
