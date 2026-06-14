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

// Key for matching a point against the caller's junction set (rounded 0.01 m —
// junction coords are copied from the same skeleton vertex into each incident
// street, so they coincide exactly). Consumed by tileGround to mark junctions.
export const jKey = (x, z) => `${Math.round(x * 100)},${Math.round(z * 100)}`

// Smooth a chain (returns null = "leave untouched", caller keeps raw points).
// `spacingOverride` (optional, meters) overrides the t-derived target spacing —
// used by wide ribbons (grade-separated highways, W≈17 m) that need a TIGHTER
// arc-length so the offset stroke doesn't gap/facet on tight ramp bends
// (RIBBONS §3.3). Default spacing comes from `t` via spacingFor().
// `breakKeys` (optional, Set of jKey) marks JUNCTION nodes as HARD vertices so
// the centerline isn't rounded *through* an intersection. (NOTE: render-time
// smoothing is currently OFF — smooth=0 — so this whole path is dormant; kept
// consistent with tileGround's call signature.)
export function smoothChain(pts, t, spacingOverride, breakKeys) {
  if (!Array.isArray(pts) || pts.length < 3) return null
  let anyBend = false
  const breaks = []   // interior corner / junction vertices to preserve as hard
  for (let i = 1; i < pts.length - 1; i++) {
    const a = turnDeg(pts, i)
    if (a > STRAIGHT_TOL_DEG) anyBend = true
    const isJunction = breakKeys && breakKeys.has(jKey(pts[i][0], pts[i][1]))
    if (a > CORNER_TOL_DEG || isJunction) breaks.push(i)
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

// ⭐ THE ONE KNOB — the single street-smoothing tension. Applied once to the
// shared centerline source so the navy editable centerline AND the curb both
// derive from ONE smooth curve (true SSoT — SKELETON.md §3.5, RIBBONS.md §1
// the Derivation Chain). Turn this one value → the navy line, the curb offset,
// and the ped ribbon all move together, concentric by construction.
//
// It is an INTERNAL engineering constant, tuned once on the operator's eye and
// then baked — NOT a user-facing slider. A curved frame's offset-safe sample
// density has a CORRECT answer (sample finely enough that a W-wide concentric
// offset doesn't facet), not a preference; a correct rule belongs in the
// automatic pipeline, not on a knob the operator must find. (The old Smoothing
// slider was retired 2026-06-04 for exactly this reason.)
//
// t maps to ~3/t m sample spacing (spacingFor). EVERY consumer that smooths
// imports THIS constant — never hardcode a second value (that reintroduces the
// two-source desync the SSoT exists to kill).
//
// ⚠️ TEMPORARILY 0 (reverted 2026-06-14). The smooth centerline is correct, but it
// FEEDS the curb offset (offsetRingVariable), which is NOT robust on tight bends /
// acute junctions — smooth>0 exposed map-wide fold-spikes/spurs in the polygon
// (Jacob's zoomed-out eye). Sequence must be: land the ROBUST curb offset (D6a
// "proper" — POLYGON-FIRST §3, the Caltrop forensic) FIRST, THEN re-enable this knob
// (back to ~1.5) and tune. Until then 0 = known-good clean map.
export const STREET_SMOOTH = 0

// Junction keys (coords owned by ≥2 streets) = the HARD vertices smoothChain
// must PIN (never round the centerline through an intersection). The SINGLE
// shared definition every smoothing consumer reads (buildTileGround's curb walk
// + the MeasureOverlay navy draw) so they pin identically and the two stay
// concentric. `breakKeys` for smoothChain. (Distinct from skeleton.junctions —
// that includes dead-ends; this is the ≥2-streets RDP/smooth-protection set,
// SKELETON.md §2.)
export function junctionKeysOf(streets) {
  const coordStreets = new Map()
  for (const s of (streets || [])) {
    if (!s?.points) continue
    for (const p of s.points) {
      const k = jKey(p[0], p[1])
      let set = coordStreets.get(k); if (!set) { set = new Set(); coordStreets.set(k, set) }
      set.add(s)
    }
  }
  const keys = new Set()
  for (const [k, set] of coordStreets) if (set.size >= 2) keys.add(k)
  return keys
}
