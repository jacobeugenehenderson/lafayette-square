// drawOrder.js — WHERE THE FOCUS MATTE DRAWS: after every environment layer of ITS town (Jacob, 2026-11-01: "the matte is
// fixed last"; "the lights are supposed to be part of the monument, especially in terms of the focus matte").
//
// ⭐ WHY (measured, Stage PTown, 2026-11-01). A display hung on a hero (the Light Show's glass and light) writes no depth, so
// every transparent environment layer drawn AFTER it that lies BEHIND it paints over it: the landcover groups, the water's
// absorption pass and the water. The strands broke wherever the background changed from one layer to another. Drawing the
// matte after them restored every bulb (renderOrder bisection: ≤ 4 broken, after the water whole).
// ⭐ DERIVED, NEVER A CONSTANT. The environment's orders are the town's own baked ground groups (bake-ground.js: positional,
// water appended last), so they differ by town; the matte is their max + 1, for THIS town (keyed by lookId: a Stage town
// switch never applies one town's order to another's matte while the new ground loads).
// ⭐ BELOW THE LATE OVERLAYS. Neon (MaxEquation: it can only brighten a bulb behind it) and the weather draw after the matte, so
// a sign or a raindrop nearer than the monument still shows over it. ⚠ KNOWN LIMIT: the neon's order is a fixed number, so a
// town whose ground reaches it is REFUSED by name rather than overlapped; one ordering function for every late layer is filed.
// ▶ node checks/claims-the-focus-matte-draws-after-the-environment.mjs --mutants
export const NEON_RENDER_ORDER = 100   // NeonBands.jsx: its tube (and its line at +1); ⛔ the matte must stay below it

const grounds = new Map()   // lookId → { max } | { refused }

/** The town's ground loaded (BakedGround, on every load, a re-bake included): record its environment's orders. */
export function setGroundOrders(lookId, groups) {
  if (!lookId) throw new Error('[drawOrder] setGroundOrders needs the lookId whose ground this is')
  const bad = !Array.isArray(groups) || !groups.length ? 'it has no groups'
    : groups.filter((g) => !Number.isFinite(g?.renderOrder)).map((g) => g?.id ?? '?')
  if (typeof bad === 'string' || bad.length) {
    grounds.set(lookId, { refused: `"${lookId}"'s ground ${typeof bad === 'string' ? bad : `has groups with no numeric renderOrder (${bad.slice(0, 5).join(', ')})`}, so the focus matte's place after it cannot be derived` })
    return
  }
  grounds.set(lookId, { max: Math.max(...groups.map((g) => g.renderOrder)) })
}

/** → { state: 'not-yet' } (the town's ground has not loaded) · { state: 'refused', reason } · { state: 'ok', order }. */
export function matteOrderFor(lookId) {
  const g = grounds.get(lookId)
  if (!g) return { state: 'not-yet' }
  if (g.refused) return { state: 'refused', reason: g.refused }
  const order = g.max + 1
  if (order >= NEON_RENDER_ORDER) return { state: 'refused', reason: `"${lookId}"'s ground reaches renderOrder ${g.max}, so the focus matte (${order}) would draw at or after the neon (${NEON_RENDER_ORDER}); one ordering function for the late layers is owed (drawOrder.js, known limit)` }
  return { state: 'ok', order }
}

/** Put every mesh under `node` at `order`; → how many it changed (0 once settled). Writes only on a change. */
export function enforceMatteOrder(node, order) {
  let changed = 0
  node.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine) && o.renderOrder !== order) { o.renderOrder = order; changed++ } })
  return changed
}
