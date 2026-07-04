// Sanitização de URL para uso seguro em CSS `url("...")` e em atributos.
// Conteúdo de kind:0 (banner/picture) é NÃO confiável: um valor com aspas/quebra
// de linha pode escapar do url("...") e injetar CSS arbitrário (UI redress,
// exfiltração via url() externa). Aqui aceitamos apenas http(s) absoluto OU
// caminho relativo same-origin (/...), rejeitando javascript:/data:, o
// protocol-relative (//host) e os chars que quebram o contexto url("...").

export function safeImageUrl(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return ''
  const u = raw.trim()
  if (!/^(https?:\/\/|\/(?!\/))/i.test(u)) return '' // só http(s) absoluto ou /relativo (não //)
  if (/["\r\n]/.test(u)) return '' // escaparia do url("...")
  return u
}

/** Monta um `background-image` seguro; retorna undefined se a URL for inválida. */
export function cssBackgroundImage(raw: string | undefined | null): string | undefined {
  const u = safeImageUrl(raw)
  return u ? `url("${u}")` : undefined
}
