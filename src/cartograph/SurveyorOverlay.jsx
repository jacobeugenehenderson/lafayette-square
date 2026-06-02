import { useMemo, useCallback, useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useCartographStore from './stores/useCartographStore.js'
import { polylineRibbon } from './overlayGeom.js'
import { innerEdgeMeasure } from './streetProfiles.js'
import { chainMeasure, findFeForSide, applyKindToMeasure } from './measureModel.js'
import { readFeCustom } from '../lib/feCustomKey.js'
import { resolveChainSegmentation } from '../lib/buildBlockGeometryV2.js'

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

// Closest point on the polyline to (px,pz) — the projected click, used to
// seed the aerial focus loader at the operator's eye.
function projectOntoPolyline(pts, px, pz) {
  let best = Infinity, bx = pts[0][0], bz = pts[0][1]
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1]
    const dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az
    const len2 = dx * dx + dz * dz
    const t = len2 > 1e-6 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0
    const cx = ax + t * dx, cz = az + t * dz
    const d = Math.hypot(px - cx, pz - cz)
    if (d < best) { best = d; bx = cx; bz = cz }
  }
  return { x: bx, z: bz }
}

// Polyline midpoint + perpendicular unit vector. The Survey asphalt-edge handle
// anchors at the chain midpoint (whole-chain authoring is the Survey default —
// the tile construction takes one asphalt width per chain side).
function midAndPerp(pts) {
  let total = 0
  for (let j = 1; j < pts.length; j++) total += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1])
  const target = 0.5 * total
  let acc = 0, segI = 0, segT = 0
  for (let j = 0; j < pts.length - 1; j++) {
    const sl = Math.hypot(pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1])
    if (acc + sl >= target) { segI = j; segT = sl > 1e-6 ? (target - acc) / sl : 0; break }
    acc += sl
  }
  const a = pts[segI], b = pts[Math.min(segI + 1, pts.length - 1)]
  const cx = a[0] + (b[0] - a[0]) * segT
  const cz = a[1] + (b[1] - a[1]) * segT
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const len = Math.hypot(dx, dz) || 1
  return { cx, cz, nx: -dz / len, nz: dx / len }
}

// Local frame at the point on the polyline closest to (px,pz): the anchor +
// perpendicular unit vector at the operator's click, so handles appear adjacent
// to touch-down. Mirrors MeasureOverlay.frameAtPoint.
function frameAtPoint(pts, px, pz) {
  let best = Infinity, bi = 0, bcx = pts[0][0], bcz = pts[0][1]
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1]
    const dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az
    const len2 = dx * dx + dz * dz
    const t = len2 > 1e-6 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0
    const cx = ax + t * dx, cz = az + t * dz
    const d = Math.hypot(px - cx, pz - cz)
    if (d < best) { best = d; bi = i; bcx = cx; bcz = cz }
  }
  const a = pts[bi], b = pts[Math.min(bi + 1, pts.length - 1)]
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const len = Math.hypot(dx, dz) || 1
  return { cx: bcx, cz: bcz, nx: -dz / len, nz: dx / len, segI: bi }
}

// Natural-segment ordinal (stretch between IX vertices) containing polyline
// segment `segI`. Mirrors MeasureOverlay — per-block authoring writes the fe at
// this ordinal; the tile per-fe resolution reads the same ordinal.
function naturalSegmentOrdinal(street, segI, ixSet) {
  const n = (street.points || []).length
  if (n < 2) return 0
  const ixs = ixSet
    ? [...ixSet].filter(i => Number.isInteger(i) && i > 0 && i < n - 1).sort((a, b) => a - b)
    : []
  if (!ixs.length) return 0
  for (let k = 0; k < ixs.length; k++) if (segI < ixs[k]) return k
  return ixs.length
}

// Handle pill dimensions (meters) — same grammar as Section's handles.
const HANDLE_LONG = 5.0
const HANDLE_SHORT = 1.2
const HANDLE_BORDER = 0.35
const AMBER = '#ffb000'   // asphalt-edge handle — Survey's hardscape-silhouette colour

// Survey is the hardscape-SHAPE tool. Left-click = select a street or node
// (skeleton inspection). It also owns the ASPHALT-EDGE handle (pavementHW) — the
// outward stroke that sets how far the chain strokes into asphalt. Dragging it
// writes the per-street measure (the field the tile construction reads), so the
// asphalt follows live. Ped handles (treelawn/sidewalk) belong to Section
// (MeasureOverlay) and never show here — handle visibility is per-tool.
export default function SurveyorOverlay() {
  const tool = useCartographStore(s => s.tool)
  const spaceDown = useCartographStore(s => s.spaceDown)
  const selectedStreet = useCartographStore(s => s.selectedStreet)
  const selectedNode = useCartographStore(s => s.selectedNode)
  const centerlineData = useCartographStore(s => s.centerlineData)
  const corridorByIdx = useCartographStore(s => s.corridorByIdx)
  const selectStreet = useCartographStore(s => s.selectStreet)
  const selectNode = useCartographStore(s => s.selectNode)
  const deselectStreet = useCartographStore(s => s.deselectStreet)
  // The operator's click point on the selected centerline — the handles anchor
  // here (adjacent to touch-down) rather than at the chain midpoint. Shared with
  // Measure's anchor (same "where did you click on the chain" intent).
  const selectedMeasurePoint = useCartographStore(s => s.selectedMeasurePoint)
  const blockCustoms = useCartographStore(s => s.blockCustoms)
  const v2FrontageEdges = useCartographStore(s => s._v2FrontageEdges)

  // Coord-match IX identity per chain — shared with the tile per-fe resolution +
  // the walker, so a per-block write resolves the same segOrd the tile reads.
  const ixByChain = useMemo(
    () => resolveChainSegmentation(centerlineData?.streets || []),
    [centerlineData]
  )

  // The set of chain indices that belong to the same corridor as the
  // selected street.
  const selectedCorridor = selectedStreet !== null
    ? (corridorByIdx.get(selectedStreet) || new Set([selectedStreet]))
    : null

  const { camera, gl } = useThree()
  const active = tool === 'surveyor'

  const { nodePositions } = useMemo(() => {
    if (!active || selectedStreet === null) return { nodePositions: [] }
    const st = centerlineData.streets[selectedStreet]
    if (!st) return { nodePositions: [] }
    return { nodePositions: st.points }
  }, [active, selectedStreet, centerlineData])

  // Asphalt-edge handle positions for the selected street. One per side,
  // anchored adjacent to the operator's click point (selectedMeasurePoint) —
  // falling back to the chain midpoint before any click — offset perpendicular
  // by that side's pavementHW (the asphalt extent; the curb sits implicitly
  // beyond). Reads the per-street measure (chainMeasure) — the SAME field the
  // tile asphalt is built from, so the handle sits on the rendered asphalt edge.
  const asphaltHandles = useMemo(() => {
    if (!active || selectedStreet === null) return null
    const st = centerlineData.streets[selectedStreet]
    if (!st || st.disabled || !st.points || st.points.length < 2) return null
    const mp = selectedMeasurePoint
    const frame = mp ? frameAtPoint(st.points, mp.x, mp.z) : midAndPerp(st.points)
    const { cx, cz, nx, nz } = frame
    // Resolve the displayed width per-fe at the anchor's segment (so the handle
    // sits on the per-block asphalt edge after a per-block edit) layered over the
    // chain default — mirrors the tile's runMeasure resolution.
    const ordinal = naturalSegmentOrdinal(st, frame.segI ?? 0, ixByChain?.get(st))
    const chainM = chainMeasure(st)
    const feL = findFeForSide(v2FrontageEdges, st, ordinal, 'left')
    const feR = findFeForSide(v2FrontageEdges, st, ordinal, 'right')
    const measure = innerEdgeMeasure(
      {
        left: readFeCustom(blockCustoms, feL) || chainM.left,
        right: readFeCustom(blockCustoms, feR) || chainM.right,
        symmetric: chainM.symmetric,
      },
      st.anchor === 'inner-edge' ? st.innerSign : 0
    )
    const ax = -nz, az = nx
    const rotY = Math.atan2(ax, az)
    const handles = []
    for (const [sideKey, sign] of [['left', -1], ['right', +1]]) {
      const hw = measure[sideKey]?.pavementHW || 0
      if (hw <= 0) continue   // median-facing inner edge has no curb to drag
      handles.push({ side: sideKey, r: hw, x: cx + sign * nx * hw, z: cz + sign * nz * hw, rotY })
    }
    return { streetIdx: selectedStreet, ordinal, mid: { cx, cz, nx, nz }, handles }
  }, [active, selectedStreet, centerlineData, selectedMeasurePoint, blockCustoms, v2FrontageEdges, ixByChain])

  // rAF-throttle the asphalt-edge drag write — each write rebuilds the whole
  // tile mesh, far heavier than one frame. Buffer the latest, flush ≤1×/frame;
  // pointerup flushes the final value.
  const dragRef = useRef(null)
  const dragRafRef = useRef(null)
  const pendingDragRef = useRef(null)

  const applyAsphaltDrag = useCallback((streetIdx, side, r) => {
    if (!Number.isFinite(r)) return
    const store = useCartographStore.getState()
    const mirror = !store.editSidesSeparately
    const otherSide = side === 'left' ? 'right' : 'left'
    const sides = mirror ? [side, otherSide] : [side]
    // Whole-chain (global): write the per-chain measure — the tile base width.
    if (store.measureMode?.type === 'global') {
      store.setStreetPavementHW(streetIdx, side, r, mirror)
      return
    }
    // Per-block: write the fe at the click anchor (+ mirror). The tile's per-fe
    // resolution reads this back at the same (skelId, side, segOrd).
    const st = store.centerlineData?.streets?.[streetIdx]
    const fes = store._v2FrontageEdges || []
    const anchor = store.selectedMeasurePoint
    if (!st || !anchor) { store.setStreetPavementHW(streetIdx, side, r, mirror); return }
    const frame = frameAtPoint(st.points, anchor.x, anchor.z)
    const segOrd = naturalSegmentOrdinal(st, frame.segI ?? 0, ixByChain?.get(st))
    const chainSeed = innerEdgeMeasure(chainMeasure(st), st.anchor === 'inner-edge' ? st.innerSign : 0)
    const FALLBACK = { pavementHW: 5, treelawn: 1.5, sidewalk: 1.5, terminal: 'sidewalk' }
    const entries = []
    for (const s of sides) {
      const fe = findFeForSide(fes, st, segOrd, s)
      if (!fe) continue
      const seed = readFeCustom(store.blockCustoms, fe) || chainSeed[s] || FALLBACK
      entries.push({ fe, measure: applyKindToMeasure(seed, 'pavementHW', r) })
    }
    if (entries.length) store.writeBlockEdgeCustoms(entries)
  }, [ixByChain])

  const onPointerDown = useCallback((e) => {
    if (!active || spaceDown || e.button !== 0) return
    const p = screenToWorld(e.clientX, e.clientY, camera, gl.domElement)
    const nodeThresh = 5 / (camera.zoom || 1)
    const lineThresh = 8 / (camera.zoom || 1)

    // Priority 1: grab an asphalt-edge handle (hit-test in its local frame —
    // long axis along street, short axis across).
    if (asphaltHandles) {
      const ax = -asphaltHandles.mid.nz, az = asphaltHandles.mid.nx
      const nx = asphaltHandles.mid.nx, nz = asphaltHandles.mid.nz
      for (const h of asphaltHandles.handles) {
        const dx = p.x - h.x, dz = p.z - h.z
        if (Math.abs(dx * ax + dz * az) < HANDLE_LONG / 2 && Math.abs(dx * nx + dz * nz) < HANDLE_SHORT / 2) {
          dragRef.current = { streetIdx: asphaltHandles.streetIdx, side: h.side }
          e.stopPropagation()
          return
        }
      }
    }

    // Priority 2: select a node of the already-selected street.
    if (selectedStreet !== null) {
      const st = centerlineData.streets[selectedStreet]
      if (st) {
        for (let i = 0; i < st.points.length; i++) {
          if (Math.hypot(p.x - st.points[i][0], p.z - st.points[i][1]) < nodeThresh) {
            selectNode(i); e.stopPropagation(); return
          }
        }
      }
    }

    // Priority 3: select a street by its centerline.
    let bestDist = Infinity, bestIdx = -1
    for (let i = 0; i < centerlineData.streets.length; i++) {
      const st = centerlineData.streets[i]
      const d = distToPolyline(st.points, p.x, p.z)
      if (d < lineThresh && d < bestDist) { bestDist = d; bestIdx = i }
    }
    if (bestIdx >= 0) {
      selectStreet(bestIdx)
      // Seed the aerial focus loader with the projected click point so
      // hi-res tiles sharpen nearest the operator's eye first. Measure
      // stores this on its own click; Survey didn't until now.
      const seed = projectOntoPolyline(centerlineData.streets[bestIdx].points, p.x, p.z)
      useCartographStore.getState().setMeasurePoint({ x: seed.x, z: seed.z })
      e.stopPropagation()
      return
    }

    deselectStreet()
  }, [active, spaceDown, camera, gl, asphaltHandles, selectedStreet, centerlineData, selectStreet, selectNode, deselectStreet])

  const onPointerMove = useCallback((e) => {
    // Asphalt-edge drag in progress.
    if (dragRef.current) {
      const p = screenToWorld(e.clientX, e.clientY, camera, gl.domElement)
      const { streetIdx, side } = dragRef.current
      const cd = useCartographStore.getState().centerlineData
      const st = cd.streets[streetIdx]
      if (!st) return
      const r = Math.max(0.5, distToPolyline(st.points, p.x, p.z))
      useCartographStore.setState({ status: 'asphalt ½-width: ' + (r * 3.28084).toFixed(1) + 'ft' })
      pendingDragRef.current = { streetIdx, side, r }
      if (dragRafRef.current == null) {
        dragRafRef.current = requestAnimationFrame(() => {
          dragRafRef.current = null
          const pend = pendingDragRef.current
          if (pend) applyAsphaltDrag(pend.streetIdx, pend.side, pend.r)
        })
      }
      e.stopPropagation()
      return
    }

    // Hover feedback (selection / handle affordance).
    if (!active || spaceDown) { useCartographStore.getState().setHoverTarget(false); return }
    const p = screenToWorld(e.clientX, e.clientY, camera, gl.domElement)
    const nodeThresh = 5 / (camera.zoom || 1)
    const lineThresh = 8 / (camera.zoom || 1)
    let hit = false
    if (asphaltHandles) {
      const ax = -asphaltHandles.mid.nz, az = asphaltHandles.mid.nx
      const nx = asphaltHandles.mid.nx, nz = asphaltHandles.mid.nz
      for (const h of asphaltHandles.handles) {
        const dx = p.x - h.x, dz = p.z - h.z
        if (Math.abs(dx * ax + dz * az) < HANDLE_LONG / 2 && Math.abs(dx * nx + dz * nz) < HANDLE_SHORT / 2) { hit = true; break }
      }
    }
    if (!hit && selectedStreet !== null) {
      const st = centerlineData.streets[selectedStreet]
      if (st) for (const pt of st.points) {
        if (Math.hypot(p.x - pt[0], p.z - pt[1]) < nodeThresh) { hit = true; break }
      }
    }
    if (!hit) {
      for (const st of centerlineData.streets) {
        if (st.points.length < 2) continue
        if (distToPolyline(st.points, p.x, p.z) < lineThresh) { hit = true; break }
      }
    }
    useCartographStore.getState().setHoverTarget(hit)
  }, [active, spaceDown, camera, gl, asphaltHandles, selectedStreet, centerlineData, applyAsphaltDrag])

  const onPointerUp = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    if (dragRafRef.current != null) { cancelAnimationFrame(dragRafRef.current); dragRafRef.current = null }
    const pend = pendingDragRef.current
    pendingDragRef.current = null
    if (pend) applyAsphaltDrag(pend.streetIdx, pend.side, pend.r)
    useCartographStore.setState({ status: '' })
  }, [applyAsphaltDrag])

  useEffect(() => {
    if (!active) return
    const onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return
      // Enter = accept the edit, Escape = cancel — both deselect, which clears
      // the editing state so the map returns to opaque (Jacob's accept→opaque).
      if (e.key === 'Enter' || e.key === 'Escape') { deselectStreet(); return }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, deselectStreet])

  useEffect(() => {
    if (!active) return
    const dom = gl.domElement
    const opts = { capture: true }
    dom.addEventListener('pointerdown', onPointerDown, opts)
    dom.addEventListener('pointermove', onPointerMove, opts)
    dom.addEventListener('pointerup', onPointerUp, opts)
    return () => {
      dom.removeEventListener('pointerdown', onPointerDown, opts)
      dom.removeEventListener('pointermove', onPointerMove, opts)
      dom.removeEventListener('pointerup', onPointerUp, opts)
    }
  }, [active, gl, onPointerDown, onPointerMove, onPointerUp])

  // Materials (hooks must run unconditionally).
  const centerlineMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#0a1a4a', depthTest: false, transparent: true, opacity: 1,
  }), [])
  const selectedMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffcc00', depthTest: false, transparent: true, opacity: 1,
  }), [])

  if (!active) return null

  const OVERLAY_Z = 10000
  const { LONG, SHORT, BORDER } = { LONG: HANDLE_LONG, SHORT: HANDLE_SHORT, BORDER: HANDLE_BORDER }
  return (
    <group position={[0, 0.2, 0]}>
      {centerlineData.streets?.map((st, i) => {
        if (st.points.length < 2) return null
        const isSel = selectedCorridor?.has(i) || false
        const hw = isSel ? 0.55 : 0.4
        const geo = polylineRibbon(st.points, hw, 0.1)
        if (!geo) return null
        const mat = isSel ? selectedMat : centerlineMat
        return (
          <mesh key={`cl-${i}`} geometry={geo} material={mat}
            renderOrder={OVERLAY_Z + (isSel ? 3 : 1)} />
        )
      })}

      {selectedStreet !== null && nodePositions.map((pt, i) => {
        const isSelected = i === selectedNode
        const radius = isSelected ? 2.5 : 1.8
        const color = isSelected ? '#ffcc00' : '#ffffff'
        return (
          <group key={i} position={[pt[0], 0.4, pt[1]]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={OVERLAY_Z + 5}>
              <ringGeometry args={[radius, radius + 0.6, 20]} />
              <meshBasicMaterial color="#000" transparent opacity={0.6}
                side={THREE.DoubleSide} depthTest={false} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={OVERLAY_Z + 6}>
              <circleGeometry args={[radius, 20]} />
              <meshBasicMaterial color={color} transparent opacity={1}
                side={THREE.DoubleSide} depthTest={false} />
            </mesh>
          </group>
        )
      })}

      {/* Asphalt-edge handles (pavementHW) — amber pills at the asphalt extent,
          one per side. Drag perpendicular to set how far the chain strokes into
          asphalt. Section's ped handles never appear here (handle visibility is
          per-tool — Survey shows asphalt-edge + corner only). */}
      {asphaltHandles?.handles.map((h, i) => (
        <group key={`ah-${i}`} position={[h.x, 0.5, h.z]} rotation={[0, h.rotY, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={OVERLAY_Z + 9}>
            <planeGeometry args={[SHORT + BORDER, LONG + BORDER]} />
            <meshBasicMaterial color="#000000" side={THREE.DoubleSide} depthTest={false} transparent opacity={1} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={OVERLAY_Z + 10}>
            <planeGeometry args={[SHORT, LONG]} />
            <meshBasicMaterial color={AMBER} side={THREE.DoubleSide} depthTest={false} transparent opacity={1} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
