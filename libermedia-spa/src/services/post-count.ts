// Total REAL de posts de um autor — FONTE DA VERDADE no strfry (scan --count),
// exposto pelo feed-engine em relay.libernet.app/count. O contador "Posts" do
// perfil mostrava só os posts já carregados na tela (posts.length), que no mobile
// fica em 40/80 e nunca bate com o total. Aqui vem o número de verdade do relay.
const COUNT_URL = 'https://relay.libernet.app/count'

// "Posts" = notas (kind:1) + enquetes (kind:1068). Reposts (kind:6) NÃO entram —
// são conteúdo de terceiros, não "minhas postagens".
const POST_KINDS = '1,1068'

export async function fetchPostCount(pubkeyHex: string): Promise<number | null> {
  if (!/^[0-9a-f]{64}$/.test(pubkeyHex)) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 9000)
  try {
    const res = await fetch(`${COUNT_URL}?pubkey=${pubkeyHex}&kinds=${POST_KINDS}`, {
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as { count?: number }
    return typeof data.count === 'number' ? data.count : null
  } catch {
    // relay fora do ar / timeout → cai no fallback (posts.length) no chamador
    return null
  } finally {
    clearTimeout(timer)
  }
}
