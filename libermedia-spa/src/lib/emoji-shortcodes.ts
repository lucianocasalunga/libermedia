// Shortcodes de emoji (:rocket: → 🚀). Alguns usuários e bots escrevem emoji como
// `:code:` (estilo Slack/GitHub) e o texto cru mostrava o código literal (:rocketship:).
// Mapa CURADO dos mais usados + aliases não-padrão que aparecem na prática (rocketship,
// thumbsup…). Shortcode não coberto fica como está (não quebra). Conversão = texto→texto,
// aplicada nos segmentos de TEXTO do content-parser e nas prévias (notificações/DM).
const MAP: Record<string, string> = {
  // foguete / destaque
  rocket: '🚀', rocketship: '🚀', fire: '🔥', flame: '🔥', tada: '🎉', party: '🎉',
  partying_face: '🥳', confetti_ball: '🎊', sparkles: '✨', star: '⭐', star2: '🌟',
  dizzy: '💫', boom: '💥', collision: '💥', zap: '⚡', high_voltage: '⚡', '100': '💯',
  // rostos
  smile: '😄', smiley: '😃', grin: '😁', laughing: '😆', satisfied: '😆', sweat_smile: '😅',
  rofl: '🤣', joy: '😂', slightly_smiling_face: '🙂', wink: '😉', blush: '😊', innocent: '😇',
  heart_eyes: '😍', kissing_heart: '😘', yum: '😋', sunglasses: '😎', smirk: '😏',
  thinking: '🤔', thinking_face: '🤔', neutral_face: '😐', expressionless: '😑', roll_eyes: '🙄',
  grimacing: '😬', sob: '😭', cry: '😢', sweat: '😓', weary: '😩', tired_face: '😫',
  fearful: '😨', cold_sweat: '😰', scream: '😱', flushed: '😳', angry: '😠', rage: '😡',
  triumph: '😤', sleeping: '😴', mask: '😷', nerd_face: '🤓', star_struck: '🤩',
  hugs: '🤗', shushing_face: '🤫', raised_eyebrow: '🤨', smiling_imp: '😈', clown_face: '🤡',
  // mãos / gestos
  pray: '🙏', clap: '👏', clapping: '👏', thumbsup: '👍', '+1': '👍', thumbsdown: '👎', '-1': '👎',
  ok_hand: '👌', wave: '👋', muscle: '💪', point_up: '☝️', point_right: '👉', point_left: '👈',
  point_down: '👇', raised_hands: '🙌', open_hands: '👐', handshake: '🤝', fist: '✊',
  punch: '👊', fist_raised: '✊', v: '✌️', crossed_fingers: '🤞', raised_hand: '✋',
  call_me_hand: '🤙', writing_hand: '✍️', eyes: '👀', brain: '🧠', tongue: '👅',
  // coração / amor
  heart: '❤️', orange_heart: '🧡', yellow_heart: '💛', green_heart: '💚', blue_heart: '💙',
  purple_heart: '💜', black_heart: '🖤', white_heart: '🤍', broken_heart: '💔',
  two_hearts: '💕', sparkling_heart: '💖', heartpulse: '💗', heartbeat: '💓', cupid: '💘',
  // símbolos / status
  white_check_mark: '✅', heavy_check_mark: '✔️', ballot_box_with_check: '☑️', x: '❌',
  negative_squared_cross_mark: '❎', warning: '⚠️', no_entry: '⛔', no_entry_sign: '🚫',
  question: '❓', grey_question: '❔', exclamation: '❗', bangbang: '‼️', bell: '🔔',
  lock: '🔒', unlock: '🔓', key: '🔑', shield: '🛡️', gear: '⚙️', wrench: '🔧',
  hammer: '🔨', hammer_and_wrench: '🛠️', link: '🔗', mag: '🔍', recycle: '♻️',
  infinity: '♾️', repeat: '🔁', arrows_counterclockwise: '🔄', heavy_plus_sign: '➕',
  arrow_up: '⬆️', arrow_right: '➡️', arrow_down: '⬇️', arrow_left: '⬅️', rocket_up: '🚀',
  // dinheiro / valor
  money_with_wings: '💸', moneybag: '💰', dollar: '💵', credit_card: '💳', gem: '💎',
  crown: '👑', trophy: '🏆', medal: '🏅', first_place_medal: '🥇', gift: '🎁', balloon: '🎈',
  chart_with_upwards_trend: '📈', chart: '📊', bulb: '💡', dart: '🎯', bullseye: '🎯',
  // tech / nostr / web3
  computer: '💻', iphone: '📱', satellite: '📡', satellite_antenna: '📡', battery: '🔋',
  globe_with_meridians: '🌐', earth_americas: '🌎', robot: '🤖', alien: '👽', ghost: '👻',
  skull: '💀', poop: '💩', wrench2: '🔧', electric_plug: '🔌', signal_strength: '📶',
  // natureza / objetos
  coffee: '☕', beer: '🍺', pizza: '🍕', sun: '☀️', sunny: '☀️', moon: '🌙',
  crescent_moon: '🌙', rainbow: '🌈', snowflake: '❄️', droplet: '💧', ocean: '🌊',
  seedling: '🌱', herb: '🌿', four_leaf_clover: '🍀', rose: '🌹', sunflower: '🌻',
  // bandeiras / lugares
  brazil: '🇧🇷', flag_br: '🇧🇷', earth: '🌍',
  // comunicação / mídia
  megaphone: '📣', loudspeaker: '📢', mega: '📣', speech_balloon: '💬', thought_balloon: '💭',
  email: '✉️', envelope: '✉️', inbox_tray: '📥', outbox_tray: '📤', package: '📦',
  bookmark: '🔖', books: '📚', newspaper: '📰', pushpin: '📌', paperclip: '📎',
  calendar: '📅', hourglass: '⏳', hourglass_flowing_sand: '⏳', watch: '⌚', alarm_clock: '⏰',
  // selos
  new: '🆕', free: '🆓', cool: '🆒', sos: '🆘', up: '🆙', ok: '🆗',
}

// `:word:` (letras, números, _ + -). Não casa URLs (https:// não tem `:word:` cercado por `:`).
const SHORTCODE_RE = /:([a-z0-9_+-]+):/gi

/** Converte :shortcode: → emoji. Código não mapeado fica intacto (texto→texto). */
export function emojifyShortcodes(text: string): string {
  if (!text || text.indexOf(':') === -1) return text
  return text.replace(SHORTCODE_RE, (full, code: string) => MAP[code.toLowerCase()] ?? full)
}

/** Unicode de um shortcode curado (:rocket:→🚀), ou undefined se não coberto. Usado pelo
 *  content-parser p/ renderizar shortcodes junto com os emoji custom (NIP-30). */
export function curatedEmoji(code: string): string | undefined {
  return MAP[code.toLowerCase()]
}
