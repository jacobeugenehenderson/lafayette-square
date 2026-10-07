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
 * { x, z, radius, count, placed, of, outside: [ids], unplaced: [ids], also }, or null when no id has a place in the disc.
 *
 * ⭐ `also` — points framed WITH the set (Jacob, 2026-10-07: "if the person has an 'active dot' in the neighborhood
 * already, the map could move to frame them AND the place"): [{ x, z }], e.g. the reader's own dot. Same floor, same
 * Extent bound. A point outside the Extent is not in the neighbourhood and is left out without a word — the place is
 * framed alone (`also` in the result counts the points that were framed). They never stand in for the set: no placed id,
 * no frame.
 */
/** The `also` points inside the Extent, as zero-footprint places. */
function alsoIn(also, stencil) {
  const [cx, cz] = stencil.center
  return (also || []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.z) && Math.hypot(p.x - cx, p.z - cz) <= stencil.radius)
    .map((p) => ({ x: p.x, z: p.z, radius: 0 }))
}
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

/**
 * ⭐ THE SMALLEST FRAME (Boz for the Ward's pin, 2026-10-07): a set this small still shows WHERE it is, not one roof filling
 * the map. The circle about [x, z] that holds the k = ⌈√N⌉ nearest of the town's N placed buildings, footprints and all —
 * the same k-NN rule the densest cluster is sized by, read off the buildings the frame already receives. No metre value,
 * no set-size threshold: a set wider than this floor is simply wider. ▶ node checks/claims-the-plan-opens-on-its-places.mjs
 */
function floorAt(town, [x, z]) {
  const d = []
  for (const p of town.values()) d.push(Math.hypot(p.x - x, p.z - z) + p.radius)
  if (!d.length) return 0
  d.sort((a, b) => a - b)
  return d[Math.min(d.length, Math.ceil(Math.sqrt(d.length))) - 1]
}

/** The circle about [x, z] that holds `chosen` (each with its footprint radius) and never less than the town's floor, moved
 *  and shrunk to lie inside the Extent. */
function circleIn(chosen, stencil, [x, z], town) {
  const [cx, cz] = stencil.center, R = stencil.radius
  let radius = Math.max(floorAt(town, [x, z]), ...chosen.map((p) => Math.hypot(p.x - x, p.z - z) + p.radius))
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
export function frameAll(places, ids, stencil, also) {
  const { pts, disclosure } = partition(places, ids, stencil, 'frameAll')
  if (!pts.length) return null
  const extra = alsoIn(also, stencil), held = [...pts, ...extra]
  // Centred on the members' extent (footprints included), so the circle is as tight as it simply can be.
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const p of held) { x0 = Math.min(x0, p.x - p.radius); x1 = Math.max(x1, p.x + p.radius); z0 = Math.min(z0, p.z - p.radius); z1 = Math.max(z1, p.z + p.radius) }
  return { ...circleIn(held, stencil, [(x0 + x1) / 2, (z0 + z1) / 2], places), count: pts.length, ...disclosure, also: extra.length }
}

/** The one switch Town's `frameMode` names: 'densest' (the default) | 'all'. ⛔ Anything else throws by name. */
export function framePlaces(places, ids, stencil, mode = 'densest', also) {
  if (mode === 'all') return frameAll(places, ids, stencil, also)
  if (mode === 'densest') return frameDensest(places, ids, stencil, also)
  throw new Error(`[framePlaces] ⛔ frameMode "${mode}" — the plan frames 'densest' or 'all'`)
}

export function frameDensest(places, ids, stencil, also) {
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

  // Centred on the cluster's mean (unchanged since Jacob chose this frame, 2026-09-28), with any `also` point in it.
  const extra = alsoIn(also, stencil), held = [...chosen, ...extra]
  const mean = [held.reduce((a, p) => a + p.x, 0) / held.length, held.reduce((a, p) => a + p.z, 0) / held.length]
  return { ...circleIn(held, stencil, mean, places), count: chosen.length, ...disclosure, also: extra.length }
}
