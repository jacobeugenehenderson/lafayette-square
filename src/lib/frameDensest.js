/**
 * frameDensest — the plan map opens on the town's places: a frame on the DENSEST CLUSTER of a set of them.
 *
 * WHY (Warden, 2026-09-28): the compass moved off the ground rim to a screen ring, so the plan map no longer has to
 * show the whole disc. An app opens it on the lit category, or on every listed place for a cold start.
 *
 * ⭐ Computed from the places alone — no per-town constant, no metre value. The cluster's size comes from the data:
 * k = ⌈√n⌉ nearest neighbours (the standard k-NN density rule; unitless). The densest point is the one whose k-th
 * neighbour is nearest. `mode`:
 *   'sqrt'      the frame holds that point and its k neighbours;
 *   'halfPeak'  the neighbourhood grows while its density (count ÷ area) stays at or above half the peak.
 * The frame is bounded by the Extent (the slab's stencil disc): it is moved and shrunk to lie inside it, never beyond.
 *
 * ⛔ NOTHING VANISHES. A requested id with no place (a listing with no building, a building the slab does not have)
 * is returned in `unplaced`; a place beyond the rim in `outside`. placed + outside + unplaced = of.
 * ▶ node checks/claims-the-plan-opens-on-its-places.mjs [--table]
 *
 * Pure (no three.js, no React): places = Map(id → { x, z, radius }) (Town's useBuildingPlaces), ids = iterable of
 * ids (null/undefined allowed and disclosed), stencil = { center: [x, z], radius }. Returns
 * { x, z, radius, count, placed, of, outside: [ids], unplaced: [ids] }, or null when no id has a place in the disc.
 */
export function frameDensest(places, ids, stencil, { mode } = {}) {
  if (mode !== 'sqrt' && mode !== 'halfPeak') throw new Error(`[frameDensest] ⛔ mode is 'sqrt' or 'halfPeak' (Jacob picks from the frames); got ${mode}`)
  if (!(stencil?.radius > 0) || !Array.isArray(stencil.center)) throw new Error('[frameDensest] ⛔ needs the Extent — the slab\'s stencil { center, radius }')
  const [cx, cz] = stencil.center, R = stencil.radius
  const all = [...ids]
  const pts = [], outside = [], unplaced = []
  for (const id of all) {
    const p = id == null ? null : places?.get(id)
    if (!p) unplaced.push(id ?? null)
    else if (Math.hypot(p.x - cx, p.z - cz) > R) outside.push(id)
    else pts.push(p)
  }
  const disclosure = { placed: pts.length, of: all.length, outside, unplaced }
  const n = pts.length
  if (!n) return null

  let chosen = pts
  const k = Math.ceil(Math.sqrt(n))
  if (k + 1 < n) {
    // The k-th nearest neighbour of every point; the densest point is the one where it is nearest.
    const dists = pts.map((p) => pts.map((q) => Math.hypot(p.x - q.x, p.z - q.z)).sort((a, b) => a - b))
    let best = 0
    for (let i = 1; i < n; i++) if (dists[i][k] < dists[best][k]) best = i
    let m = k
    if (mode === 'halfPeak') {
      // Density of the neighbourhood of m neighbours: (m + 1) points over the disc reaching the m-th.
      const density = (j) => (j + 1) / (Math.PI * Math.max(dists[best][j], Number.MIN_VALUE) ** 2)
      const peak = density(k)
      while (m + 1 < n && density(m + 1) >= peak / 2) m++
    }
    const reach = dists[best][m]
    const o = pts[best]
    chosen = pts.filter((q) => Math.hypot(q.x - o.x, q.z - o.z) <= reach)
  }

  const x0 = chosen.reduce((a, p) => a + p.x, 0) / chosen.length
  const z0 = chosen.reduce((a, p) => a + p.z, 0) / chosen.length
  let radius = Math.max(...chosen.map((p) => Math.hypot(p.x - x0, p.z - z0) + p.radius))
  let x = x0, z = z0
  // Bound by the Extent: never beyond the rim.
  if (radius >= R) { x = cx; z = cz; radius = R }
  else {
    const d = Math.hypot(x - cx, z - cz)
    if (d + radius > R) { const s = (R - radius) / d; x = cx + (x - cx) * s; z = cz + (z - cz) * s }
  }
  return { x, z, radius, count: chosen.length, ...disclosure }
}
