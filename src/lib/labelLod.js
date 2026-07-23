// labelLod.js — runtime zoom-LOD for street labels (pure; node-testable).
//
// Density thins as the camera pulls OUT and fills back in as it pulls CLOSER,
// guaranteeing ≥1 label per street in view. Computed at runtime (no baked
// density tiers) and reusing the trees' camera-driven pattern
// ([[tree-building-frustum-culling]]): a MANUAL visibility pass, never three's
// fragile auto-cull.
//
// The zoom metre is meters-per-pixel at the ground, so the Designer (ortho) and
// the player (perspective) thin identically — targetSpacing (world m) scales
// with it, holding on-screen label spacing ~constant.

// Target on-screen spacing between successive same-street labels (px).
export const SCREEN_LABEL_SPACING_PX = 340

/** Ground meters per screen pixel, for ortho or perspective cameras. */
export function metersPerPixel(camera, viewportHeightPx) {
  if (!viewportHeightPx) return 1
  if (camera.isOrthographicCamera) {
    const frustumH = (camera.top - camera.bottom) / (camera.zoom || 1)
    return frustumH / viewportHeightPx
  }
  // Perspective: height above ground is the view-distance proxy (browse/hero
  // look down; street view is near-horizontal, where labels aren't the point).
  const dist = Math.max(1, Math.abs(camera.position?.y ?? 1))
  const fov = ((camera.fov ?? 50) * Math.PI) / 180
  return (2 * dist * Math.tan(fov / 2)) / viewportHeightPx
}

/**
 * Group placements by street, pre-sort each along its dominant axis, and mark the
 * primary (longest straight run). Computed once per placement set; the per-frame
 * pass just re-thresholds it.
 */
export function prepareLabelLod(placements) {
  const byStreet = new Map()
  placements.forEach((p, i) => {
    if (!byStreet.has(p.street)) byStreet.set(p.street, [])
    byStreet.get(p.street).push(i)
  })
  const groups = []
  for (const idxs of byStreet.values()) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const i of idxs) {
      const p = placements[i]
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
    const horiz = (maxX - minX) >= (maxZ - minZ)
    const sorted = idxs.slice().sort((a, b) =>
      horiz ? placements[a].x - placements[b].x : placements[a].z - placements[b].z)
    let primary = idxs[0]
    for (const i of idxs) if (placements[i].runLen > placements[primary].runLen) primary = i
    groups.push({ sorted, primary })
  }
  return groups
}

/**
 * Decide visibility at the current zoom. Each street's primary is always on
 * (≥1 per street — three's own frustum skip drops the off-screen ones); repeats
 * fill in only when they clear `targetSpacing` from every already-kept sibling.
 * @param {(i:number, visible:boolean)=>void} setVisible
 */
export function assignLabelLod(placements, groups, targetSpacing, setVisible) {
  for (const g of groups) {
    const kept = [g.primary]
    setVisible(g.primary, true)
    for (const i of g.sorted) {
      if (i === g.primary) continue
      const p = placements[i]
      let ok = true
      for (const j of kept) {
        if (Math.hypot(p.x - placements[j].x, p.z - placements[j].z) < targetSpacing) { ok = false; break }
      }
      setVisible(i, ok)
      if (ok) kept.push(i)
    }
  }
}
