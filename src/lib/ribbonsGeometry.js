/**
 * ribbonsGeometry.js — single source of truth for ribbon clipping +
 * triangulation, called by both Designer's live render
 * (StreetRibbons.jsx) and the offline Stage bake (bake-ground.js).
 *
 * Pure JS, no React, no THREE. Inputs: a ribbons object with the
 * operator-intent already resolved (Designer merges live state via
 * useCartographStore.js:_loadCenterlines; bake reads ribbons.json
 * which derive.js has already merged overlay.json into). Output:
 * canonical ring data the consumer turns into meshes.
 *
 * Outputs from `buildRibbonGeometry(ribbons, { stencilPolygon?, cornerRadiusScale? })`:
 *   - byMaterial: Map<material, ring[]>           — ribbon bands
 *                                                   (asphalt, sidewalk,
 *                                                   curb, lawn, …)
 *   - byFaceUse:  Map<use,      face[]>           — land-use fills,
 *                                                   each face = {outer,
 *                                                   holes}, pre-clipped
 *                                                   against the ribbon
 *                                                   footprint
 *
 * History: this lived in `cartograph/bake-paths.js` with a separate
 * parallel implementation embedded in `StreetRibbons.jsx`'s
 * `clippedFaces` useMemo. The two drifted; Stage geometry diverged
 * from Designer Preview. Consolidated 2026-05-04 into this shared
 * helper. If you find yourself adding the same logic in two places
 * again, stop — extend the helper instead.
 *
 * Coord space: ribbons.json uses [x,z] in meters, origin at
 * neighborhood center. 1 unit = 1 m.
 */

import {
  sideToStripes,
  CURB_WIDTH,
  innerEdgeMeasure,
  segmentRangesForCouplers,
  measureForSegment,
  resolveInserts,
} from '../cartograph/streetProfiles.js'
import clipperLib from 'clipper-lib'

// Bands that run unbroken through intersections (driving surfaces). Mirror
// of FULL_LENGTH_BANDS in StreetRibbons.jsx:781 — keep in sync. All other
// stripe materials (sidewalk, curb, treelawn, lawn) split at IX vertices so
// corner plugs can later substitute (live render only; bake just emits the
// split rings without plug fill, matching live's underlying stripe layer).
const FULL_LENGTH_BANDS = new Set(['asphalt', 'highway', 'gutter', 'parking-parallel', 'parking-angled'])

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

// Default corner-plug fillet radius if an intersection has no per-IX
// override. Matches StreetRibbons.jsx's CORNER_RADIUS_M default.
const DEFAULT_CORNER_R = 4.5

// Build per-corner annular-sector clip paths from intersections data.
// Each corner pad covers area between curb arc (R_curb from C) and pad
// arc (R_curb − min_ped from C). Used so parcel faces get carved by the
// SAME concentric arc the rendered pad uses — keeps the inner-grass
// edge concentric instead of leaving the parcel's raw L corner. Mirror
// of buildSidewalkPads() in StreetRibbons.jsx; if you change one,
// change the other.
function buildCornerPadClips(streets, intersections, scale = 1, overrides = {}, cornerOverrides = {}) {
  if (!intersections?.length) return []
  const TWO_PI = Math.PI * 2
  const toClipper = (p) => ({ X: Math.round(p[0] * CLIP_SCALE), Y: Math.round(p[1] * CLIP_SCALE) })
  const ixKey = (p) => `${(+p[0]).toFixed(3)},${(+p[1]).toFixed(3)}`
  // Stable leg identity = "<skelId>:<dir>". Direction 'b' = back from V toward
  // the previous chain vertex; 'f' = forward toward the next. Mirror of the
  // store's legKey helper; if you change the format, change both.
  const legKey = (skel, dir) => `${skel || '?'}:${dir === -1 || dir === 'b' ? 'b' : 'f'}`
  // Composite per-corner key. Sort the two leg keys so authoring is invariant
  // under (A,B) ↔ (B,A) swap. Mirror of the store's cornerKey helper.
  const cornerKey = (V, lkA, lkB) => {
    const [a, b] = (lkA <= lkB) ? [lkA, lkB] : [lkB, lkA]
    return `${ixKey(V)}|${a}|${b}`
  }
  const streetByName = new Map(streets.map(s => [s.name, s]))
  const out = []
  for (const ix of intersections) {
    if (!ix.streets || ix.streets.length < 2) continue
    if (ix.disabled) continue
    const V = ix.point
    // IX-level fallback radius (per-IX override → data-file → AASHTO default).
    // Per-corner overrides are applied INSIDE the corner loop below; this is
    // the value those overrides fall back to.
    const ixOverrideR = overrides[ixKey(V)]
    const baseR_ix = Number.isFinite(ixOverrideR) ? ixOverrideR
      : Number.isFinite(ix.cornerRadius) ? ix.cornerRadius
      : DEFAULT_CORNER_R

    const legs = []
    for (const sref of ix.streets) {
      const chain = streetByName.get(sref.name)
      if (!chain) continue
      const m = chain.measure
      if (!m?.left?.pavementHW || !m?.right?.pavementHW) continue
      const ixIdx = sref.ix
      const pts = chain.points
      const v = pts[ixIdx]
      if (!v) continue
      if (Math.hypot(v[0] - V[0], v[1] - V[1]) >= 0.5) continue
      const skel = chain.skelId || chain.name
      const buildLeg = (direction) => {
        const ni = ixIdx + direction
        if (ni < 0 || ni >= pts.length) return null
        const dx = pts[ni][0] - V[0], dz = pts[ni][1] - V[1]
        const L = Math.hypot(dx, dz)
        if (L < 1e-6) return null
        const isBack = direction === -1
        const left  = isBack ? m.right : m.left
        const right = isBack ? m.left  : m.right
        const tlSafe = (s) => (s.terminal === 'sidewalk') ? (s.treelawn || 0) : 0
        const swSafe = (s) => (s.terminal === 'sidewalk') ? (s.sidewalk || 0) : 0
        return {
          T: [dx / L, dz / L],
          outerL: left.pavementHW || 0,
          outerR: right.pavementHW || 0,
          leftPed:  tlSafe(left)  + swSafe(left),
          rightPed: tlSafe(right) + swSafe(right),
          leftTreelawn:  tlSafe(left),
          rightTreelawn: tlSafe(right),
          legKey: legKey(skel, direction),
        }
      }
      if (ixIdx > 0) { const l = buildLeg(-1); if (l) legs.push(l) }
      if (ixIdx < pts.length - 1) { const l = buildLeg(+1); if (l) legs.push(l) }
    }
    if (legs.length < 2) continue
    legs.sort((a, b) => Math.atan2(a.T[1], a.T[0]) - Math.atan2(b.T[1], b.T[0]))

    for (let i = 0; i < legs.length; i++) {
      const A = legs[i], B = legs[(i + 1) % legs.length]
      const T_A = A.T, T_B = B.T
      const P_A = [-T_A[1], T_A[0]]
      const P_B = [-T_B[1], T_B[0]]
      let theta = Math.atan2(T_B[1], T_B[0]) - Math.atan2(T_A[1], T_A[0])
      while (theta < 0) theta += TWO_PI
      while (theta >= TWO_PI) theta -= TWO_PI
      const thetaDeg = theta * 180 / Math.PI
      if (thetaDeg <= 5 || thetaDeg >= 175) continue
      // Per-corner radius resolution: per-corner override → IX fallback (per-IX
      // override or data-file or default), then × scale. Per-corner radii give
      // each corner of an IX its own value (Phase 3 of the corner-authoring
      // kit); per-IX is the bulk control via the center handle.
      const ckey = cornerKey(V, A.legKey, B.legKey)
      const cornerOverrideR = cornerOverrides[ckey]
      const baseR = Number.isFinite(cornerOverrideR) ? cornerOverrideR : baseR_ix
      const cornerR = baseR * scale
      const R_curb = cornerR - CURB_WIDTH
      if (R_curb <= 0) continue
      const halfTheta = theta / 2
      const sinH = Math.sin(halfTheta)
      const tanH = Math.tan(halfTheta)
      const A0 = [V[0] + (A.outerL + CURB_WIDTH) * P_A[0], V[1] + (A.outerL + CURB_WIDTH) * P_A[1]]
      const B0 = [V[0] - (B.outerR + CURB_WIDTH) * P_B[0], V[1] - (B.outerR + CURB_WIDTH) * P_B[1]]
      const det = T_A[0] * (-T_B[1]) - T_A[1] * (-T_B[0])
      if (Math.abs(det) < 1e-9) continue
      const dxQ = B0[0] - A0[0], dzQ = B0[1] - A0[1]
      const sQ = (dxQ * (-T_B[1]) - dzQ * (-T_B[0])) / det
      const Q_curb = [A0[0] + sQ * T_A[0], A0[1] + sQ * T_A[1]]
      const distFromQ = R_curb / tanH
      if (!Number.isFinite(distFromQ) || distFromQ > 200) continue
      const TA_curb = [Q_curb[0] + distFromQ * T_A[0], Q_curb[1] + distFromQ * T_A[1]]
      const TB_curb = [Q_curb[0] + distFromQ * T_B[0], Q_curb[1] + distFromQ * T_B[1]]
      const bisAng = Math.atan2(T_A[1], T_A[0]) + halfTheta
      const Cdist = R_curb / sinH
      const C = [Q_curb[0] + Cdist * Math.cos(bisAng), Q_curb[1] + Cdist * Math.sin(bisAng)]

      if (A.leftPed <= 0 && B.rightPed <= 0) continue
      // Mirror StreetRibbons.jsx — scan all four sides for the smallest
      // sidewalk width so R_pad is uniform across corners. Per-corner-
      // decoupled variant deferred to the dedicated asymmetric-corner pass
      // (see note in StreetRibbons.jsx:buildSidewalkPads).
      const minPed = Math.min(A.leftPed, A.rightPed, B.leftPed, B.rightPed)
      const R_pad = R_curb - minPed
      const TA_padarc = [TA_curb[0] + minPed * P_A[0], TA_curb[1] + minPed * P_A[1]]
      const TB_padarc = [TB_curb[0] - minPed * P_B[0], TB_curb[1] - minPed * P_B[1]]

      const arcStart = Math.atan2(TA_curb[1] - C[1], TA_curb[0] - C[0])
      const arcSegs = Math.max(6, Math.ceil(theta * 12 / Math.PI))
      const ring = []
      ring.push(toClipper(TA_curb))
      ring.push(toClipper(TA_padarc))
      if (R_pad > 0.05) {
        const angA_pad = Math.atan2(TA_padarc[1] - C[1], TA_padarc[0] - C[0])
        const angB_pad = Math.atan2(TB_padarc[1] - C[1], TB_padarc[0] - C[0])
        let dAB = angB_pad - angA_pad
        if (dAB > Math.PI) dAB -= 2 * Math.PI
        if (dAB < -Math.PI) dAB += 2 * Math.PI
        for (let k = 1; k < 8; k++) {
          const t = k / 8
          const a = angA_pad + t * dAB
          ring.push(toClipper([C[0] + R_pad * Math.cos(a), C[1] + R_pad * Math.sin(a)]))
        }
      }
      ring.push(toClipper(TB_padarc))
      ring.push(toClipper(TB_curb))
      for (let k = arcSegs - 1; k >= 1; k--) {
        const a = arcStart - (k / arcSegs) * theta
        ring.push(toClipper([C[0] + R_curb * Math.cos(a), C[1] + R_curb * Math.sin(a)]))
      }
      out.push(ring)
    }
  }
  return out
}

function buildRibbonUnion(streets, intersections, cornerRadiusScale = 1, cornerRadiusOverrides = {}, cornerCornerRadiusOverrides = {}) {
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
  // Add corner-pad annular sectors so face clipping carves the parcel's
  // L corner with the same concentric arc the rendered pad uses.
  const cornerPads = buildCornerPadClips(streets, intersections, cornerRadiusScale, cornerRadiusOverrides, cornerCornerRadiusOverrides)
  for (const ring of cornerPads) ribbonClipPaths.push(ring)
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
export function clipAllToStencil(byMaterial, byFaceUse, stencilPolygon) {
  if (!stencilPolygon || stencilPolygon.length < 3) return
  const { Clipper, PolyType, ClipType, PolyFillType, Paths, PolyTree } = clipperLib
  const toClipper = (p) => ({ X: Math.round(p[0] * CLIP_SCALE), Y: Math.round(p[1] * CLIP_SCALE) })
  const toWorld   = (path) => path.map(p => [p.X / CLIP_SCALE, p.Y / CLIP_SCALE])
  const stencilC  = stencilPolygon.map(toClipper)

  for (const [mat, rings] of byMaterial) {
    const out = []
    for (const item of rings) {
      if (!item) continue
      // Polymorphic: byMaterial entries may be bare rings (V1, paths, OSM
      // overlays) OR {outer, holes} polygons (V2's Clipper output via the
      // bake adapter). Holed polygons go through the same PolyTree path
      // byFaceUse uses below so the result preserves outer/hole topology.
      if (Array.isArray(item)) {
        if (item.length < 3) continue
        const c = new Clipper()
        c.AddPath(item.map(toClipper), PolyType.ptSubject, true)
        c.AddPath(stencilC,            PolyType.ptClip,    true)
        const sol = new Paths()
        c.Execute(ClipType.ctIntersection, sol, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
        for (const path of sol) {
          const w = toWorld(path)
          if (w.length >= 3) out.push(w)
        }
      } else if (item.outer && item.outer.length >= 3) {
        const subj = new Paths()
        subj.push(item.outer.map(toClipper))
        for (const h of (item.holes || [])) {
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
            if (outer.length < 3) { for (const c2 of node.Childs()) stack.push(c2); continue }
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
// opts:
//   stencilPolygon  — closed [x,z] polygon. If supplied, every ring is
//                     intersected with it as a final pass; bounds the
//                     bake to the silhouette so nothing extends past it.
//   cornerRadiusScale — Look-level multiplier on every IX corner radius
//                     (default 1). Applies to per-IX overrides AND the
//                     baseline default at buildCornerPadClips.
export function buildRibbonGeometry(ribbons, opts = {}) {
  // Back-compat: legacy callers passed stencilPolygon as the 2nd arg
  // (an Array of [x,z] points). Detect and rewrap.
  if (Array.isArray(opts)) opts = { stencilPolygon: opts }
  const { stencilPolygon = null, cornerRadiusScale = 1, cornerRadiusOverrides = {}, cornerCornerRadiusOverrides = {} } = opts

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
  const ribbonUnion = buildRibbonUnion(streets, ribbons.intersections || [], cornerRadiusScale, cornerRadiusOverrides, cornerCornerRadiusOverrides)
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

  // Stripe emission. Mirrors the wrapping logic in StreetRibbons.jsx
  // `meshes` useMemo (around L783-905) so Designer Preview and the Stage
  // bake see identical per-side band geometry. What's accounted for here:
  //   - segmentRangesForCouplers walks split couplers per chain
  //   - measureForSegment overrides chain measure per-segment ordinal
  //   - inboardPedZoneless zeroes ped zone on the inboard side of
  //     inner-edge-anchored chains (median half-roads). Without this,
  //     Park Avenue's median-side sidewalk emits across the parking-lot
  //     block — the operator-visible drift symptom that motivated the
  //     consolidation.
  //   - Pedestrian-band splits at chain-internal IX indices so each
  //     non-driving stripe stops at the corner. Corner plugs are a live-
  //     only concern (operator-authored visual on top); the bake emits the
  //     stripe with that gap so the underlying paint matches.
  //   - Per-segment cap measure (cap of the segment whose terminal hits
  //     the chain end, not chain.measure)
  // Median bands and corner plugs are NOT emitted here yet; they're live-
  // only render features that don't affect the reported sidewalk-cut bug.
  for (const st of streets) {
    if (!st.points || st.points.length < 2) continue
    if (st.disabled) continue
    const chainMeasure = st.measure
    if (!chainMeasure?.left || !chainMeasure?.right) continue
    const pts = st.points
    const perps = computePerps(pts)
    const caps = st.capEnds || { start: null, end: null }

    const segRanges = segmentRangesForCouplers(pts, st.couplers || [])
    const ranges = segRanges.length ? segRanges : [[0, pts.length - 1]]
    const ixIdxs = (st.intersections || []).map(ix => ix.ix).sort((a, b) => a - b)

    for (let segOrd = 0; segOrd < ranges.length; segOrd++) {
      const range = ranges[segOrd]
      const baseMeasure = measureForSegment(st, segOrd) || chainMeasure
      if (!baseMeasure?.left || !baseMeasure?.right) continue
      const measure = inboardPedZonelessBake(st, baseMeasure)
      const segPts = pts.slice(range[0], range[1] + 1)
      const segPp = perps.slice(range[0], range[1] + 1)
      // Pedestrian-band sub-splits at chain-internal IX indices that fall
      // strictly inside this segment (segment-local indexing).
      const segIxs = ixIdxs.filter(i => i > range[0] && i < range[1])
      const localSplits = [0, ...segIxs.map(i => i - range[0]), segPts.length - 1]
      const uniqueLocalSplits = [...new Set(localSplits)].sort((a, b) => a - b)

      for (const [side, sideMeasure] of [[-1, measure.left], [+1, measure.right]]) {
        const stripes = sideToStripes(sideMeasure)
        for (const stripe of stripes) {
          if (FULL_LENGTH_BANDS.has(stripe.material)) {
            pushMat(stripe.material, bandRing(segPts, segPp, side, stripe.innerR, stripe.outerR))
          } else {
            for (let si = 0; si < uniqueLocalSplits.length - 1; si++) {
              const from = uniqueLocalSplits[si], to = uniqueLocalSplits[si + 1]
              const sPts = segPts.slice(from, to + 1)
              const sPp = segPp.slice(from, to + 1)
              if (sPts.length < 2) continue
              pushMat(stripe.material, bandRing(sPts, sPp, side, stripe.innerR, stripe.outerR))
            }
          }
        }
      }
    }

    // Endcaps — measure resolved per the segment whose terminal touches
    // the chain end (start = ord 0, end = last ord).
    if (caps.start === 'round' || caps.end === 'round') {
      const lastOrd = ranges.length - 1
      const endInfo = [
        { cap: caps.start, idx: 0, prev: 1, ord: 0 },
        { cap: caps.end, idx: pts.length - 1, prev: pts.length - 2, ord: lastOrd },
      ]
      for (const e of endInfo) {
        if (e.cap !== 'round' || pts.length < 2) continue
        const baseM = measureForSegment(st, e.ord) || chainMeasure
        if (!baseM?.left || !baseM?.right) continue
        const capM = inboardPedZonelessBake(st, baseM)
        const ep = pts[e.idx]
        const tdx = ep[0] - pts[e.prev][0], tdz = ep[1] - pts[e.prev][1]
        const tl = Math.hypot(tdx, tdz) || 1
        const tan = [tdx / tl, tdz / tl]
        for (const [side, sideMeasure] of [[-1, capM.left], [+1, capM.right]]) {
          const stripes = sideToStripes(sideMeasure)
          for (const stripe of stripes) {
            pushMat(stripe.material, roundCapRing(ep, tan, perps[e.idx], side, stripe.innerR, stripe.outerR))
          }
        }
      }
    }
  }

  // Path ribbons (alleys, footways, cycleways, steps, paths) —
  // pavement-only single-material strips. Alleys carry no `kind` field
  // upstream; tag them so they can claim their own bake group instead of
  // folding into asphalt/footway.
  const paths = (ribbons.paths || [])
    .concat((ribbons.alleys || []).map(a => ({ ...a, kind: 'alley' })))
    .slice().sort((a, b) => {
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
    pushMat(p.kind || 'footway', ring)
  }

  clipAllToStencil(byMaterial, byFaceUse, stencilPolygon)

  return { byMaterial, byFaceUse }
}
