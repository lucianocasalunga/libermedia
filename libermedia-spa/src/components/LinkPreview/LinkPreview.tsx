// Card de preview (Open Graph) para links comuns no post. Busca o metadado em
// POST /api/link-preview (backend faz cache de 7 dias no Postgres + bloqueio
// SSRF). Render SEMPRE como elementos React (texto escapado pelo React) — a
// imagem passa por safeImageUrl. Enquanto carrega mostra esqueleto; em erro cai
// num link simples com o hostname.
import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { safeImageUrl } from '../../lib/safe-url'

interface Preview {
  title?: string
  description?: string
  image?: string
  site_name?: string
}

// Cache de módulo (url → preview|null) — uma busca por URL, compartilhada entre
// cards e re-renders. null = já tentou e falhou (não refaz).
const cache = new Map<string, Preview | null>()
const inflight = new Map<string, Promise<Preview | null>>()

function fetchPreview(url: string): Promise<Preview | null> {
  if (cache.has(url)) return Promise.resolve(cache.get(url) ?? null)
  const existing = inflight.get(url)
  if (existing) return existing
  const p = api
    .post<Preview>('/api/link-preview', { url })
    .then((data) => {
      cache.set(url, data)
      return data
    })
    .catch(() => {
      cache.set(url, null)
      return null
    })
    .finally(() => inflight.delete(url))
  inflight.set(url, p)
  return p
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<Preview | null | undefined>(() =>
    cache.has(url) ? cache.get(url) : undefined,
  )

  useEffect(() => {
    if (cache.has(url)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(cache.get(url))
      return
    }
    let alive = true
    fetchPreview(url).then((d) => {
      if (alive) setData(d)
    })
    return () => {
      alive = false
    }
  }, [url])

  const host = hostOf(url)
  const box =
    'mt-2 block overflow-hidden rounded-xl border border-[var(--lm-border)] transition hover:bg-[var(--lm-bg-card)]'

  // Carregando: esqueleto discreto.
  if (data === undefined) {
    return (
      <div className={`${box} p-3 text-sm text-[var(--lm-text-muted)]`}>
        Carregando preview…
      </div>
    )
  }

  // Falhou ou sem metadado útil: link simples com o hostname.
  const title = data?.title?.trim()
  const desc = data?.description?.trim()
  const site = data?.site_name?.trim() || host
  if (!data || (!title && !desc && !data.image)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={`${box} p-3 text-sm text-[var(--lm-link-ext)] hover:underline`}
        onClick={(e) => e.stopPropagation()}
      >
        {host}
      </a>
    )
  }

  const img = safeImageUrl(data.image)

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={box}
      onClick={(e) => e.stopPropagation()}
    >
      {img && (
        <div className="max-h-52 w-full overflow-hidden bg-[var(--lm-bg-card)]">
          <img
            src={img}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            onError={(e) => {
              ;(e.currentTarget.parentElement as HTMLElement).style.display = 'none'
            }}
          />
        </div>
      )}
      <div className="p-3">
        <div className="line-clamp-2 text-sm font-semibold text-[var(--lm-text-pri)]">
          {title || host}
        </div>
        {desc && (
          <div className="mt-1 line-clamp-2 text-xs text-[var(--lm-text-muted)]">{desc}</div>
        )}
        <div className="mt-1 text-xs text-[var(--lm-text-muted)]">{site}</div>
      </div>
    </a>
  )
}
