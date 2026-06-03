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

// Render tessellation density is ARC-LENGTH based, NOT input-vertex-count
// based. The old code put a fixed `samplesPerSeg` (≈ round(t*8) = 4 at the
// default) on EVERY input segment regardless of length — so an already-dense
// frame got ×4-multiplied (Benton 29 → ~113) and the inward ped-band offset of
// that over-dense, unevenly-spaced ring bulged/pinched into thorns; a sparse
// frame got under-sampled. Targeting a uniform spacing instead makes smoothing
// a single authority that is ROBUST to input density: it neither re-densifies a
// clean (RDP-simplified) frame nor under-samples a sparse one. The smoothed
// CURVE is identical either way — these samples lie on the same centripetal
// Catmull-Rom spline; only the spacing between rendered points changes.
//
// `t` (the Smoothing slider) maps to the target spacing: higher t → tighter
// spacing → a visually smoother (less faceted) curve, preserving the slider's
// WYSIWYG meaning. 6 m at the t=0.5 default ≈ the old average density, but EVEN.
const SMOOTH_SPACING_AT_HALF = 6.0   // meters between samples at t = 0.5
function spacingFor(t) { return SMOOTH_SPACING_AT_HALF * 0.5 / Math.max(t, 0.05) }

// Centripetal Catmull-Rom (alpha = 0.5). Reparameterizing by sqrt(chord-
// length) is provably free of the overshoot/cusps uniform Catmull-Rom
// produces on non-uniformly-spaced polylines (LS chains are wildly
// non-uniform). Interpolating: passes through every authored vertex.
// Endpoints clamp (p0=p1, p3=p2); the 1e-6 chord floor keeps the knot
// sequence strictly increasing. `spacing` = target arc-length (m) between
// rendered samples; each input segment gets round(segLen/spacing) samples
// (≥1), so output density is uniform regardless of input vertex spacing.
function centripetalRun(pts, spacing) {
  const n = pts.length
  if (n < 2) return pts.slice()
  const knot = (ti, pa, pb) =>
    ti + Math.pow(Math.max(Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), 1e-6), 0.5)
  // A segment is locally STRAIGHT when neither of its endpoints bends (turn <
  // STRAIGHT_TOL). Such a segment needs no interpolation — emitting just its
  // start vertex keeps a straight grid run at ~2 pts (polygon-ready) instead of
  // re-densifying a long collinear segment with arc-length samples. Only genuine
  // curve facets get the arc-length tessellation.
  const turnAt = (idx) => (idx <= 0 || idx >= n - 1) ? 0 : turnDeg(pts, idx)
  const out = []
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i]
    const p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)]
    const t0 = 0, t1 = knot(t0, p0, p1), t2 = knot(t1, p1, p2), t3 = knot(t2, p2, p3)
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
    const straightSeg = Math.max(turnAt(i), turnAt(i + 1)) < STRAIGHT_TOL_DEG
    const samplesPerSeg = straightSeg ? 1 : Math.max(1, Math.round(segLen / spacing))
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
// `spacingOverride` (optional, meters) overrides the t-derived target spacing —
// used by wide ribbons (grade-separated highways, W≈17 m) that need a TIGHTER
// arc-length so the offset stroke doesn't gap/facet on tight ramp bends
// (RIBBONS §3.3). Default spacing comes from `t` via spacingFor().
export function smoothChain(pts, t, spacingOverride) {
  if (!Array.isArray(pts) || pts.length < 3) return null
  let anyBend = false
  const breaks = []   // interior corner vertices to preserve
  for (let i = 1; i < pts.length - 1; i++) {
    const a = turnDeg(pts, i)
    if (a > STRAIGHT_TOL_DEG) anyBend = true
    if (a > CORNER_TOL_DEG) breaks.push(i)
  }
  if (!anyBend) return null                       // dead straight → untouched
  const spacing = (Number.isFinite(spacingOverride) && spacingOverride > 0) ? spacingOverride : spacingFor(t)
  if (!breaks.length) return centripetalRun(pts, spacing)   // one gentle curve
  // Split into runs at each corner; smooth each; stitch (drop the shared
  // corner vertex repeated at run seams) so the corner stays a hard vertex.
  const out = []
  let start = 0
  const bounds = [...breaks, pts.length - 1]
  for (const end of bounds) {
    const run = centripetalRun(pts.slice(start, end + 1), spacing)
    for (let k = (start === 0 ? 0 : 1); k < run.length; k++) out.push(run[k])
    start = end
  }
  return out
}
