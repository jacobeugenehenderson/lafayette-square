import { useMemo, useRef, useCallback, useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useCartographStore from './stores/useCartographStore.js'
import { defaultMeasure, sideToStripes, CURB_WIDTH, segmentRangesForCouplers, measureForSegment, innerEdgeOffsetPolyline, innerEdgeMeasure, getStrips } from './streetProfiles.js'

// C3.3: writers emit strips going forward. Helpers build a fresh mutable
// strips copy from a side (legacy or strips-shaped) so drag/delete/insert
// gestures operate on one canonical shape, then write back `side.strips`
// + drop the legacy {treelawn, sidewalk} fields so they never re-persist.
const stripsCopy = (side) => getStrips(side).map(s => ({ ...s }))
function writeStrips(sd, strips) {
  sd.strips = strips
  if ('treelawn' in sd) delete sd.treelawn
  if ('sidewalk' in sd) delete sd.sidewalk
}
// Apply a handle-kind drag to one side via its strips. `r` = new absolute
// radius from centerline; `caps` carries the same clamps the legacy paths
// used (MAX_PAVEMENT_HW, MAX_STRIPE, STRIPE_MIN). Same drag semantics:
//   pavementHW     — resize asphalt half-width
//   treelawnOuter  — divide strips[0]/strips[1] within their existing total
//   propertyLine   — grow/shrink the LAST strip (outer = r - inner)
function applyStripsDrag(sd, kind, r, caps) {
  const cw = Number.isFinite(sd.curb) ? sd.curb : CURB_WIDTH
  if (kind === 'pavementHW') {
    sd.pavementHW = Math.min(caps.MAX_PAVEMENT_HW, Math.max(0.5, r))
    return
  }
  const strips = stripsCopy(sd)
  if (kind === 'treelawnOuter' && strips.length >= 2) {
    const curbEnd = sd.pavementHW + cw
    const total = strips[0].width + strips[1].width
    if (total >= caps.STRIPE_MIN * 2) {
      const newFirst = Math.max(caps.STRIPE_MIN, Math.min(total - caps.STRIPE_MIN, r - curbEnd))
      strips[0].width = Math.min(caps.MAX_STRIPE, newFirst)
      strips[1].width = Math.min(caps.MAX_STRIPE, total - newFirst)
    } else {
      strips[0].width = total / 2
      strips[1].width = total / 2
    }
  } else if (kind === 'propertyLine' && strips.length) {
    const curbEnd = sd.pavementHW + cw
    const innerBeforeLast = curbEnd + strips.slice(0, -1).reduce((s, st) => s + st.width, 0)
    strips[strips.length - 1].width = Math.min(caps.MAX_STRIPE, Math.max(caps.STRIPE_MIN, r - innerBeforeLast))
  }
  writeStrips(sd, strips)
}
import { polylineRibbon } from './overlayGeom.js'
import ribbonsRaw from '../data/ribbons.json'
import { resolveChainSegmentation, dilateRings, blockKeyFromRing } from '../lib/buildBlockGeometryV2.js'

// Lookup of survey-derived measure by street name — used when the operator
// selects a street that has never been edited. Clicking it for the first
// time adopts the pipeline's measure so handles sit on the rendered edges.
const PIPELINE_MEASURE = (() => {
  const m = new Map()
  for (const st of (ribbonsRaw.streets || [])) {
    if (st.name && st.measure) m.set(st.name, st.measure)
  }
  return m
})()

// Chain-level fallback used when a segment has no override. Order:
// segment override → street.measure → pipeline-derived → type default.
function chainMeasure(st) {
  if (st.measure) return st.measure
  const fromPipeline = PIPELINE_MEASURE.get(st.name)
  if (fromPipeline) {
    return {
      left: { ...fromPipeline.left },
      right: { ...fromPipeline.right },
      symmetric: fromPipeline.left.terminal === fromPipeline.right.terminal
        && Math.abs(fromPipeline.left.treelawn - fromPipeline.right.treelawn) < 0.01
        && Math.abs(fromPipeline.left.sidewalk - fromPipeline.right.sidewalk) < 0.01,
    }
  }
  return defaultMeasure(st.type || 'residential')
}

// Resolve effective measure for a specific segment ordinal. Post-couplers
// (block-customs model) the chain default is the single source for handle
// positions; segment-ordinal storage retires. Kept as a thin wrapper so
// downstream callers don't need to change shape if a future feature reads
// per-segment again.
function effectiveSegmentMeasure(st /* , ordinal */) {
  return chainMeasure(st)
}

// Pavement half-width for the chain (used for inner-edge offset distance).
// Reads chain-default measure; segment overrides aren't applied here because
// the visible centerline is one continuous line per chain.
function chainPavementHW(st) {
  const m = chainMeasure(st)
  return Math.max(m.left?.pavementHW || 0, m.right?.pavementHW || 0)
}

// Find which segment ordinal contains the click anchor. `segI` is the polyline
// segment index returned by projection (between pts[segI] and pts[segI+1]).
function resolveSegmentOrdinal(st, segI) {
  const ranges = segmentRangesForCouplers(st.points, st.couplers || [])
  if (!ranges.length) return 0
  for (let i = 0; i < ranges.length; i++) {
    const [a, b] = ranges[i]
    if (segI >= a && segI < b) return i
  }
  return ranges.length - 1
}

// Measure overlay: when a street is selected, empty circles appear at each
// stripe boundary at the street midpoint, on each side. Drag a circle
// perpendicular to the centerline to resize that boundary. In symmetric mode
// (default) dragging mirrors to the opposite side. Double-click on the
// ribbon boundary (stroke) to add a new boundary (treelawn split). Right-
// or Ctrl-click a circle to remove that boundary (collapse stripe).
//
// Ribbon translucency + opaque edge strokes are rendered by StreetRibbons
// when `measureActive` — this overlay is pure interaction geometry.

const raycaster = new THREE.Raycaster()
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const intersectPt = new THREE.Vector3()

function screenToWorld(clientX, clientY, camera, domElement) {
  const rect = domElement.getBoundingClientRect()
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera)
  raycaster.ray.intersectPlane(groundPlane, intersectPt)
  return { x: intersectPt.x, z: intersectPt.z }
}

function distToPolyline(pts, px, pz) {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1]
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz
    if (len2 < 1e-6) { best = Math.min(best, Math.hypot(px - ax, pz - az)); continue }
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2))
    best = Math.min(best, Math.hypot(px - (ax + t * dx), pz - (az + t * dz)))
  }
  return best
}

// Closest-point projection onto a polyline. Returns {x, z, t} where t is
// 0–1 along total length.
function projectOntoPolyline(pts, px, pz) {
  let bestDist = Infinity, bestX = pts[0][0], bestZ = pts[0][1]
  let cum = 0, bestCum = 0, total = 0
  const lens = []
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i+1][0] - pts[i][0], pts[i+1][1] - pts[i][1])
    lens.push(l); total += l
  }
  cum = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1]
    const bx = pts[i+1][0], bz = pts[i+1][1]
    const dx = bx - ax, dz = bz - az
    const len2 = dx*dx + dz*dz
    const t = len2 > 1e-6 ? Math.max(0, Math.min(1, ((px-ax)*dx + (pz-az)*dz) / len2)) : 0
    const cxp = ax + t * dx, czp = az + t * dz
    const d = Math.hypot(px - cxp, pz - czp)
    if (d < bestDist) {
      bestDist = d; bestX = cxp; bestZ = czp
      bestCum = cum + t * lens[i]
    }
    cum += lens[i]
  }
  return { x: bestX, z: bestZ, t: total > 0 ? bestCum / total : 0 }
}

// Given a polyline and a point, return the local frame at the projected point.
function frameAtPoint(pts, px, pz) {
  const proj = projectOntoPolyline(pts, px, pz)
  // Find the segment containing proj.t to compute tangent there
  let cum = 0, total = 0, segI = 0
  const lens = []
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i+1][0] - pts[i][0], pts[i+1][1] - pts[i][1])
    lens.push(l); total += l
  }
  const targetCum = proj.t * total
  cum = 0
  for (let i = 0; i < pts.length - 1; i++) {
    if (cum + lens[i] >= targetCum) { segI = i; break }
    cum += lens[i]
  }
  const a = pts[segI], b = pts[Math.min(segI + 1, pts.length - 1)]
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const len = Math.hypot(dx, dz) || 1
  return { cx: proj.x, cz: proj.z, nx: -dz/len, nz: dx/len, segI }
}

// Polyline midpoint + perpendicular unit vector.
function midAndPerp(pts) {
  let total = 0
  for (let j = 1; j < pts.length; j++) {
    total += Math.hypot(pts[j][0] - pts[j-1][0], pts[j][1] - pts[j-1][1])
  }
  const target = 0.5 * total
  let acc = 0, segI = 0, segT = 0
  for (let j = 0; j < pts.length - 1; j++) {
    const sl = Math.hypot(pts[j+1][0] - pts[j][0], pts[j+1][1] - pts[j][1])
    if (acc + sl >= target) { segI = j; segT = sl > 1e-6 ? (target - acc) / sl : 0; break }
    acc += sl
  }
  const a = pts[segI], b = pts[Math.min(segI + 1, pts.length - 1)]
  const cx = a[0] + (b[0] - a[0]) * segT
  const cz = a[1] + (b[1] - a[1]) * segT
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const len = Math.hypot(dx, dz) || 1
  return { cx, cz, nx: -dz / len, nz: dx / len, segI }
}

// Boundaries on one side as draggable handles. Curb has fixed width, so only
// one handle sits at the pavement/curb region (pavementHW) — the curb's outer
// edge is implicitly pavementHW + CURB_WIDTH and tracks the pavementHW handle.
function sideBoundaries(side) {
  const stripes = sideToStripes(side)
  if (!stripes.length) return []
  const out = []
  const asph = stripes.find(s => s.material === 'asphalt')
  if (asph) out.push({ r: asph.outerR, kind: 'pavementHW' })
  const tl = stripes.find(s => s.material === 'treelawn')
  if (tl) out.push({ r: tl.outerR, kind: 'treelawnOuter' })
  const last = stripes[stripes.length - 1]
  if (last.material !== 'asphalt' && last.material !== 'curb') {
    out.push({ r: last.outerR, kind: 'propertyLine' })
  }
  return out
}

// Handle pill dimensions (meters). Long axis runs along the street; short
// axis is the perpendicular "ruler" direction. Used for hit-testing AND
// for the anti-overlap stagger pass.
const HANDLE_LONG = 5.0
const HANDLE_SHORT = 1.2
const HANDLE_BORDER = 0.35

// Compute which natural-segment ordinal contains a polyline-segment
// index. Natural segments are the stretches of chain between IX
// vertices (and the chain endpoints). Ordinals: [0..ixs[0]] = 0,
// [ixs[0]..ixs[1]] = 1, etc. Mirrors buildBlockGeometryV2.naturalSegments
// but exposes the ordinal directly given a polyline `segI` index.
//
// IX identity: when `ixSet` is provided (coord-match from
// resolveChainSegmentation), use it. Otherwise fall back to
// `intersections[].ix` — stale on LS / toy-bend chains, kept only as
// a safety net. The walker, emitter, and this overlay MUST agree on
// the partition or findFeForSide will resolve to a different fe than
// the bands were emitted against.
function naturalSegmentOrdinal(street, segI, ixSet) {
  const n = (street.points || []).length
  if (n < 2) return 0
  let ixs
  if (ixSet) {
    ixs = [...ixSet].filter(i => Number.isInteger(i) && i > 0 && i < n - 1)
                    .sort((a, b) => a - b)
  } else {
    ixs = (street.intersections || [])
      .map(r => r.ix).filter(i => Number.isInteger(i) && i > 0 && i < n - 1)
      .sort((a, b) => a - b)
  }
  if (!ixs.length) return 0
  for (let k = 0; k < ixs.length; k++) {
    if (segI < ixs[k]) return k
  }
  return ixs.length
}

export default function MeasureOverlay() {
  const tool = useCartographStore(s => s.tool)
  const spaceDown = useCartographStore(s => s.spaceDown)
  const centerlineData = useCartographStore(s => s.centerlineData)
  const selectedStreet = useCartographStore(s => s.selectedStreet)
  const selectStreet = useCartographStore(s => s.selectStreet)
  const deselectStreet = useCartographStore(s => s.deselectStreet)
  const measureMode = useCartographStore(s => s.measureMode)
  const blockCustoms = useCartographStore(s => s.blockCustoms)
  // D.5/D.6: frontageEdges from the V2 build — used to resolve a
  // (chainIdx, segOrd, sideKey) tuple to its containing block-edge
  // (blockKey + edgeOrd) for per-block-edge customs authoring.
  const v2FrontageEdges = useCartographStore(s => s._v2FrontageEdges)
  const v2Blocks        = useCartographStore(s => s._v2Blocks)
  // Coord-match IX identity per chain — single source of truth shared
  // with buildBlockGeometryV2 + buildChainBandsLive. naturalSegmentOrdinal
  // below uses this so the operator's drag resolves segOrds against the
  // same partition the walker / emitter used.
  const ixByChain = useMemo(
    () => resolveChainSegmentation(centerlineData?.streets || []),
    [centerlineData]
  )
  // findFeForSide takes a streetIdx into centerlineData.streets, but
  // fe.chainIdx is into liveRibbons.streets (different ordering). Match
  // by chain identity (skelId, with name as a fallback for legacy data
  // missing skelId) so the two indexings don't have to agree.
  const findFeForSide = useCallback((streetIdx, segOrd, sideKey) => {
    if (streetIdx == null || segOrd == null || !v2FrontageEdges?.length) return null
    const st = useCartographStore.getState().centerlineData?.streets?.[streetIdx]
    if (!st) return null
    // centerlineData chains carry carriageway identity on `.id`; some
    // also carry `.skelId`. fes use chainSkelId built from the source
    // chain's id. Prefer skelId, fall back to id — without this, divided
    // roads (LS Park Avenue) fall through to name-match and pick a fe
    // on the wrong carriageway.
    const idKey = st.skelId || st.id || null
    const nameKey = st.name || null
    for (const fe of v2FrontageEdges) {
      if (fe.side !== sideKey) continue
      const feIdMatches = idKey && fe.chainSkelId === idKey
      const feNameMatches = !idKey && nameKey && fe.chainName === nameKey
      if (!feIdMatches && !feNameMatches) continue
      if (fe.segOrds?.includes(segOrd)) return fe
    }
    return null
  }, [v2FrontageEdges])

  const { camera, gl } = useThree()
  const active = tool === 'measure'
  const dragRef = useRef(null)
  // rAF-throttle the store commit during a handle drag. The pointermove
  // handler fires 60-120Hz, and each store write triggers a full V2
  // rebuild (Clipper booleans across 242 chains, 200-500ms on LS) which
  // queues up faster than it can complete and stutters the drag. Buffer
  // the latest drag args here, flush at most once per animation frame.
  // pointerup flushes any pending value so the persisted measure matches
  // where the operator released.
  const dragRafRef = useRef(null)
  const pendingDragRef = useRef(null)

  // Hit-test data for every street (for click-to-select).
  const streetData = useMemo(() => {
    if (!active || !centerlineData.streets?.length) return []
    const out = []
    for (let i = 0; i < centerlineData.streets.length; i++) {
      const st = centerlineData.streets[i]
      if (st.points.length < 2) continue
      // Disabled chains stay clickable (dim) so the operator can re-enable.
      out.push({ idx: i, st })
    }
    return out
  }, [active, centerlineData])

  const selectedMeasurePoint = useCartographStore(s => s.selectedMeasurePoint)

  // Thick royal-blue centerlines for every street in measure mode. For
  // inner-edge anchored chains (divided carriageways) the line is rendered
  // at the offset position — where the asphalt actually starts — so the
  // operator authors against where the median begins, not the carriageway
  // center.
  const centerlineMeshes = useMemo(() => {
    if (!active) return []
    const out = []
    const dividedNames = ['Truman Parkway', 'South 14th Street', 'Park Avenue', 'South Jefferson Avenue']
    const dividedSeen = new Map()
    for (const { idx, st } of streetData) {
      if (!st.points || st.points.length < 2) continue
      const geo = polylineRibbon(st.points, 0.35, 0)
      if (dividedNames.includes(st.name)) {
        const arr = dividedSeen.get(st.name) || []
        arr.push({ id: st.id, npts: st.points.length, geoOk: !!geo, first: st.points[0] })
        dividedSeen.set(st.name, arr)
      }
      out.push({ idx, geo, disabled: !!st.disabled })
    }
    // (Diagnostic: total centerlineMesh count + divided-chain breakdown.
    // Re-enable for survey-debugging by uncommenting below.)
    // console.log(`[MeasureOverlay] centerlineMeshes: ${out.length} total. Divided chains:`)
    // for (const [name, arr] of dividedSeen) console.log(`  ${name}: ${arr.length} chain(s)`, arr)
    return out
  }, [active, streetData])

  // Handle positions for the selected street. Anchor to the click point so
  // handles appear where the operator clicked rather than the midpoint.
  const selection = useMemo(() => {
    if (!active || selectedStreet === null) return null
    const st = centerlineData.streets[selectedStreet]
    if (!st || st.disabled || st.points.length < 2) return null
    const anchor = selectedMeasurePoint
      ? frameAtPoint(st.points, selectedMeasurePoint.x, selectedMeasurePoint.z)
      : midAndPerp(st.points)
    const { cx, cz, nx, nz, segI } = anchor
    const ordinal = naturalSegmentOrdinal(st, segI ?? 0, ixByChain?.get(st))
    // D.5/D.6: Per-side override from the block-edge containing this
    // segOrd. Each side has its own fe (one block-edge per side per
    // segOrd). blockCustoms[fe.blockKey][fe.edgeOrd] wins over
    // chain.measure[side]. This is what makes handles stick to the
    // band boundaries when the operator drags in per-block mode.
    const feLeft = findFeForSide(selectedStreet, ordinal, 'left')
    const feRight = findFeForSide(selectedStreet, ordinal, 'right')
    const customLeft = feLeft ? blockCustoms?.[feLeft.blockKey]?.[feLeft.edgeOrd] : null
    const customRight = feRight ? blockCustoms?.[feRight.blockKey]?.[feRight.edgeOrd] : null
    const chainM = st.measure || {}
    const baseMeasure = {
      left:  customLeft  || chainM.left,
      right: customRight || chainM.right,
      symmetric: chainM.symmetric,
    }
    // For inner-edge chains, zero out the inboard ped zone so its handles
    // collapse (no treelawn/sidewalk along the median). Pavement + curb
    // handles still emit on both sides — operator authors carriageway width
    // the same as a regular street.
    const measure = innerEdgeMeasure(baseMeasure, st.anchor === 'inner-edge' ? st.innerSign : 0)
    // Along-street unit vector (perpendicular to the ruler). Handles
    // orient with long axis along the street so they don't overlap each
    // other when boundary radii are close.
    const ax = -nz, az = nx
    const rotY = Math.atan2(ax, az)   // rotation for a plane geometry aligned XZ
    const handles = []
    for (const [sideKey, sign] of [['left', -1], ['right', +1]]) {
      const bounds = sideBoundaries(measure[sideKey])
      for (const b of bounds) {
        handles.push({
          side: sideKey,
          kind: b.kind,
          r: b.r,
          x: cx + sign * nx * b.r,
          z: cz + sign * nz * b.r,
          alongOffset: 0,
          rotY,
        })
      }
    }
    // Anti-overlap pass: when two handles on the same side have similar r
    // (within HANDLE_LONG of each other), their pill bodies stack on top of
    // one another and occlude both each other and the underlying ribbon.
    // Stagger them along the street tangent so each gets a clean footprint.
    // r is preserved (drag still updates the correct boundary); only the
    // visual along-street position shifts.
    const STAGGER_GAP = HANDLE_LONG + 0.5    // pills clear each other with breathing room
    const STAGGER_AMT = HANDLE_LONG + 0.5
    for (const sideKey of ['left', 'right']) {
      const sideHandles = handles.filter(h => h.side === sideKey).sort((a, b) => a.r - b.r)
      let staggerIdx = 0
      for (let i = 1; i < sideHandles.length; i++) {
        const prev = sideHandles[i - 1]
        const curr = sideHandles[i]
        if (Math.abs(curr.r - prev.r) < STAGGER_GAP) {
          staggerIdx += 1
          // Alternate fore/aft of the centerline anchor point.
          const dir = staggerIdx % 2 === 0 ? +1 : -1
          const mag = Math.ceil(staggerIdx / 2) * STAGGER_AMT
          curr.alongOffset = dir * mag
          curr.x += (-nz) * curr.alongOffset
          curr.z += (nx) * curr.alongOffset
        }
      }
    }
    return { streetIdx: selectedStreet, measure, ordinal, mid: { cx, cz, nx, nz }, handles }
  }, [active, selectedStreet, centerlineData, selectedMeasurePoint, blockCustoms, findFeForSide, ixByChain])

  // Mirror selection.ordinal to the store so MeasurePanel shows the right segment.
  useEffect(() => {
    if (!selection) return
    useCartographStore.getState().setSegmentOrdinal(selection.ordinal)
  }, [selection])

  // C3.4 — derived continuous border per adjacent block. Selecting a
  // chain anchors handles on BOTH sides (operator clicks the centerline),
  // so both adjacent blocks get their border visualized. Each border is
  // the inward inset of that block's blockRounded by cw + W, where W =
  // max(strips-total) across every fe on the block. Single-source: the
  // same Clipper inward offset the cutover renderer uses (C2), evaluated
  // on-demand from the stashed V2 outputs — what the operator sees is
  // what the corner geometry will key off.
  const derivedBlockBorders = useMemo(() => {
    if (!active || !selection || !v2Blocks?.length || !v2FrontageEdges?.length) return []
    const st = centerlineData.streets[selection.streetIdx]
    if (!st) return []
    const idKey = st.skelId || st.id || null
    const nameKey = st.name || null
    const adjBlockKeys = new Set()
    for (const fe of v2FrontageEdges) {
      const idMatch = idKey && fe.chainSkelId === idKey
      const nameMatch = !idKey && nameKey && fe.chainName === nameKey
      if (idMatch || nameMatch) adjBlockKeys.add(fe.blockKey)
    }
    if (!adjBlockKeys.size) return []
    const ringByKey = new Map()
    for (const ring of v2Blocks) ringByKey.set(blockKeyFromRing(ring), ring)
    // Centerline lookup by skelId/name → chain object (for chain.measure
    // fallback when no per-block custom is authored on a fe's edge).
    const chainByKey = new Map()
    for (const c of (centerlineData.streets || [])) {
      const k = c.skelId || c.id || c.name
      if (k) chainByKey.set(k, c)
    }
    const out = []
    for (const bk of adjBlockKeys) {
      const ring = ringByKey.get(bk)
      if (!ring || ring.length < 3) continue
      let W = 0
      for (const fe of v2FrontageEdges) {
        if (fe.blockKey !== bk) continue
        const cust = blockCustoms?.[bk]?.[fe.edgeOrd]
        const chain = chainByKey.get(fe.chainSkelId) || chainByKey.get(fe.chainName)
        const sideM = cust || chain?.measure?.[fe.side]
        if (!sideM) continue
        const total = getStrips(sideM).reduce((s, x) => s + x.width, 0)
        if (total > W) W = total
      }
      if (W <= 0) continue
      // Normalize CCW so dilateRings' negative delta insets inward.
      let area = 0
      for (let i = 0, n = ring.length; i < n; i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n]
        area += x1 * y2 - x2 * y1
      }
      const ccwRing = area >= 0 ? ring : ring.slice().reverse()
      const propLine = dilateRings([ccwRing], -(CURB_WIDTH + W), 'jtRound')
      for (const pl of propLine) {
        if (pl?.length >= 3) out.push({ blockKey: bk, ring: pl })
      }
    }
    return out
  }, [active, selection, centerlineData, blockCustoms, v2Blocks, v2FrontageEdges])

  // Whole-chain measure write — global Measure-mode drags target chain.measure
  // directly. Per-block divergence routes through setBlockEdgeCustom (D.6) on
  // the custom branch in applyDrag, keyed by (blockKey, edgeOrd).
  const modifyMeasure = useCallback((streetIdx, _ordinal, updater) => {
    const cd = useCartographStore.getState().centerlineData
    const st = cd.streets[streetIdx]
    if (!st) return
    const seed = chainMeasure(st)
    useCartographStore.getState().setStreetMeasure(streetIdx, updater, seed)
  }, [])

  // Apply a boundary drag. `r` = new radius (absolute, from centerline).
  // Updates the named field on the given side. If symmetric, mirrors the
  // same field on the other side.
  //
  // Block-customs routing: when measureMode === 'custom', the drag writes
  // to design.blockCustoms[blockId][chainIdx][side] instead of the chain's
  // segment measure. blockId is resolved at drag time from the anchor
  // point + dragged side using V2's stashed block rings. When in 'global'
  // mode, the drag also clears any customs on this chain — globals are
  // truth, customs are local deviations that don't survive a chain edit.
  const applyDrag = useCallback((streetIdx, ordinal, side, kind, r) => {
    // Guard against non-finite r — if the pointer briefly leaves the canvas
    // mid-drag, screenToWorld can return NaN, distToPolyline propagates it,
    // and Math.max(0.3, NaN) is NaN. A persisted NaN in any measure field
    // poisons the merged ribbon buffer's bounding box and drops every
    // ribbon from the frame.
    if (!Number.isFinite(r)) return
    // Sanity-cap r so a handle dragged very far doesn't explode ribbon
    // geometry. subdivideGeo subdivides each ribbon up to 8× whenever an
    // edge exceeds 30m; a 500m-wide ribbon would request a multi-million-
    // vertex Float32Array and the OOM crashes the StreetRibbons render
    // (RangeError: Array buffer allocation failed). 60m from centerline
    // is well past the widest real curb in the neighborhood.
    if (r > 60) r = 60
    const MAX_PAVEMENT_HW = 30
    const MAX_STRIPE = 20

    // D.6: Per-block mode (default) writes to blockCustoms keyed by
    // (blockKey, edgeOrd). The operator clicks at point P on chain X;
    // the click resolves to a (chainIdx, segOrd) tuple; the dragged
    // side determines which block-edge (left or right of chain) we're
    // authoring. blockCustoms[fe.blockKey][fe.edgeOrd] = next.
    const mode = useCartographStore.getState().measureMode
    if (window.__customDebug) console.log('[applyDrag] mode:', mode, 'side:', side, 'kind:', kind)
    if (mode?.type !== 'global') {
      const cd = useCartographStore.getState().centerlineData
      const st = cd.streets[streetIdx]
      if (!st) { if (window.__customDebug) console.log('  bail: no street'); return }
      const anchor = useCartographStore.getState().selectedMeasurePoint
      if (!anchor) { if (window.__customDebug) console.log('  bail: no anchor'); return }
      const frame = frameAtPoint(st.points, anchor.x, anchor.z)
      const segOrd = naturalSegmentOrdinal(st, frame.segI ?? 0, ixByChain?.get(st))
      // Find the block-edge for this side. If no fe is found (operator
      // clicked on a chain segment that isn't asphalt-facing on this
      // side, e.g. an internal edge), bail — there's nothing to author.
      const fe = findFeForSide(streetIdx, segOrd, side)
      if (!fe) {
        if (window.__customDebug) {
          const all = useCartographStore.getState()._v2FrontageEdges || []
          const st = useCartographStore.getState().centerlineData?.streets?.[streetIdx]
          const idKey = st?.skelId || null
          const nameKey = st?.name || null
          const forChain = all.filter(f =>
            (idKey && f.chainSkelId === idKey) ||
            (!idKey && nameKey && f.chainName === nameKey)
          ).map(f => ({ side: f.side, edgeOrd: f.edgeOrd, blockKey: f.blockKey, segOrds: f.segOrds }))
          console.log('  bail: no fe for', { streetIdx, segOrd, side, skelId: idKey, name: nameKey },
            '\n    npts:', st?.points?.length,
            'ixs:', (st?.intersections || []).map(r => r.ix),
            '\n    feCount(total):', all.length, 'feCount(thisChain):', forChain.length,
            '\n    fesForChain:', JSON.stringify(forChain))
        }
        return
      }
      const existing = useCartographStore.getState().blockCustoms?.[fe.blockKey]?.[fe.edgeOrd]
      const seed = existing || st.measure?.[side] || {
        pavementHW: 5, terminal: 'sidewalk',
        strips: [{ width: 1.5, fill: 'landuse' }, { width: 1.5, fill: 'concrete' }],
      }
      const next = { ...seed }
      applyStripsDrag(next, kind, r, { MAX_PAVEMENT_HW, MAX_STRIPE, STRIPE_MIN: 1.0 })
      if (window.__customDebug) console.log('  → write blockEdge[', fe.blockKey, '][', fe.edgeOrd, '] =', next)
      useCartographStore.getState().setBlockEdgeCustom(fe.blockKey, fe.edgeOrd, next)
      return
    }

    // Whole-chain mode: write chain.measure. Per-block customs are
    // already wiped at the moment the operator toggled INTO global mode
    // (handled by ModeToggle in MeasurePanel) — toggling INTO global
    // is the operator's commit to "this is the universal width now."
    modifyMeasure(streetIdx, ordinal, (m) => {
      // Symmetric is the default. measure.symmetric === true → drag mirrors
      // both sides together; false → drag affects only the dragged side.
      // Operator opts INTO asymmetric via the panel's "Asymmetric (edit
      // sides separately)" checkbox.
      const sides = m.symmetric === false ? [side] : ['left', 'right']
      if (window.__measureDebug) {
        console.log('[applyDrag]', { dragSide: side, kind, r: r.toFixed(2),
          symmetric: m.symmetric, willUpdate: sides,
          before_left: { ...m.left }, before_right: { ...m.right } })
      }
      // Pedestrian-stripe minimum width: ribbons can't be dragged thinner
      // than this. To eliminate a stripe entirely, ctrl/right-click the
      // boundary handle (existing delete gesture). Keeps handles from
      // visually collapsing onto each other and forces explicit removal.
      const caps = { MAX_PAVEMENT_HW, MAX_STRIPE, STRIPE_MIN: 1.0 }
      for (const s of sides) {
        const sd = m[s]
        if (!sd) continue
        applyStripsDrag(sd, kind, r, caps)
      }
    })
  }, [modifyMeasure, findFeForSide, ixByChain])

  const onPointerDown = useCallback((e) => {
    if (!active || spaceDown || e.button !== 0) return
    const p = screenToWorld(e.clientX, e.clientY, camera, gl.domElement)
    const thresh = 5 / (camera.zoom || 1)

    // Priority 1: start dragging an existing handle. Hit-test in the handle's
    // local frame (long axis = along street, short axis = perpendicular = ruler).
    if (selection) {
      const ax = -selection.mid.nz, az = selection.mid.nx   // along-street
      const nx = selection.mid.nx, nz = selection.mid.nz    // across (ruler)
      const longHalf = HANDLE_LONG / 2
      const shortHalf = HANDLE_SHORT / 2
      for (const h of selection.handles) {
        const dx = p.x - h.x, dz = p.z - h.z
        const along = dx * ax + dz * az
        const across = dx * nx + dz * nz
        if (Math.abs(along) < longHalf && Math.abs(across) < shortHalf) {
          dragRef.current = { streetIdx: selection.streetIdx, ordinal: selection.ordinal, side: h.side, kind: h.kind }
          e.stopPropagation()
          return
        }
      }
    }

    // Priority 2: click on a centerline → select that street + anchor handles
    // at the click position.
    const lineThresh = 6 / (camera.zoom || 1)
    let bestDist = Infinity, bestIdx = -1, bestProj = null
    for (const { idx, st } of streetData) {
      const proj = projectOntoPolyline(st.points, p.x, p.z)
      const d = Math.hypot(p.x - proj.x, p.z - proj.z)
      if (d < lineThresh && d < bestDist) { bestDist = d; bestIdx = idx; bestProj = proj }
    }
    if (bestIdx >= 0) {
      selectStreet(bestIdx)
      useCartographStore.getState().setMeasurePoint({ x: bestProj.x, z: bestProj.z })
      e.stopPropagation()
      return
    }

    // Empty click does NOT deselect — operators pan the map constantly and
    // the gesture used to silently throw away their selection. Accept
    // explicitly via double-click (handler below), Enter, or Escape.
  }, [active, spaceDown, camera, gl, selection, streetData, selectStreet])

  const onPointerMove = useCallback((e) => {
    if (dragRef.current) {
      const p = screenToWorld(e.clientX, e.clientY, camera, gl.domElement)
      const { streetIdx, ordinal, side, kind } = dragRef.current
      const cd = useCartographStore.getState().centerlineData
      const st = cd.streets[streetIdx]
      if (!st) return
      const r = Math.max(0.3, distToPolyline(st.points, p.x, p.z))
      // Status bar update is cheap, do it every move for live readout.
      useCartographStore.setState({
        status: kind + ': ' + (r * 3.28084).toFixed(1) + 'ft',
      })
      // Buffer the drag's intent; coalesce to one applyDrag per frame.
      pendingDragRef.current = { streetIdx, ordinal, side, kind, r }
      if (dragRafRef.current == null) {
        dragRafRef.current = requestAnimationFrame(() => {
          dragRafRef.current = null
          const pending = pendingDragRef.current
          if (pending) applyDrag(pending.streetIdx, pending.ordinal, pending.side, pending.kind, pending.r)
        })
      }
      return
    }

    // Hover feedback
    if (!active || spaceDown) { useCartographStore.getState().setHoverTarget(false); return }
    const p = screenToWorld(e.clientX, e.clientY, camera, gl.domElement)
    let hit = false
    if (selection) {
      const ax = -selection.mid.nz, az = selection.mid.nx
      const nx = selection.mid.nx, nz = selection.mid.nz
      for (const h of selection.handles) {
        const dx = p.x - h.x, dz = p.z - h.z
        if (Math.abs(dx * ax + dz * az) < HANDLE_LONG / 2 && Math.abs(dx * nx + dz * nz) < HANDLE_SHORT / 2) { hit = true; break }
      }
    }
    if (!hit) {
      const lineThresh = 6 / (camera.zoom || 1)
      for (const { st } of streetData) {
        if (distToPolyline(st.points, p.x, p.z) < lineThresh) { hit = true; break }
      }
    }
    useCartographStore.getState().setHoverTarget(hit)
  }, [active, spaceDown, camera, gl, selection, streetData, applyDrag])

  const onPointerUp = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    // Flush any pending rAF-buffered drag so the persisted measure matches
    // where the operator released (otherwise the last 16ms of motion may be
    // dropped if the rAF never fired before pointerup).
    if (dragRafRef.current != null) {
      cancelAnimationFrame(dragRafRef.current)
      dragRafRef.current = null
    }
    const pending = pendingDragRef.current
    pendingDragRef.current = null
    if (pending) applyDrag(pending.streetIdx, pending.ordinal, pending.side, pending.kind, pending.r)
    useCartographStore.setState({ status: '' })
  }, [applyDrag])

  // Ctrl/Cmd-click or right-click on a handle → delete that boundary
  // (collapse stripe). Same gesture in an empty band → insert a boundary
  // (split sidewalk into treelawn + sidewalk, or re-seed a removed zone).
  useEffect(() => {
    if (!active) return
    const dom = gl.domElement
    const onKeyDown = (e) => {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'SELECT' || e.target?.tagName === 'TEXTAREA') return
      if (e.key === 'Escape' || e.key === 'Enter') deselectStreet()
    }
    // Try to delete a handle at world point p. Returns true if a handle
    // was hit and removed.
    const tryDeleteHandle = (p) => {
      if (!selection) return false
      const ax = -selection.mid.nz, az = selection.mid.nx
      const nx = selection.mid.nx, nz = selection.mid.nz
      for (const h of selection.handles) {
        const dx = p.x - h.x, dz = p.z - h.z
        if (Math.abs(dx * ax + dz * az) < HANDLE_LONG / 2 && Math.abs(dx * nx + dz * nz) < HANDLE_SHORT / 2) {
          modifyMeasure(selection.streetIdx, selection.ordinal, (m) => {
            const sides = m.symmetric ? ['left', 'right'] : [h.side]
            for (const s of sides) {
              const sd = m[s]
              if (!sd) continue
              if (h.kind === 'treelawnOuter') {
                // Collapse strips[0] into strips[1] (its width merges down).
                const strips = stripsCopy(sd)
                if (strips.length >= 2) {
                  strips[1].width += strips[0].width
                  strips.shift()
                }
                writeStrips(sd, strips)
              } else if (h.kind === 'propertyLine') {
                writeStrips(sd, [])
                sd.terminal = 'none'
              }
            }
          })
          useCartographStore.setState({ status: 'Removed boundary' })
          return true
        }
      }
      return false
    }
    // Try to insert a boundary at world point p (in a band). Returns true
    // if the click landed in an insertable band.
    const tryInsertBoundary = (p) => {
      if (!selection) return false
      const st = centerlineData.streets[selection.streetIdx]
      if (!st) return false
      const frame = frameAtPoint(st.points, p.x, p.z)
      const dx = p.x - frame.cx, dz = p.z - frame.cz
      const signedPerp = dx * frame.nx + dz * frame.nz
      const side = signedPerp >= 0 ? 'right' : 'left'
      const r = Math.abs(signedPerp)
      const ord = resolveSegmentOrdinal(st, frame.segI ?? 0)
      let inserted = false
      modifyMeasure(selection.streetIdx, ord, (m) => {
        const sides = m.symmetric ? ['left', 'right'] : [side]
        for (const s of sides) {
          const sd = m[s]
          if (!sd) continue
          const cw = Number.isFinite(sd.curb) ? sd.curb : CURB_WIDTH
          const curbEnd = sd.pavementHW + cw
          const strips = stripsCopy(sd)
          const outerEnd = curbEnd + strips.reduce((a, st) => a + st.width, 0)
          // Single-strip + click between curb and outer → split: insert a
          // landuse strip at the click; keep the existing strip's fill on
          // the property-side remainder. (C3.4 will replace this gesture
          // with fill-toggle, which is the brief's settled authoring story.)
          if (r > curbEnd + 0.2 && r < outerEnd - 0.2 && strips.length === 1) {
            const tail = strips[0]
            writeStrips(sd, [
              { width: r - curbEnd, fill: 'landuse' },
              { width: outerEnd - r, fill: tail.fill },
            ])
            inserted = true
          } else if (sd.terminal === 'none') {
            sd.terminal = 'sidewalk'
            writeStrips(sd, [{ width: Math.max(0.3, r - curbEnd), fill: 'concrete' }])
            inserted = true
          }
        }
      })
      if (inserted) useCartographStore.setState({ status: 'Inserted boundary' })
      return inserted
    }
    // C3.4 — toggle a strip's fill at the click point. The settled
    // authoring story: ctrl-click in a band flips that strip between
    // 'concrete' (sidewalk) and 'landuse' (the parcel showing through,
    // what the old model called "treelawn"). Honors symmetric mode and
    // the active measureMode (custom writes to blockCustoms; global
    // writes to chain.measure). Insertion of a NEW strip splits in C3.5.
    const tryToggleFill = (p) => {
      if (!selection) return false
      const st = centerlineData.streets[selection.streetIdx]
      if (!st) return false
      const frame = frameAtPoint(st.points, p.x, p.z)
      const dx = p.x - frame.cx, dz = p.z - frame.cz
      const signedPerp = dx * frame.nx + dz * frame.nz
      const side = signedPerp >= 0 ? 'right' : 'left'
      const r = Math.abs(signedPerp)
      const segOrd = naturalSegmentOrdinal(st, frame.segI ?? 0, ixByChain?.get(st))
      const fe = findFeForSide(selection.streetIdx, segOrd, side)
      const cust = fe ? useCartographStore.getState().blockCustoms?.[fe.blockKey]?.[fe.edgeOrd] : null
      const seed = cust || st.measure?.[side]
      if (!seed) return false
      const cw = Number.isFinite(seed.curb) ? seed.curb : CURB_WIDTH
      const curbEnd = (seed.pavementHW || 0) + cw
      const baseStrips = getStrips(seed)
      if (!baseStrips.length) return false
      // Resolve which strip the click radius falls in.
      let depth = curbEnd, hitIdx = -1
      for (let i = 0; i < baseStrips.length; i++) {
        const next = depth + baseStrips[i].width
        if (r >= depth - 0.05 && r <= next + 0.05) { hitIdx = i; break }
        depth = next
      }
      if (hitIdx < 0) return false
      const flipFill = (f) => (f === 'concrete' ? 'landuse' : 'concrete')
      const mode = useCartographStore.getState().measureMode
      if (mode?.type !== 'global' && fe) {
        const next = { ...seed, strips: baseStrips.map((s, i) =>
          i === hitIdx ? { ...s, fill: flipFill(s.fill) } : { ...s }) }
        if ('treelawn' in next) delete next.treelawn
        if ('sidewalk' in next) delete next.sidewalk
        useCartographStore.getState().setBlockEdgeCustom(fe.blockKey, fe.edgeOrd, next)
      } else {
        modifyMeasure(selection.streetIdx, segOrd, (m) => {
          const sides = m.symmetric ? ['left', 'right'] : [side]
          for (const s of sides) {
            const sd = m[s]
            if (!sd) continue
            const strips = getStrips(sd).map((x, i) =>
              i === hitIdx ? { ...x, fill: flipFill(x.fill) } : { ...x })
            sd.strips = strips
            if ('treelawn' in sd) delete sd.treelawn
            if ('sidewalk' in sd) delete sd.sidewalk
          }
        })
      }
      useCartographStore.setState({ status: 'Toggled fill' })
      return true
    }
    // Unified ctrl/right gesture: hit a handle → delete; else toggle fill
    // of the strip under the click. (Strip insertion moves to C3.5.)
    const handleCtrlOrRight = (e) => {
      if (!selection) return false
      const p = screenToWorld(e.clientX, e.clientY, camera, gl.domElement)
      if (tryDeleteHandle(p)) return true
      if (tryToggleFill(p)) return true
      if (tryInsertBoundary(p)) return true   // legacy fallback; C3.5 supersedes
      return false
    }
    const onContextMenu = (e) => {
      if (handleCtrlOrRight(e)) e.preventDefault()
    }
    // Ctrl/Cmd + left-click trigger the same as right-click. Capture phase
    // so we beat the normal pointerdown flow (drag/select/deselect).
    const onCtrlClickDown = (e) => {
      if (!active || spaceDown) return
      if (e.button !== 0) return
      if (!(e.ctrlKey || e.metaKey)) return
      if (handleCtrlOrRight(e)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    // Double-click anywhere on the canvas accepts the current edit and
    // releases the selection — replaces the old empty-click-to-accept,
    // which was too easy to trigger while panning.
    const onDblClick = (e) => {
      if (!selection) return
      if (e.ctrlKey || e.metaKey) return
      deselectStreet()
      e.preventDefault()
      e.stopPropagation()
    }
    const opts = { capture: true }
    dom.addEventListener('pointerdown', onCtrlClickDown, opts)
    dom.addEventListener('pointerdown', onPointerDown, opts)
    dom.addEventListener('pointermove', onPointerMove, opts)
    dom.addEventListener('pointerup', onPointerUp, opts)
    dom.addEventListener('contextmenu', onContextMenu, opts)
    dom.addEventListener('dblclick', onDblClick, opts)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      dom.removeEventListener('pointerdown', onCtrlClickDown, opts)
      dom.removeEventListener('pointerdown', onPointerDown, opts)
      dom.removeEventListener('pointermove', onPointerMove, opts)
      dom.removeEventListener('pointerup', onPointerUp, opts)
      dom.removeEventListener('contextmenu', onContextMenu, opts)
      dom.removeEventListener('dblclick', onDblClick, opts)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [active, gl, camera, selection, onPointerDown, onPointerMove, onPointerUp, deselectStreet, modifyMeasure])

  if (!active) return null

  const LONG = HANDLE_LONG
  const SHORT = HANDLE_SHORT
  const BORDER = HANDLE_BORDER
  const ROYAL_BLUE = '#2250E8'
  return (
    <group position={[0, 0.5, 0]}>
      {/* Royal-blue centerlines — clickable affordance for every street.
          Disabled chains render at low opacity so they're visible-but-dim,
          stay clickable for re-enabling. */}
      {centerlineMeshes.map(m => (
        <mesh key={`cl-${m.idx}`} geometry={m.geo} renderOrder={140}>
          <meshBasicMaterial color={ROYAL_BLUE}
            transparent opacity={m.disabled ? 0.18 : 1}
            polygonOffset polygonOffsetFactor={-30} polygonOffsetUnits={-120}
            depthTest={false} depthWrite={false} />
        </mesh>
      ))}
      {/* C3.4 — derived per-block border at W = max(strips-total). One
          ring per adjacent block; previews the uniform corner the
          renderer keys off. View-only; persists no data. */}
      {derivedBlockBorders.map((b, i) => {
        const n = b.ring.length
        const positions = new Float32Array((n + 1) * 3)
        for (let k = 0; k < n; k++) {
          positions[k * 3 + 0] = b.ring[k][0]
          positions[k * 3 + 1] = 0.25
          positions[k * 3 + 2] = b.ring[k][1]
        }
        positions[n * 3 + 0] = b.ring[0][0]
        positions[n * 3 + 1] = 0.25
        positions[n * 3 + 2] = b.ring[0][1]
        return (
          <line key={`bb-${i}-${b.blockKey}`} renderOrder={145}>
            <bufferGeometry attach="geometry">
              <bufferAttribute attach="attributes-position"
                array={positions} count={n + 1} itemSize={3} />
            </bufferGeometry>
            <lineBasicMaterial color="#FFA500" transparent opacity={0.85}
              depthTest={false} depthWrite={false} />
          </line>
        )
      })}
      {selection && selection.handles.map((h, i) => (
        <group key={i} position={[h.x, 0, h.z]} rotation={[0, h.rotY, 0]}>
          {/* Black outline (slightly larger) — transparent flag puts it
              into three.js's transparent draw pass so high renderOrder
              actually beats the transparent ribbon stripes (which would
              otherwise paint over an opaque handle, since opaque always
              draws before transparent regardless of renderOrder). */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={149}>
            <planeGeometry args={[SHORT + BORDER, LONG + BORDER]} />
            <meshBasicMaterial color="#000000" side={THREE.DoubleSide} depthTest={false} transparent opacity={1} />
          </mesh>
          {/* White fill */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={150}>
            <planeGeometry args={[SHORT, LONG]} />
            <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} depthTest={false} transparent opacity={1} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
