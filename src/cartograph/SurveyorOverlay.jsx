import { useMemo, useCallback, useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useCartographStore from './stores/useCartographStore.js'
import { polylineRibbon } from './overlayGeom.js'
import { innerEdgeOffsetPolyline, defaultMeasure } from './streetProfiles.js'

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

// Survey is an inspector on skeleton geometry. Left-click = select a
// street or a node. No drag, no hide, no delete — geometry is owned by
// skeleton.js and the overlay file (TBD) carries only non-geometric
// intent (caps, couplers, measure).
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
  const toggleCoupler = useCartographStore(s => s.toggleCoupler)

  // The set of chain indices that belong to the same corridor as the
  // selected street. When two divided carriageways share a corridor
  // with their bidirectional continuation, clicking any chain highlights
  // all of them.
  const selectedCorridor = selectedStreet !== null
    ? (corridorByIdx.get(selectedStreet) || new Set([selectedStreet]))
    : null

  const { camera, gl } = useThree()
  const active = tool === 'surveyor'

  const { lineGeo, nodePositions } = useMemo(() => {
    const empty = { lineGeo: null, nodePositions: [] }
    if (!active || selectedStreet === null) return empty
    const st = centerlineData.streets[selectedStreet]
    if (!st) return empty
    const linePoints = st.points.map(p => new THREE.Vector3(p[0], 0.3, p[1]))
    const lineGeo = linePoints.length >= 2
      ? new THREE.BufferGeometry().setFromPoints(linePoints)
      : null
    return { lineGeo, nodePositions: st.points }
  }, [active, selectedStreet, centerlineData])

  const onPointerDown = useCallback((e) => {
    if (!active || spaceDown || e.button !== 0) return
    const p = screenToWorld(e.clientX, e.clientY, camera, gl.domElement)
    const nodeThresh = 5 / (camera.zoom || 1)
    const lineThresh = 8 / (camera.zoom || 1)

    if (selectedStreet !== null) {
      const st = centerlineData.streets[selectedStreet]
      if (st) {
        for (let i = 0; i < st.points.length; i++) {
          if (Math.hypot(p.x - st.points[i][0], p.z - st.points[i][1]) < nodeThresh) {
            // Ctrl/Meta+click on an interior node toggles a coupler there.
            // Endpoints (idx 0 and idx n-1) are already chain boundaries.
            if ((e.ctrlKey || e.metaKey) && i > 0 && i < st.points.length - 1) {
              toggleCoupler(selectedStreet, i)
              e.stopPropagation()
              return
            }
            selectNode(i)
            e.stopPropagation()
            return
          }
        }
      }
    }

    let bestDist = Infinity, bestIdx = -1
    for (let i = 0; i < centerlineData.streets.length; i++) {
      const st = centerlineData.streets[i]
      const d = distToPolyline(st.points, p.x, p.z)
      if (d < lineThresh && d < bestDist) { bestDist = d; bestIdx = i }
    }
    if (bestIdx >= 0) {
      selectStreet(bestIdx)
      e.stopPropagation()
      return
    }

    deselectStreet()
  }, [active, spaceDown, camera, gl, selectedStreet, centerlineData, selectStreet, selectNode, deselectStreet, toggleCoupler])

  const onPointerMove = useCallback((e) => {
    if (!active || spaceDown) { useCartographStore.getState().setHoverTarget(false); return }
    const p = screenToWorld(e.clientX, e.clientY, camera, gl.domElement)
    const nodeThresh = 5 / (camera.zoom || 1)
    const lineThresh = 8 / (camera.zoom || 1)
    let hit = false
    if (selectedStreet !== null) {
      const st = centerlineData.streets[selectedStreet]
      if (st) {
        for (const pt of st.points) {
          if (Math.hypot(p.x - pt[0], p.z - pt[1]) < nodeThresh) { hit = true; break }
        }
      }
    }
    if (!hit) {
      for (const st of centerlineData.streets) {
        if (st.points.length < 2) continue
        if (distToPolyline(st.points, p.x, p.z) < lineThresh) { hit = true; break }
      }
    }
    useCartographStore.getState().setHoverTarget(hit)
  }, [active, spaceDown, camera, gl, selectedStreet, centerlineData])

  useEffect(() => {
    if (!active) return
    const onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      if (e.key === 'Escape') { deselectStreet(); return }
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
    return () => {
      dom.removeEventListener('pointerdown', onPointerDown, opts)
      dom.removeEventListener('pointermove', onPointerMove, opts)
    }
  }, [active, gl, onPointerDown, onPointerMove])

  // Materials (hooks must run unconditionally).
  const centerlineMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#0a1a4a', depthTest: false, transparent: true, opacity: 1,
  }), [])
  const selectedMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffcc00', depthTest: false, transparent: true, opacity: 1,
  }), [])

  if (!active) return null

  const OVERLAY_Z = 10000
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

      {selectedStreet !== null && (() => {
        const sel = centerlineData.streets[selectedStreet]
        const couplerSet = new Set((sel?.couplers || [])
          .map(c => typeof c === 'number' ? c : c.pointIdx)
          .filter(c => Number.isFinite(c)))
        return nodePositions.map((pt, i) => {
          const isSelected = i === selectedNode
          const isCoupler = couplerSet.has(i)
          const radius = isSelected ? 2.5 : 1.8
          // Coupler = orange diamond; selected = yellow circle; default = white circle.
          const color = isCoupler ? '#ff7a1a' : (isSelected ? '#ffcc00' : '#ffffff')
          // Diamonds rotate 45°; circles use a many-segment circle.
          const segments = isCoupler ? 4 : 20
          const rotZ = isCoupler ? Math.PI / 4 : 0
          return (
            <group key={i} position={[pt[0], 0.4, pt[1]]} rotation={[0, 0, rotZ]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={OVERLAY_Z + 5}>
                <ringGeometry args={[radius, radius + 0.6, segments]} />
                <meshBasicMaterial color="#000" transparent opacity={0.6}
                  side={THREE.DoubleSide} depthTest={false} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={OVERLAY_Z + 6}>
                <circleGeometry args={[radius, segments]} />
                <meshBasicMaterial color={color} transparent opacity={1}
                  side={THREE.DoubleSide} depthTest={false} />
              </mesh>
            </group>
          )
        })
      })()}
    </group>
  )
}
