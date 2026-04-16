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

// Build a ribbon mesh from a polyline and half-width, with optional endcaps
// capStart/capEnd: 'round' | 'blunt' | null
function buildRibbonGeo(pts, halfWidth, capStart = null, capEnd = null) {
  if (pts.length < 2 || halfWidth < 0.1) return null
  const n = pts.length
  const CAP_SEGS = 8 // segments in a semicircle cap

  // Count vertices: ribbon body + optional caps
  const capStartVerts = capStart === 'round' ? CAP_SEGS + 1 : capStart === 'blunt' ? 2 : 0
  const capEndVerts = capEnd === 'round' ? CAP_SEGS + 1 : capEnd === 'blunt' ? 2 : 0
  const totalVerts = n * 2 + capStartVerts + capEndVerts

  const positions = new Float32Array(totalVerts * 3)
  const normals = new Float32Array(totalVerts * 3)
  const indices = []

  // Helper: write a vertex
  let vIdx = 0
  function addVert(x, z) {
    const i = vIdx++
    positions[i * 3] = x
    positions[i * 3 + 1] = 0
    positions[i * 3 + 2] = z
    normals[i * 3 + 1] = 1
    return i
  }

  // Compute perpendiculars
  const perps = []
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(n - 1, i + 1)]
    const dx = next[0] - prev[0], dz = next[1] - prev[1]
    const len = Math.sqrt(dx * dx + dz * dz) || 1
    perps.push({ nx: -dz / len, nz: dx / len })
  }

  // Body vertices: left/right pairs
  const bodyStart = vIdx
  for (let i = 0; i < n; i++) {
    const { nx, nz } = perps[i]
    addVert(pts[i][0] + nx * halfWidth, pts[i][1] + nz * halfWidth)  // left
    addVert(pts[i][0] - nx * halfWidth, pts[i][1] - nz * halfWidth)  // right
  }

  // Body triangles
  for (let i = 0; i < n - 1; i++) {
    const a = bodyStart + i * 2, b = bodyStart + i * 2 + 1
    const c = bodyStart + (i + 1) * 2, d = bodyStart + (i + 1) * 2 + 1
    indices.push(a, c, b, b, c, d)
  }

  // Endcap helper
  function addCap(ptIdx, direction) {
    // direction: -1 = start cap (faces backward), +1 = end cap (faces forward)
    const p = pts[ptIdx]
    const { nx, nz } = perps[ptIdx]
    // Tangent direction (along the street)
    const adj = direction === -1 ? pts[Math.min(n - 1, ptIdx + 1)] : pts[Math.max(0, ptIdx - 1)]
    let tx = p[0] - adj[0], tz = p[1] - adj[1]
    const tlen = Math.sqrt(tx * tx + tz * tz) || 1
    tx /= tlen; tz /= tlen

    const capType = direction === -1 ? capStart : capEnd
    const leftV = bodyStart + ptIdx * 2
    const rightV = bodyStart + ptIdx * 2 + 1

    if (capType === 'blunt') {
      // Blunt: two extra verts pushed out along tangent, forming a rectangle cap
      const lx = p[0] + nx * halfWidth + tx * halfWidth
      const lz = p[1] + nz * halfWidth + tz * halfWidth
      const rx = p[0] - nx * halfWidth + tx * halfWidth
      const rz = p[1] - nz * halfWidth + tz * halfWidth
      const cl = addVert(lx, lz)
      const cr = addVert(rx, rz)
      indices.push(leftV, cl, rightV, rightV, cl, cr)
    } else if (capType === 'round') {
      // Round: semicircle fan from left edge to right edge
      const center = addVert(p[0] + tx * 0, p[1] + tz * 0) // center at endpoint
      // Arc from left edge around to right edge
      const startAngle = Math.atan2(nz, nx)
      for (let s = 0; s < CAP_SEGS; s++) {
        const a0 = startAngle + (s / CAP_SEGS) * Math.PI * direction
        const a1 = startAngle + ((s + 1) / CAP_SEGS) * Math.PI * direction
        const v0 = s === 0 ? leftV : addVert(
          p[0] + Math.cos(a0) * halfWidth,
          p[1] + Math.sin(a0) * halfWidth
        )
        const v1 = s === CAP_SEGS - 1
          ? rightV
          : addVert(
              p[0] + Math.cos(a1) * halfWidth,
              p[1] + Math.sin(a1) * halfWidth
            )
        indices.push(center, v0, v1)
      }
    }
  }

  if (capStart) addCap(0, -1)
  if (capEnd) addCap(n - 1, 1)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions.slice(0, vIdx * 3), 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(normals.slice(0, vIdx * 3), 3))
  geo.setIndex(indices)
  return geo
}

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

  // ── All street width ribbons (shown when surveyor is active) ──
  const allRibbons = useMemo(() => {
    if (!active || !centerlineData.streets?.length) return null
    const geos = []
    const mats = []
    for (let i = 0; i < centerlineData.streets.length; i++) {
      const st = centerlineData.streets[i]
      if (st.disabled || st.points.length < 2) continue

      const hw = getHalfWidth(st.type || 'residential')

      // Dead-end streets get endcaps — round by default, togglable to blunt
      const capStyle = st.deadEnd ? (st.capStyle || 'round') : null
      const geo = buildRibbonGeo(st.points, hw, null, capStyle)
      if (!geo) continue

      const isSelected = i === selectedStreet
      geos.push({ geo, isSelected, idx: i })
    }
    return geos
  }, [active, centerlineData, selectedStreet])

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

  // ── Attach pointer events to canvas ──
  useEffect(() => {
    if (!active) return
    const dom = gl.domElement
    dom.addEventListener('pointerdown', onPointerDown)
    dom.addEventListener('pointermove', onPointerMove)
    dom.addEventListener('pointerup', onPointerUp)
    return () => {
      dom.removeEventListener('pointerdown', onPointerDown)
      dom.removeEventListener('pointermove', onPointerMove)
      dom.removeEventListener('pointerup', onPointerUp)
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

  if (!active) return null

  // ── Materials ──
  // Width ribbons: semi-transparent overlay showing computed pavement extent
  const ribbonMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#0088aa', transparent: true, opacity: 0.2,
    side: THREE.DoubleSide, depthTest: false,
  }), [])
  const ribbonSelectedMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffcc00', transparent: true, opacity: 0.3,
    side: THREE.DoubleSide, depthTest: false,
  }), [])
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

  return (
    <group position={[0, 0.2, 0]}>
      {/* All street width ribbons */}
      {allRibbons && allRibbons.map(({ geo, isSelected, idx }) => (
        <mesh key={`ribbon-${idx}`} geometry={geo}
          material={isSelected ? ribbonSelectedMat : ribbonMat} />
      ))}

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
