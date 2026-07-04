// URL do SVG Twemoji SELF-HOSPEDADO (/static/twemoji/svg) para um emoji.
// Por quê: o iOS Safari (WebKit) NÃO pinta a fonte de cor COLR (a nossa LmEmoji/Twemoji),
// então no iPhone os emojis caem na fonte NATIVA — e o ❤ nativo tem métrica diferente dos
// astrais (👍😂…), saindo do lugar. Renderizar como IMAGEM fixa fica idêntico em qualquer
// aparelho. Regra de nome do Twemoji: remove U+FE0F (a não ser que haja ZWJ), codepoints em
// hex lowercase juntados por '-'. Ex: ❤️->2764, 👍->1f44d; sequência ZWJ mantém o 200d.
const ZWJ = '‍'
const FE0F = /️/g
export function twemojiUrl(emoji: string): string {
  const base = emoji.includes(ZWJ) ? emoji : emoji.replace(FE0F, '')
  const code = [...base].map((c) => c.codePointAt(0)!.toString(16)).join('-')
  return `/static/twemoji/svg/${code}.svg`
}
