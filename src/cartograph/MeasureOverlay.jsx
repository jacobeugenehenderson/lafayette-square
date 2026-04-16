import { useMemo, useRef, useCallback, useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useCartographStore from './stores/useCartographStore.js'
import {
  getDefaultBands, bandsToCumulative, offsetPolyline,
  BAND_COLORS, SNAP_TARGETS, SNAP_RADIUS,
} from './streetProfiles.js'

const raycaster = new THREE.Raycaster()
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const intersectPt = new THREE.Vector3()

// Map-matching ribbon colors (from StreetRibbons.jsx MAT tokens)
const MAP_COLORS = {
  asphalt:            '#555550',
  'parking-parallel': '#555550',
  'parking-angled':   '#555550',
  gutter:             '#555550',
  curb:               '#c8a878',
  treelawn:           '#6a8a4a',
  sidewalk:           '#a09a8e',
  lawn:               '#4a6a3a',
}

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

function getStreetBands(st) {
  return st._bands || getDefaultBands(st.type || 'residential')
}

function snapIncrement(material, rawIncrement) {
  const targets = SNAP_TARGETS[material]
  if (!targets) return rawIncrement
  let best = rawIncrement, bestDist = Infinity
  for (const t of targets) {
    const d = Math.abs(rawIncrement - t)
    if (d < SNAP_RADIUS && d < bestDist) { bestDist = d; best = t }
  }
  return best
}

export default function MeasureOverlay() {
  const mode = useCartographStore(s => s.mode)
  const spaceDown = useCartographStore(s => s.spaceDown)
  const centerlineData = useCartographStore(s => s.centerlineData)
  const selectedStreet = useCartographStore(s => s.selectedStreet)
  const selectStreet = useCartographStore(s => s.selectStreet)
  const deselectStreet = useCartographStore(s => s.deselectStreet)

  const { camera, gl } = useThree()
  const active = mode === 'measure'
  const dragRef = useRef(null)

  // ── Pre-compute all street data (no geometry objects here) ────
  const streetData = useMemo(() => {
    if (!active || !centerlineData.streets?.length) return []
    const result = []
    for (let i = 0; i < centerlineData.streets.length; i++) {
      const st = centerlineData.streets[i]
      if (st.disabled || st.points.length < 2) continue
      try {
        const bands = getStreetBands(st)
        const cum = bandsToCumulative(bands)
        result.push({ idx: i, st, cum, isSelected: i === selectedStreet })
      } catch (err) {
        console.error('[Measure] street', i, err.message)
      }
    }
    return result
  }, [active, centerlineData, selectedStreet])

  // ── Memoize reusable materials ────────────────────────────────
  const mats = useMemo(() => ({
    center: new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthTest: false }),
    centerSel: new THREE.LineBasicMaterial({ color: '#ffcc00', depthTest: false }),
    shadow: new THREE.LineBasicMaterial({ color: '#000000', depthTest: false }),
  }), [])

  // ── Build all Three.js objects as stable refs ─────────────────
  const sceneObjects = useMemo(() => {
    if (!streetData.length) return null
    const objects = []

    for (const { idx, st, cum, isSelected } of streetData) {
      const group = { idx, meshes: [], lines: [] }

      // Centerline
      const clPts = st.points.map(p => new THREE.Vector3(p[0], 0.05, p[1]))
      const clGeo = new THREE.BufferGeometry().setFromPoints(clPts)
      group.lines.push({ geo: clGeo, mat: isSelected ? mats.centerSel : mats.center })

      // Edge strokes + ribbon fills for each band
      for (const c of cum) {
        const color = MAP_COLORS[c.material] || '#444'
        const edgeColor = BAND_COLORS[c.material] || '#888'

        for (const side of [1, -1]) {
          // Along-street edge stroke — always visible, bolder when selected
          const edge = offsetPolyline(st.points, c.outerR, side)
          const edgePts = edge.map(p => new THREE.Vector3(p[0], 0.08, p[1]))
          const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePts)
          const edgeMat = new THREE.LineBasicMaterial({
            color: edgeColor,
            transparent: !isSelected, opacity: isSelected ? 1 : 0.7,
            depthTest: false,
          })
          group.lines.push({ geo: edgeGeo, mat: edgeMat })

          // Ribbon fill (semi-transparent)
          const inner = offsetPolyline(st.points, c.innerR, side)
          const outer = offsetPolyline(st.points, c.outerR, side)
          const n = inner.length
          if (n < 2) continue

          const positions = new Float32Array(n * 2 * 3)
          const normals = new Float32Array(n * 2 * 3)
          const indices = []
          for (let j = 0; j < n; j++) {
            positions[j*6]   = inner[j][0]; positions[j*6+1] = 0; positions[j*6+2] = inner[j][1]
            positions[j*6+3] = outer[j][0]; positions[j*6+4] = 0; positions[j*6+5] = outer[j][1]
            normals[j*6+1] = 1; normals[j*6+4] = 1
          }
          for (let j = 0; j < n - 1; j++) {
            const a = j*2, b = j*2+1, c2 = (j+1)*2, d = (j+1)*2+1
            indices.push(a, c2, b, b, c2, d)
          }
          const fillGeo = new THREE.BufferGeometry()
          fillGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
          fillGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
          fillGeo.setIndex(indices)
          const fillMat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: isSelected ? 0.7 : 0.5,
            side: THREE.DoubleSide, depthTest: false,
          })
          group.meshes.push({ geo: fillGeo, mat: fillMat })
        }
      }

      // Caustic perpendicular (selected only)
      if (isSelected) {
        const t = 0.5 // midpoint for now
        // Find position and perp at midpoint
        let totalLen = 0
        for (let j = 1; j < st.points.length; j++) {
          totalLen += Math.hypot(st.points[j][0]-st.points[j-1][0], st.points[j][1]-st.points[j-1][1])
        }
        let target = t * totalLen, acc = 0, segI = 0, segT = 0
        for (let j = 0; j < st.points.length - 1; j++) {
          const sl = Math.hypot(st.points[j+1][0]-st.points[j][0], st.points[j+1][1]-st.points[j][1])
          if (acc + sl >= target) { segI = j; segT = (target - acc) / sl; break }
          acc += sl
        }
        const a = st.points[segI], b = st.points[Math.min(segI+1, st.points.length-1)]
        const cx = a[0] + (b[0]-a[0]) * segT
        const cz = a[1] + (b[1]-a[1]) * segT
        const dx = b[0]-a[0], dz = b[1]-a[1]
        const len = Math.sqrt(dx*dx + dz*dz) || 1
        const nx = -dz/len, nz = dx/len

        // Perpendicular line segments per band, both sides
        for (const c of cum) {
          for (const side of [1, -1]) {
            const fromX = cx + side*nx*c.innerR, fromZ = cz + side*nz*c.innerR
            const toX = cx + side*nx*c.outerR, toZ = cz + side*nz*c.outerR
            const segGeo = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(fromX, 0.1, fromZ),
              new THREE.Vector3(toX, 0.1, toZ),
            ])
            group.lines.push({
              geo: segGeo,
              mat: new THREE.LineBasicMaterial({ color: BAND_COLORS[c.material] || '#888', depthTest: false }),
            })
            // Node at outer tip
            group.nodePos = group.nodePos || []
            group.nodePos.push({ x: toX, z: toZ, color: BAND_COLORS[c.material] || '#888', bandIdx: cum.indexOf(c) })
          }
        }
      }

      objects.push(group)
    }
    return objects
  }, [streetData, mats])

  // ── Pointer handlers ──────────────────────────────────────────
  const onPointerDown = useCallback((e) => {
    if (!active || spaceDown || e.button !== 0) return
    const p = screenToWorld(e.clientX, e.clientY, camera, gl.domElement)
    const thresh = 4 / (camera.zoom || 1)
    const lineThresh = 6 / (camera.zoom || 1)

    // Check caustic nodes on selected street
    if (selectedStreet !== null && sceneObjects) {
      const selObj = sceneObjects.find(o => o.idx === selectedStreet)
      if (selObj?.nodePos) {
        for (const node of selObj.nodePos) {
          if (Math.hypot(p.x - node.x, p.z - node.z) < thresh) {
            dragRef.current = { streetIdx: selectedStreet, bandIdx: node.bandIdx }
            e.stopPropagation()
            return
          }
        }
      }
    }

    // Check all streets
    let bestDist = Infinity, bestIdx = -1
    for (const { idx, st } of streetData) {
      const d = distToPolyline(st.points, p.x, p.z)
      if (d < lineThresh && d < bestDist) { bestDist = d; bestIdx = idx }
    }
    if (bestIdx >= 0) { selectStreet(bestIdx); e.stopPropagation(); return }
    deselectStreet()
  }, [active, spaceDown, camera, gl, selectedStreet, streetData, sceneObjects, selectStreet, deselectStreet])

  const onPointerMove = useCallback((e) => {
    if (dragRef.current) {
      const p = screenToWorld(e.clientX, e.clientY, camera, gl.domElement)
      const { streetIdx, bandIdx } = dragRef.current
      const st = centerlineData.streets[streetIdx]
      if (!st) return
      if (!st._bands) st._bands = getDefaultBands(st.type || 'residential').map(b => ({...b}))
      const bands = st._bands
      const rawDist = Math.max(0.15, distToPolyline(st.points, p.x, p.z))
      const innerR = bands.slice(0, bandIdx).reduce((s, b) => s + b.width, 0)
      let newWidth = Math.max(0.05, rawDist - innerR)
      newWidth = snapIncrement(bands[bandIdx].material, newWidth)
      bands[bandIdx].width = Math.round(newWidth * 1000) / 1000
      const ft = (newWidth * 3.28084).toFixed(1)
      useCartographStore.setState({
        centerlineData: { ...centerlineData },
        status: bands[bandIdx].material + ': ' + ft + 'ft (' + newWidth.toFixed(2) + 'm)',
      })
      return
    }

    if (!active || spaceDown) { useCartographStore.getState().setHoverTarget(false); return }
    const p = screenToWorld(e.clientX, e.clientY, camera, gl.domElement)
    const lineThresh = 6 / (camera.zoom || 1)
    let hit = false
    // Check nodes
    if (selectedStreet !== null && sceneObjects) {
      const selObj = sceneObjects.find(o => o.idx === selectedStreet)
      if (selObj?.nodePos) {
        const thresh = 4 / (camera.zoom || 1)
        for (const node of selObj.nodePos) {
          if (Math.hypot(p.x - node.x, p.z - node.z) < thresh) { hit = true; break }
        }
      }
    }
    if (!hit) {
      for (const { st } of streetData) {
        if (distToPolyline(st.points, p.x, p.z) < lineThresh) { hit = true; break }
      }
    }
    useCartographStore.getState().setHoverTarget(hit)
  }, [active, spaceDown, camera, gl, selectedStreet, streetData, sceneObjects, centerlineData])

  const onPointerUp = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    useCartographStore.getState()._saveCenterlines()
    useCartographStore.setState({ status: '' })
  }, [])

  // Right-click: add band
  useEffect(() => {
    if (!active) return
    const onKeyDown = (e) => { if (e.key === 'Escape') deselectStreet() }
    const onContextMenu = (e) => {
      if (selectedStreet === null) return
      e.preventDefault()
      const st = centerlineData.streets[selectedStreet]
      if (!st) return
      if (!st._bands) st._bands = getDefaultBands(st.type || 'residential').map(b => ({...b}))
      const existing = new Set(st._bands.map(b => b.material))
      const FT = 0.3048
      if (!existing.has('treelawn')) {
        st._bands.push({ material: 'treelawn', width: 4.5 * FT })
        useCartographStore.setState({ centerlineData: { ...centerlineData }, status: 'Added treelawn' })
      } else if (!existing.has('sidewalk')) {
        st._bands.push({ material: 'sidewalk', width: 5 * FT })
        useCartographStore.setState({ centerlineData: { ...centerlineData }, status: 'Added sidewalk' })
      }
      useCartographStore.getState()._saveCenterlines()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('contextmenu', onContextMenu)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('contextmenu', onContextMenu) }
  }, [active, selectedStreet, centerlineData, deselectStreet])

  useEffect(() => {
    if (!active) return
    const dom = gl.domElement
    dom.addEventListener('pointerdown', onPointerDown)
    dom.addEventListener('pointermove', onPointerMove)
    dom.addEventListener('pointerup', onPointerUp)
    return () => { dom.removeEventListener('pointerdown', onPointerDown); dom.removeEventListener('pointermove', onPointerMove); dom.removeEventListener('pointerup', onPointerUp) }
  }, [active, gl, onPointerDown, onPointerMove, onPointerUp])

  if (!active || !sceneObjects) return null

  return (
    <group position={[0, 0.15, 0]}>
      {sceneObjects.map(group => (
        <group key={group.idx}>
          {group.lines.map((l, i) => (
            <primitive key={`l-${i}`} object={new THREE.Line(l.geo, l.mat)} />
          ))}
          {group.meshes.map((m, i) => (
            <mesh key={`m-${i}`} geometry={m.geo} material={m.mat} />
          ))}
          {group.nodePos?.map((node, i) => (
            <group key={`n-${i}`} position={[node.x, 0.2, node.z]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[1.8, 2.4, 16]} />
                <meshBasicMaterial color="#000" side={THREE.DoubleSide} depthTest={false} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[1.8, 16]} />
                <meshBasicMaterial color={node.color} side={THREE.DoubleSide} depthTest={false} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  )
}
