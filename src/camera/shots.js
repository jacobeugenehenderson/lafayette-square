/**
 * shots — the one shot vocabulary every surface reads (Phase 2 B, BRIEF-phase2-B-camera-authority row 5).
 *
 * ADJACENCY. Which shot a viewer can reach from which: Hero ↔ Browse and Browse ↔ Street, with no Hero ↔ Street
 * edge. Stage's shot picker (cartograph/Toolbar) and Preview's (PreviewApp, TriggerBar) disable a button that is
 * not adjacent, so authoring cannot reach a framing the player cannot.
 */
export const SHOT_ADJACENCY = {
  hero:   new Set(['browse']),
  browse: new Set(['hero', 'street']),
  street: new Set(['browse']),
}

/** True when `to` is reachable from `from` in one step. A shot outside the graph (the Designer, Extent) reaches anything. */
export function shotReachable(from, to) {
  if (from === to) return true
  const adj = SHOT_ADJACENCY[from]
  return !adj || adj.has(to)
}

/** The shots' names, as every picker labels them. */
export const SHOT_LABELS = { hero: 'Hero', browse: 'Browse', street: 'Street' }

// STREET. In the player the eye stands where the viewer taps; Stage's Street shot and Preview's Street button have no
// tap, so the eye stands near the centre of the town's own disc — a ratio of its radius, never a town's coordinate
// (StageApp's SHOTS stood every town at Lafayette Square's [0, -50] until Phase 2 B).
const STREET_STAND_RATIO = 0.08

/** Where the Street eye stands with no tap: `[x, z]`, or null while the disc is unknown. */
export function streetStandOf(stencil) {
  const r = stencil?.radius, c = stencil?.center
  if (!(r > 0) || !Array.isArray(c) || !c.every(Number.isFinite)) return null
  return [c[0], c[1] + r * STREET_STAND_RATIO]
}
