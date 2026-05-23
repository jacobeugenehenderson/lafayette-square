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
import {
  useSalonPreviewAtlas,
  applyBarkUniforms,
  stampTreeVertexAttrs,
  treeSwayUniforms,
} from '../components/treeAtlasMaterial.js'

// Dry-swap experiment (2026-05-21): replace vendor leaf-card diffuse with
// our LeafSet010-derived single Sugar Maple leaf. Module-scoped so every
// Skeleton instance shares one GPU texture. flipY=false matches glTF UV
// convention (vendor cards' UV-spans the full [0,1] so the leaf shows
// once per card; see articulated-blank plan in NOTES.md).
const SUGAR_MAPLE_LEAF_URL = `${import.meta.env.BASE_URL}textures/leaves/sugar_maple_single.png`
let _sugarMapleLeafTex = null
function getSugarMapleLeafTex() {
  if (_sugarMapleLeafTex) return _sugarMapleLeafTex
  _sugarMapleLeafTex = new THREE.TextureLoader().load(SUGAR_MAPLE_LEAF_URL, (t) => {
    t.flipY = false
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    t.needsUpdate = true
  })
  _sugarMapleLeafTex.flipY = false
  _sugarMapleLeafTex.colorSpace = THREE.SRGBColorSpace
  return _sugarMapleLeafTex
}

// Realistic tree heights (meters) per category — yardstick highlights this band.
const CATEGORY_TARGET_HEIGHT = {
  broadleaf: 12,
  conifer: 18,
  ornamental: 6,
  weeping: 10,
  columnar: 12,
  unusual: 10,
}

// Studio framing: centers the bullseye (y=0) and the canopy top (y=treeH)
// vertically in the viewport. fov=38° (matches the Canvas). Padding adds
// a little headroom above the canopy. `treeH` defaults to the broadleaf
// category target (12m) for first-paint before the GLB finishes loading;
// once Skeleton emits its computed top-Y the framing re-fits on the real
// chassis height — fixes the 30m Linden being clipped at default 12m fit.
const STUDIO_FOV_DEG = 38
function studioFraming(treeH = 12) {
  const padding = 2
  const halfSpan = treeH / 2 + padding
  const halfFov = (STUDIO_FOV_DEG * Math.PI / 180) / 2
  const distance = halfSpan / Math.tan(halfFov)
  return { height: treeH / 2, distance }
}

// Brief 13 (Vantage): three preset camera framings matching the three
// bark-shader tiers (Brief 10 sub-phase A — uBarkShaderTier 0/1/2).
// Generic studio-inspection distances, NOT cartograph SHOT imports —
// Salon stays helper-internal per project_kit_helpers_pattern.
//   overhead → aerial tier verification (~150m+ above, looking down)
//   hero     → mid-distance Browse/Hero (current studio framing)
//   street   → close-up walking distance (~5m, near human eye level)
// Returns {distance, height, lookAtY}. lookAtY=0 for overhead so the
// camera tilts down at the chassis base; horizontal (=height) otherwise.
function presetFraming(preset, treeH = 12) {
  switch (preset) {
    case 'overhead': {
      const distance = Math.max(150, treeH * 6)
      const height = treeH + 50
      return { distance, height, lookAtY: 0 }
    }
    case 'street': {
      const distance = Math.max(5, treeH * 0.2)
      const height = 1.8
      return { distance, height, lookAtY: height }
    }
    case 'hero':
    default: {
      const f = studioFraming(treeH)
      return { distance: f.distance, height: f.height, lookAtY: f.height }
    }
  }
}

// ── Camera — fixed azimuth, separate zoom (distance) + crane (height) ─
// Target tracks the camera height so the camera looks horizontally
// forward, like a film crane rising up the tree. Crane down to look at
// the floor, crane up to study the canopy. Zoom (scroll) is independent.
//
// `cameraStateRef` is owned by the parent (Workstage), so the camera
// position survives Canvas remounts when the operator switches LOD,
// variant, or species — it doesn't snap back to defaults every click.
function DollyCam({ cameraStateRef, dragPanRef, rotationY = 0, rotationOffset, onRotationChange }) {
  const { camera, gl } = useThree()
  const stateRef = cameraStateRef
  // Track latest rotationY in a ref so the pointerdown listener captures
  // the live value at gesture start without re-binding listeners every
  // rotation change.
  const rotYRef = useRef(rotationY)
  useEffect(() => { rotYRef.current = rotationY }, [rotationY])
  const rotOffsetRef = useRef(rotationOffset)
  useEffect(() => { rotOffsetRef.current = rotationOffset }, [rotationOffset])
  const onRotRef = useRef(onRotationChange)
  useEffect(() => { onRotRef.current = onRotationChange }, [onRotationChange])

  useFrame(() => {
    const { distance, height, lookAtY } = stateRef.current
    camera.position.set(0, height, distance)
    // Default behavior: look horizontally forward at the same Y as the
    // camera — film-crane mental model, crane DOWN to see the ground.
    // Brief 13 (Vantage): the overhead preset overrides lookAtY=0 so the
    // camera tilts down toward the chassis base; without this, an
    // overhead-from-90m-up camera looking horizontally would frame empty
    // sky with the tree dwindling far below the lens.
    const ly = (typeof lookAtY === 'number') ? lookAtY : height
    camera.lookAt(0, ly, 0)
  })

  useEffect(() => {
    const dom = gl.domElement
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
    // Height clamp: bumped 40 → 60 (Brief 7, mature broadleaf canopy);
    // bumped 60 → 120 (Brief 13 Vantage) so the Overhead preset can park
    // the camera at treeH+50 ≈ 90m on a 40m chassis. Distance max 150 →
    // 300 for the same reason (treeH*6 ≈ 240 on a 40m chassis).
    const H_MIN = 0.1, H_MAX = 120
    const D_MIN = 1.5, D_MAX = 300
    const onWheel = (e) => {
      e.preventDefault()
      const s = stateRef.current
      if (e.shiftKey) {
        s.height = clamp(s.height - e.deltaY * 0.03, H_MIN, H_MAX)
      } else {
        s.distance = clamp(s.distance + e.deltaY * 0.04, D_MIN, D_MAX)
      }
    }
    const onKey = (e) => {
      const s = stateRef.current
      const step = e.shiftKey ? 2 : 0.5
      if (e.key === 'ArrowUp')   { s.height   = clamp(s.height + step, H_MIN, H_MAX) }
      if (e.key === 'ArrowDown') { s.height   = clamp(s.height - step, H_MIN, H_MAX) }
      if (e.key === '=' || e.key === '+') { s.distance = clamp(s.distance - step, D_MIN, D_MAX) }
      if (e.key === '-' || e.key === '_') { s.distance = clamp(s.distance + step, D_MIN, D_MAX) }
    }
    // Alt (Option on Mac) + drag → 2-axis camera gesture: dy cranes the
    // camera up/down, dx turntable-rotates the tree. Capture-phase
    // listener fires BEFORE R3F's bubble-phase canvas listener on the
    // same element, so stopPropagation prevents gnomon handles from
    // also processing the click. Without Alt, clicks pass through
    // normally. Sensitivity: 0.05 m/px crane, 0.008 rad/px rotate
    // (≈ 360° per 800px drag).
    const onDown = (e) => {
      if (!e.altKey || e.button !== 0 || !stateRef?.current) return
      dragPanRef.current = {
        x0: e.clientX,
        y0: e.clientY,
        h0: stateRef.current.height,
        ry0: rotYRef.current,
        axis: null,  // 'x' or 'y' — locked after first 5px of travel
      }
      e.preventDefault()
      e.stopPropagation()
    }
    const onMove = (e) => {
      const d = dragPanRef?.current
      if (!d) return
      const dy = e.clientY - d.y0
      const dx = e.clientX - d.x0
      // Axis lock: whichever direction first crosses 5px deadzone wins,
      // and the rest of the gesture stays on that axis. Prevents
      // accidental cross-axis micro-input.
      if (!d.axis) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
        d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      }
      if (d.axis === 'y') {
        // Drag UP → camera DOWN (inverted per operator preference —
        // matches "pull the view down to reveal what's up").
        stateRef.current.height = clamp(d.h0 + dy * 0.05, H_MIN, H_MAX)
      } else if (d.axis === 'x' && onRotRef.current) {
        const nextRy = d.ry0 + dx * 0.008
        const off = rotOffsetRef.current || [0, 0, 0]
        onRotRef.current(off[0], nextRy, off[2])
      }
    }
    const onUp = () => { if (dragPanRef) dragPanRef.current = null }
    dom.addEventListener('wheel', onWheel, { passive: false })
    dom.addEventListener('pointerdown', onDown, { capture: true })
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      dom.removeEventListener('wheel', onWheel)
      dom.removeEventListener('pointerdown', onDown, { capture: true })
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [gl, dragPanRef])

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
  // Extended 25 → 40m 2026-05-22 (Linden 30.7m). Mature broadleaf upper
  // bound for the LS inventory comfortably fits within 40m.
  const ticks = [1, 5, 10, 15, 20, 25, 30, 35, 40]

  return (
    <group position={[3, 0, 0]}>
      {/* Post */}
      <mesh position={[0, 20, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 40, 12]} />
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
// Brief 7 (Cambium): buildGradientLUT helper retired — the per-composition
// preview atlas now carries the LUT tile inline, baked by
// arborist/salon-preview-atlas.js#bakeGradientPage. The shared
// treeAtlasMaterial samples it from the unified atlas exactly like the LS
// runtime does. One implementation across both surfaces.

function Skeleton({
  url, atlasManifestUrl, forestryRotation,
  scale = 1,
  positionOffset = [0, 0, 0],
  rotationOffset = [0, 0, 0],
  onTopY,
  windStrength = 0,
}) {
  const { scene } = useGLTF(url)
  // Always compute the auto-anchor from LOD0 so switching LODs (which
  // have slightly different decimated geometry) doesn't shift the
  // visible position.
  const lod0Url = url.replace(/-lod[12]\.glb($|\?)/, '-lod0.glb$1')
  const { scene: anchorScene } = useGLTF(lod0Url)

  // Brief 9a (Sough) — workstage drives the SHARED treeSwayUniforms;
  // Phase W's wind chunks live in `treeAtlasMaterial.js#injectFoliageSway`
  // now, so Salon preview and LS runtime share the same vertex-shader
  // wind path. The local `windStrength` slider (0..1) maps to a synthetic
  // wind state — ~5 m/s drift + light gusts at strength=1, with the
  // rustle floor visible at strength=0. Direction is fixed east-bound
  // for the workstage (no preview-only direction knob today).
  useFrame((_, dt) => {
    treeSwayUniforms.uTime.value += dt
    const speed = Math.max(0, windStrength) * 5.0
    treeSwayUniforms.uWindForce.value.set(speed, 0, 0)
    treeSwayUniforms.uWindIntensity.value = speed
    treeSwayUniforms.uGustFrontVelocity.value.set(10, 0, 0)
    treeSwayUniforms.uGustsScale.value   = windStrength * 4.0
    treeSwayUniforms.uGustEnvelope.value = windStrength > 0 ? 1.0 : 0.0
  })

  // Brief 7 (Cambium): the shared treeAtlasMaterial owns the bark gradient
  // path now. Birch's gradientUniformsRef + fallback texture + per-prop
  // useEffects are gone — the preview-atlas pipeline encodes the LUT into
  // the unified atlas tile, and applyBarkUniforms (below) binds the
  // resulting uvTransform + hashAmp into the material's uniforms.
  const atlas = useSalonPreviewAtlas(atlasManifestUrl)

  // Brief 7 (Cambium): replace raw GLB materials with the shared
  // treeAtlasMaterial. Stamp per-vertex aBark / aBarkRegion / aLampGlow
  // / aWindTier (Brief 9a) so the shared shader sees the same per-vertex
  // signals here as in the LS runtime.
  useMemo(() => {
    if (!atlas.treeMaterial) return
    const treeMaterial = atlas.treeMaterial
    // Brief 10A (Cork) — chassis-wide Y bbox for aBarkWorldYNorm normalization,
    // so multi-mesh skeletons share the same aerial-gradient range as the LS
    // runtime computes across its merged chassis. Pass it down to
    // stampTreeVertexAttrs as fallback (no caller-supplied range → per-geometry).
    let chassisMinY = Infinity, chassisMaxY = -Infinity
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return
      const p = o.geometry.attributes.position
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i)
        if (y < chassisMinY) chassisMinY = y
        if (y > chassisMaxY) chassisMaxY = y
      }
    })
    const chassisYRange = Math.max(chassisMaxY - chassisMinY, 1e-6)
    scene.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      o.receiveShadow = true
      if (o.geometry) {
        stampTreeVertexAttrs(o.geometry, { chassisMinY, chassisYRange }, o)
        // Strip vertex colors — they flip USE_COLOR in three.js's shader
        // cache, which would compile a parallel program; the shared
        // material expects no vertex colors.
        if (o.geometry.attributes?.color) o.geometry.deleteAttribute('color')
      }
      o.material = treeMaterial
    })

    // Brief 9a (Sough): workstage's onBeforeCompile wind chunk is RETIRED
    // — Phase W wind logic + rustle floor now live in the shared
    // `treeAtlasMaterial.js#injectFoliageSway` (single path, both
    // consumers). The workstage drives the wind via `treeSwayUniforms`
    // uniforms in the useFrame above. `feedback_salon_preview_is_authoring_surface`
    // is honored — wind effects fire identically here and in LS.
  }, [scene, atlas.treeMaterial])

  // Brief 7: apply per-composition bark uniforms each frame. material.user
  // Data.shader is undefined until three.js compiles the shader on the
  // first render — a useEffect that runs before first paint would early-
  // return and never get re-invoked, leaving the uniforms at defaults
  // (uUseBarkGradient=0, etc.) forever. InstancedTrees handles this via
  // onBeforeRender per draw; for the preview's single-tree single-material
  // setup, a useFrame call is the cleanest equivalent. applyBarkUniforms is
  // a handful of value assignments — well below per-frame cost concern.
  const barkUniformsState = useMemo(() => {
    if (!atlas.manifest) return null
    const m = atlas.manifest
    const sp = m.previewKey?.species
    const vid = m.previewKey?.variantId
    return {
      barkSettings: (sp && m.barkBySpecies?.[sp]) || null,
      gradientSlot: (sp && m.barkGradientByVariant?.[sp]?.[vid]) || null,
      detailSlot:   (sp && m.barkDetailBySpecies?.[sp]) || null,
    }
  }, [atlas.manifest])
  useFrame(() => {
    if (!atlas.treeMaterial || !barkUniformsState) return
    applyBarkUniforms(
      atlas.treeMaterial,
      barkUniformsState.barkSettings,
      barkUniformsState.gradientSlot,
      barkUniformsState.detailSlot,
    )
  })

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

// ── Perf probe — samples renderer.info + scene traversal at ~4 Hz ─────
// Reads-only: renders nothing, adds no materials, so it can't influence
// the `programs` count it's measuring (per
// [[feedback_unique_program_cache_key_before_wrappers]]).
function PerfProbe({ onSample }) {
  const { gl, scene } = useThree()
  const lastRef = useRef({ t: 0, tris: -1, leafCards: -1, drawCalls: -1, programs: -1 })
  useFrame(() => {
    const now = performance.now()
    if (now - lastRef.current.t < 250) return
    lastRef.current.t = now
    let tris = 0
    let leafCards = 0
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return
      const g = o.geometry
      const vCount = g.index ? g.index.count : (g.attributes?.position?.count || 0)
      tris += vCount / 3
      if (g.userData?.atlasKind === 'leaf') {
        leafCards += (g.attributes?.position?.count || 0) / 4
      }
    })
    tris = Math.round(tris)
    leafCards = Math.round(leafCards)
    const drawCalls = gl.info.render.calls
    const programs  = gl.info.programs?.length ?? 0
    const last = lastRef.current
    if (tris === last.tris && leafCards === last.leafCards
        && drawCalls === last.drawCalls && programs === last.programs) return
    last.tris = tris; last.leafCards = leafCards; last.drawCalls = drawCalls; last.programs = programs
    onSample({ tris, leafCards, drawCalls, programs })
  })
  return null
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
  windStrength = 0,
  onPerfSample,
  // Brief 7 (Cambium): SpecimenViewport now mounts the shared
  // treeAtlasMaterial via the per-composition preview atlas. atlasUrl /
  // atlasNormalUrl are accepted but unused at this level — the atlas PNGs
  // are loaded by useSalonPreviewAtlas inside Skeleton via the manifest's
  // colorPath / normalPath. Accepting them as props keeps the prop contract
  // explicit (the workstage is passing them through, even if currently they
  // get re-resolved from the manifest).
  atlasUrl,
  atlasNormalUrl,
  atlasManifestUrl,
}) {
  if (mode === 'skeleton' && !glbUrl) {
    return <EmptyState>No baked variant for this specimen.</EmptyState>
  }
  if (mode === 'cloud' && !cloudUrl) {
    return <EmptyState>Select a specimen to preview</EmptyState>
  }
  const topYRef = useRef(12)
  const [topY, setTopY] = useState(null)  // null until Skeleton reports
  // Drag-to-crane: empty-space drag adjusts camera height. `onPointerMissed`
  // gates the start so gnomon handles keep input priority — only empty
  // canvas clicks arm the drag. Mid-drag updates land in DollyCam via the
  // shared ref (set on the pointerdown, read in pointermove).
  const dragPanRef = useRef(null)
  // 'studio' = full gizmo (xy + z + rotation), 'worm' = only z + rotation
  // (xy makes no sense looking horizontally near the floor — operator
  // uses Oubliette drag for horizontal placement instead).
  const [camMode, setCamMode] = useState('studio')
  // Brief 13 (Vantage) — preset camera for bark-tier verification.
  // Separate concern from camMode (gizmo affordance): camPreset only
  // sets camera distance/height/lookAt. Defaults to 'hero' so existing
  // Salon workflow is undisturbed.
  const [camPreset, setCamPreset] = useState('hero')
  // Auto-fit camera whenever the chassis changes. Triggers on viewKey
  // (encodes species:slot:chassis:bark.ref:leaves.pack — anything that
  // remounts the Canvas) AND on the first topY emission per chassis.
  // The fit uses the ACTUAL loaded chassis height AND the current
  // camPreset — fixes the previous CATEGORY_TARGET_HEIGHT default (12m
  // broadleaf) clipping 30m chassis like Linden, and ensures e.g.
  // overhead preset re-fits to treeH+50 when a 30m chassis loads while
  // overhead is active. Operator dolly/crane tweaks AFTER fit are
  // preserved since we only re-fit on the first topY signal per chassis.
  const lastFitKeyRef = useRef(null)
  useEffect(() => {
    if (!cameraStateRef?.current || topY == null) return
    if (lastFitKeyRef.current === viewKey) return  // already fit this chassis
    lastFitKeyRef.current = viewKey
    const f = presetFraming(camPreset, topY)
    cameraStateRef.current.distance = f.distance
    cameraStateRef.current.height   = f.height
    cameraStateRef.current.lookAtY  = f.lookAtY
  }, [topY, viewKey, cameraStateRef, camPreset])
  // Snap to the active preset whenever the operator picks one. Reads the
  // latest known chassis height (topY if reported, else 12m default).
  // Independent of the auto-fit-on-chassis-change useEffect above — that
  // one runs once per viewKey; this one runs every time the operator
  // taps a different preset button.
  useEffect(() => {
    if (!cameraStateRef?.current) return
    const h = (typeof topY === 'number') ? topY : 12
    const f = presetFraming(camPreset, h)
    cameraStateRef.current.distance = f.distance
    cameraStateRef.current.height   = f.height
    cameraStateRef.current.lookAtY  = f.lookAtY
  }, [camPreset, cameraStateRef])
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
              atlasManifestUrl={atlasManifestUrl}
              forestryRotation={forestryRotation}
              scale={effectiveScale}
              positionOffset={positionOffset}
              rotationOffset={rotationOffset}
              onTopY={(y) => { topYRef.current = y; setTopY(y) }}
              windStrength={windStrength}
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
        <DollyCam
          cameraStateRef={cameraStateRef}
          dragPanRef={dragPanRef}
          rotationY={rotationOffset[1]}
          rotationOffset={rotationOffset}
          onRotationChange={onRotationChange}
        />
        {onPerfSample && <PerfProbe onSample={onPerfSample} />}
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
      {/* Gizmo-mode toggle (Brief 7). Studio = full xy+z+rotate gizmo;
          Worm = only z + rotate (xy makes no sense at eye level — drag
          the Oubliette for horizontal placement instead). These buttons
          ALSO snap the camera as a courtesy, but the camera framing of
          record is the preset row below — Brief 13. */}
      <div style={{
        position: 'absolute', top: 12, left: 12,
        display: 'flex', gap: 6,
      }}>
        <button
          onClick={() => {
            if (cameraStateRef?.current) {
              const h = (typeof topY === 'number') ? topY : 12
              const f = studioFraming(h)
              cameraStateRef.current.distance = f.distance
              cameraStateRef.current.height   = f.height
              cameraStateRef.current.lookAtY  = f.height
            }
            setCamMode('studio')
            setCamPreset('hero')
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
              cameraStateRef.current.lookAtY = 0.3
            }
            setCamMode('worm')
          }}
          style={presetBtnStyle(camMode === 'worm')}
          title="Eye-level near the bullseye; only scale + rotation handles, drag the Oubliette for X/Z">
          Worm
        </button>
      </div>
      {/* Brief 13 (Vantage) — preset camera distances matching the three
          bark-shader tiers (Brief 10 sub-phase A — uBarkShaderTier).
          Operator picks the tier they want to verify; chassis re-frames
          to the corresponding generic studio-inspection distance. NOT
          coupled to uBarkShaderTier — operator controls those
          independently per brief Out-of-Scope §Auto-tier-binding. */}
      <div style={{
        position: 'absolute', top: 44, left: 12,
        display: 'flex', gap: 6,
      }}>
        {[
          ['overhead', 'Overhead', '~200m above — aerial-tier silhouette read'],
          ['hero',     'Hero',     'Studio framing — mid-distance Browse/Hero (default)'],
          ['street',   'Street',   '~5m close-up at human eye level — bark detail read'],
        ].map(([key, label, title]) => (
          <button key={key}
            onClick={() => setCamPreset(key)}
            style={presetBtnStyle(camPreset === key)}
            title={title}>
            {label}
          </button>
        ))}
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
