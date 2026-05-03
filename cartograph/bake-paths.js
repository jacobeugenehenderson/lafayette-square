/**
 * bake-paths.js — shared geometry for the per-Look bake pipeline.
 *
 * Reads ribbons.json and produces the canonical ring data that the
 * downstream bakes (bake-ground.js for the Three.js bundle, etc.) all
 * consume. One copy of the procedural ribbon math, the face-clip, and
 * the paint-order taxonomy lives here.
 *
 * Outputs from `buildPaths(ribbons)`:
 *   - byMaterial: Map<material, ring[]>           — ribbon bands (asphalt,
 *                                                   sidewalk, curb, lawn, …)
 *   - byFaceUse:  Map<use,      face[]>           — land-use fills, where
 *                                                   each face = {outer, holes}
 *                                                   pre-clipped against the
 *                                                   ribbon footprint
 *
 * The face-clip mirrors `StreetRibbons.jsx`'s runtime `clippedFaces`
 * useMemo (the live Designer geometry). Algorithm + constants must track
 * that source — drift = mismatched geometry between Designer and Stage.
 *
 * Coord space: ribbons.json uses [x,z] in meters, origin at neighborhood
 * center. 1 unit = 1 m.
 */

import {
  sideToStripes,
  CURB_WIDTH,
  innerEdgeMeasure,
  segmentRangesForCouplers,
} from '../src/cartograph/streetProfiles.js'
import clipperLib from 'clipper-lib'

// Land-use face fills. Authoring lives in CartographSurfaces; this is the
// fallback for pre-Look-customization or untouched uses.
export const LAND_USE_COLORS = {
  residential:        '#5A8A3A',
  commercial:         '#A87D3E',
  vacant:             '#7A6E5C',
  'vacant-commercial':'#9A7E54',
  parking:            '#7E7A72',
  institutional:      '#7A6E96',
  recreation:         '#5E9E5E',
  industrial:         '#7E6648',
  park:               '#5E8A3A',
  island:             '#5E8A3A',
  unknown:            '#666666',
}

// ── Geometry helpers ────────────────────────────────────────────────
// Per-vertex bisector-perpendicular, mirrors StreetRibbons.computePerps.
function computePerps(pts) {
  const n = pts.length
  return pts.map((_, i) => {
    let nx = 0, nz = 0
    if (i < n - 1) {
      const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1]
      const l = Math.hypot(dx, dz)
      if (l > 1e-9) { nx -= dz / l; nz += dx / l }
    }
    if (i > 0) {
      const dx = pts[i][0] - pts[i - 1][0], dz = pts[i][1] - pts[i - 1][1]
      const l = Math.hypot(dx, dz)
      if (l > 1e-9) { nx -= dz / l; nz += dx / l }
    }
    const l = Math.hypot(nx, nz)
    if (l < 1e-9) return [0, 1]
    return [nx / l, nz / l]
  })
}

function offsetPolyline(pts, perps, side, w) {
  return pts.map((p, i) => [p[0] + side * perps[i][0] * w, p[1] + side * perps[i][1] * w])
}

// One half-ring (one side of one stripe band): inner offset forward,
// outer offset backward — a closed strip polygon.
function bandRing(pts, perps, side, innerR, outerR) {
  const inner = offsetPolyline(pts, perps, side, innerR)
  const outer = offsetPolyline(pts, perps, side, outerR)
  const ring = []
  for (const p of inner) ring.push(p)
  for (let i = outer.length - 1; i >= 0; i--) ring.push(outer[i])
  return ring
}

// Round endcap (cul-de-sac): quarter-disk on one side.
function roundCapRing(endpoint, tangent, perp, side, innerR, outerR, segments = 12) {
  const ring = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * (Math.PI / 2)
    const dx = Math.cos(a) * tangent[0] + Math.sin(a) * side * perp[0]
    const dz = Math.cos(a) * tangent[1] + Math.sin(a) * side * perp[1]
    ring.push([endpoint[0] + dx * innerR, endpoint[1] + dz * innerR])
  }
  for (let i = segments; i >= 0; i--) {
    const a = (i / segments) * (Math.PI / 2)
    const dx = Math.cos(a) * tangent[0] + Math.sin(a) * side * perp[0]
    const dz = Math.cos(a) * tangent[1] + Math.sin(a) * side * perp[1]
    ring.push([endpoint[0] + dx * outerR, endpoint[1] + dz * outerR])
  }
  return ring
}

// ── Face clip vs ribbon footprint ───────────────────────────────────
// The pipeline emits faces UNCLIPPED (extending to street centerlines);
// we subtract the union of per-side ribbon outer edges (pavementHW + curb
// + treelawn + sidewalk) from each face here, so consumers see the clean
// block face instead of the raw centerline-reach polygon. Mirror of
// StreetRibbons.jsx:1466-1651 — keep them in sync.
const CLIP_SCALE = 1000
const ARC_N = 8

function inboardPedZonelessBake(street, baseMeasure) {
  if (street.anchor !== 'inner-edge' || !street.innerSign) return baseMeasure
  return innerEdgeMeasure(baseMeasure, street.innerSign)
}

function widthForSide(s) {
  if (!s) return 0
  const hw = s.pavementHW || 0, tl = s.treelawn || 0, sw = s.sidewalk || 0
  const cw = Number.isFinite(s.curb) ? s.curb : CURB_WIDTH
  if (!hw && !tl && !sw && (s.terminal === 'none' || !s.terminal)) return 0
  return hw + cw + tl + sw
}

function buildRibbonUnion(streets) {
  const { Clipper, PolyType, ClipType, PolyFillType, Paths } = clipperLib
  const toClipper = (x, z) => ({ X: Math.round(x * CLIP_SCALE), Y: Math.round(z * CLIP_SCALE) })
  const ribbonClipPaths = []
  for (const st of streets) {
    if (st.disabled) continue
    if (!st.points || st.points.length < 2) continue
    if (!st.measure?.left || !st.measure?.right) continue
    const perps = computePerps(st.points)
    const segRanges = segmentRangesForCouplers(st.points, st.couplers || [])
    const ranges = segRanges.length ? segRanges : [[0, st.points.length - 1]]
    for (let ord = 0; ord < ranges.length; ord++) {
      const [from, to] = ranges[ord]
      const baseM = (st.segmentMeasures && st.segmentMeasures[String(ord)]) || st.measure
      if (!baseM?.left || !baseM?.right) continue
      const m = inboardPedZonelessBake(st, baseM)
      const segPts = st.points.slice(from, to + 1)
      const segPp = perps.slice(from, to + 1)
      const outerL = widthForSide(m.left)
      const outerR = widthForSide(m.right)
      if (outerL <= 0 && outerR <= 0) continue
      const isFirstSeg = ord === 0
      const isLastSeg = ord === ranges.length - 1
      for (const [sideSign, W] of [[-1, outerL], [+1, outerR]]) {
        if (W <= 0) continue
        const outerEdge = offsetPolyline(segPts, segPp, sideSign, W)
        const ring = []
        for (const p of segPts) ring.push(toClipper(p[0], p[1]))
        if (isLastSeg && st.capEnds?.end === 'round' && segPts.length >= 2) {
          const last = segPts.length - 1
          const ep = segPts[last]
          const tdx = ep[0] - segPts[last - 1][0], tdz = ep[1] - segPts[last - 1][1]
          const tl = Math.hypot(tdx, tdz) || 1
          const tx = tdx / tl, tz = tdz / tl
          const px = segPp[last][0], pz = segPp[last][1]
          for (let i = 0; i < ARC_N; i++) {
            const a = (i / ARC_N) * (Math.PI / 2)
            const ca = Math.cos(a), sa = Math.sin(a)
            const dx = ca * tx + sa * sideSign * px
            const dz = ca * tz + sa * sideSign * pz
            ring.push(toClipper(ep[0] + dx * W, ep[1] + dz * W))
          }
        }
        for (let i = outerEdge.length - 1; i >= 0; i--) ring.push(toClipper(outerEdge[i][0], outerEdge[i][1]))
        if (isFirstSeg && st.capEnds?.start === 'round' && segPts.length >= 2) {
          const ep = segPts[0]
          const tdx = ep[0] - segPts[1][0], tdz = ep[1] - segPts[1][1]
          const tl = Math.hypot(tdx, tdz) || 1
          const tx = tdx / tl, tz = tdz / tl
          const px = segPp[0][0], pz = segPp[0][1]
          for (let i = 1; i <= ARC_N; i++) {
            const a = (i / ARC_N) * (Math.PI / 2)
            const ca = Math.cos(a), sa = Math.sin(a)
            const dx = ca * sideSign * px + sa * tx
            const dz = ca * sideSign * pz + sa * tz
            ring.push(toClipper(ep[0] + dx * W, ep[1] + dz * W))
          }
        }
        ribbonClipPaths.push(ring)
      }
    }
  }
  if (!ribbonClipPaths.length) return null
  const unionC = new Clipper()
  unionC.AddPaths(ribbonClipPaths, PolyType.ptSubject, true)
  const ribbonUnion = new Paths()
  unionC.Execute(ClipType.ctUnion, ribbonUnion, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return ribbonUnion
}

// Subtract `ribbonUnion` from `faces` (array of {ring, use}). Returns an
// array of {outer, holes, use} entries. Difference output is a PolyTree
// of outer rings + their hole rings; both bakes consume this shape so
// holes don't get triangulated as solid (the bug that produced the
// rotated-rectangle and lawn-occlusion symptoms).
function clipFacesAgainstRibbons(faces, ribbonUnion) {
  const toFaceWorld = (path) => path.map(p => [p.X / CLIP_SCALE, p.Y / CLIP_SCALE])
  if (!ribbonUnion || !ribbonUnion.length) {
    return faces.map(f => ({ outer: f.ring, holes: [], use: f.use }))
  }
  const { Clipper, PolyType, ClipType, PolyFillType, Paths, PolyTree } = clipperLib
  const toClipper = (x, z) => ({ X: Math.round(x * CLIP_SCALE), Y: Math.round(z * CLIP_SCALE) })
  const out = []
  for (const f of faces) {
    if (!f.ring || f.ring.length < 3) { out.push({ outer: f.ring, holes: [], use: f.use }); continue }
    const subj = new Paths()
    subj.push(f.ring.map(p => toClipper(p[0] ?? p.x, p[1] ?? p.z)))
    const diff = new Clipper()
    diff.AddPaths(subj, PolyType.ptSubject, true)
    diff.AddPaths(ribbonUnion, PolyType.ptClip, true)
    const tree = new PolyTree()
    diff.Execute(ClipType.ctDifference, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
    // Walk top-level outer polygons; each PolyNode at the top has IsHole=false
    // and its direct children are its hole rings. Nested outers (islands
    // inside holes) become their own top-level entries.
    const stack = tree.Childs().slice()
    while (stack.length) {
      const node = stack.shift()
      if (!node.IsHole()) {
        const outer = toFaceWorld(node.Contour())
        if (outer.length < 3) {
          for (const c of node.Childs()) stack.push(c)
          continue
        }
        const holes = []
        for (const child of node.Childs()) {
          if (child.IsHole()) {
            const h = toFaceWorld(child.Contour())
            if (h.length >= 3) holes.push(h)
            for (const gc of child.Childs()) stack.push(gc)
          }
        }
        out.push({ outer, holes, use: f.use })
      } else {
        for (const c of node.Childs()) stack.push(c)
      }
    }
  }
  return out
}

// ── Stencil clip (final pass) ───────────────────────────────────────
// After all ribbons + faces are emitted, intersect every ring with the
// neighborhood-stencil polygon (scaled to streetFade.outer + a buffer).
// Streets and paths get clipped here so the bake never carries geometry
// past the silhouette — Preview's fade can be soft instead of competing
// with off-canvas streets that extend past the canvas.
function clipAllToStencil(byMaterial, byFaceUse, stencilPolygon) {
  if (!stencilPolygon || stencilPolygon.length < 3) return
  const { Clipper, PolyType, ClipType, PolyFillType, Paths, PolyTree } = clipperLib
  const toClipper = (p) => ({ X: Math.round(p[0] * CLIP_SCALE), Y: Math.round(p[1] * CLIP_SCALE) })
  const toWorld   = (path) => path.map(p => [p.X / CLIP_SCALE, p.Y / CLIP_SCALE])
  const stencilC  = stencilPolygon.map(toClipper)

  for (const [mat, rings] of byMaterial) {
    const out = []
    for (const ring of rings) {
      if (!ring || ring.length < 3) continue
      const c = new Clipper()
      c.AddPath(ring.map(toClipper), PolyType.ptSubject, true)
      c.AddPath(stencilC,            PolyType.ptClip,    true)
      const sol = new Paths()
      c.Execute(ClipType.ctIntersection, sol, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
      for (const path of sol) {
        const w = toWorld(path)
        if (w.length >= 3) out.push(w)
      }
    }
    byMaterial.set(mat, out)
  }

  for (const [use, faces] of byFaceUse) {
    const out = []
    for (const f of faces) {
      if (!f.outer || f.outer.length < 3) continue
      const subj = new Paths()
      subj.push(f.outer.map(toClipper))
      for (const h of (f.holes || [])) {
        if (h.length >= 3) subj.push(h.map(toClipper))
      }
      const c = new Clipper()
      c.AddPaths(subj,    PolyType.ptSubject, true)
      c.AddPath(stencilC, PolyType.ptClip,    true)
      const tree = new PolyTree()
      c.Execute(ClipType.ctIntersection, tree, PolyFillType.pftEvenOdd, PolyFillType.pftNonZero)
      const stack = tree.Childs().slice()
      while (stack.length) {
        const node = stack.shift()
        if (!node.IsHole()) {
          const outer = toWorld(node.Contour())
          if (outer.length < 3) {
            for (const c2 of node.Childs()) stack.push(c2)
            continue
          }
          const holes = []
          for (const child of node.Childs()) {
            if (child.IsHole()) {
              const h = toWorld(child.Contour())
              if (h.length >= 3) holes.push(h)
              for (const gc of child.Childs()) stack.push(gc)
            }
          }
          out.push({ outer, holes })
        } else {
          for (const c2 of node.Childs()) stack.push(c2)
        }
      }
    }
    byFaceUse.set(use, out)
  }
}

// ── Bake (the canonical ring producer) ──────────────────────────────
// Output:
//   byMaterial: Map<material, ring[]>
//   byFaceUse:  Map<use,      [{outer, holes}]>
// `stencilPolygon` (optional): closed [x,z] polygon. If supplied, every
// ring is intersected with it as a final pass — bounds the bake to the
// silhouette so nothing extends past it.
export function buildPaths(ribbons, stencilPolygon = null) {
  const byMaterial = new Map()
  const byFaceUse = new Map()

  const pushMat = (mat, ring) => {
    if (!ring || ring.length < 3) return
    if (!byMaterial.has(mat)) byMaterial.set(mat, [])
    byMaterial.get(mat).push(ring)
  }
  const pushFace = (use, face) => {
    if (!face?.outer || face.outer.length < 3) return
    if (!byFaceUse.has(use)) byFaceUse.set(use, [])
    byFaceUse.get(use).push(face)
  }

  // Streets — per side, per stripe band, emit a polygon ring.
  // Sort by skelId for deterministic output.
  const streets = (ribbons.streets || []).slice().sort((a, b) => {
    const ak = a.skelId || a.name || ''
    const bk = b.skelId || b.name || ''
    return ak < bk ? -1 : ak > bk ? 1 : 0
  })

  // Face fills (land-use). Pipeline emits unclipped (centerline-reach);
  // subtract the ribbon footprint here so consumers don't have to re-clip
  // and so triangulation honors holes correctly.
  const ribbonUnion = buildRibbonUnion(streets)
  const facesRaw = (ribbons.faces || []).map(f => ({
    ring: (f.ring || []).map(p => Array.isArray(p) ? p : [p.x, p.z]),
    use: f.use || 'unknown',
  }))
  const facesClipped = clipFacesAgainstRibbons(facesRaw, ribbonUnion)
  const faces = facesClipped.slice().sort((a, b) => {
    if (a.use !== b.use) return a.use < b.use ? -1 : 1
    const ax = a.outer?.[0]?.[0] ?? 0, az = a.outer?.[0]?.[1] ?? 0
    const bx = b.outer?.[0]?.[0] ?? 0, bz = b.outer?.[0]?.[1] ?? 0
    if (ax !== bx) return ax - bx
    return az - bz
  })
  for (const f of faces) {
    pushFace(f.use, { outer: f.outer, holes: f.holes })
  }

  for (const st of streets) {
    if (!st.points || st.points.length < 2) continue
    if (st.disabled) continue
    const measure = st.measure
    if (!measure?.left || !measure?.right) continue
    const pts = st.points
    const perps = computePerps(pts)
    const caps = st.capEnds || { start: null, end: null }
    for (const [side, sideMeasure] of [[-1, measure.left], [+1, measure.right]]) {
      const stripes = sideToStripes(sideMeasure)
      for (const stripe of stripes) {
        const ring = bandRing(pts, perps, side, stripe.innerR, stripe.outerR)
        pushMat(stripe.material, ring)
      }
      const totalOuter = stripes.length ? stripes[stripes.length - 1].outerR : 0
      const totalInner = 0
      const capMat = stripes.length ? stripes[stripes.length - 1].material : 'asphalt'
      if (caps.start === 'round' && pts.length >= 2) {
        const ep = pts[0]
        const tdx = ep[0] - pts[1][0], tdz = ep[1] - pts[1][1]
        const tl = Math.hypot(tdx, tdz) || 1
        const tan = [tdx / tl, tdz / tl]
        pushMat(capMat, roundCapRing(ep, tan, perps[0], side, totalInner, totalOuter))
      }
      if (caps.end === 'round' && pts.length >= 2) {
        const i = pts.length - 1
        const ep = pts[i]
        const tdx = ep[0] - pts[i - 1][0], tdz = ep[1] - pts[i - 1][1]
        const tl = Math.hypot(tdx, tdz) || 1
        const tan = [tdx / tl, tdz / tl]
        pushMat(capMat, roundCapRing(ep, tan, perps[i], side, totalInner, totalOuter))
      }
    }
  }

  // Path ribbons (alleys, footways, cycleways, steps, paths) —
  // pavement-only single-material strips.
  const paths = (ribbons.paths || []).concat(ribbons.alleys || []).slice().sort((a, b) => {
    const ax = a.points?.[0]?.[0] ?? 0, bx = b.points?.[0]?.[0] ?? 0
    return ax - bx
  })
  for (const p of paths) {
    if (!p.points || p.points.length < 2) continue
    const hw = (p.pavedWidth || 3) / 2
    const perps = computePerps(p.points)
    const left  = offsetPolyline(p.points, perps, -1, hw)
    const right = offsetPolyline(p.points, perps, +1, hw)
    const ring = []
    for (const pt of left) ring.push(pt)
    for (let i = right.length - 1; i >= 0; i--) ring.push(right[i])
    const mat = p.kind === 'alley' ? 'asphalt' : (p.kind || 'footway')
    pushMat(mat, ring)
  }

  clipAllToStencil(byMaterial, byFaceUse, stencilPolygon)

  return { byMaterial, byFaceUse }
}
