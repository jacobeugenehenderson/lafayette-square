// coast-in-drawing.mjs — whether a coast ring reaches the town's DRAWING (its terrain grid), shared by the bake that asks
// (bake-terrain.js#waterDatum) and the check that holds it (checks/claims-a-coast-outside-the-drawing-is-no-shore.mjs).

/**
 * Does `ring` ([[x,z]…]) reach the rectangle at all? Exact: a ring vertex inside it, a rectangle corner inside the
 * ring, or an edge crossing one of its sides. Pure.
 */
const crosses = (p, q, u, v) => { const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  return d(p, q, u) * d(p, q, v) < 0 && d(u, v, p) * d(u, v, q) < 0 }
const sidesOf = (r) => [[[r.minX, r.minZ], [r.maxX, r.minZ]], [[r.maxX, r.minZ], [r.maxX, r.maxZ]], [[r.maxX, r.maxZ], [r.minX, r.maxZ]], [[r.minX, r.maxZ], [r.minX, r.minZ]]]
const inRectOf = (r) => ([x, z]) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ

/** Does an OPEN polyline (a shoreline run) reach the rectangle: a vertex inside it, or a segment crossing a side? */
export function polylineTouchesRect(line, r) {
  if (line.some(inRectOf(r))) return true
  const sides = sidesOf(r)
  for (let k = 0; k + 1 < line.length; k++) if (sides.some(([u, v]) => crosses(line[k], line[k + 1], u, v))) return true
  return false
}

export function ringTouchesRect(ring, r) {
  if (ring.some(inRectOf(r))) return true
  const inRing = (x, z) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
  if ([[r.minX, r.minZ], [r.maxX, r.minZ], [r.maxX, r.maxZ], [r.minX, r.maxZ]].some(([x, z]) => inRing(x, z))) return true
  return polylineTouchesRect([...ring, ring[0]], r)
}

/**
 * ⭐ A COAST THAT LIES WHOLLY OUTSIDE THE TOWN'S DRAWING IS NO SHORE FOR THIS TOWN (Jacob, 2026-10-06: Jackson Heights is
 * landlocked; Flushing Bay is in its FETCH envelope only). `coastRings` closes the coast against the fetch bb, which is
 * wider than the drawing; a ring that never reaches the terrain grid is set aside, NAMED, and — if none remains — the
 * town takes the existing no-coast path. ⛔ A ring that DOES reach the grid and still catches zero samples stays the
 * loud throw below: that is a real frame disagreement, not a distant bay. Returns { inDrawing, outside }.
 */
export function ringsInDrawing(rings, bounds) {
  const inDrawing = [], outside = []
  for (const r of rings) (ringTouchesRect(r, bounds) ? inDrawing : outside).push(r)
  return { inDrawing, outside }
}
