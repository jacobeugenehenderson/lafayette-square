/**
 * buildPathRibbons — shared geometry for non-street ribbons (alleys,
 * footways, cycleways, steps, dirt paths).
 *
 * V2 (`buildBlockGeometryV2`) models street chains with full block-
 * structured emission (asphalt + curb + treelawn + sidewalk + corner
 * pads). Non-street ribbons don't carry that profile — they're just
 * pavement-only strips. This helper offsets each polyline by its
 * authored `pavedWidth` using Clipper (proper miter/round joints, no
 * self-intersection at sharp bends) and returns one ring set per kind.
 * Single source of truth: both `cartograph/bake-ground.js` and Designer's
 * `BlockGeometryV2Debug.jsx` consume it, so the bake and the live render
 * cannot drift.
 *
 * Cap modes (alleys only — others use per-kind defaults):
 *   - `square`  — flush butt cut at the endpoint (etOpenButt)
 *   - `rounded` — squared pad with filleted corners (etOpenSquare +
 *                 morphological-opening fillet by halfWidth × 0.4)
 *   - `round`   — true semicircle (etOpenRound)
 *
 * Input shape (from src/data/ribbons.json):
 *   ribbons.paths  = [{ kind, points, pavedWidth }]
 *   ribbons.alleys = [{ points, pavedWidth }]  // kind defaults to 'alley'
 *
 * Output: `Map<kind, ring[]>`. Empty kinds omitted.
 */

import clipperLib from 'clipper-lib'
import { differenceRings, intersectRings } from './buildBlockGeometryV2.js'

const SCALE = 1000
const toClipper = (p) => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })
const fromClipper = (p) => [p.X / SCALE, p.Y / SCALE]

// Tighter than Clipper's library default — visibly smooth at typical
// Designer / Preview zoom on 3-5m wide paths. SCALE=1000 → 25 units =
// 0.025m (2.5cm) max vertex drift from the true arc. Generates ~30
// segments around a halfWidth=1.5m semicircle (vs ~10 at the old 250).
const ARC_TOLERANCE = 25
// Fillet radius for the `rounded` cap mode, as a fraction of halfWidth.
// 0.4 gives a visibly rounded-rectangle silhouette without losing the
// "pad" feel — at halfWidth=2.25m (typical alley), fillet ≈ 0.9m.
const ROUNDED_FILLET_FRACTION = 0.4

// Per-kind cap default. Alleys terminate at parcel/fence/garage and get
// the operator-controlled universal dial (alleyCap). Other path kinds
// always use 'round' since they're typically organic / blending into
// terrain or other paths.
const DEFAULT_CAP_BY_KIND = {
  alley:    'square',
  footway:  'round',
  cycleway: 'round',
  steps:    'round',
  path:     'round',
}

function endTypeFor(cap) {
  const { EndType } = clipperLib
  switch (cap) {
    case 'square':  return EndType.etOpenButt
    case 'rounded': return EndType.etOpenSquare
    case 'round':
    default:        return EndType.etOpenRound
  }
}

// Morphological opening: erode by r then dilate by r, both with jtRound.
// Effect: rounds off convex corners with radius ~r, leaves the bulk of
// the polygon unchanged. Used to fillet the square pad produced by
// etOpenSquare into a rounded rectangle.
function filletRings(rings, r) {
  if (!rings.length || !(r > 0)) return rings
  const { ClipperOffset, JoinType, EndType } = clipperLib
  const erode = new ClipperOffset(2.0, ARC_TOLERANCE)
  for (const ring of rings) {
    if (!ring || ring.length < 3) continue
    erode.AddPath(ring.map(toClipper), JoinType.jtRound, EndType.etClosedPolygon)
  }
  const eroded = []
  erode.Execute(eroded, -r * SCALE)
  if (!eroded.length) return rings  // erosion would obliterate; keep original
  const dilate = new ClipperOffset(2.0, ARC_TOLERANCE)
  for (const path of eroded) dilate.AddPath(path, JoinType.jtRound, EndType.etClosedPolygon)
  const out = []
  dilate.Execute(out, r * SCALE)
  return out.map(path => path.map(fromClipper))
}

// Offset one open polyline into a closed ring set by `halfWidth` on
// both sides. JoinType.jtRound fillets interior bends. EndType chosen
// per cap mode; `rounded` does a second pass to fillet the pad corners.
function offsetPolyline(points, halfWidth, cap) {
  if (!points || points.length < 2 || !(halfWidth > 0)) return []
  const { ClipperOffset, JoinType } = clipperLib
  const co = new ClipperOffset(2.0, ARC_TOLERANCE)
  co.AddPath(points.map(toClipper), JoinType.jtRound, endTypeFor(cap))
  const raw = []
  co.Execute(raw, halfWidth * SCALE)
  const rings = raw.map(path => path.map(fromClipper))
  if (cap === 'rounded') {
    return filletRings(rings, halfWidth * ROUNDED_FILLET_FRACTION)
  }
  return rings
}

const DEFAULT_PAVED_WIDTH = 3

/**
 * Returns `Map<kind, ring[]>`. Empty kinds omitted.
 * `kind ∈ { 'alley', 'footway', 'cycleway', 'steps', 'path' }`.
 *
 * Options:
 *   alleyCap — universal cap mode for ALL alleys ('square'|'rounded'|'round').
 *              One global dial. Default 'square'.
 *   intersect — rings to clip paths INTO (parcel-interior union).
 *   subtract  — rings to clip paths AGAINST (less restrictive). Intersect
 *               wins if both provided.
 */
export function buildPathRibbons(ribbons, { alleyCap, intersect, subtract } = {}) {
  const out = new Map()
  const push = (kind, rings) => {
    if (!rings?.length) return
    if (!out.has(kind)) out.set(kind, [])
    for (const r of rings) if (r?.length >= 3) out.get(kind).push(r)
  }
  for (const p of (ribbons?.paths || [])) {
    const kind = p.kind || 'footway'
    const cap = DEFAULT_CAP_BY_KIND[kind] || 'round'
    push(kind, offsetPolyline(p.points, (p.pavedWidth || DEFAULT_PAVED_WIDTH) / 2, cap))
  }
  const ALLEY_CAP = alleyCap || DEFAULT_CAP_BY_KIND.alley
  for (const a of (ribbons?.alleys || [])) {
    push('alley', offsetPolyline(a.points, (a.pavedWidth || DEFAULT_PAVED_WIDTH) / 2, ALLEY_CAP))
  }
  const clipFn = intersect?.length
    ? (rings) => intersectRings(rings, intersect)
    : subtract?.length
    ? (rings) => differenceRings(rings, subtract)
    : null
  if (clipFn) {
    for (const [kind, rings] of out) {
      const clipped = clipFn(rings)
      if (clipped.length) out.set(kind, clipped)
      else out.delete(kind)
    }
  }
  return out
}
