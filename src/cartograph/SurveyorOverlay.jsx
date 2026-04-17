import { useMemo, useRef, useCallback, useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useCartographStore from './stores/useCartographStore.js'
import { getHalfWidth } from './streetProfiles.js'

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
  const mode = useCartographStore(s => s.mode)
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
  const active = mode === 'surveyor'

  // ── Selected street: editable nodes ──
  const { lineGeo, nodePositions, hiddenNodes } = useMemo(() => {
    if (!active || selectedStreet === null) return { lineGeo: null, nodePositions: [], hiddenNodes: new Set() }
    const st = centerlineData.streets[selectedStreet]
    if (!st) return { lineGeo: null, nodePositions: [], hiddenNodes: new Set() }

    const hidden = new Set(st.hiddenNodes || [])
    const activePts = st.points.filter((_, i) => !hidden.has(i))

    const linePoints = activePts.map(p => new THREE.Vector3(p[0], 0.3, p[1]))
    const lineGeo = linePoints.length >= 2
      ? new THREE.BufferGeometry().setFromPoints(linePoints)
      : null

    return { lineGeo, nodePositions: st.points, hiddenNodes: hidden }
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
    return () => {
      dom.removeEventListener('pointerdown', onPointerDown, opts)
      dom.removeEventListener('pointermove', onPointerMove, opts)
      dom.removeEventListener('pointerup', onPointerUp, opts)
    }
  }, [active, gl, onPointerDown, onPointerMove, onPointerUp])

  // ── Selected street line objects ──
  const lineObjects = useMemo(() => {
    if (!lineGeo) return null
    const shadow = new THREE.Line(lineGeo,
      new THREE.LineBasicMaterial({ color: '#000', transparent: true, opacity: 0.7, linewidth: 1 }))
    const main = new THREE.Line(lineGeo,
      new THREE.LineBasicMaterial({ color: '#ffcc00', depthTest: false }))
    return { shadow, main }
  }, [lineGeo])

  // ── Materials ──
  // All hooks must run on every render (React hook rules). Early return moved
  // below all hook calls.
  // Unselected centerlines: visible white with enough contrast on aerial
  const centerlineMat = useMemo(() => new THREE.LineBasicMaterial({
    color: '#ffffff', transparent: true, opacity: 0.7, depthTest: false,
  }), [])
  // Unselected centerlines shadow for readability on light aerial
  const centerlineShadowMat = useMemo(() => new THREE.LineBasicMaterial({
    color: '#000000', transparent: true, opacity: 0.4, depthTest: false,
  }), [])
  // Disabled streets: ghosted red so they're findable but clearly off
  const disabledMat = useMemo(() => new THREE.LineBasicMaterial({
    color: '#ff4444', transparent: true, opacity: 0.3, depthTest: false,
  }), [])

  // Early return moved here — after all hooks (React hook rules).
  if (!active) return null

  return (
    <group position={[0, 0.2, 0]}>
      {/* All centerlines: active = white with shadow, disabled = ghosted red */}
      {centerlineData.streets?.map((st, i) => {
        if (st.points.length < 2) return null
        if (i === selectedStreet) return null // selected street drawn separately
        const pts = st.points.map(p => new THREE.Vector3(p[0], 0.1, p[1]))
        const geo = new THREE.BufferGeometry().setFromPoints(pts)
        if (st.disabled) {
          return (
            <primitive key={`cl-${i}`} object={new THREE.Line(geo, disabledMat)} />
          )
        }
        return (
          <group key={`cl-${i}`}>
            <primitive object={new THREE.Line(geo.clone(), centerlineShadowMat)} position={[0.3, -0.05, 0.3]} />
            <primitive object={new THREE.Line(geo, centerlineMat)} />
          </group>
        )
      })}

      {/* Selected street: bold yellow centerline */}
      {lineObjects && (
        <>
          <primitive object={lineObjects.shadow} />
          <primitive object={lineObjects.main} />
        </>
      )}

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
              }))} />
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
              }))} />
            )
          }
        }
        mkPreview(pts[0], pts[1], st.capStart, 'cap-start')
        mkPreview(pts[last], pts[last - 1], st.capEnd, 'cap-end')
        return previews
      })()}

      {/* Nodes: large, high-contrast, easy to grab */}
      {selectedStreet !== null && nodePositions.map((pt, i) => {
        const isSelected = i === selectedNode
        const isHidden = hiddenNodes.has(i)
        const radius = isSelected ? 2.5 : isHidden ? 1.2 : 1.8
        const color = isSelected ? '#ffcc00' : isHidden ? '#ff4444' : '#ffffff'
        const opacity = isHidden ? 0.5 : 1

        return (
          <group key={i} position={[pt[0], 0.4, pt[1]]}>
            {/* Dark outline ring for contrast */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[radius, radius + 0.6, 20]} />
              <meshBasicMaterial color="#000" transparent opacity={opacity * 0.6}
                side={THREE.DoubleSide} depthTest={false} />
            </mesh>
            {/* Filled node */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
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
