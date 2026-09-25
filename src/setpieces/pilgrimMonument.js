/**
 * The Pilgrim Monument: Provincetown's set-piece. The dimensions table, the placeholder
 * profile built from it, and the site math. Pure, with no React or three, so the renderer
 * (`src/components/PilgrimMonument.jsx`) and the check
 * (`checks/claims-pilgrim-monument-site.mjs`) read the SAME numbers.
 *
 * SOURCE: *Pilgrim Monument Dimensional Reconstruction Dossier v1* (9 pp.), converted from
 * Carpenter, *The Pilgrims and Their Monument* (1911). Jacob's copy, not committed. Its
 * confidence codes govern what is built here:
 *   D / C (documented / calculated) → DOSSIER below. Built as given.
 *   I     (inferred)                → INFERRED below. Parametric placeholder only.
 *   U     (unresolved)              → left out.
 *
 * DATUM (dossier p.1): Z = 0 is the top of the foundation = finished grade = tower base.
 * The original ground is Z = −5′, and the foundation bottom is Z = −13′. The 60′ below-grade
 * mass is omitted (dossier §3: "normally below grade and can be omitted").
 *
 * ══ THE DROP-IN SLOT: the contract for the artist's model ═══════════════════════════════
 * FILE      glTF 2.0 binary (.glb), at `public/setpieces/<look>/pilgrim-monument.glb`, then
 *           declared as `setPiece.model: 'setpieces/<look>/pilgrim-monument.glb'` in the
 *           town's instance module (`src/instances/provincetown.js`). Undeclared means the
 *           placeholder renders. Declared but unloadable throws: it never falls back to the
 *           placeholder.
 * UNITS     metres (the glTF default). Model at true size; the component applies no scale.
 * AXES      +Y up (the glTF default).
 * ORIGIN    base centre at Z = 0 (top of foundation = finished grade = tower base). Geometry
 *           below Z = 0 (the foundation shoulder, below-grade mass) is allowed and simply
 *           sinks into the hill.
 * FACING    tower faces square to the model's X and Z axes, with the SOUTH face (the one
 *           carrying the four shaft windows, dossier §1) facing +Z. The component turns +Z
 *           onto the footprint face nearest true south. ⚠️ OSM fixes the footprint's
 *           rotation only modulo 90°, so WHICH face is the window face is inferred (I).
 *           Confirm it against a photo when the model lands.
 * TOP       252′ 7.5″ (76.99 m) above the origin. The check measures the placeholder
 *           against this; measure the model the same way when it lands.
 * ════════════════════════════════════════════════════════════════════════════════════════
 */

export const FT = 0.3048
/** feet + inches → feet */
export const ft = (feet, inches = 0) => feet + inches / 12

// ── D / C: the documented table. ⛔ Nothing here is tuned; each value cites its page. ──
export const DOSSIER = Object.freeze({
  originalGroundZ:  ft(-5),        // p.1, D/C: original ground = 5′ below foundation top
  foundationTopSq:  ft(28),        // §3,  D:   foundation top 28′ × 28′
  baseSq:           ft(27),        // §1,  D:   tower begins 27′0″
  wash1:  { z: ft(16, 3),  sq: ft(25, 8) },   // §1, D/C: 21′3″ above original ground − 5′
  wash2:  { z: ft(28, 11), sq: ft(24, 4) },   // §1, D/C
  wash3:  { z: ft(39, 4),  sq: ft(23, 0) },   // §1, D/C: the 23′ shaft above
  gargoyle1Z:       ft(189),       // §5,  D:   first gargoyle, the lower limit of the crown zone
  balcony: { z: ft(204, 4), sq: ft(29, 6) },  // §5, D/C: 3′3″ projection past the 23′ shaft
  belfryTopSq:      ft(21, 4),     // §5,  D:   top of belfry square (its Z is U)
  topZ:             ft(252, 7.5),  // p.1, D:   top battlement above foundation
})

// ── I: the placeholder's inferred values. Parametric; the artist's model replaces them. ──
export const INFERRED = Object.freeze({
  // The balcony slab's thickness is not given (§8 #5). Only the deck TOP (D) is fixed.
  balconySlabFt: 1.5,
  // The belfry top's Z is U (§8 #7). The placeholder runs the 21′4″ square (a D width)
  // from the balcony deck to the battlement top, so the skyline reads at the right scale.
  upperStageFromZ: DOSSIER.balcony.z,
})

/**
 * The placeholder as stacked square prisms, bottom to top. Each is
 * `{ name, sq, z0, z1, status }` in FEET on the Z = 0 datum. Contiguous: each z0 is the
 * previous z1, except the balcony, which is a deck overlapping the shaft.
 */
export function placeholderStages(d = DOSSIER, inf = INFERRED) {
  return [
    // Foundation shoulder: 28′ square from the original ground (−5′) to Z = 0. This is the
    // documented above-original-ground part of the foundation, so it is also what covers
    // the terrain's spread under the footprint (see `seatOnTerrain`).
    { name: 'plinth',     sq: d.foundationTopSq, z0: d.originalGroundZ, z1: 0,            status: 'D' },
    { name: 'base',       sq: d.baseSq,          z0: 0,                 z1: d.wash1.z,    status: 'D' },
    { name: 'wash1',      sq: d.wash1.sq,        z0: d.wash1.z,         z1: d.wash2.z,    status: 'D/C' },
    { name: 'wash2',      sq: d.wash2.sq,        z0: d.wash2.z,         z1: d.wash3.z,    status: 'D/C' },
    // The 23′ shaft. The transition from 189′ to 204′4″ is I, so the placeholder holds 23′.
    { name: 'shaft',      sq: d.wash3.sq,        z0: d.wash3.z,         z1: inf.upperStageFromZ, status: 'D/C' },
    { name: 'balcony',    sq: d.balcony.sq,      z0: d.balcony.z - inf.balconySlabFt, z1: d.balcony.z, status: 'D/C deck, I slab' },
    { name: 'upperStage', sq: d.belfryTopSq,     z0: inf.upperStageFromZ, z1: d.topZ,     status: 'D width + top, I extent' },
  ]
}

/**
 * The site from the mapped footprint: centre, rotation and side length. `ring` is
 * `[[x, z], …]` in local metres (closed or open). The rotation is recovered modulo 90°,
 * averaging every edge on the 4θ circle, so midpoints and uneven vertex spacing don't bias it.
 */
export function siteFromFootprint(ring) {
  const pts = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]
    ? ring.slice(0, -1) : ring.slice()
  let area2 = 0, cx = 0, cz = 0, s = 0, c = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length]
    const cr = x0 * z1 - x1 * z0
    area2 += cr; cx += (x0 + x1) * cr; cz += (z0 + z1) * cr
    const len = Math.hypot(x1 - x0, z1 - z0), th = Math.atan2(z1 - z0, x1 - x0)
    s += len * Math.sin(4 * th); c += len * Math.cos(4 * th)
  }
  const x = cx / (3 * area2), z = cz / (3 * area2), yaw = Math.atan2(s, c) / 4
  // Extent along each footprint axis. The dossier governs SIZE; the map gives position and
  // rotation only, and Provincetown's mapped ring is not square (see the check).
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity
  for (const [px, pz] of pts) {
    const u = (px - x) * Math.cos(yaw) + (pz - z) * Math.sin(yaw)
    const v = -(px - x) * Math.sin(yaw) + (pz - z) * Math.cos(yaw)
    a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v)
  }
  return {
    x, z,
    yaw,                                // footprint edge direction, in (−45°, 45°]
    sidesM: [a1 - a0, b1 - b0].sort((p, q) => p - q),   // [short, long]
  }
}

/** The plinth's four corners plus its centre, in local metres, for a site. */
export function plinthSamplePoints(site, d = DOSSIER) {
  const h = (d.foundationTopSq * FT) / 2, cs = Math.cos(site.yaw), sn = Math.sin(site.yaw)
  const pts = [[site.x, site.z]]
  for (const [u, v] of [[h, h], [-h, h], [-h, -h], [h, -h]]) {
    pts.push([site.x + u * cs - v * sn, site.z + u * sn + v * cs])
  }
  return pts
}

/**
 * Seat Z = 0 on the terrain. Returns `{ groundRaw, spread }` in RAW metres, before the
 * exaggeration, which the renderer applies live because it tweens per shot. Z = 0 goes on
 * the LOWEST sampled point, so no corner floats. The uphill side sinks, and the plinth's
 * documented depth (5′, down to the original ground) is what it may sink by.
 * ⛔ If `spread` exceeds that depth, the site needs grading the kit cannot fake. The check
 * fails loudly on it; nothing here clamps.
 */
export function seatOnTerrain(getElevationRaw, site, d = DOSSIER) {
  const hs = plinthSamplePoints(site, d).map(([x, z]) => getElevationRaw(x, z))
  const lo = Math.min(...hs), hi = Math.max(...hs)
  return { groundRaw: lo, spread: hi - lo, samples: hs }
}

/** Which multiple of 90° turns model +Z onto the footprint face nearest true south (+Z local). */
export function southFacingYaw(site) {
  // A face normal for rotation r (about +Y, three.js convention) maps +Z to (sin r, cos r).
  // Candidates are the footprint yaw plus k·90°; pick the one whose normal is closest to +Z.
  let best = 0, bestDot = -Infinity
  for (let k = 0; k < 4; k++) {
    const r = -site.yaw + k * Math.PI / 2
    const dot = Math.cos(r)
    if (dot > bestDot) { bestDot = dot; best = r }
  }
  return best
}

/** lon/lat → the runtime's local frame (the same formula as `AerialTiles.wgs84ToLocal`). */
export function lonLatToLocal(geo, lon, lat) {
  return [(lon - geo.lon) * geo.lonToMeters, (geo.lat - lat) * geo.latToMeters]
}
