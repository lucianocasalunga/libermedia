// Formata contadores estilo redes sociais: 0 → '', 1.2k, 3.4M.
export function formatCount(n: number | undefined): string {
  if (!n || n <= 0) return ''
  if (n < 1000) return String(n)
  if (n < 1_000_000) {
    const k = n / 1000
    return `${k % 1 === 0 ? k : k.toFixed(1)}k`
  }
  const m = n / 1_000_000
  return `${m % 1 === 0 ? m : m.toFixed(1)}M`
}
