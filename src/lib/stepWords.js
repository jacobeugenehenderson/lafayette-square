// stepWords.js — THE ONE MAP from a Foundry step's id to the words the operator reads (Jacob's chain names, 2026-11-01).
// The server names its steps by id (cartograph/serve.js#runIfDirty labels: 'skeleton', 'pipeline', 'ground-ao', …) and the
// ids stay: they are code. Every screen that shows a step (Look's banner, Preview's Publish line, the Foundry's progress
// card, Extent) says it through stepWords, never the raw id. ⛔ An id with no words is shown as a loud "unnamed step", not
// passed through: ▶ node checks/claims-the-chain-has-one-set-of-names.mjs (it reads serve.js's step ids and fails on any
// with no entry here).
export const STEP_WORDS = Object.freeze({
  skeleton: 'the street skeleton',
  coast: 'the coastline',
  pipeline: 'the street plan',
  'promote-ribbons': 'the street ribbons',
  terrain: 'the terrain',
  'terrain-slab': 'the terrain tiles',
  ground: 'the ground',
  revetment: 'the shore banks',
  'revetment-far': 'the far shore',
  'coast-distance': 'the distance to the coast',
  buildings: 'the buildings',
  landscape: 'the landscape beyond the circle',
  content: 'the places and listings',
  'derived-lamps': 'where the street lamps stand',
  lamps: 'the street lamps',
  scene: "the Look's settings",
  labels: 'the street labels',
  trees: 'the trees',
  'tree-anchors': 'where the trees stand',
  'ground-ao': "the ground's shading",
})

export const stepWords = (id) => STEP_WORDS[id] ?? `⛔ unnamed step "${id}"`

// "the terrain, the ground and 3 more" — the first few steps in words, the rest counted.
export function stepList(ids, show = 3) {
  const w = ids.map(stepWords)
  if (w.length <= show) return w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}` : (w[0] ?? '')
  return `${w.slice(0, show).join(', ')} and ${w.length - show} more`
}
