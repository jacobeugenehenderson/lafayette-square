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
