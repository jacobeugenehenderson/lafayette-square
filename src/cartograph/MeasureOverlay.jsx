import { useMemo, useRef, useCallback, useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useCartographStore from './stores/useCartographStore.js'
import { sideToStripes, CURB_WIDTH, segmentRangesForCouplers, measureForSegment, innerEdgeOffsetPolyline, innerEdgeMeasure } from './streetProfiles.js'
import { polylineRibbon } from './overlayGeom.js'
import { resolveChainSegmentation } from '../lib/buildBlockGeometryV2.js'
import { chainMeasure, findFeForSide as findFeForSidePure, feesForChainSide, applyKindToMeasure } from './measureModel.js'

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
  // streetIdx-keyed wrapper over the shared pure helper — resolves the
  // street from the live store, then delegates to measureModel.findFeForSide.
  const findFeForSide = useCallback((streetIdx, segOrd, sideKey) => {
    if (streetIdx == null) return null
    const st = useCartographStore.getState().centerlineData?.streets?.[streetIdx]
    return findFeForSidePure(v2FrontageEdges, st, segOrd, sideKey)
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

  // Apply a boundary drag. `r` = new radius (absolute, from centerline).
  //
  // Polygon-only authoring (RIBBONS §1 data wall): every write lands in
  // blockCustoms[blockKey][edgeOrd] — NEVER chain.measure. The chain is a
  // SELECTION criterion, not a write scope:
  //   • Whole-chain mode  → SELECT every fe of the chain on the touched
  //     side(s) and fan a per-fe write across them (writeBlockEdgeCustoms,
  //     one store mutation / one V2 rebuild).
  //   • Per-block mode    → write only the one fe at the click anchor.
  // "Symmetric" is the transient `editSidesSeparately` toggle, not stored
  // chain data: when it's false the edit mirrors to the opposite-side fe(s).
  const applyDrag = useCallback((streetIdx, ordinal, side, kind, r) => {
    // Guard against non-finite r — a brief pointer-leave makes screenToWorld
    // return NaN, which poisons the ribbon buffer's bbox and drops every
    // ribbon. Cap r so a wild drag can't request a multi-million-vert buffer
    // (subdivideGeo OOM). 60m is well past the widest real curb.
    if (!Number.isFinite(r)) return
    if (r > 60) r = 60

    const store = useCartographStore.getState()
    const st = store.centerlineData?.streets?.[streetIdx]
    if (!st) return
    const mode = store.measureMode
    const editSep = store.editSidesSeparately
    const blockCustoms = store.blockCustoms || {}
    const fes = store._v2FrontageEdges || []
    const otherSide = side === 'left' ? 'right' : 'left'
    const sides = editSep ? [side] : [side, otherSide]

    // Chain-default seed, innerEdge-resolved so divided carriageways match
    // the bake: innerEdgeMeasure is applied to chain.measure at build time
    // but NOT to blockCustoms, so the seed must pre-apply it or the median
    // side would sprout a ped zone.
    const chainSeed = innerEdgeMeasure(
      chainMeasure(st), st.anchor === 'inner-edge' ? st.innerSign : 0
    )
    const FALLBACK = { pavementHW: 5, treelawn: 1.5, sidewalk: 1.5, terminal: 'sidewalk' }

    const entries = []
    const pushFe = (fe, s) => {
      if (!fe) return
      const seed = blockCustoms[fe.blockKey]?.[fe.edgeOrd] || chainSeed[s] || FALLBACK
      entries.push({ blockKey: fe.blockKey, edgeOrd: fe.edgeOrd, measure: applyKindToMeasure(seed, kind, r) })
    }

    if (mode?.type === 'global') {
      for (const s of sides) for (const fe of feesForChainSide(fes, st, s)) pushFe(fe, s)
    } else {
      const anchor = store.selectedMeasurePoint
      if (!anchor) return
      const frame = frameAtPoint(st.points, anchor.x, anchor.z)
      const segOrd = naturalSegmentOrdinal(st, frame.segI ?? 0, ixByChain?.get(st))
      for (const s of sides) pushFe(findFeForSide(streetIdx, segOrd, s), s)
    }
    if (entries.length) store.writeBlockEdgeCustoms(entries)
  }, [findFeForSide, ixByChain])

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

  // V1.5: Ctrl/Cmd-click or right-click in a strip's body flips that
  // strip's material between LU and SW. Handle hits are ignored (handles
  // are drag-only; the pre-V1.5 add/subtract gesture model is retired
  // per RIBBONS.md §5 since the 16-fields construction has a structurally
  // fixed two-strip layout — no "empty band" to insert into, no "collapse"
  // to express).
  useEffect(() => {
    if (!active) return
    const dom = gl.domElement
    const onKeyDown = (e) => {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'SELECT' || e.target?.tagName === 'TEXTAREA') return
      if (e.key === 'Escape' || e.key === 'Enter') deselectStreet()
    }
    // Returns true if world point p sits on a drag handle (within the
    // pill bounds). Handle clicks are NO-OP in V1.5 (drag-only).
    const hitHandle = (p) => {
      if (!selection) return false
      const ax = -selection.mid.nz, az = selection.mid.nx
      const nx = selection.mid.nx, nz = selection.mid.nz
      for (const h of selection.handles) {
        const dx = p.x - h.x, dz = p.z - h.z
        if (Math.abs(dx * ax + dz * az) < HANDLE_LONG / 2 && Math.abs(dx * nx + dz * nz) < HANDLE_SHORT / 2) {
          return true
        }
      }
      return false
    }
    // Resolve (slot, side) for a click in a strip's body. Returns null
    // if click falls outside the ribbon (in asphalt, on curb, past
    // propertyLine, or on a non-sidewalk terminal side). Otherwise
    // returns { slot: 'outer'|'inner', side, segOrd, sourceMeasure }.
    //
    // V1.5 doctrine: outer slot = TL strip (curb-side, between curbEnd
    // and curbEnd+treelawn); inner slot = SW strip (property-side,
    // between curbEnd+treelawn and curbEnd+treelawn+sidewalk).
    const resolveStripHit = (p) => {
      if (!selection) return null
      const st = centerlineData.streets[selection.streetIdx]
      if (!st) return null
      const frame = frameAtPoint(st.points, p.x, p.z)
      const dx = p.x - frame.cx, dz = p.z - frame.cz
      const signedPerp = dx * frame.nx + dz * frame.nz
      const side = signedPerp >= 0 ? 'right' : 'left'
      const r = Math.abs(signedPerp)
      const segOrd = naturalSegmentOrdinal(st, frame.segI ?? 0, ixByChain?.get(st))
      // Resolve seed measure for the side from blockCustoms (per-block
      // mode preference) → chain.measure → defaults; needed only to read
      // strip-boundary depths, not yet to write.
      const customFe = findFeForSide(selection.streetIdx, segOrd, side)
      const existing = customFe ? blockCustoms?.[customFe.blockKey]?.[customFe.edgeOrd] : null
      const sd = existing || st.measure?.[side] || null
      if (!sd) return null
      if (sd.terminal !== 'sidewalk') return null
      const cw = Number.isFinite(sd.curb) ? sd.curb : CURB_WIDTH
      const curbEnd = sd.pavementHW + cw
      const tlEnd   = curbEnd + (sd.treelawn || 0)
      const swEnd   = tlEnd + (sd.sidewalk || 0)
      let slot = null
      if (r > curbEnd && r <= tlEnd && (sd.treelawn || 0) > 1e-6) slot = 'outer'
      else if (r > tlEnd && r <= swEnd && (sd.sidewalk || 0) > 1e-6) slot = 'inner'
      if (!slot) return null
      return { slot, side, segOrd, sourceMeasure: sd, fe: customFe }
    }
    // Try to flip the material of the strip whose body the click landed in.
    // Polygon-only (same scope rules as drag): per-block flips the one fe at
    // the click; whole-chain SELECTS every fe of the chain on the touched
    // side(s) and fans the material write. Never writes chain.measure. When
    // not editing sides separately, the flip mirrors to the opposite side.
    // Returns true if a flip was committed.
    const tryFlipStripMaterial = (p) => {
      const hit = resolveStripHit(p)
      if (!hit) return false
      const { slot, side, segOrd, sourceMeasure, fe } = hit
      const store = useCartographStore.getState()
      const mode = store.measureMode
      const editSep = store.editSidesSeparately
      const st = centerlineData.streets[selection.streetIdx]
      const blockCustoms = store.blockCustoms || {}
      const fes = store._v2FrontageEdges || []
      // Defaults per V1.5 doctrine: outer=LU, inner=SW. Flip captures the
      // previous slot values and inverts the clicked slot only.
      const seedMats = sourceMeasure.materials && typeof sourceMeasure.materials === 'object'
        ? {
            outer: (sourceMeasure.materials.outer === 'SW') ? 'SW' : 'LU',
            inner: (sourceMeasure.materials.inner === 'LU') ? 'LU' : 'SW',
          }
        : { outer: 'LU', inner: 'SW' }
      const nextMats = { ...seedMats, [slot]: seedMats[slot] === 'LU' ? 'SW' : 'LU' }

      const otherSide = side === 'left' ? 'right' : 'left'
      const sides = editSep ? [side] : [side, otherSide]
      const chainSeed = innerEdgeMeasure(
        chainMeasure(st), st.anchor === 'inner-edge' ? st.innerSign : 0
      )
      const entries = []
      const pushFe = (feX, s) => {
        if (!feX) return
        // Seed each fe from its own custom (preserve its widths) else the
        // chain default; only the materials change.
        const seed = blockCustoms[feX.blockKey]?.[feX.edgeOrd] || chainSeed[s] || sourceMeasure
        entries.push({ blockKey: feX.blockKey, edgeOrd: feX.edgeOrd, measure: { ...seed, materials: { ...nextMats } } })
      }
      if (mode?.type === 'global') {
        for (const s of sides) for (const feX of feesForChainSide(fes, st, s)) pushFe(feX, s)
      } else {
        for (const s of sides) pushFe(s === side ? fe : findFeForSide(selection.streetIdx, segOrd, s), s)
      }
      if (!entries.length) return false
      store.writeBlockEdgeCustoms(entries)
      useCartographStore.setState({ status: `Flipped ${slot} strip material (${mode?.type === 'global' ? 'chain' : 'block'})` })
      return true
    }
    // Unified ctrl/right gesture: handle hit = no-op (handles drag-only);
    // strip body = flip that strip's material.
    const handleCtrlOrRight = (e) => {
      if (!selection) return false
      const p = screenToWorld(e.clientX, e.clientY, camera, gl.domElement)
      if (hitHandle(p)) return false
      return tryFlipStripMaterial(p)
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
  }, [active, gl, camera, selection, onPointerDown, onPointerMove, onPointerUp, deselectStreet, centerlineData, findFeForSide, blockCustoms, ixByChain])

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
