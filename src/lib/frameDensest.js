/**
 * frameDensest — the plan map opens on the town's places: a frame on the DENSEST CLUSTER of a set of them.
 *
 * WHY (Warden, 2026-09-28): the compass moved off the ground rim to a screen ring, so the plan map no longer has to
 * show the whole disc. An app opens it on the lit category, or on every listed place for a cold start.
 *
 * ⭐ Computed from the places alone — no per-town constant, no metre value. The cluster's size comes from the data:
 * k = ⌈√n⌉ nearest neighbours (the standard k-NN density rule; unitless). The densest point is the one whose k-th
 * neighbour is nearest, and the frame holds that point and its k neighbours (Jacob picked this over growing the
 * neighbourhood to half the peak density, 2026-09-28).
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
/** The partition every frame shares: placed inside the Extent, beyond it, or with no place. */
function partition(places, ids, stencil, who) {
  if (!(stencil?.radius > 0) || !Array.isArray(stencil.center)) throw new Error(`[${who}] ⛔ needs the Extent — the slab's stencil { center, radius }`)
  const [cx, cz] = stencil.center
  const all = [...ids]
  const pts = [], outside = [], unplaced = []
  for (const id of all) {
    const p = id == null ? null : places?.get(id)
    if (!p) unplaced.push(id ?? null)
    else if (Math.hypot(p.x - cx, p.z - cz) > stencil.radius) outside.push(id)
    else pts.push(p)
  }
  return { pts, disclosure: { placed: pts.length, of: all.length, outside, unplaced } }
}

/** The circle about [x, z] that holds `chosen` (each with its footprint radius), moved and shrunk to lie inside the Extent. */
function circleIn(chosen, stencil, [x, z]) {
  const [cx, cz] = stencil.center, R = stencil.radius
  let radius = Math.max(...chosen.map((p) => Math.hypot(p.x - x, p.z - z) + p.radius))
  if (radius >= R) { x = cx; z = cz; radius = R }
  else {
    const d = Math.hypot(x - cx, z - cz)
    if (d + radius > R) { const s = (R - radius) / d; x = cx + (x - cx) * s; z = cz + (z - cz) * s }
  }
  return { x, z, radius }
}

/**
 * frameAll — a frame that holds EVERY placed member of the set, footprints and all (Jacob, 2026-09-29: "Dining should
 * frame all the bars and restaurants" · at arrival "we want to see everything that's open"). Same partition and Extent
 * bound as frameDensest; bounded by the Extent, so a set wider than the town frames the whole town and says which
 * members lie beyond it (`outside`). Same return shape.
 */
export function frameAll(places, ids, stencil) {
  const { pts, disclosure } = partition(places, ids, stencil, 'frameAll')
  if (!pts.length) return null
  // Centred on the members' extent (footprints included), so the circle is as tight as it simply can be.
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const p of pts) { x0 = Math.min(x0, p.x - p.radius); x1 = Math.max(x1, p.x + p.radius); z0 = Math.min(z0, p.z - p.radius); z1 = Math.max(z1, p.z + p.radius) }
  return { ...circleIn(pts, stencil, [(x0 + x1) / 2, (z0 + z1) / 2]), count: pts.length, ...disclosure }
}

/** The one switch Town's `frameMode` names: 'densest' (the default) | 'all'. ⛔ Anything else throws by name. */
export function framePlaces(places, ids, stencil, mode = 'densest') {
  if (mode === 'all') return frameAll(places, ids, stencil)
  if (mode === 'densest') return frameDensest(places, ids, stencil)
  throw new Error(`[framePlaces] ⛔ frameMode "${mode}" — the plan frames 'densest' or 'all'`)
}

export function frameDensest(places, ids, stencil) {
  const { pts, disclosure } = partition(places, ids, stencil, 'frameDensest')
  const n = pts.length
  if (!n) return null

  let chosen = pts
  const k = Math.ceil(Math.sqrt(n))
  if (k + 1 < n) {
    // The k-th nearest neighbour of every point; the densest point is the one where it is nearest.
    const dists = pts.map((p) => pts.map((q) => Math.hypot(p.x - q.x, p.z - q.z)).sort((a, b) => a - b))
    let best = 0
    for (let i = 1; i < n; i++) if (dists[i][k] < dists[best][k]) best = i
    const reach = dists[best][k]
    const o = pts[best]
    chosen = pts.filter((q) => Math.hypot(q.x - o.x, q.z - o.z) <= reach)
  }

  // Centred on the cluster's mean (unchanged since Jacob chose this frame, 2026-09-28).
  const mean = [chosen.reduce((a, p) => a + p.x, 0) / chosen.length, chosen.reduce((a, p) => a + p.z, 0) / chosen.length]
  return { ...circleIn(chosen, stencil, mean), count: chosen.length, ...disclosure }
}
