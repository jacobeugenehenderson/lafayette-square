/**
 * neonPlaces — the neon each open PLACE lights (BRIEF-neon-reads-at-every-distance §3.3). Pure: SceneNeon draws what it
 * returns, checks/claims-neon-per-place.mjs proves it on the baked slab.
 *
 * ⭐ A RING ROUND THE ROOFLINE, LIT BY ITS PLACES (Jacob, 2026-10-08: "the building must be very visible from different
 * angles"). A building with any lit place draws its whole footprint at the eave — visible from every side — and the ring is
 * the PLACES', not the building's: one lit place takes the whole ring in its category's colour; several share it in equal
 * arcs, in id order, each in its own colour. A building none of whose places is lit stays dark.
 * ⛔ It was a stretch of wall toward the place's street (its address's face, else its street frontage) — a band across the
 * front that vanished from behind and the side. The per-place rule that replaced a ring keyed by ONE listing (the last write
 * won, so a closed listing darkened a building whose other place was open, 2026-10-06) stays: any lit place lights the ring.
 * The ring's height is the eave the slab's per-building `neon` record carries (cartograph/neon-faces.mjs).
 */

/** The reasons a lit place could not be placed — the census keys, so a reader can count them. */
export const UNPLACED = Object.freeze({
  slab: 'its building carries no neon record (no eave height — a slab baked before it; re-bake buildings)',
  footprint: 'its building has no footprint ring to trace',
})

const polyLen = (pts) => { let L = 0; for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); return L }
function slice(pts, s0, s1) {
  const out = []
  let acc = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az)
    const lo = Math.max(s0, acc), hi = Math.min(s1, acc + L)
    if (hi > lo && L > 0) {
      const at = (s) => [ax + (bx - ax) * (s - acc) / L, az + (bz - az) * (s - acc) / L]
      if (!out.length) out.push(at(lo))
      out.push(at(hi))
    }
    acc += L
  }
  return out
}

/**
 * entries  — the slab building index (useSlabBuildingIndex byNum): { id, footprint, baseY, centroidY, ranges, neon }
 * places   — the town's listings, each { id, building_id, address, category, … }, already filtered to real places
 * isLit    — (place) => whether its neon is on now (its hours, or Stage's force-on)
 * keep     — optional (buildingId) => whether the app shows this building's neon (Stage density, <Town litIds>)
 * Returns { stretches: [{ id, buildingId, pts, y, footprint, groundYRaw, category }], census }.
 */
export function placeNeon({ entries, places, isLit, keep = () => true }) {
  const byBuilding = new Map()
  for (const p of places) {
    if (!p.building_id) continue
    if (!byBuilding.has(p.building_id)) byBuilding.set(p.building_id, [])
    byBuilding.get(p.building_id).push(p)
  }
  const census = { lit: 0, ringed: 0, dark: {} }
  const dark = (why, n) => { census.dark[why] = (census.dark[why] || 0) + n }
  const stretches = []
  for (const e of entries) {
    // A record the slab built no walls for (a set-piece's building, SetPiece.jsx) has no roofline to carry a sign.
    if (!e.ranges?.wall) continue
    const lit = (byBuilding.get(e.id) || []).filter(isLit)
    if (!lit.length || !keep(e.id)) continue
    lit.sort((a, b) => String(a.id).localeCompare(String(b.id)))
    census.lit += lit.length
    // The eave: the height the slab's neon record carries for this building's walls (the highest, if they differ).
    const ys = e.neon ? [...(e.neon.faces || []), ...(e.neon.frontage || [])].map((f) => f.y).filter(Number.isFinite) : []
    if (!ys.length) { dark(UNPLACED.slab, lit.length); continue }
    const fp = (e.footprint || []).filter((q) => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1]))
    if (fp.length < 3) { dark(UNPLACED.footprint, lit.length); continue }
    const closed = fp[0][0] === fp[fp.length - 1][0] && fp[0][1] === fp[fp.length - 1][1]
    const ring = closed ? fp : [...fp, fp[0]]
    const y = Math.max(...ys), L = polyLen(ring)
    census.ringed += lit.length
    // Each stretch carries its RING NEIGHBOURS — the ring vertex before its first point and after its last — so the drawing
    // joins its ends like any other corner: the whole ring closes on itself, and arcs meeting at a corner meet cleanly.
    const cum = [0]; for (let k = 1; k < ring.length; k++) cum.push(cum[k - 1] + Math.hypot(ring[k][0] - ring[k - 1][0], ring[k][1] - ring[k - 1][1]))
    const vBefore = (s) => { let k = 0; while (k + 1 < ring.length && cum[k + 1] < s - 1e-6) k++; return cum[k] < s - 1e-6 ? ring[k] : ring[(k - 1 + ring.length - 1) % (ring.length - 1)] }
    const vAfter = (s) => { let k = ring.length - 1; while (k - 1 >= 0 && cum[k - 1] > s + 1e-6) k--; return cum[k] > s + 1e-6 ? ring[k] : ring[(k + 1) % (ring.length - 1)] }
    lit.forEach((p, i) => {
      const s0 = L * i / lit.length, s1 = L * (i + 1) / lit.length
      const pts = lit.length === 1 ? ring : slice(ring, s0, s1)
      const pre = lit.length === 1 ? ring[ring.length - 2] : vBefore(s0), post = lit.length === 1 ? ring[1] : vAfter(s1 >= L - 1e-6 ? 0 : s1)
      if (pts.length >= 2) stretches.push({ id: p.id, buildingId: e.id, pts, pre, post, y, footprint: e.footprint, groundYRaw: e.centroidY, groundY: e.groundY, category: p.category ?? null, ring: lit.length === 1 })
    })
  }
  return { stretches, census }
}
