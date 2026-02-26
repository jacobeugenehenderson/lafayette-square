/**
 * Curated emoji set for avatar shuffle.
 * Free-type input stays open for anything — this only governs shuffle.
 *
 * Categories: animals, nature, plants, food, weather, objects, shapes.
 * Excluded: flags, clocks, bathroom signs, obscure symbols, unsettling faces.
 */

const SHUFFLE_AVATARS = [
  // Animals — warm, expressive
  '🦊','🐻','🐼','🐨','🐯','🦁','🐸','🐵','🐶','🐱',
  '🐰','🐷','🐮','🐴','🦄','🐝','🦋','🐢','🐙','🦎',
  '🐸','🦉','🐧','🦩','🐦','🦜','🐠','🐬','🐳','🦈',
  '🐿️','🦔','🦦','🦥','🦘','🐾','🪶','🐞','🦀','🐚',
  '🦭','🦫','🐺','🦝','🦨','🪿','🐓','🦆',

  // Plants & nature
  '🌻','🌸','🌺','🌷','🌹','🌼','💐','🌿','🍀','☘️',
  '🪴','🪻','🌵','🌾','🍄','🍂','🍁','🪷','🌱','🪹',

  // Food & drink — playful
  '🍎','🍊','🍋','🍒','🍓','🍑','🍉','🥑','🌽','🥕',
  '🍕','🧁','🍩','🍪','🎂','🍦','☕','🧋','🍵',

  // Weather & sky
  '🌊','🔥','⭐','🌙','☀️','🌈','❄️','⚡','💧','🌸',

  // Objects & fun
  '🎲','🎯','🧊','🫧','🪩','🎨','🎵','🎸','🎭','🧲',
  '💎','🔮','🪬','🧿','🏀','⚽','🎱','🛸','🚀','🏔️',
  '⛺','🏡','🌋','🗿','🧸','🎀','🪁','🫶','✨','💫',
]

// Deduplicate (a few intentional repeats in source for readability)
const unique = [...new Set(SHUFFLE_AVATARS)]

export default unique

export function randomAvatar() {
  return unique[Math.floor(Math.random() * unique.length)]
}
