/**
 * neonPlaces — which stretch of which building each open PLACE's neon lights (BRIEF-neon-reads-at-every-distance §3.3).
 * Pure: SceneNeon draws what it returns, checks/claims-neon-per-place.mjs proves it on the baked slab.
 *
 * ⭐ NEON BELONGS TO A PLACE, NOT A BUILDING (Jacob, 2026-10-06). A building carries several addresses, so each lit place
 * gets its own stretch of wall from the slab's per-building `neon` (cartograph/neon-faces.mjs), joined by ADDRESS
 * (src/lib/addressKey.js — one canonical form for the bake and the player; within the building's own streets a loose
 * form also matches — spacing and a direction word one source carries and the other doesn't, addressKey#streetLoose):
 *   1. its address's face — the face its address point marks;
 *   2. else its own street's frontage — the building's face toward that street — COUNTED as such;
 *   3. else it stays dark, COUNTED BY CAUSE. ⛔ Never a whole-roofline fallback: a ring round the building would
 *      read as "placed" and hide that the place has no face.
 * Places claiming the same stretch share it, split along it in id order. A building none of whose places is lit
 * stays dark.
 */
import { addressParts, streetLoose } from './addressKey.js'

/** The reasons a lit place could not be placed — the census keys, so a reader can count them. */
export const UNPLACED = Object.freeze({
  slab: 'its building carries no neon stretches (a slab baked before them — re-bake buildings)',
  address: 'it has no address',
  street: 'its street is not one its building fronts',
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
  const census = { lit: 0, address: 0, frontage: 0, dark: {} }
  const dark = (why) => { census.dark[why] = (census.dark[why] || 0) + 1 }
  const stretches = []
  for (const e of entries) {
    // A record the slab built no walls for (a set-piece's building, SetPiece.jsx) has no wall to carry a sign.
    if (!e.ranges?.wall) continue
    const lit = (byBuilding.get(e.id) || []).filter(isLit)
    if (!lit.length || !keep(e.id)) continue
    lit.sort((a, b) => String(a.id).localeCompare(String(b.id)))
    const claims = new Map()   // a stretch → the places on it
    for (const p of lit) {
      census.lit++
      if (!e.neon) { dark(UNPLACED.slab); continue }
      const { house, street } = addressParts(p.address)
      if (!street) { dark(UNPLACED.address); continue }
      const loose = streetLoose(street)
      const sameStreet = (s) => s === street || streetLoose(s) === loose
      const faces = house ? (e.neon.faces || []).filter((f) => f.key.startsWith(`${house} `) && sameStreet(f.key.slice(house.length + 1))) : []
      const front = faces.length ? [] : (e.neon.frontage || []).filter((f) => sameStreet(f.street))
      if (faces.length) census.address++
      else if (front.length) census.frontage++
      else { dark(UNPLACED.street); continue }
      for (const s of faces.length ? faces : front) { if (!claims.has(s)) claims.set(s, []); claims.get(s).push(p) }
    }
    for (const [s, on] of claims) {
      const L = polyLen(s.pts)
      on.forEach((p, i) => {
        const pts = on.length === 1 ? s.pts : slice(s.pts, L * i / on.length, L * (i + 1) / on.length)
        if (pts.length >= 2) stretches.push({ id: p.id, buildingId: e.id, pts, y: s.y, footprint: e.footprint, groundYRaw: e.centroidY, category: p.category ?? null })
      })
    }
  }
  return { stretches, census }
}
