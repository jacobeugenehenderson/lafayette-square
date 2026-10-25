/**
 * THE EXTENT COMMIT'S RECORDS — what POST /<scene>/commit-extent writes, as a pure function (serve.js calls it; the
 * check runs it on every town). Extracted 2026-10-25 when a re-commit of LS's UNCHANGED extent was found to drop
 * neighborhood.json's `sides` (the LIVE extent mechanism) and `_note`, and to overwrite geography.json's `_comment`.
 *
 * ⭐ A COMMIT CARRIES EVERY KEY IT DOES NOT OWN, and a re-commit of unchanged inputs changes nothing. Each record starts
 * from the prior file and replaces only what the gesture addresses:
 *   geography.json   — owns `timezone` (from the hood's location); `_comment` only when the file has none.
 *   neighborhood.json — owns `draftRadius`, `timezone`, `exclusions`, `committed`, and `name` / `blurb` / `polygon` when
 *                       the request carries them. `sides`, `_note` and every other key are carried, in their order.
 *   neighborhood_boundary.json — the three records (boundaryRecords.mjs#composeBoundary), unchanged here.
 * ▶ node checks/claims-a-recommit-changes-nothing.mjs
 */
import { makeDiscRecord, composeBoundary } from './boundaryRecords.mjs'

/** One editable bezier loop (frame-independent lon/lat anchors + handles) → a closed x/z polygon in `geo`'s frame:
 *  each anchor and handle projected, every cubic segment sampled (18 steps); a segment with no handles is straight.
 *  Deterministic, no snap. Returns [{x, z}] or null. (Was serve.js#flattenBoundaryPath; one home now.) */
export function flattenBoundaryPath(boundaryPath, geo) {
  const A = boundaryPath?.anchors
  if (!Array.isArray(A) || A.length < 3) return null
  const r2 = (v) => Math.round(v * 100) / 100
  // lon/lat → local x/z in the committed frame (the same lonToMeters/latToMeters the buildings use, so membership lines up)
  const latToM = geo.latToMeters || 111000
  const proj = (p) => ({ x: (p.lon - geo.lon) * geo.lonToMeters, z: (geo.lat - p.lat) * latToM })
  const pts = A.map(a => ({ p: proj(a), hIn: a.handleIn ? proj(a.handleIn) : null, hOut: a.handleOut ? proj(a.handleOut) : null }))
  const cubic = (p0, c0, c1, p3, t) => {
    const u = 1 - t, w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t
    return { x: w0 * p0.x + w1 * c0.x + w2 * c1.x + w3 * p3.x, z: w0 * p0.z + w1 * c0.z + w2 * c1.z + w3 * p3.z }
  }
  const out = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    if (!(a.hOut || b.hIn)) { out.push({ x: r2(a.p.x), z: r2(a.p.z) }); continue }
    const c0 = a.hOut || a.p, c1 = b.hIn || b.p
    for (let k = 0; k < 18; k++) { const q = cubic(a.p, c0, c1, b.p, k / 18); out.push({ x: r2(q.x), z: r2(q.z) }) }
  }
  return out.length >= 3 ? out : null
}

/** The hood centre (lat/lon) → its x/z in the FROZEN frame (+z = south), to the centimetre. The frame never moves. */
export const discCenterOf = (geo, center) => {
  const latToM = geo.latToMeters || 111000
  return [Math.round(((center.lon - geo.lon) * geo.lonToMeters) * 100) / 100, Math.round(((geo.lat - center.lat) * latToM) * 100) / 100]
}

/**
 * → { geography, neighborhood, boundary } — the three objects a commit writes, from the prior ones and the request.
 * `prev.neighborhood` may be null (a first commit); `prev.boundaryRecords` is boundaryRecords.mjs#splitBoundary's output
 * or null. `timezone` is the caller's answer for the hood's location (null keeps the prior). Throws on a bad polygon.
 */
export function commitExtentRecords({ geo, prev, body, timezone, scene }) {
  const { center, radius, name, blurb, exclusions, polygon, polygonSource } = body
  const discCenter = discCenterOf(geo, center)
  // geography: carried; owns the timezone, and a comment only where there is none
  const geography = { ...geo }
  if (timezone) geography.timezone = timezone
  if (geography._comment == null) geography._comment = 'Committed extent — frame origin FROZEN at the fetch center (never moves); hood center stored off-origin on the disc. bbox = the fetch extent; timezone follows the hood location.'
  // boundary: the three records, starting from the prior ones (EXTENT-DESIGN §5.1)
  const disc = makeDiscRecord({ radius, center: discCenter, where: `${scene}/neighborhood_boundary.json` })
  // ⚠️ Exclusions are REQUEST-ONLY: the request states the whole set (Extent always sends one).
  const excl = Array.isArray(exclusions) ? exclusions.map(loop => flattenBoundaryPath(loop, geo)).filter(p => Array.isArray(p) && p.length >= 3) : []
  let membership = null
  if (Array.isArray(polygon) && polygon.length >= 3) {
    const polyXZ = flattenBoundaryPath({ closed: true, anchors: polygon }, geo)
    if (!Array.isArray(polyXZ) || polyXZ.length < 3) throw new Error('inclusion polygon flattened to fewer than 3 points')
    membership = { polygon: polyXZ, polygonSource: polygonSource || 'authored' }
  } else if (polygon != null && !Array.isArray(polygon)) {
    throw new Error('polygon must be an array of {lon,lat} anchors')
  } else if (prev.boundaryRecords?.membership) {
    membership = prev.boundaryRecords.membership   // no polygon supplied → the record is carried, not re-stated
  }
  const boundary = composeBoundary({ disc, membership, exclusions: excl.length ? excl : null,
    carry: prev.boundaryRecords?.carry ?? {}, keyOrder: prev.boundaryRecords?.keyOrder ?? [] })
  // neighborhood: CARRIED; owns the draft radius, the timezone, the exclusions and `committed`, and what the request states
  const neighborhood = { ...(prev.neighborhood || {}) }
  if (name !== undefined || !('name' in neighborhood)) neighborhood.name = name || ''
  if (blurb !== undefined || !('blurb' in neighborhood)) neighborhood.blurb = blurb || ''
  neighborhood.draftRadius = Math.round(radius)
  neighborhood.timezone = geography.timezone || null
  neighborhood.exclusions = exclusions || []
  neighborhood.committed = true
  if (Array.isArray(polygon) && polygon.length >= 3) { neighborhood.polygon = polygon; neighborhood.polygonSource = polygonSource || 'authored' }
  return { geography, neighborhood, boundary, discCenter, membership }
}

/** Deep JSON equality, as the file would read back. A commit writes a record only when its VALUE changed, so a re-commit
 *  of unchanged inputs leaves every file byte-identical (whatever whitespace an earlier writer used). */
export const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b)
