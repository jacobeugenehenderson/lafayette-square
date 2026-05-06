/**
 * intersectionGeometry.js — whole-intersection plug geometry.
 *
 * Given a vertex V and the legs of incident chains (each a half-line from V
 * outward with a ribbon width on each side), produces the polygon shapes
 * the consumer Clipper-unions to form the intersection footprint, plus the
 * per-corner arc polylines used for curb stroking.
 *
 * Pure JS, no THREE, no Clipper. Coords are [x, z] in meters.
 *
 * The intersection polygon is the Clipper-union of:
 *   - legShapes[]: rectangular spokes from V outward along each leg.
 *   - fillets[]:   wedge polygons rounding each concave corner between
 *                  CCW-adjacent legs.
 * cornerArcs[] are the arc polylines (one per fillet wedge) the consumer
 * offsets outward by CURB_WIDTH to emit the corner-arc curb stroke.
 *
 * Per-corner behavior:
 *   - R = 0 (Look's cornerRadiusScale = 0):     skip wedge → square corner.
 *   - Adjacent legs ≥ 175° (e.g. T-junction's   skip wedge → flat boundary
 *     "open" side; collinear cross):            (legShapes' union is flat).
 *   - Otherwise: fillet wedge bows from Q toward arc.
 */

// Highway → coarse class. Anything unknown (or `service`, `living_street`,
// `unclassified`) collapses to residential — Lafayette Square is dense urban
// and the NACTO low-end is the right default.
const HIGHWAY_CLASS = {
  motorway: 'motorway',
  motorway_link: 'motorway',
  trunk: 'motorway',
  trunk_link: 'motorway',
  primary: 'primary',
  primary_link: 'primary',
  secondary: 'secondary',
  secondary_link: 'secondary',
  tertiary: 'tertiary',
  tertiary_link: 'tertiary',
  residential: 'residential',
  unclassified: 'residential',
  service: 'residential',
  living_street: 'residential',
}

function classOf(highway) {
  return HIGHWAY_CLASS[highway] || 'residential'
}

// Sorted "a|b" key. AASHTO/NACTO baseline (BACKLOG.md:230-238). Dense-urban
// bias: residential at NACTO low end (4.5m); arterials at AASHTO mid-range.
export const CORNER_RADIUS_M = {
  'residential|residential': 4.5,
  'residential|tertiary':    6.0,
  'residential|secondary':   7.5,
  'primary|residential':     9.0,
  'motorway|residential':   15.0,
  'tertiary|tertiary':       7.5,
  'secondary|tertiary':      9.0,
  'primary|tertiary':       12.0,
  'motorway|tertiary':      15.0,
  'secondary|secondary':     9.0,
  'primary|secondary':      12.0,
  'motorway|secondary':     15.0,
  'primary|primary':        13.5,
  'motorway|primary':       15.0,
  'motorway|motorway':      15.0,
}

function classPair(highwayA, highwayB) {
  const ca = classOf(highwayA), cb = classOf(highwayB)
  return ca <= cb ? `${ca}|${cb}` : `${cb}|${ca}`
}

// Sharper angles between legs (smaller `angleDeg`) → larger radius for
// drivability (AASHTO).
function angleMult(angleDeg) {
  return Math.max(1, Math.min(1.5, 1 + (90 - angleDeg) / 90))
}

export function cornerRadiusFor(highwayA, highwayB, angleDeg, scale = 1) {
  const baseline = CORNER_RADIUS_M[classPair(highwayA, highwayB)] ?? 4.5
  return baseline * angleMult(angleDeg) * scale
}

// ── Geometry helpers ───────────────────────────────────────────────────
const TWO_PI = Math.PI * 2

function perpLeft(t) { return [-t[1], t[0]] }   // rotate +90° (left of T)
function add(a, b)   { return [a[0] + b[0], a[1] + b[1]] }
function sub(a, b)   { return [a[0] - b[0], a[1] - b[1]] }
function scale2(v, s){ return [v[0] * s, v[1] * s] }
function dot(a, b)   { return a[0] * b[0] + a[1] * b[1] }

function ccwAngle(tFrom, tTo) {
  const a = Math.atan2(tFrom[1], tFrom[0])
  const b = Math.atan2(tTo[1], tTo[0])
  let d = b - a
  while (d < 0) d += TWO_PI
  while (d >= TWO_PI) d -= TWO_PI
  return d
}

function sortLegsCCW(legs) {
  return legs.slice().sort((la, lb) =>
    Math.atan2(la.tangent[1], la.tangent[0]) -
    Math.atan2(lb.tangent[1], lb.tangent[0])
  )
}

// Fillet wedge between CCW-adjacent legs A, B at vertex V. The corner Q is
// the intersection of A's left outer edge with B's right outer edge; the
// arc center C sits on the outboard bisector at R/sin(θ/2) from Q; tangent
// points TA, TB are at R/tan(θ/2) along each edge from Q. Wedge polygon
// (CCW): Q → arc(TA→TB, CW around C, bowing toward Q) → close.
function buildFilletWedge(V, legA, legB, scale, override) {
  const T_A = legA.tangent, T_B = legB.tangent
  // Use the leg's bisector perp at V if provided (matches the leg ribbon's
  // computePerps output, eliminating the torque-spike at V where chains
  // bend through the intersection). Falls back to perpLeft(tangent) for
  // legs without bisector info.
  const P_A = legA.bisectorPerp || perpLeft(T_A)
  const P_B = legB.bisectorPerp || perpLeft(T_B)

  const theta = ccwAngle(T_A, T_B)
  const thetaDeg = theta * 180 / Math.PI
  if (thetaDeg >= 175 || thetaDeg <= 5) return null

  const R = (override != null && Number.isFinite(override))
    ? override
    : cornerRadiusFor(legA.highway, legB.highway, thetaDeg, scale)
  if (R <= 1e-6) return null

  const A0 = add(V, scale2(P_A,  legA.outerL))    // V + outerL_A * leftPerp_A
  const B0 = sub(V, scale2(P_B,  legB.outerR))    // V - outerR_B * leftPerp_B

  // [T_A | -T_B] · [s; t]^T = B0 - A0
  const det = T_A[0] * (-T_B[1]) - T_A[1] * (-T_B[0])
  if (Math.abs(det) < 1e-9) return null
  const d = sub(B0, A0)
  const s = (d[0] * (-T_B[1]) - d[1] * (-T_B[0])) / det
  const Q = add(A0, scale2(T_A, s))

  const halfTheta = theta / 2
  const distFromQ = R / Math.tan(halfTheta)
  if (!Number.isFinite(distFromQ) || distFromQ > 200) return null

  const TA = add(Q, scale2(T_A, distFromQ))
  const TB = add(Q, scale2(T_B, distFromQ))

  const bisAngle = Math.atan2(T_A[1], T_A[0]) + halfTheta
  const Cdist = R / Math.sin(halfTheta)
  const C = [Q[0] + Cdist * Math.cos(bisAngle), Q[1] + Cdist * Math.sin(bisAngle)]

  // CW sweep around C from TA to TB; passes near Q (the SHORT arc).
  const angStart = Math.atan2(TA[1] - C[1], TA[0] - C[0])
  const segs = Math.max(4, Math.ceil(theta * 12 / Math.PI))   // ~1 sample / 15°
  const arc = []
  for (let i = 0; i <= segs; i++) {
    const a = angStart - (i / segs) * theta
    arc.push([C[0] + R * Math.cos(a), C[1] + R * Math.sin(a)])
  }

  return {
    wedge: [Q, ...arc],
    arc: { points: arc, center: C, R, legA, legB },
    distV_A: dot(sub(TA, V), T_A),
    distV_B: dot(sub(TB, V), T_B),
  }
}

/**
 * offsetArcStrip(arcRecord, innerOffset, outerOffset)
 *
 * Builds a closed strip ring concentric with `arcRecord.points` (an arc
 * polyline around `arcRecord.center` at radius `arcRecord.R`). The strip's
 * inner edge is at radius (R - innerOffset), outer edge at (R - outerOffset).
 * "Outward" = toward arcRecord.center (the asphalt-polygon's filleted
 * corner has its center in the corner pad, away from the polygon interior).
 *
 * Use cases:
 *   curb stripe:    innerOffset=0,           outerOffset=CURB_WIDTH
 *   sidewalk pad:   innerOffset=CURB_WIDTH,  outerOffset=CURB_WIDTH + ped_zone
 *
 * Returns a CCW-ish closed polygon ([x,z] points).
 */
export function offsetArcStrip(arcRecord, innerOffset, outerOffset) {
  const { points, center, R } = arcRecord
  const Ri = R - innerOffset, Ro = R - outerOffset
  if (Ri <= 0 || Ro <= 0) return null
  const inner = points.map(p => {
    const t = Ri / R
    return [center[0] + (p[0] - center[0]) * t, center[1] + (p[1] - center[1]) * t]
  })
  const outer = points.map(p => {
    const t = Ro / R
    return [center[0] + (p[0] - center[0]) * t, center[1] + (p[1] - center[1]) * t]
  })
  const ring = []
  for (const p of inner) ring.push(p)
  for (let i = outer.length - 1; i >= 0; i--) ring.push(outer[i])
  return ring
}

// CCW rectangle from V outward `length` meters along leg.tangent, full
// ribbon width (outerL on left of T, outerR on right). Uses leg's
// bisector perp at V (if set) so the near-V corners land at exactly the
// leg ribbon's outer-edge endpoints at V — no torque spike at the corner.
// Far-V corners use leg.tangent direction (parallel rectangle), which
// approximates the leg ribbon for chains that don't bend within the
// rectangle's reach.
function buildLegRectangle(V, leg, length) {
  const T = leg.tangent
  const P = leg.bisectorPerp || perpLeft(T)
  const v_left_near  = add(V, scale2(P,  leg.outerL))
  const v_right_near = sub(V, scale2(P,  leg.outerR))
  const v_right_far  = add(v_right_near, scale2(T, length))
  const v_left_far   = add(v_left_near,  scale2(T, length))
  return [v_left_near, v_right_near, v_right_far, v_left_far]
}

/**
 * buildIntersectionPolygon(vertex, legs, opts)
 *
 *   vertex: [x, z]
 *   legs: [{
 *     tangent: [tx, tz],      // unit vector outward from V along the leg
 *     outerL: number,         // ribbon width on left of T  (perp = +90°)
 *     outerR: number,         // ribbon width on right of T (perp = -90°)
 *     highway: string,        // OSM class — drives baseline corner radius
 *     length?: number,        // max usable length before far end / next vertex
 *   }]
 *   opts:
 *     scale:    number = Look's cornerRadiusScale (default 1)
 *     override: number | null = per-vertex R override in meters (null = auto)
 *     bufferM:  number = extra length past the furthest tangent point (default 1)
 *
 * Returns:
 *   { legShapes, fillets, cornerArcs }   — each an array of [x,z] polylines
 *   or null if N < 2.
 *
 * Consumer Clipper-unions (legShapes ∪ fillets) for the polygon, and
 * offsets cornerArcs[] outward by CURB_WIDTH for the corner-arc curb stroke.
 */
export function buildIntersectionPolygon(vertex, legs, opts = {}) {
  if (!legs || legs.length < 2) return null
  const { scale = 1, override = null, bufferM = 1.0 } = opts

  const sorted = sortLegsCCW(legs)
  const N = sorted.length

  const fillets = new Array(N)
  for (let i = 0; i < N; i++) {
    fillets[i] = buildFilletWedge(vertex, sorted[i], sorted[(i + 1) % N], scale, override)
  }

  // Per-leg required length: max tangent distance among its two adjacent
  // corners + bufferM. If neither corner produced a fillet, fall back to
  // 2× max ribbon width (enough to clear the cross at V).
  const legShapes = []
  for (let i = 0; i < N; i++) {
    const leg = sorted[i]
    const ccwCorner = fillets[i]                          // uses leg i's left edge
    const cwCorner  = fillets[(i - 1 + N) % N]            // uses leg i's right edge
    let needed = 0
    if (ccwCorner) needed = Math.max(needed, ccwCorner.distV_A)
    if (cwCorner)  needed = Math.max(needed, cwCorner.distV_B)
    if (needed === 0) needed = Math.max(leg.outerL, leg.outerR) * 2
    needed += bufferM
    // Don't clamp to leg.length: derive.js sometimes splices an IX vertex
    // adjacent to an existing chain point, leaving the immediate-neighbor
    // distance very small. The leg-rectangle needs to reach the fillet's
    // tangent point (≈ R + buffer); the chain's actual ribbon extends far
    // enough that any overlap is harmlessly Clipper-unioned away.
    legShapes.push(buildLegRectangle(vertex, leg, needed))
  }

  const filletShapes = []
  const cornerArcs = []
  for (const f of fillets) {
    if (!f) continue
    filletShapes.push(f.wedge)
    cornerArcs.push(f.arc)
  }

  return { legShapes, fillets: filletShapes, cornerArcs }
}
