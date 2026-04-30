/**
 * SpecimenViewport — workstage's 3D inspection canvas.
 *
 * Photo-studio model: camera is on a fixed dolly (locked azimuth) with
 * distance + height controls. The TREE rotates, not the camera. Always-on
 * reference geometry (bullseye + yardstick + human silhouette + cyclorama)
 * makes scale and orientation immediately diagnostic — no hunting, no
 * "looks fine close up but is the size of a building."
 *
 * Modes:
 *   cloud     → input point cloud (LiDAR specimen browse)
 *   skeleton  → published GLB variant
 *
 * Inputs:
 *   targetCategory       — broadleaf | conifer | ornamental | weeping | columnar
 *                          drives which yardstick band glows
 *   effectiveScale       — variant.scaleOverride ?? variant.normalizeScale
 *                          applied to the GLB so preview = runtime
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import * as THREE from 'three'

// Realistic tree heights (meters) per category — yardstick highlights this band.
const CATEGORY_TARGET_HEIGHT = {
  broadleaf: 12,
  conifer: 18,
  ornamental: 6,
  weeping: 10,
  columnar: 12,
  unusual: 10,
}

// Studio framing: centers the bullseye (y=0) and the category-target band
// (y=target) vertically in the viewport. fov=38° (matches the Canvas).
// Padding adds a little headroom above the canopy so the yardstick mark
// isn't pinned at the frame edge.
const STUDIO_FOV_DEG = 38
function studioFraming(category) {
  const target = CATEGORY_TARGET_HEIGHT[category] ?? 12
  const padding = 2
  const halfSpan = target / 2 + padding
  const halfFov = (STUDIO_FOV_DEG * Math.PI / 180) / 2
  const distance = halfSpan / Math.tan(halfFov)
  return { height: target / 2, distance }
}

// ── Camera — fixed azimuth, separate zoom (distance) + crane (height) ─
// Target tracks the camera height so the camera looks horizontally
// forward, like a film crane rising up the tree. Crane down to look at
// the floor, crane up to study the canopy. Zoom (scroll) is independent.
//
// `cameraStateRef` is owned by the parent (Workstage), so the camera
// position survives Canvas remounts when the operator switches LOD,
// variant, or species — it doesn't snap back to defaults every click.
function DollyCam({ cameraStateRef }) {
  const { camera, gl } = useThree()
  const stateRef = cameraStateRef

  useFrame(() => {
    const { distance, height } = stateRef.current
    camera.position.set(0, height, distance)
    // Always look horizontally forward at the same Y as the camera.
    // To inspect the ground plane, the operator cranes DOWN — they
    // bring the camera near floor level rather than tilting it.
    camera.lookAt(0, height, 0)
  })

  useEffect(() => {
    const dom = gl.domElement
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
    const onWheel = (e) => {
      e.preventDefault()
      const s = stateRef.current
      if (e.shiftKey) {
        s.height = clamp(s.height - e.deltaY * 0.03, 0.1, 40)
      } else {
        s.distance = clamp(s.distance + e.deltaY * 0.04, 1.5, 150)
      }
    }
    const onKey = (e) => {
      const s = stateRef.current
      const step = e.shiftKey ? 2 : 0.5
      if (e.key === 'ArrowUp')   { s.height   = clamp(s.height + step, 0.1, 40) }
      if (e.key === 'ArrowDown') { s.height   = clamp(s.height - step, 0.1, 40) }
      if (e.key === '=' || e.key === '+') { s.distance = clamp(s.distance - step, 1.5, 150) }
      if (e.key === '-' || e.key === '_') { s.distance = clamp(s.distance + step, 1.5, 150) }
    }
    dom.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    return () => {
      dom.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
    }
  }, [gl])

  return null
}

// ── Bullseye on the cyc floor ─────────────────────────────────────────
// The tree base lands here. Crosshair includes a longer +Z arm so the
// operator can read which way the tree is "facing the camera."
function Bullseye() {
  // Surveyor / target reticle: three thin concentric rings + a small
  // notch on the +Z side marking "front" (toward the camera). No center
  // dot — the empty middle is where the trunk lands. polygonOffset keeps
  // it from z-fighting the cyc floor.
  const stroke = '#c92a2a'
  const matProps = {
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }
  const Ring = ({ r, w = 0.012, color = stroke, segments = 96 }) => (
    <mesh renderOrder={2}>
      <ringGeometry args={[r - w, r + w, segments]} />
      <meshBasicMaterial color={color} {...matProps} />
    </mesh>
  )
  // Thin diametric line (rotated about Z within the floor plane).
  const Line = ({ length, angle = 0, w = 0.008 }) => (
    <mesh rotation={[0, 0, angle]} renderOrder={2}>
      <planeGeometry args={[length, w]} />
      <meshBasicMaterial color={stroke} {...matProps} />
    </mesh>
  )
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
      <Ring r={0.30} />
      <Ring r={0.55} />
      <Ring r={0.85} />
      <Line length={1.55} angle={0} w={0.006} />
      <Line length={1.55} angle={Math.PI / 2} w={0.006} />
      {/* Front notch (+Z toward camera) */}
      <mesh position={[0, 0.93, 0]} renderOrder={2}>
        <circleGeometry args={[0.06, 3, Math.PI / 2, Math.PI * 2]} />
        <meshBasicMaterial color={stroke} {...matProps} />
      </mesh>
    </group>
  )
}

// Find the dominant trunk in a tree GLB scene. Returns the world-XZ
// centroid of the densest local region in the bottom-slab vertex
// distribution, plus min Y (ground plant) and overall height. For a
// clean single-tree variant: just the trunk axis. For multi-trunk
// variants: the largest/densest trunk only — passengers ignored.
export function computeDominantTrunk(scene) {
  scene.updateMatrixWorld(true)
  let minY = Infinity, maxY = -Infinity
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return
    const pos = o.geometry.attributes.position
    const e = o.matrixWorld.elements
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      const wy = e[1] * x + e[5] * y + e[9]  * z + e[13]
      if (wy < minY) minY = wy
      if (wy > maxY) maxY = wy
    }
  })
  if (!isFinite(minY)) return null
  const total = maxY - minY
  const slabHi = minY + Math.max(0.05 * total, 0.05)

  // Bin slab vertices into a 0.5m XZ grid; track count + sum-XZ per cell.
  const GRID = 0.5
  const cells = new Map()
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return
    const pos = o.geometry.attributes.position
    const e = o.matrixWorld.elements
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      const wy = e[1] * x + e[5] * y + e[9]  * z + e[13]
      if (wy > slabHi) continue
      const wx = e[0] * x + e[4] * y + e[8]  * z + e[12]
      const wz = e[2] * x + e[6] * y + e[10] * z + e[14]
      const ix = Math.floor(wx / GRID), iz = Math.floor(wz / GRID)
      const key = `${ix},${iz}`
      let c = cells.get(key)
      if (!c) { c = { ix, iz, count: 0, sx: 0, sz: 0 }; cells.set(key, c) }
      c.count++; c.sx += wx; c.sz += wz
    }
  })
  if (cells.size === 0) return { x: 0, z: 0, minY, height: total }

  // For each cell, compute the 3x3-neighborhood sum and pick the cell
  // with the largest sum — that's the densest trunk's center.
  let bestSum = -1, bestCell = null
  for (const c of cells.values()) {
    let sum = 0
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = cells.get(`${c.ix+dx},${c.iz+dz}`)
      if (n) sum += n.count
    }
    if (sum > bestSum) { bestSum = sum; bestCell = c }
  }

  // Centroid of the dominant cell + its 8 neighbors gives a stable
  // axis location (ignores nearby noise, includes the tree's flare).
  let sx = 0, sz = 0, n = 0
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const c = cells.get(`${bestCell.ix+dx},${bestCell.iz+dz}`)
    if (!c) continue
    sx += c.sx; sz += c.sz; n += c.count
  }
  return { x: sx / n, z: sz / n, minY, height: total }
}

// Apply the inverse of an XYZ Euler rotation to a 3-vector. Used to
// convert a world-space drag delta back into the tree's local frame
// when the tree has been rotated, so dragging the X arrow always moves
// the tree along world X regardless of current rotation.
const _tmpVec = new THREE.Vector3()
const _tmpEuler = new THREE.Euler()
const _tmpMatrix = new THREE.Matrix4()
function invRotateDelta(dx, dy, dz, rx, ry, rz) {
  _tmpEuler.set(rx, ry, rz)
  _tmpMatrix.makeRotationFromEuler(_tmpEuler).invert()
  _tmpVec.set(dx, dy, dz).applyMatrix4(_tmpMatrix)
  return [_tmpVec.x, _tmpVec.y, _tmpVec.z]
}

// ── Tree transform gizmo — XYZ axis arrows + rotation ring + scale handle ─
// Anchored at the tree's current position. Drag handles each modify
// exactly one axis. Bullseye stays fixed at origin as the target reference.
//
// Drag math: use manual raycasting against a drag plane that's chosen
// per-axis. Pointer-capture keeps events flowing even when the cursor
// leaves the arrow's geometry; we recompute the world-space intersection
// on every pointer-move via the camera + cursor NDC.
function TreeGizmo({ position, rotation = [0, 0, 0], scale, topY, overheadY = 13, showXZArrows = true, wormMode = false, onTranslate, onRotateY, onScale }) {
  const { camera, gl } = useThree()
  const X_COLOR = '#e85a5a'
  const Y_COLOR = '#5ad36a'
  const Z_COLOR = '#5a8aff'
  const ROT_COLOR = '#e8b860'
  const [rx, ry, rz] = rotation

  const dragRef = useRef(null)
  const tmpRay = useMemo(() => new THREE.Raycaster(), [])
  const tmpV2  = useMemo(() => new THREE.Vector2(), [])
  const tmpV3  = useMemo(() => new THREE.Vector3(), [])

  // Manual raycast: cursor (clientX/Y) → world hit on a chosen plane.
  // Plane is given as Three.js Plane (normal + constant).
  const rayHit = (clientX, clientY, plane) => {
    const rect = gl.domElement.getBoundingClientRect()
    tmpV2.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    tmpRay.setFromCamera(tmpV2, camera)
    const hit = tmpRay.ray.intersectPlane(plane, tmpV3)
    return hit ? [hit.x, hit.y, hit.z] : null
  }

  const FLOOR_PLANE = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const verticalPlaneAt = (pz) => new THREE.Plane(new THREE.Vector3(0, 0, 1), -pz)

  const releaseCapture = (e) => {
    if (e.pointerId !== undefined) {
      try { e.target.releasePointerCapture(e.pointerId) } catch {}
    }
    dragRef.current = null
  }

  const startXZTranslate = (axis) => (e) => {
    e.stopPropagation()
    e.target.setPointerCapture(e.pointerId)
    const hit = rayHit(e.clientX, e.clientY, FLOOR_PLANE)
    if (!hit) return
    dragRef.current = { mode: 'translate', axis, startHit: hit, origin: [...position] }
  }
  const startYTranslate = (e) => {
    e.stopPropagation()
    e.target.setPointerCapture(e.pointerId)
    const plane = verticalPlaneAt(position[2])
    const hit = rayHit(e.clientX, e.clientY, plane)
    if (!hit) return
    dragRef.current = { mode: 'translateY', plane, startHit: hit, origin: [...position] }
  }
  const startRotate = (e) => {
    e.stopPropagation()
    e.target.setPointerCapture(e.pointerId)
    const hit = rayHit(e.clientX, e.clientY, FLOOR_PLANE)
    if (!hit) return
    // Ring sits at world origin → angle relative to (0, 0).
    const a0 = Math.atan2(hit[0], hit[2])
    dragRef.current = { mode: 'rotate', startAngle: a0, origin: ry }
  }
  const startScale = (e) => {
    e.stopPropagation()
    e.target.setPointerCapture(e.pointerId)
    dragRef.current = { mode: 'scale', startClientY: e.clientY, origin: scale }
  }

  const onMove = (e) => {
    const d = dragRef.current
    if (!d) return
    if (d.mode === 'translate' || d.mode === 'translateY') {
      const plane = d.mode === 'translateY' ? d.plane : FLOOR_PLANE
      const hit = rayHit(e.clientX, e.clientY, plane)
      if (!hit) return
      // Lock to the dragged axis IN WORLD SPACE first (so the tree
      // moves along world X/Y/Z regardless of its current rotation),
      // then inverse-rotate + scale-divide to express the result in
      // positionOverride's pre-rotation, pre-scale frame, then apply
      // all three components so the rotation re-creates world motion.
      let dwx = 0, dwy = 0, dwz = 0
      if (d.axis === 'x')      dwx = hit[0] - d.startHit[0]
      else if (d.axis === 'z') dwz = hit[2] - d.startHit[2]
      else                     dwy = hit[1] - d.startHit[1]   // translateY
      const inv = 1 / Math.max(scale, 0.001)
      const local = invRotateDelta(dwx * inv, dwy * inv, dwz * inv, rx, ry, rz)
      onTranslate?.(
        d.origin[0] + local[0],
        d.origin[1] + local[1],
        d.origin[2] + local[2],
      )
    } else if (d.mode === 'rotate') {
      const hit = rayHit(e.clientX, e.clientY, FLOOR_PLANE)
      if (!hit) return
      const a = Math.atan2(hit[0], hit[2])
      onRotateY?.(d.origin + (a - d.startAngle))
    } else if (d.mode === 'scale') {
      const dy = d.startClientY - e.clientY
      onScale?.(Math.max(0.01, d.origin * (1 + dy * 0.005)))
    }
  }

  // Modest, fixed-size handles so they stay legible regardless of how
  // mis-scaled the tree is.
  const armLen = 2.5
  const tipR = 0.18
  const ringR = 1.6
  // Scale handle pinned to a camera-relative height so it's always
  // reachable even when the tree itself is offscreen.
  const scaleHandleY = 4

  // overheadY comes in from props — anchored to the category target so
  // the scale + Y handles sit right at the expected canopy top.

  return (
    <>
      {/* All gizmo handles anchored to the bullseye (world origin), not
          the tree. The bullseye is the target; dragging an axis slides
          the tree toward/along that axis. Handles never leave the
          frame even when auto-anchor was wrong by tens of meters. */}

      {/* Floor controls — X + Z translate at the bullseye. Hidden in
          worm view (camera near floor); operator uses the Oubliette
          radar drag for floor placement instead. */}
      {showXZArrows && (
        <>
          <AxisArrow color={X_COLOR} direction="x" length={armLen} tipR={tipR}
            onDown={startXZTranslate('x')} onMove={onMove} onUp={releaseCapture} />
          <AxisArrow color={Z_COLOR} direction="z" length={armLen} tipR={tipR}
            onDown={startXZTranslate('z')} onMove={onMove} onUp={releaseCapture} />
        </>
      )}
      {/* Worm-only ground-level Y handle. Lets the operator nudge the
          tree up/down for ground contact while looking at the base
          horizontally. The overhead Y arrow stays in Studio. */}
      {wormMode && (
        <AxisArrow color={Y_COLOR} direction="y" length={armLen * 0.7} tipR={tipR}
          onDown={startYTranslate} onMove={onMove} onUp={releaseCapture} />
      )}

      {/* Vertical guide line from the bullseye up to overhead */}
      <mesh position={[0, overheadY / 2, 0]}>
        <cylinderGeometry args={[0.015, 0.015, overheadY, 6]} />
        <meshBasicMaterial color="#888" transparent opacity={0.5} />
      </mesh>

      {/* Overhead controls — Y translate + scale, directly over bullseye */}
      <group position={[0, overheadY, 0]}>
        <AxisArrow color={Y_COLOR} direction="y" length={armLen} tipR={tipR}
          onDown={startYTranslate} onMove={onMove} onUp={releaseCapture} />
        <mesh position={[1.5, 0, 0]}>
          <boxGeometry args={[2.4, 0.05, 0.05]} />
          <meshBasicMaterial color="#ff8a3d" transparent opacity={0.6} />
        </mesh>
        <mesh
          position={[3.0, 0, 0]}
          onPointerDown={startScale}
          onPointerMove={onMove}
          onPointerUp={releaseCapture}
          onPointerCancel={releaseCapture}
        >
          <boxGeometry args={[0.8, 0.8, 0.8]} />
          <meshStandardMaterial color="#ff8a3d" emissive="#ff5500" emissiveIntensity={0.6} />
        </mesh>
      </group>

      {/* Rotation ring at the bullseye. Tree on bullseye → rotates
          around its trunk; off bullseye → orbits, telling the operator
          they haven't centered yet. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
        onPointerDown={startRotate}
        onPointerMove={onMove}
        onPointerUp={releaseCapture}
        onPointerCancel={releaseCapture}
      >
        <ringGeometry args={[ringR, ringR + 0.08, 64]} />
        <meshBasicMaterial color={ROT_COLOR} transparent opacity={0.75} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, -ry]}
        position={[0, 0.011, 0]}
      >
        <ringGeometry args={[ringR + 0.09, ringR + 0.20, 32, 1, -0.06, 0.12]} />
        <meshBasicMaterial color={ROT_COLOR} />
      </mesh>
    </>
  )
}

function AxisArrow({ color, direction, length, tipR, onDown, onMove, onUp }) {
  let rotation = [0, 0, 0]
  if (direction === 'x') rotation = [0, 0, -Math.PI / 2]
  if (direction === 'z') rotation = [Math.PI / 2, 0, 0]
  const halfL = length / 2
  const shaftR = tipR * 0.25
  return (
    <group rotation={rotation}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <mesh position={[0, halfL, 0]}>
        <cylinderGeometry args={[shaftR, shaftR, length, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, length + tipR * 1.5, 0]}>
        <coneGeometry args={[tipR, tipR * 3, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

// ── Yardstick — vertical post w/ labeled tick marks + category target band ─
function Yardstick({ targetCategory = 'broadleaf' }) {
  const target = CATEGORY_TARGET_HEIGHT[targetCategory] ?? 12
  const ticks = [1, 5, 10, 15, 20, 25]

  return (
    <group position={[3, 0, 0]}>
      {/* Post */}
      <mesh position={[0, 12.5, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 25, 12]} />
        <meshStandardMaterial color="#888" roughness={0.7} />
      </mesh>

      {/* Target-height glow band — half-meter slab around the category target */}
      <mesh position={[0, target, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.5, 16]} />
        <meshStandardMaterial color="#e8b860" emissive="#c89030" emissiveIntensity={0.8} roughness={0.5} />
      </mesh>

      {/* Tick marks + labels — label sits to the right of the tick, not on top */}
      {ticks.map((m) => (
        <group key={m} position={[0, m, 0]}>
          <mesh position={[0.18, 0, 0]}>
            <boxGeometry args={[0.32, 0.04, 0.04]} />
            <meshStandardMaterial color={m === target ? '#e8b860' : '#aaa'} />
          </mesh>
          <Label3D text={`${m}m`} position={[0.42, 0, 0]} color={m === target ? '#7a5520' : '#666'} anchor="left" />
        </group>
      ))}
    </group>
  )
}

// Cheap text using a sprite-canvas — no font asset needed.
function Label3D({ text, position, color = '#444', anchor = 'center' }) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 128; c.height = 64
    const ctx = c.getContext('2d')
    ctx.fillStyle = color
    ctx.font = 'bold 36px -apple-system, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 4, 32)
    const tex = new THREE.CanvasTexture(c)
    tex.minFilter = THREE.LinearFilter
    return tex
  }, [text, color])
  // anchor='left' pins the sprite's left edge to `position` so labels
  // sit cleanly beside their target (e.g. yardstick ticks) without
  // overlapping. Default 'center' for free-floating labels.
  const centerVec = useMemo(
    () => new THREE.Vector2(anchor === 'left' ? 0 : 0.5, 0.5),
    [anchor],
  )
  return (
    <sprite position={position} scale={[1.0, 0.5, 1]} center={centerVec}>
      <spriteMaterial map={texture} transparent />
    </sprite>
  )
}

// ── Reference obelisk — 1.83 m rectangular column for human scale ─────
// A simple plinth, not a figure. Labeled below so the height is
// unambiguous.
function HumanSilhouette() {
  return (
    <group position={[-3, 0, 0]}>
      <mesh position={[0, 0.915, 0]}>
        <boxGeometry args={[0.4, 1.83, 0.4]} />
        <meshStandardMaterial color="#5a6a78" transparent opacity={0.6} roughness={0.9} />
      </mesh>
      <Label3D text="1.83 m" position={[0, -0.25, 0]} color="#5a6a78" />
    </group>
  )
}

// ── Cyclorama (white sweep) ───────────────────────────────────────────
function Cyclorama() {
  return (
    <>
      <color attach="background" args={['#f7f5f1']} />
      <hemisphereLight args={['#ffffff', '#e8e4dc', 0.85]} />
      <directionalLight
        position={[8, 22, 12]} intensity={0.55} castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-camera-left={-25} shadow-camera-right={25}
        shadow-camera-top={25} shadow-camera-bottom={-25}
        shadow-camera-near={0.5} shadow-camera-far={80}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#f7f5f1" roughness={1} />
      </mesh>
      {/* Big cyc sweep — pushed back + scaled up so the camera never
          escapes its curve at any reasonable dolly/crane setting. */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[180, 180, 200, 64, 1, true, Math.PI / 2, Math.PI]} />
        <meshStandardMaterial color="#f7f5f1" roughness={1} side={2} />
      </mesh>
    </>
  )
}

// ── Specimen content — point cloud (LiDAR) ────────────────────────────
function PointCloud({ url }) {
  const geometry = useLoader(PLYLoader, url)
  const oriented = useMemo(() => {
    const g = geometry.clone()
    g.rotateX(-Math.PI / 2)  // forestry Z-up → Three.js Y-up
    g.computeBoundingBox()
    return g
  }, [geometry])
  return (
    <points geometry={oriented}>
      <pointsMaterial size={0.045} sizeAttenuation color="#1a2418" />
    </points>
  )
}

// ── Specimen content — published GLB ──────────────────────────────────
// Applies effectiveScale (override or normalize) so what you see here is
// what InstancedTrees ships. Auto-plants base by sampling lowest mesh Y.
function Skeleton({
  url, forestryRotation,
  scale = 1,
  positionOffset = [0, 0, 0],
  rotationOffset = [0, 0, 0],
  onTopY,
}) {
  const { scene } = useGLTF(url)
  // Always compute the auto-anchor from LOD0 so switching LODs (which
  // have slightly different decimated geometry) doesn't shift the
  // visible position.
  const lod0Url = url.replace(/-lod[12]\.glb($|\?)/, '-lod0.glb$1')
  const { scene: anchorScene } = useGLTF(lod0Url)

  // Strip vertex-color AO baking.
  useMemo(() => {
    scene.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      o.receiveShadow = true
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (m?.vertexColors) { m.vertexColors = false; m.needsUpdate = true }
      }
    })
  }, [scene])

  // Auto-anchor on the DOMINANT trunk, not the centroid of all trunks.
  // For a single-tree variant: same as before. For a multi-trunk variant
  // (passengers from imperfect split): plants the densest trunk on the
  // bullseye, so the operator's primary visible tree IS the one centered.
  // Always computed from LOD0 (`anchorScene`) for cross-LOD stability.
  const { groundOffset, centerX, centerZ, topY } = useMemo(() => {
    const trunk = computeDominantTrunk(anchorScene)
    if (!trunk) return { groundOffset: 0, centerX: 0, centerZ: 0, topY: 12 }
    return {
      groundOffset: -trunk.minY,
      centerX: -trunk.x,
      centerZ: -trunk.z,
      topY: trunk.height,
    }
  }, [anchorScene])

  const rot = forestryRotation ? [-Math.PI / 2, 0, 0] : [0, 0, 0]
  const [ox, oy, oz] = positionOffset
  const [rx, ry, rz] = rotationOffset

  useEffect(() => { onTopY?.(topY) }, [topY, onTopY])

  // Both rotation AND scale pivot at world origin (the bullseye).
  // Position is applied INSIDE both, so a tree off-bullseye orbits on
  // rotate and grows/shrinks toward the bullseye on scale — both
  // useful "you haven't centered yet" cues.
  // Stack (outer → inner): rotation → scale → position → auto-center.
  return (
    <group rotation={[rx, ry, rz]}>
      <group scale={[scale, scale, scale]}>
        <group position={[ox, oy, oz]}>
          <group position={[centerX, groundOffset, centerZ]}>
            <primitive object={scene} rotation={rot} />
          </group>
        </group>
      </group>
    </group>
  )
}

// ── Top-level viewport ────────────────────────────────────────────────
export default function SpecimenViewport({
  mode, cloudUrl, glbUrl, viewKey,
  forestryRotation = true,
  targetCategory = 'broadleaf',
  effectiveScale = 1,
  positionOffset = [0, 0, 0],
  rotationOffset = [0, 0, 0],
  onPositionChange,
  onRotationChange,
  onScaleChange,
  cameraStateRef,
}) {
  if (mode === 'skeleton' && !glbUrl) {
    return <EmptyState>No baked variant for this specimen.</EmptyState>
  }
  if (mode === 'cloud' && !cloudUrl) {
    return <EmptyState>Select a specimen to preview</EmptyState>
  }
  const topYRef = useRef(12)
  // 'studio' = full gizmo (xy + z + rotation), 'worm' = only z + rotation
  // (xy makes no sense looking horizontally near the floor — operator
  // uses Oubliette drag for horizontal placement instead).
  const [camMode, setCamMode] = useState('studio')
  // First-mount framing: snap the camera to studio so the bullseye and
  // category-target band are centered. The ref is owned by the parent
  // and persists across Canvas remounts (variant/LOD swaps), so we
  // seed only when it still holds the WorkstageGlb default sentinel —
  // operator tweaks survive variant navigation.
  if (cameraStateRef?.current
      && cameraStateRef.current.distance === 22
      && cameraStateRef.current.height === 8) {
    const f = studioFraming(targetCategory)
    cameraStateRef.current.distance = f.distance
    cameraStateRef.current.height   = f.height
  }
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        key={viewKey}
        shadows
        camera={{ near: 0.1, far: 500, fov: 38 }}
      >
        <Cyclorama />
        <Bullseye />
        <Yardstick targetCategory={targetCategory} />
        <HumanSilhouette />
        <Suspense fallback={null}>
          {mode === 'cloud'    && cloudUrl && <PointCloud url={cloudUrl} />}
          {mode === 'skeleton' && glbUrl   && (
            <Skeleton
              url={glbUrl}
              forestryRotation={forestryRotation}
              scale={effectiveScale}
              positionOffset={positionOffset}
              rotationOffset={rotationOffset}
              onTopY={(y) => { topYRef.current = y }}
            />
          )}
        </Suspense>
        {mode === 'skeleton' && (
          <TreeGizmo
            position={positionOffset}
            rotation={rotationOffset}
            scale={effectiveScale}
            topY={topYRef.current}
            overheadY={(CATEGORY_TARGET_HEIGHT[targetCategory] ?? 12) + 1}
            showXZArrows={camMode !== 'worm'}
            wormMode={camMode === 'worm'}
            onTranslate={(x, y, z) => onPositionChange?.(x, y, z)}
            onRotateY={(y) => onRotationChange?.(rotationOffset[0], y, rotationOffset[2])}
            onScale={onScaleChange}
          />
        )}
        <DollyCam cameraStateRef={cameraStateRef} />
      </Canvas>
      {mode === 'skeleton' && glbUrl && (
        <Suspense fallback={null}>
          <TopDownSchematic
            glbUrl={glbUrl}
            scale={effectiveScale}
            positionOffset={positionOffset}
            rotationOffset={rotationOffset}
            onPositionChange={onPositionChange}
          />
        </Suspense>
      )}
      {/* Snap-to-preset buttons. Both stay on the same crane+zoom rig
          — they just set distance + height to useful inspection points. */}
      <div style={{
        position: 'absolute', top: 12, left: 12,
        display: 'flex', gap: 6,
      }}>
        <button
          onClick={() => {
            if (cameraStateRef?.current) {
              const f = studioFraming(targetCategory)
              cameraStateRef.current.distance = f.distance
              cameraStateRef.current.height   = f.height
            }
            setCamMode('studio')
          }}
          style={presetBtnStyle(camMode === 'studio')}
          title="Frames bullseye + canopy target centered in view">
          Studio
        </button>
        <button
          onClick={() => {
            if (cameraStateRef?.current) {
              cameraStateRef.current.distance = 6
              cameraStateRef.current.height = 0.3
            }
            setCamMode('worm')
          }}
          style={presetBtnStyle(camMode === 'worm')}
          title="Eye-level near the bullseye; only scale + rotation handles, drag the Oubliette for X/Z">
          Worm
        </button>
      </div>
    </div>
  )
}

function presetBtnStyle(active = false) {
  return {
    padding: '4px 10px', fontSize: 10,
    background: active ? 'rgba(232,184,96,0.18)' : 'rgba(20,20,24,0.85)',
    color: active ? '#fff' : '#ccc',
    border: '1px solid ' + (active ? 'rgba(232,184,96,0.6)' : 'rgba(255,255,255,0.15)'),
    borderRadius: 3,
    fontFamily: 'inherit',
    cursor: 'pointer',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  }
}

// ── Hell view — top-down XZ schematic over the bullseye ──────────────
// A small inset SVG that projects the tree's geometry onto the floor
// plane. Operator can verify the trunk is centered on the bullseye
// without perspective ambiguity. Splits the canopy footprint (light)
// from the trunk-slab footprint (dark) so where the actual trunk lands
// is unmissable.
function TopDownSchematic({ glbUrl, scale, positionOffset, rotationOffset, onPositionChange }) {
  const { scene } = useGLTF(glbUrl)
  // Always source the anchor from LOD0 so the schematic agrees with
  // Skeleton's auto-anchor (which is also LOD0-pinned). Otherwise
  // switching LOD shifts the projection relative to what's in 3D.
  const lod0Url = glbUrl.replace(/-lod[12]\.glb($|\?)/, '-lod0.glb$1')
  const { scene: anchorScene } = useGLTF(lod0Url)
  const VIEW_RADIUS_M = 12
  const SIZE_PX = 200

  const { trunkPts, canopyPts, trunkAnchor } = useMemo(() => {
    const trunk = computeDominantTrunk(anchorScene)
    const anchor = trunk ? [trunk.x, trunk.z] : [0, 0]
    if (!trunk) return { trunkPts: [], canopyPts: [], trunkAnchor: anchor }
    const slabHi = trunk.minY + Math.max(trunk.height * 0.05, 0.05)
    const trunkPts = [], canopyPts = []
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return
      const pos = o.geometry.attributes.position
      const e = o.matrixWorld.elements
      const stride = Math.max(1, Math.floor(pos.count / 1500))
      for (let i = 0; i < pos.count; i += stride) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
        const wx = e[0] * x + e[4] * y + e[8]  * z + e[12]
        const wy = e[1] * x + e[5] * y + e[9]  * z + e[13]
        const wz = e[2] * x + e[6] * y + e[10] * z + e[14]
        canopyPts.push([wx, wz])
        if (wy <= slabHi) trunkPts.push([wx, wz])
      }
    })
    return { trunkPts, canopyPts, trunkAnchor: anchor }
  }, [scene, anchorScene])

  // Mirror the runtime transform stack EXACTLY:
  //   world = R · S · (positionOffset + (sceneXZ − trunkAnchor))
  // i.e. positionOffset lives INSIDE the scale + rotation, same as in
  // Skeleton's nested groups. Putting it outside (like an earlier
  // version did) was wrong whenever scale ≠ 1 or rotation ≠ 0 and
  // caused the schematic to lie to the operator.
  const cos = Math.cos(rotationOffset[1] || 0)
  const sin = Math.sin(rotationOffset[1] || 0)
  const transform = (x, z) => {
    const dx = (x - trunkAnchor[0]) + (positionOffset[0] || 0)
    const dz = (z - trunkAnchor[1]) + (positionOffset[2] || 0)
    const lx = dx * scale
    const lz = dz * scale
    const rx = lx * cos + lz * sin
    const rz = -lx * sin + lz * cos
    return [rx, rz]
  }

  // Auto-fit the view radius to whatever's in the variant. If extreme
  // transforms push things past the default ±12m, expand so nothing's
  // ever just empty. Floor at 12m so a normal tree doesn't zoom in
  // weirdly tight.
  let viewRadius = VIEW_RADIUS_M
  for (let i = 0; i < canopyPts.length; i += 8) {
    const [tx, tz] = transform(canopyPts[i][0], canopyPts[i][1])
    const m = Math.max(Math.abs(tx), Math.abs(tz))
    if (m > viewRadius) viewRadius = m
  }
  // World → SVG: standard top-down map. World +X right, world +Z up.
  const k = SIZE_PX / (2 * viewRadius)
  const w2s = (wx, wz) => [SIZE_PX / 2 + wx * k, SIZE_PX / 2 - wz * k]

  // For point clouds at this scale, compress to a sparse polyline-style
  // dot field. Use a Set keyed by quantized cell so we don't render
  // hundreds of overlapping dots at the same screen position.
  const renderDots = (pts, color, opacity, size) => {
    const out = []
    for (let i = 0; i < pts.length; i++) {
      const [wx, wz] = pts[i]
      const [twx, twz] = transform(wx, wz)
      if (Math.abs(twx) > viewRadius || Math.abs(twz) > viewRadius) continue
      const [sx, sy] = w2s(twx, twz)
      out.push(<circle key={i} cx={sx} cy={sy} r={size} fill={color} opacity={opacity} />)
    }
    return out
  }

  // Drag-on-radar: pointer moves on the SVG → positionOverride moves
  // by the same world-XZ delta. The cyan crosshair (and the orange
  // trunk dots) track the cursor. Accounts for scale + Y rotation
  // so the drag stays 1:1 with what you see.
  const dragRef = useRef(null)
  const cosI = Math.cos(-(rotationOffset[1] || 0))
  const sinI = Math.sin(-(rotationOffset[1] || 0))
  const onSvgDown = (e) => {
    if (!onPositionChange) return
    e.target.setPointerCapture?.(e.pointerId)
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      origin: [...positionOffset],
    }
  }
  const onSvgMove = (e) => {
    const d = dragRef.current
    if (!d) return
    // Pixel delta on the SVG → world XZ delta (top-down standard map).
    const dwx = (e.clientX - d.startX) / k
    const dwz = -(e.clientY - d.startY) / k
    // Inverse-rotate (because positionOffset is in pre-rotation frame)
    // and divide by scale (because positionOffset is pre-scale).
    const inv = 1 / Math.max(scale, 0.001)
    const lx = (dwx * cosI + dwz * sinI) * inv
    const lz = (-dwx * sinI + dwz * cosI) * inv
    onPositionChange(d.origin[0] + lx, d.origin[1], d.origin[2] + lz)
  }
  const onSvgUp = (e) => {
    try { e.target.releasePointerCapture?.(e.pointerId) } catch {}
    dragRef.current = null
  }

  return (
    <div style={{
      position: 'absolute', bottom: 12, right: 12,
      width: SIZE_PX, height: SIZE_PX,
      background: 'rgba(20, 20, 24, 0.85)',
      border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4,
    }}>
      <svg width={SIZE_PX} height={SIZE_PX}
        style={{ cursor: onPositionChange ? 'grab' : 'default' }}
        onPointerDown={onSvgDown}
        onPointerMove={onSvgMove}
        onPointerUp={onSvgUp}
        onPointerCancel={onSvgUp}>
        {/* Grid rings at 2m, 5m, 10m */}
        {[2, 5, 10].map((r) => (
          <circle key={r} cx={SIZE_PX/2} cy={SIZE_PX/2} r={r * k}
            fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
        ))}
        {/* Crosshairs */}
        <line x1={0} y1={SIZE_PX/2} x2={SIZE_PX} y2={SIZE_PX/2} stroke="rgba(255,255,255,0.10)" />
        <line x1={SIZE_PX/2} y1={0} x2={SIZE_PX/2} y2={SIZE_PX} stroke="rgba(255,255,255,0.10)" />
        {/* Canopy footprint — light dots */}
        {renderDots(canopyPts, '#6ad06a', 0.35, 1.0)}
        {/* Trunk slab — bright dots over canopy */}
        {renderDots(trunkPts, '#ff8a3d', 1.0, 1.6)}
        {/* Bullseye marker (target, world origin). */}
        <circle cx={SIZE_PX/2} cy={SIZE_PX/2} r={3} fill="#c92a2a" />
        <circle cx={SIZE_PX/2} cy={SIZE_PX/2} r={10} fill="none" stroke="#c92a2a" strokeWidth="1" />
        {/* (Cyan dominant-trunk crosshair removed — too unreliable across
            multi-trunk variants. Operator reads the orange cluster
            on the bullseye to identify which tree is the canonical one.) */}
      </svg>
      <div style={{
        position: 'absolute', top: 4, left: 6, fontSize: 9,
        color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em',
      }}>oubliette · ±{Math.round(viewRadius)}m</div>
    </div>
  )
}

function EmptyState({ children }) {
  return (
    <div style={{
      height: '100%', display: 'grid', placeItems: 'center',
      color: '#666', fontSize: 12, padding: 24, textAlign: 'center', lineHeight: 1.5,
    }}>
      {children}
    </div>
  )
}
