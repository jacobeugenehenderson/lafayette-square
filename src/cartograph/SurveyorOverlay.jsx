import { useMemo, useRef, useCallback, useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useCartographStore from './stores/useCartographStore.js'
import { getHalfWidth } from './streetProfiles.js'
import { polylineRibbon } from './overlayGeom.js'

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

// 2026-04-16: Private `buildRibbonGeo()` removed. StreetRibbons is now the single
// renderer of street geometry (including dead-end caps via centerlines.capStyle,
// propagated through the pipeline). This overlay emits only edit affordances:
// centerlines, nodes, selection halos. Map-underneath comes from StreetRibbons.

export default function SurveyorOverlay() {
  const tool = useCartographStore(s => s.tool)
  const spaceDown = useCartographStore(s => s.spaceDown)
  const selectedStreet = useCartographStore(s => s.selectedStreet)
  const selectedNode = useCartographStore(s => s.selectedNode)
  const centerlineData = useCartographStore(s => s.centerlineData)
  const selectStreet = useCartographStore(s => s.selectStreet)
  const selectNode = useCartographStore(s => s.selectNode)
  const deselectStreet = useCartographStore(s => s.deselectStreet)
  const moveNode = useCartographStore(s => s.moveNode)

  const { camera, gl } = useThree()
  const dragRef = useRef(null)
  const active = tool === 'surveyor'

  // ── Selected street: editable nodes ──
  const { lineGeo, nodePositions, hiddenNodes, couplers, segmentTangents } = useMemo(() => {
    if (!active || selectedStreet === null) return { lineGeo: null, nodePositions: [], hiddenNodes: new Set(), couplers: new Set(), segmentTangents: {} }
    const st = centerlineData.streets[selectedStreet]
    if (!st) return { lineGeo: null, nodePositions: [], hiddenNodes: new Set(), couplers: new Set(), segmentTangents: {} }

    const hidden = new Set(st.hiddenNodes || [])
    const activePts = st.points.filter((_, i) => !hidden.has(i))

    const linePoints = activePts.map(p => new THREE.Vector3(p[0], 0.3, p[1]))
    const lineGeo = linePoints.length >= 2
      ? new THREE.BufferGeometry().setFromPoints(linePoints)
      : null

    // Per-coupler tangent (street direction at that node) — used to orient the
    // semicircle pair so they face along the street.
    const couplerSet = new Set(st.couplers || [])
    const tangents = {}
    for (const i of couplerSet) {
      const prev = st.points[Math.max(0, i - 1)]
      const next = st.points[Math.min(st.points.length - 1, i + 1)]
      const dx = next[0] - prev[0], dz = next[1] - prev[1]
      const len = Math.hypot(dx, dz) || 1
      tangents[i] = Math.atan2(dx / len, dz / len)
    }

    return { lineGeo, nodePositions: st.points, hiddenNodes: hidden, couplers: couplerSet, segmentTangents: tangents }
  }, [active, selectedStreet, centerlineData])

  // ── Pointer handlers ──
  const onPointerDown = useCallback((e) => {
    if (!active || spaceDown || e.button !== 0) return
    const p = screenToWorld(e.clientX, e.clientY, camera, gl.domElement)
    const nodeThresh = 3 / (camera.zoom || 1)
    const lineThresh = 5 / (camera.zoom || 1)

    if (selectedStreet !== null) {
      const st = centerlineData.streets[selectedStreet]
      if (st) {
        for (let i = 0; i < st.points.length; i++) {
          if (Math.hypot(p.x - st.points[i][0], p.z - st.points[i][1]) < nodeThresh) {
            selectNode(i)
            useCartographStore.getState().beginDrag(selectedStreet)
            dragRef.current = { streetIdx: selectedStreet, nodeIdx: i }
            e.stopPropagation()
            return
          }
        }
      }
    }

    let bestDist = Infinity, bestIdx = -1
    for (let i = 0; i < centerlineData.streets.length; i++) {
      const st = centerlineData.streets[i]
      // Don't skip disabled — they need to be selectable to re-enable
      const d = distToPolyline(st.points, p.x, p.z)
      if (d < lineThresh && d < bestDist) { bestDist = d; bestIdx = i }
    }
    if (bestIdx >= 0) {
      selectStreet(bestIdx)
      e.stopPropagation()
      return
    }

    deselectStreet()
  }, [active, spaceDown, camera, gl, selectedStreet, centerlineData, selectStreet, selectNode, deselectStreet])

  const onPointerMove = useCallback((e) => {
    if (dragRef.current) {
      const p = screenToWorld(e.clientX, e.clientY, camera, gl.domElement)
      moveNode(dragRef.current.streetIdx, dragRef.current.nodeIdx,
        Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100)
      return
    }
    // Hover detection for cursor
    if (!active || spaceDown) { useCartographStore.getState().setHoverTarget(false); return }
    const p = screenToWorld(e.clientX, e.clientY, camera, gl.domElement)
    const nodeThresh = 3 / (camera.zoom || 1)
    const lineThresh = 5 / (camera.zoom || 1)
    let hit = false
    // Check selected street's nodes
    if (selectedStreet !== null) {
      const st = centerlineData.streets[selectedStreet]
      if (st) {
        for (const pt of st.points) {
          if (Math.hypot(p.x - pt[0], p.z - pt[1]) < nodeThresh) { hit = true; break }
        }
      }
    }
    // Check all street lines
    if (!hit) {
      for (const st of centerlineData.streets) {
        if (st.points.length < 2) continue
        if (distToPolyline(st.points, p.x, p.z) < lineThresh) { hit = true; break }
      }
    }
    useCartographStore.getState().setHoverTarget(hit)
  }, [active, spaceDown, camera, gl, moveNode, selectedStreet, centerlineData])

  const onPointerUp = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    useCartographStore.getState()._saveCenterlines()
  }, [])

  // ── Keyboard ──
  useEffect(() => {
    if (!active) return
    const onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      const { selectedStreet: si, selectedNode: ni, centerlineData: cd } = useCartographStore.getState()
      if (si === null) return
      const st = cd.streets[si]
      if (!st) return

      // Cmd+Z / Ctrl+Z = undo on this street
      if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        useCartographStore.getState().undoStreet()
        return
      }
      if (e.key === 'Escape') { deselectStreet(); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && ni !== null) {
        e.preventDefault()
        useCartographStore.getState().toggleNodeHidden(ni)
        return
      }
      if (ni === null) return
      const step = e.shiftKey ? 1.0 : 0.15
      let dx = 0, dz = 0
      if (e.key === 'ArrowLeft') dx = -step
      else if (e.key === 'ArrowRight') dx = step
      else if (e.key === 'ArrowUp') dz = -step
      else if (e.key === 'ArrowDown') dz = step
      else return
      e.preventDefault()
      const pt = st.points[ni]
      moveNode(si, ni, +(pt[0] + dx).toFixed(2), +(pt[1] + dz).toFixed(2))
      useCartographStore.getState()._saveCenterlines()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, deselectStreet, moveNode])

  // Right-click a node (selected street) → toggle split coupler at that node.
  // No coupler at endpoints (0, n-1) — those are the natural ends already.
  const onContextMenu = useCallback((e) => {
    if (!active) return
    if (selectedStreet === null) return
    const p = screenToWorld(e.clientX, e.clientY, camera, gl.domElement)
    const nodeThresh = 3 / (camera.zoom || 1)
    const st = centerlineData.streets[selectedStreet]
    if (!st) return
    for (let i = 1; i < st.points.length - 1; i++) {
      if (Math.hypot(p.x - st.points[i][0], p.z - st.points[i][1]) < nodeThresh) {
        e.preventDefault()
        e.stopPropagation()
        useCartographStore.getState().toggleCoupler(i)
        return
      }
    }
  }, [active, selectedStreet, centerlineData, camera, gl])

  // ── Attach pointer events to canvas (capture phase) ──
  // Capture runs before MapControls' bubble-phase pan handler, so a click on
  // a street selects instead of being eaten by pan.
  useEffect(() => {
    if (!active) return
    const dom = gl.domElement
    const opts = { capture: true }
    dom.addEventListener('pointerdown', onPointerDown, opts)
    dom.addEventListener('pointermove', onPointerMove, opts)
    dom.addEventListener('pointerup', onPointerUp, opts)
    dom.addEventListener('contextmenu', onContextMenu, opts)
    return () => {
      dom.removeEventListener('pointerdown', onPointerDown, opts)
      dom.removeEventListener('pointermove', onPointerMove, opts)
      dom.removeEventListener('pointerup', onPointerUp, opts)
      dom.removeEventListener('contextmenu', onContextMenu, opts)
    }
  }, [active, gl, onPointerDown, onPointerMove, onPointerUp, onContextMenu])

  // ── Materials ──
  // All hooks must run on every render (React hook rules). Early return moved
  // below all hook calls.
  // Royal-blue thick centerlines — same affordance as Measure mode.
  const centerlineMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#2250E8', depthTest: false,
  }), [])
  const disabledMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ff4444', transparent: true, opacity: 0.35, depthTest: false,
  }), [])
  const selectedMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffcc00', depthTest: false,
  }), [])

  // Early return moved here — after all hooks (React hook rules).
  if (!active) return null

  // Overlay must draw above ribbons/faces/etc. — ribbon materials have
  // polygonOffset + priority that can let them overwrite depthTest:false lines
  // with a default renderOrder of 0. Force overlay geometry to the top.
  const OVERLAY_Z = 10000
  return (
    <group position={[0, 0.2, 0]}>
      {/* All centerlines: royal blue thick ribbons (disabled = red) */}
      {centerlineData.streets?.map((st, i) => {
        if (st.points.length < 2) return null
        const isSel = i === selectedStreet
        const geo = polylineRibbon(st.points, isSel ? 0.45 : 0.35, 0.1)
        if (!geo) return null
        const mat = st.disabled ? disabledMat : (isSel ? selectedMat : centerlineMat)
        return (
          <mesh key={`cl-${i}`} geometry={geo} material={mat}
            renderOrder={OVERLAY_Z + (isSel ? 3 : 1)} />
        )
      })}

      {/* Cap previews at endpoints of selected street — show what the renderer
          will produce for the current capStart / capEnd setting. */}
      {selectedStreet !== null && (() => {
        const st = centerlineData.streets[selectedStreet]
        if (!st || st.points.length < 2) return null
        const pts = st.points
        const last = pts.length - 1
        const hw = getHalfWidth(st.type || 'residential')
        const previews = []
        const mkPreview = (pt, neighborPt, cap, key) => {
          if (!cap) return
          // Tangent = direction AWAY from street body (from neighbor toward endpoint)
          const tx = pt[0] - neighborPt[0], tz = pt[1] - neighborPt[1]
          const tlen = Math.hypot(tx, tz) || 1
          const tnx = tx / tlen, tnz = tz / tlen
          const px = -tnz, pz = tnx  // perpendicular
          if (cap === 'round') {
            // Semicircle arc preview (radius = street half-width)
            const segments = 24
            const vecs = []
            for (let j = 0; j <= segments; j++) {
              const a = (j / segments) * Math.PI
              const dx = Math.cos(a) * px + Math.sin(a) * tnx
              const dz = Math.cos(a) * pz + Math.sin(a) * tnz
              vecs.push(new THREE.Vector3(pt[0] + dx * hw, 0.35, pt[1] + dz * hw))
            }
            const geo = new THREE.BufferGeometry().setFromPoints(vecs)
            previews.push(
              <primitive key={key} object={new THREE.Line(geo, new THREE.LineBasicMaterial({
                color: '#00ddff', transparent: true, opacity: 0.85, depthTest: false,
              }))} renderOrder={OVERLAY_Z + 4} />
            )
          } else if (cap === 'blunt') {
            // Perpendicular bar across the street width, nudged slightly outward
            const bar = [
              new THREE.Vector3(pt[0] + px * hw, 0.35, pt[1] + pz * hw),
              new THREE.Vector3(pt[0] - px * hw, 0.35, pt[1] - pz * hw),
            ]
            const geo = new THREE.BufferGeometry().setFromPoints(bar)
            previews.push(
              <primitive key={key} object={new THREE.Line(geo, new THREE.LineBasicMaterial({
                color: '#00ddff', transparent: true, opacity: 0.85, depthTest: false, linewidth: 2,
              }))} renderOrder={OVERLAY_Z + 4} />
            )
          }
        }
        mkPreview(pts[0], pts[1], st.capStart, 'cap-start')
        mkPreview(pts[last], pts[last - 1], st.capEnd, 'cap-end')
        return previews
      })()}

      {/* Nodes: large, high-contrast, easy to grab.  Coupled nodes (st.couplers)
          render as paired semicircles facing along the street — the "extension
          cord" affordance — with a small gap between halves. Right-click any
          interior node to toggle. */}
      {selectedStreet !== null && nodePositions.map((pt, i) => {
        const isSelected = i === selectedNode
        const isHidden = hiddenNodes.has(i)
        const isCoupled = couplers.has(i)
        const radius = isSelected ? 2.5 : isHidden ? 1.2 : 1.8
        const color = isSelected ? '#ffcc00' : isHidden ? '#ff4444' : '#ffffff'
        const opacity = isHidden ? 0.5 : 1

        if (isCoupled) {
          // Two semicircle halves split perpendicular to the street tangent,
          // separated by ~radius * 0.6m so the gap reads clearly.
          const ang = segmentTangents[i] || 0
          const gap = radius * 0.7
          const half = (sign) => (
            <mesh rotation={[-Math.PI / 2, 0, ang + (sign > 0 ? Math.PI : 0)]}
              position={[Math.sin(ang) * gap * sign * 0.5, 0, Math.cos(ang) * gap * sign * 0.5]}
              renderOrder={OVERLAY_Z + 6}>
              <circleGeometry args={[radius, 20, 0, Math.PI]} />
              <meshBasicMaterial color={color} transparent opacity={opacity}
                side={THREE.DoubleSide} depthTest={false} />
            </mesh>
          )
          return (
            <group key={i} position={[pt[0], 0.4, pt[1]]}>
              {/* Dark outline pair */}
              <mesh rotation={[-Math.PI / 2, 0, ang]} renderOrder={OVERLAY_Z + 5}>
                <ringGeometry args={[radius, radius + 0.6, 20, 1, 0, Math.PI]} />
                <meshBasicMaterial color="#000" transparent opacity={opacity * 0.6}
                  side={THREE.DoubleSide} depthTest={false} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, ang + Math.PI]} renderOrder={OVERLAY_Z + 5}>
                <ringGeometry args={[radius, radius + 0.6, 20, 1, 0, Math.PI]} />
                <meshBasicMaterial color="#000" transparent opacity={opacity * 0.6}
                  side={THREE.DoubleSide} depthTest={false} />
              </mesh>
              {half(-1)}
              {half(+1)}
            </group>
          )
        }

        return (
          <group key={i} position={[pt[0], 0.4, pt[1]]}>
            {/* Dark outline ring for contrast */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={OVERLAY_Z + 5}>
              <ringGeometry args={[radius, radius + 0.6, 20]} />
              <meshBasicMaterial color="#000" transparent opacity={opacity * 0.6}
                side={THREE.DoubleSide} depthTest={false} />
            </mesh>
            {/* Filled node */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={OVERLAY_Z + 6}>
              <circleGeometry args={[radius, 20]} />
              <meshBasicMaterial color={color} transparent opacity={opacity}
                side={THREE.DoubleSide} depthTest={false} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
