// Timestamp relativo estilo X/Twitter, a partir de um unix seconds.
export function relativeTime(createdAt: number): string {
  const diff = Math.floor(Date.now() / 1000) - createdAt
  if (diff < 0) return 'agora'
  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  // Mais de uma semana: data curta.
  const d = new Date(createdAt * 1000)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}
