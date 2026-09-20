// discSquare.mjs — THE SQUARE IS DERIVED FROM THE DISC.
//
// `_archive/EXTENT-EXCAVATION-DIARY §0.1` / `§0.4`, Jacob's ruled spec: the HEAVY
// pass is "scoped to the square containing the DISC, + padding", squared in METRES
// "because the disc is a circle and a circle cannot fit a rectangle narrower than
// its diameter."
//
// ⭐ THE POINT, AND IT IS THE WHOLE POINT (`§0.1`): "`bbox ⊇ disc` becomes true by
// construction. Today the box is framed BEFORE the disc is known, which is why
// Altadena's disc runs 981 m past its own data and LS's runs 226 m. If the heavy
// fetch is derived from the disc, the invariant is not a check to add — IT STOPS
// BEING EXPRESSIBLE."
//
// ⛔ So this module is the cure for a whole class, not a helper. Anything that
// fetches, clips or bakes to an envelope derives it HERE, from the disc, and the
// containment failure cannot be authored. A caller that computes its own square
// has reintroduced the defect.
//
// The operator-visible symptom this closes (Jacob, 2026-09-19, on Huron): "the
// square doesn't center the circle." It didn't, because nothing ever squared
// around the circle — the envelope came from the SEARCH and the disc floated
// inside it wherever the hood happened to be.

/** Padding beyond the disc rim — the "forever safety zone" (`EXTENT-DESIGN §3.3`).
 *  ⛔ A PERCENTAGE, never an absolute distance: "a fixed 1000 m is enormous on a
 *  tiny hood, trivial on a big one." 25% is the top of the ruled 20–25% band. */
export const ZONE_PAD = 0.25

/** ⛔ A metre of slack, because a sub-metre shortfall is float dust, not a finding.
 *  Lafayette Square's envelope is EXACTLY radius x 1.25 — it lands on the line to
 *  within centimetres, and without this the gate refuses the one scene that sizes
 *  itself perfectly. A gate that fails on its own best case teaches people to bypass it. */
export const TOLERANCE_M = 1

const LAT_M = 111000
const lonM = (lat) => 111320 * Math.cos((lat * Math.PI) / 180)

/**
 * The square the heavy fetch must cover for a given disc.
 * @param {{lon:number, lat:number}} center  the DISC centroid (the hood centre) — ⛔ not the frame origin
 * @param {number} radiusM                   the disc radius in metres
 * @param {number} [pad]                     fraction beyond the rim (default ZONE_PAD)
 * @returns {{minLon,minLat,maxLon,maxLat,halfM:number}}
 */
export function squareAroundDisc(center, radiusM, pad = ZONE_PAD) {
  if (!center || !Number.isFinite(center.lon) || !Number.isFinite(center.lat)) {
    throw new Error('squareAroundDisc: need a disc centre {lon, lat}')
  }
  if (!Number.isFinite(radiusM) || radiusM <= 0) {
    throw new Error(`squareAroundDisc: need a positive radius (got ${radiusM})`)
  }
  // Half-width in METRES, then converted per axis — squaring in degrees would give
  // a box that is square on paper and oblong on the ground everywhere but the equator.
  const halfM = radiusM * (1 + pad)
  const dLat = halfM / LAT_M
  const dLon = halfM / lonM(center.lat)
  return {
    minLon: center.lon - dLon, maxLon: center.lon + dLon,
    minLat: center.lat - dLat, maxLat: center.lat + dLat,
    halfM,
  }
}

/**
 * Does `outer` contain `inner`? Reports the shortfall PER SIDE in metres, because
 * "it doesn't fit" is not actionable and "the north side is 981 m short" is.
 * ⭐ The failure this catches is SILENT on screen — nothing errors, the streets
 * just stop, and you only find it by looking at that one compass direction.
 */
export function containment(outer, inner, tolM = TOLERANCE_M) {
  const midLat = (inner.minLat + inner.maxLat) / 2
  const lm = lonM(midLat)
  const short = {
    north: (outer.maxLat - inner.maxLat) * LAT_M,
    south: (inner.minLat - outer.minLat) * LAT_M,
    east: (outer.maxLon - inner.maxLon) * lm,
    west: (inner.minLon - outer.minLon) * lm,
  }
  const sides = Object.entries(short)
    .filter(([, m]) => m < -tolM)
    .map(([s, m]) => ({ side: s, shortM: -m }))
  return { ok: sides.length === 0, shortfall: short, failing: sides }
}

/**
 * The smallest circle containing every point — Welzl, randomized, expected O(n).
 *
 * ⭐ THIS IS WHAT "CIRCUMSCRIBE THE TINT" HAS TO MEAN. The obvious alternative —
 * centre on the bounding box, take the farthest vertex — produces a circle that
 * touches the shape at exactly ONE point and gaps everywhere else, so the shape
 * reads as shoved toward that point. (Jacob, 2026-09-19, on Huron: "the tint still
 * doesn't seem truly centered in the circle.") The minimum enclosing circle touches
 * at two or three points by construction, which is what balanced means geometrically.
 *
 * ⛔ It also removes the last place a BBOX was acting as a primitive. A bounding box
 * is an axis-aligned accident of how a shape happens to sit against north; a town on
 * a diagonal shoreline is exactly where that accident is largest.
 *
 * @param {Array<{x:number,z:number}>} pts
 * @returns {{x:number,z:number,r:number}|null}
 */
export function minimumEnclosingCircle(pts) {
  if (!pts?.length) return null
  const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
  const has = (c, p) => !!c && d(c, p) <= c.r + 1e-7
  const from2 = (a, b) => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, r: d(a, b) / 2 })
  const from3 = (a, b, c) => {
    const A = b.x - a.x, B = b.z - a.z, C = c.x - a.x, D = c.z - a.z
    const E = A * (a.x + b.x) + B * (a.z + b.z)
    const F = C * (a.x + c.x) + D * (a.z + c.z)
    const G = 2 * (A * (c.z - b.z) - B * (c.x - b.x))
    if (Math.abs(G) < 1e-12) return null      // collinear
    const x = (D * E - B * F) / G, z = (A * F - C * E) / G
    return { x, z, r: Math.hypot(a.x - x, a.z - z) }
  }
  // Deterministic shuffle — a fixed seed, so the same tint always yields the same
  // disc. An operator re-opening a hood must not find the circle a metre different.
  const p = pts.slice()
  let seed = 0x2f6e2b1
  for (let i = p.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const j = seed % (i + 1)
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  let c = null
  for (let i = 0; i < p.length; i++) {
    if (has(c, p[i])) continue
    c = { x: p[i].x, z: p[i].z, r: 0 }
    for (let j = 0; j < i; j++) {
      if (has(c, p[j])) continue
      c = from2(p[i], p[j])
      for (let k = 0; k < j; k++) {
        if (has(c, p[k])) continue
        c = from3(p[i], p[j], p[k]) || c
      }
    }
  }
  return c
}
