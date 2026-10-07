// curbCutSlots.js — the ONE write of a corner's curb cut into `blockCustoms` (`BRIEF-corner-ramps-and-kerb §3` step 4).
// A corner is authored on BOTH legs at once — the arriving run's `curbCuts.end`, the leaving run's `curbCuts.start` —
// exactly the two slots the painter reads (`tileGround.js#curbCutsOnJunctionCorners`), so the gesture can never make
// them disagree. `style` null removes both keys (the corner draws what it would unauthored); empty slots are pruned.
// Pure (returns a new object); the store calls it, and the check calls the same function.
export function writeCornerCurbCut(blockCustoms, corner, style) {
  const next = { ...(blockCustoms || {}) }
  for (const sl of corner?.slots || []) {
    if (!sl) continue
    const { skelId, side, segOrd, end } = sl
    next[skelId] = { ...(next[skelId] || {}) }; next[skelId][side] = { ...(next[skelId][side] || {}) }
    const slot = { ...(next[skelId][side][segOrd] || {}) }, cc = { ...(slot.curbCuts || {}) }
    if (style == null) delete cc[end]; else cc[end] = style
    if (Object.keys(cc).length) slot.curbCuts = cc; else delete slot.curbCuts
    if (Object.keys(slot).length) next[skelId][side][segOrd] = slot; else delete next[skelId][side][segOrd]
    if (!Object.keys(next[skelId][side]).length) delete next[skelId][side]
    if (!Object.keys(next[skelId]).length) delete next[skelId]
  }
  return next
}
