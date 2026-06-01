// smoothCenterline — interpolating centripetal Catmull-Rom smoothing of a
// chain's GENTLE facets while preserving its sharp corners as hard vertices.
// Extracted verbatim from buildBlockGeometryV2.js (Camber's Phase-2a) so the
// figure-ground path, the tile path (tileGround.js), and the bake all smooth
// identically — one source of truth (WYSIWYG). No logic change on extraction.

// Turn angle (degrees) at interior vertex i — 0° = straight, 180° = reversal.
function turnDeg(pts, i) {
  const ax = pts[i][0] - pts[i - 1][0], az = pts[i][1] - pts[i - 1][1]
  const bx = pts[i + 1][0] - pts[i][0], bz = pts[i + 1][1] - pts[i][1]
  const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz)
  if (la < 1e-6 || lb < 1e-6) return 0
  const c = Math.max(-1, Math.min(1, (ax * bx + az * bz) / (la * lb)))
  return Math.acos(c) * 180 / Math.PI
}

//  • STRAIGHT_TOL (1°): a chain that never bends beyond this is dead straight
//    (the bulk of LS's grid) — pass it through untouched so the grid stays
//    pristine and we don't add collinear verts.
//  • CORNER_TOL (30°): vertices that turn harder than this are intentional
//    corners (a 90° street corner, a hairpin) — NOT curve facets. Split the
//    chain there and smooth each run independently, so the corner stays sharp
//    (keeps its authored R via applyRoundCornersToRing downstream).
const STRAIGHT_TOL_DEG = 1.0
const CORNER_TOL_DEG = 30.0

// Centripetal Catmull-Rom (alpha = 0.5). Reparameterizing by sqrt(chord-
// length) is provably free of the overshoot/cusps uniform Catmull-Rom
// produces on non-uniformly-spaced polylines (LS chains are wildly
// non-uniform). Interpolating: passes through every authored vertex.
// Endpoints clamp (p0=p1, p3=p2); the 1e-6 chord floor keeps the knot
// sequence strictly increasing.
function centripetalRun(pts, samplesPerSeg) {
  const n = pts.length
  if (n < 2) return pts.slice()
  const knot = (ti, pa, pb) =>
    ti + Math.pow(Math.max(Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), 1e-6), 0.5)
  const out = []
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i]
    const p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)]
    const t0 = 0, t1 = knot(t0, p0, p1), t2 = knot(t1, p1, p2), t3 = knot(t2, p2, p3)
    out.push([p1[0], p1[1]])
    for (let k = 1; k < samplesPerSeg; k++) {
      const t = t1 + (t2 - t1) * (k / samplesPerSeg)
      const lp = (a, b, ta, tb) => {
        const w = (tb - t) / (tb - ta), u = (t - ta) / (tb - ta)
        return [w * a[0] + u * b[0], w * a[1] + u * b[1]]
      }
      const A1 = lp(p0, p1, t0, t1), A2 = lp(p1, p2, t1, t2), A3 = lp(p2, p3, t2, t3)
      const B1 = lp(A1, A2, t0, t2), B2 = lp(A2, A3, t1, t3)
      out.push(lp(B1, B2, t1, t2))
    }
  }
  out.push([pts[n - 1][0], pts[n - 1][1]])
  return out
}

// Smooth a chain (returns null = "leave untouched", caller keeps raw points).
export function smoothChain(pts, t) {
  if (!Array.isArray(pts) || pts.length < 3) return null
  let anyBend = false
  const breaks = []   // interior corner vertices to preserve
  for (let i = 1; i < pts.length - 1; i++) {
    const a = turnDeg(pts, i)
    if (a > STRAIGHT_TOL_DEG) anyBend = true
    if (a > CORNER_TOL_DEG) breaks.push(i)
  }
  if (!anyBend) return null                       // dead straight → untouched
  const samplesPerSeg = Math.max(1, Math.round(t * 8))
  if (!breaks.length) return centripetalRun(pts, samplesPerSeg)   // one gentle curve
  // Split into runs at each corner; smooth each; stitch (drop the shared
  // corner vertex repeated at run seams) so the corner stays a hard vertex.
  const out = []
  let start = 0
  const bounds = [...breaks, pts.length - 1]
  for (const end of bounds) {
    const run = centripetalRun(pts.slice(start, end + 1), samplesPerSeg)
    for (let k = (start === 0 ? 0 : 1); k < run.length; k++) out.push(run[k])
    start = end
  }
  return out
}
