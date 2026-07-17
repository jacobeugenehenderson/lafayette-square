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
  applyDeformerUniforms,
  injectOverheadWiggle,
  injectOverheadStamp,
  overheadLightUniforms,
  stampTreeVertexAttrs,
  treeSwayUniforms,
  treeBarkTierUniform,
  treeBarkTierPinned,
} from '../components/treeAtlasMaterial.js'
import { buildBranchSkeleton, buildUmbrellaShell, buildGradientCloud, buildLeafClusters, buildOverheadBandDisc, buildHeroImpostorCard } from '../components/impostorGeometry.js'
import { prepareOverheadBands, captureOverheadBand, prepareHeroBands, captureHeroBand } from '../components/captureImpostor.js'

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

// Soft radial-alpha disc for the translucent canopy layers (umbrella + cloud):
// white, opaque core → transparent rim, so material.color tints it and the layers
// composite with a soft edge. One shared texture (module-level).
let _canopyGradientTex = null
function getCanopyGradientTex() {
  if (_canopyGradientTex) return _canopyGradientTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0.0, 'rgba(255,255,255,1)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.85, 'rgba(255,255,255,0.45)')
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  _canopyGradientTex = tex
  return tex
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

// Brief 13 (Vantage 2026-05-23, refined post-ship same-session): two
// preset camera framings driving Brief 10's bark-shader tier
// (uBarkShaderTier 0/1/2) via auto-binding from camera distance.
//   overhead → literal top-down plan view. Camera at (0, treeH+20, 0)
//              looking at (0,0,0). Yardstick + tree fan-out read in
//              plan; trunk = centered dot. topDown:true so DollyCam
//              swaps camera.up to (0,0,-1) (avoids the +Y/-Y gimbal
//              singularity) and routes wheel-zoom to height instead
//              of distance. Pins tier 0.
//   ground   → current studio framing (Hero default). Existing
//              Option+drag + wheel-zoom + key cranes preserved. Tier
//              auto-binds from distance per-frame: distance > 20m =>
//              tier 1 (hero), distance < 20m => tier 2 (street).
// Threshold 20m is first-pass per refinement note; tune from visual
// feel. Generic studio-inspection — NOT cartograph SHOT imports per
// project_kit_helpers_pattern.
const GROUND_TIER_DISTANCE_THRESHOLD = 20
// The three viewing CONTEXTS = the LsoD (operator, 2026-06-23): Street
// (full detail), Hero (size-managed), Browse (overhead). Each preset frames
// the camera so DollyCam's distance-based auto-bind lands on the matching
// bark tier — street (close, <threshold) → tier 2, hero (mid, >threshold)
// → tier 1, browse (top-down) → tier 0. Geometry-LOD binds to these same
// contexts as the LoD build lands (street=lod0 / hero=lod1 / browse=lod2).
function presetFraming(preset, treeH = 12) {
  switch (preset) {
    case 'browse': {
      // Browse — literal top-down plan view (tier 0, aerial / overhead).
      return { distance: 0, height: treeH + 20, lookAtY: 0, topDown: true }
    }
    case 'street': {
      // Street — eye-level, close. distance < GROUND_TIER_DISTANCE_THRESHOLD
      // so the auto-bind picks tier 2 (street, full PBR). Full-sized trees.
      return { distance: 8, height: 1.7, lookAtY: 1.7, topDown: false }
    }
    case 'worm': {
      // Worm — low to the ground, looking at the trunk base, to check the tree
      // sits flat (the grounding-inspection POV; restored 2026-06-25).
      return { distance: 5, height: 0.35, lookAtY: 0.55, topDown: false }
    }
    case 'heroimp': {
      // Hero Impostor — side-on, level with the CANOPY (not mid-trunk), the eye-gate
      // for the hero canopy-band billboard (the side-on twin of Browse=overhead).
      // Camera on +Z looking horizontally at the canopy centre, so the az=0 card
      // (built facing +Z) faces the camera. Canopy mid ≈ 0.68·H (base ≈ 0.35·H).
      const f = studioFraming(treeH)
      const canopyMidY = treeH * 0.68
      return { distance: f.distance, height: canopyMidY, lookAtY: canopyMidY, topDown: false }
    }
    case 'hero':
    default: {
      // Hero — studio mid framing (tier 1, size-managed). distance >
      // threshold → auto tier 1. The authoring default.
      const f = studioFraming(treeH)
      return { distance: f.distance, height: f.height, lookAtY: f.height, topDown: false }
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
    const s = stateRef.current
    if (s.topDown) {
      // Overhead — literal top-down plan view. camera.up swaps to
      // (0,0,-1) so the +Y look direction isn't parallel to up
      // (gimbal singularity), and the plan view renders with +X
      // screen-right.
      if (camera.up.z !== -1) camera.up.set(0, 0, -1)
      camera.position.set(0, s.height, 0)
      camera.lookAt(0, 0, 0)
    } else {
      // Ground — preserve exact pre-Brief-13 behavior: camera at
      // (0, height, distance) looking horizontally at the same Y, so
      // cranes (height changes) keep the camera level — film-crane
      // mental model.
      if (camera.up.y !== 1) camera.up.set(0, 1, 0)
      camera.position.set(0, s.height, s.distance)
      camera.lookAt(0, s.height, 0)
    }
    // Auto-bind uBarkShaderTier per Brief 13 refinement: Overhead → 0,
    // Ground distance < 20m → 2 (street), else → 1 (hero). Yields to
    // the debug pin (treeBarkTierPinned) so the operator can verify
    // cross-pairs via window.__setBarkShaderTier(n).
    if (!treeBarkTierPinned.value) {
      const desired = s.topDown
        ? 0
        : (s.distance < GROUND_TIER_DISTANCE_THRESHOLD ? 2 : 1)
      if (treeBarkTierUniform.value !== desired) treeBarkTierUniform.value = desired
    }
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
      // In topDown (Overhead) mode, distance is locked at 0 and the
      // intuitive zoom axis is altitude. Route non-shift wheel to
      // height so wheel-up = lift, wheel-down = descend — wheel-distance
      // would otherwise pull the camera off the trunk axis and break
      // the plan view. Shift+wheel still adjusts height in both modes.
      const wheelToHeight = !!s.topDown
      if (e.shiftKey || wheelToHeight) {
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

// ── Rotator ring (2026-06-25 remake) — visible turntable at the tree base ───
// Grab the ring and drag to spin the tree (inspection only — view rotation, not
// authored). Responsive because the drag angle is computed by intersecting the
// pointer RAY with the ring's ground plane (not the torus mesh), so it tracks
// even when the cursor leaves the ring. The amber marker shows the tree's facing.
function RotatorRing({ rotationY = 0, radius = 2.5, onRotate }) {
  const PLANE_Y = 0.06
  const drag = useRef(null)
  const angleFromRay = (ray) => {
    if (!ray || Math.abs(ray.direction.y) < 1e-6) return null
    const t = (PLANE_Y - ray.origin.y) / ray.direction.y
    if (!(t > 0)) return null
    return Math.atan2(ray.origin.z + ray.direction.z * t, ray.origin.x + ray.direction.x * t)
  }
  const onDown = (e) => {
    e.stopPropagation()
    e.target.setPointerCapture?.(e.pointerId)
    const a = angleFromRay(e.ray)
    if (a == null) return
    drag.current = { startA: a, startRot: rotationY }
  }
  const onMove = (e) => {
    if (!drag.current) return
    const a = angleFromRay(e.ray)
    if (a == null) return
    onRotate?.(drag.current.startRot - (a - drag.current.startA))
  }
  const onUp = (e) => { try { e.target.releasePointerCapture?.(e.pointerId) } catch {} drag.current = null }
  return (
    <group position={[0, PLANE_Y, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerOut={onUp}>
        <torusGeometry args={[radius, 0.05, 8, 72]} />
        <meshBasicMaterial color="#e8b860" transparent opacity={0.55} />
      </mesh>
      {/* facing marker — rotates with the tree so the current orientation reads */}
      <group rotation={[0, rotationY, 0]}>
        <mesh position={[0, 0, radius]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.22, 0.55, 14]} />
          <meshBasicMaterial color="#ffd98a" />
        </mesh>
      </group>
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
  deformerRange = null,
  deformerSeed = null,
  variantCount = 1,
  variantHeightSpread = false,
  overheadMode = false,           // Browse preset → show the overhead snapshot stamps
  heroMode = false,               // Hero-Impostor preset → show the side-on canopy card
  heroShells = 2,                 // depth-shell count (nesting dial; front + darker back)
  overhead = null,                // leaf controls (procedural-relic canopy) + tints
}) {
  const { scene } = useGLTF(url)
  const gl = useThree(s => s.gl)
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
    // Brief 3A (Cant): chassis-wide trunk-base→top Y range, pre-scanned over
    // all preview meshes so aTreeHeightNorm normalizes against the same axis
    // the LS runtime uses (InstancedTrees#meshes). Geometry-local Y, matching
    // stampTreeVertexAttrs' existing aWindTier coordinate assumption (chassis
    // GLBs are baked flat — base at Y≈0 per Brief 20).
    let chMinY = Infinity, chMaxY = -Infinity
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return
      o.geometry.computeBoundingBox()
      const bb = o.geometry.boundingBox
      if (bb) { chMinY = Math.min(chMinY, bb.min.y); chMaxY = Math.max(chMaxY, bb.max.y) }
    })
    const chassisMinY = Number.isFinite(chMinY) ? chMinY : 0
    const chassisYRange = Math.max(1e-4, chMaxY - chMinY)
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
      barkSettings:    (sp && m.barkBySpecies?.[sp]) || null,
      gradientSlot:    (sp && m.barkGradientByVariant?.[sp]?.[vid]) || null,
      detailSlot:      (sp && m.barkDetailBySpecies?.[sp]) || null,
      posterizedSlot:  (sp && m.barkPosterizedBySpecies?.[sp]) || null,
    }
  }, [atlas.manifest])
  useFrame(() => {
    if (!atlas.treeMaterial || !barkUniformsState) return
    applyBarkUniforms(
      atlas.treeMaterial,
      barkUniformsState.barkSettings,
      barkUniformsState.gradientSlot,
      barkUniformsState.detailSlot,
      barkUniformsState.posterizedSlot,
    )
  })

  // Brief 3A (Cant) — preview parity (LOAD-BEARING per
  // `feedback_salon_preview_is_authoring_surface`). The deformer is uniform-
  // driven (not atlas-baked), so we bind the LIVE authored range straight from
  // the workstage state — the operator sees lean/twist/wander update instantly
  // as they drag, with no preview-atlas re-bake. deformerSeed perturbs the hash
  // anchor so the single-tree preview can re-roll across the authored spread
  // (multi-instance preview is deferred — see brief surface notes).
  useFrame(() => {
    if (!atlas.treeMaterial) return
    applyDeformerUniforms(atlas.treeMaterial, deformerRange, deformerSeed)
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

  // ── Overhead "hula" impostor (Browse preset) — procedural canopy ─────────
  // Stage 1: the BRANCH SKELETON. A procedural woody backbone (radial tapered
  // flat limbs) that from directly above reads as branches radiating out; the
  // umbrella lobes + leaf clusters hang off its tips in later stages. Flat-shaded
  // + opaque (cheap). Wiggles in x/y via the shared hula (injectOverheadWiggle).
  const overheadRec = useMemo(() => {
    if (!overheadMode && !heroMode) return null   // shared canopy-radius measure (Browse + Hero-Imp)
    // Canopy radius = max XZ extent over leaf meshes (fallback: all meshes).
    const LEAF_RE = /leaf|leaves|foliage|frond|needle/i
    const isLeaf = (o) => {
      const k = o.geometry?.userData?.atlasKind ?? o.userData?.atlasKind ?? o.userData?.gltfExtras?.atlasKind
      if (k === 'leaf') return true
      if (k === 'bark') return false
      const mn = Array.isArray(o.material) ? o.material.map(m => m?.name).join(' ') : o.material?.name
      return LEAF_RE.test(o.name || '') || LEAF_RE.test(mn || '')
    }
    // WORLD space (each vertex through its node matrix) — raw local positions
    // mis-size the frame wherever foliage sits in a scaled node (oaks clip,
    // conifers go near-blank). Matches OverheadBaker.measureCanopyRadius.
    scene.updateMatrixWorld(true)
    const v = new THREE.Vector3()
    let xzLeaf = 0, xzAll = 0
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return
      const pos = o.geometry.attributes.position
      const leaf = isLeaf(o)
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld)
        const r = Math.hypot(v.x, v.z)
        if (r > xzAll) xzAll = r
        if (leaf && r > xzLeaf) xzLeaf = r
      }
    })
    // xzAll (all geometry), not leaf-only: the frame must contain everything that
    // renders, or mis-tagged outer foliage clips on one side. Matches OverheadBaker.
    void xzLeaf
    const canopyRadiusM = Math.max(1, xzAll)
    return { heightM: (typeof topY === 'number' ? topY : 12), canopyRadiusM, trunkFrac: 0.12 }
  }, [overheadMode, heroMode, scene, topY])

  // ── Overhead 3-slice SNAPSHOT impostor (Browse preset) — the CANONICAL path ──
  // Three top-down RTT captures of the REAL tree (branch / mid / canopy height
  // bands) skinned onto three parallax disc-planes stacked at their real heights,
  // riding the shared overhead deformers (ruche → hula → shared wind). This is the
  // canonical RTT-skinned disc the doctrine blesses (HANDOFF-overhead-snapshot-
  // impostor-wireup.md §Two decisions #2) — the procedural branch/umbrella/leaf
  // canopy below stays as a Salon-only relic + a until-captured fallback. The
  // capture runs once per (chassis × overheadMode) on the LIVE GL context + the
  // materialized preview material — the same in-browser capture the eventual bake
  // POSTs into the slab atlas (Jacob's chosen ship path, 2026-07-09).
  const [snapshot, setSnapshot] = useState(null)   // { bands:[{key,tex,yLoNorm,yHiNorm}], heightM }
  const snapKeyRef = useRef(null)
  // Diagnostic: surface a WebGL context loss (the "full crash") in the console so
  // we can tell a GPU death from a JS throw. Remove once the capture is stable.
  useEffect(() => {
    const canvas = gl?.domElement
    if (!canvas) return
    const onLost = (e) => { console.error('[overhead-snapshot] ⚠️ WEBGL CONTEXT LOST during capture', e) }
    canvas.addEventListener('webglcontextlost', onLost)
    return () => canvas.removeEventListener('webglcontextlost', onLost)
  }, [gl])
  useEffect(() => {
    if (!overheadMode || !gl || !scene || !atlas.treeMaterial || !overheadRec || !url) return
    if (snapKeyRef.current === url) return   // already captured this chassis
    let cancelled = false
    let raf = 0
    // Prepare once (clone shares the live geometry — no 2nd 21MB GPU copy; skip the
    // attribute re-stamp so we never mutate the live-rendered buffers), then render
    // ONE band per frame so the three slice renders never burst the GPU alongside
    // the live preview (that burst was the "full crash" = WebGL context loss).
    let prep = null
    try {
      prep = prepareOverheadBands(scene, atlas.treeMaterial, {
        canopyRadiusM: overheadRec.canopyRadiusM, alreadyStamped: true,
      })
    } catch (err) {
      console.error('[overhead-snapshot] prepare failed — procedural fallback', err)
      return
    }
    if (!prep) return
    const acc = []
    const step = () => {
      if (cancelled) return
      try {
        acc.push(captureOverheadBand(gl, prep, acc.length))
      } catch (err) {
        console.error('[overhead-snapshot] band capture failed — procedural fallback', err)
        return
      }
      if (acc.length < prep.cuts.length) {
        raf = requestAnimationFrame(step)         // next slice, next frame
      } else if (!cancelled) {
        snapKeyRef.current = url
        setSnapshot({ bands: acc, heightM: prep.heightM, canopyBaseY: prep.canopyBaseY })
      }
    }
    raf = requestAnimationFrame(step)
    return () => { cancelled = true; cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overheadMode, gl, scene, atlas.treeMaterial, overheadRec, url])

  useEffect(() => () => {
    if (snapshot) for (const b of snapshot.bands) {
      try { b.albedoTex?.dispose() } catch {}
      try { b.aoTex?.dispose() } catch {}
    }
  }, [snapshot])

  // (Overhead PERSISTENCE moved to the Grove Bake→Slab button — OverheadBaker.jsx.
  // The Salon Browse preview is eye-gate only; it never writes to the slab.)

  // FLAT disc per band, stacked at its real height (branch low → canopy high) — the
  // carrier for the baked ALBEDO + AO channels.
  const snapshotDiscs = useMemo(() => {
    if (!snapshot || !overheadRec) return null
    const rec = { heightM: snapshot.heightM || overheadRec.heightM, canopyRadiusM: overheadRec.canopyRadiusM }
    return snapshot.bands.map((b) => ({
      key: b.key,
      albedoTex: b.albedoTex,
      aoTex: b.aoTex,
      geo: buildOverheadBandDisc(rec, { yLoNorm: b.yLoNorm, yHiNorm: b.yHiNorm }),
    }))
  }, [snapshot, overheadRec])

  // One RUNTIME-RELIT material per band — MeshBasic(map=ALBEDO) + injectOverheadStamp:
  // fragment relights albedo × (ambient + sun·AO) from the shared overhead light
  // state (so overcast → flat, sun → contrast: weather parity), vertex adds the wind
  // (hula + flutter). Per-band BRIGHTNESS ramp (branch 0.3 → canopy 1.0) stays as a
  // structural multiplier — the lower bands sit in the crown's shadow, so glimpsing
  // them through the top's gaps reads as dark depth.
  const snapshotMats = useMemo(() => {
    if (!snapshotDiscs) return null
    const n = snapshotDiscs.length
    return snapshotDiscs.map(({ albedoTex, aoTex }, i) => {
      const b = n > 1 ? 0.3 + 0.7 * (i / (n - 1)) : 1.0
      const m = new THREE.MeshBasicMaterial({
        map: albedoTex, color: new THREE.Color(b, b, b),
        transparent: false, alphaTest: 0.4,
        side: THREE.DoubleSide, depthWrite: true, toneMapped: false,
      })
      injectOverheadStamp(m, aoTex)
      return m
    })
  }, [snapshotDiscs])

  useEffect(() => () => {
    if (snapshotMats) for (const m of snapshotMats) { try { m.dispose() } catch {} }
  }, [snapshotMats])

  // ── HERO canopy impostor (Hero-Imp preset) — the side-on twin of the overhead ──
  // snapshot. One azimuth (az=0, facing +Z at the camera) × heroShells depth shells,
  // captured canopy-only + level, ONE shot per frame (crash-safe), skinned onto
  // vertical cards. The eye-gate: does the leaf mass read as this species from the
  // side, and does it BREATHE with the wind (windStrength slider → treeSwayUniforms)?
  // Persistence (all N azimuths) rides the Grove Bake→Slab (HeroImpostorBaker); this
  // Salon preview is eye-gate only, front azimuth only.
  const [heroSnapshot, setHeroSnapshot] = useState(null)   // { shots:[{shellIdx,shellCount,albedoTex,aoTex,depthLoFrac,depthHiFrac}], heightM, canopyBaseNorm }
  const heroSnapKeyRef = useRef(null)
  useEffect(() => {
    if (!heroMode || !gl || !scene || !atlas.treeMaterial || !overheadRec || !url) return
    const key = `${url}#${heroShells}`
    if (heroSnapKeyRef.current === key) return   // already captured this chassis at this shell count
    let cancelled = false
    let raf = 0
    let prep = null
    try {
      prep = prepareHeroBands(scene, atlas.treeMaterial, {
        canopyRadiusM: overheadRec.canopyRadiusM, azimuths: 1, shells: heroShells, alreadyStamped: true,
      })
    } catch (err) {
      console.error('[hero-impostor] prepare failed', err)
      return
    }
    if (!prep) return
    const acc = []
    const step = () => {
      if (cancelled) return
      try {
        acc.push(captureHeroBand(gl, prep, acc.length))
      } catch (err) {
        console.error('[hero-impostor] shot capture failed', err)
        return
      }
      if (acc.length < prep.shots.length) {
        raf = requestAnimationFrame(step)         // next shot, next frame (crash-safe)
      } else if (!cancelled) {
        heroSnapKeyRef.current = key
        const denom = Math.max(1e-3, prep.maxY || prep.heightM)
        setHeroSnapshot({ shots: acc, heightM: prep.heightM, canopyBaseNorm: prep.canopyBaseY / denom })
      }
    }
    raf = requestAnimationFrame(step)
    return () => { cancelled = true; cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroMode, gl, scene, atlas.treeMaterial, overheadRec, url, heroShells])

  useEffect(() => () => {
    if (heroSnapshot) for (const s of heroSnapshot.shots) {
      try { s.albedoTex?.dispose() } catch {}
      try { s.aoTex?.dispose() } catch {}
    }
  }, [heroSnapshot])

  // Vertical card per depth shell, at its baked depth offset (front → back parallax).
  const heroCards = useMemo(() => {
    if (!heroSnapshot || !overheadRec) return null
    const rec = { heightM: heroSnapshot.heightM || overheadRec.heightM, canopyRadiusM: overheadRec.canopyRadiusM, canopyBaseNorm: heroSnapshot.canopyBaseNorm }
    return heroSnapshot.shots.map((s) => ({
      key: `sh${s.shellIdx}`,
      albedoTex: s.albedoTex,
      aoTex: s.aoTex,
      geo: buildHeroImpostorCard(rec, { depthLoFrac: s.depthLoFrac, depthHiFrac: s.depthHiFrac }),
    }))
  }, [heroSnapshot, overheadRec])

  // One relight material per shell — MeshBasic(map=ALBEDO) + injectOverheadStamp
  // (albedo × ambient+sun·AO + base-anchored wind). Front shell bright → back shell
  // darker (structural depth: the back shell sits deeper in the crown shadow).
  const heroMats = useMemo(() => {
    if (!heroCards) return null
    const n = heroCards.length
    return heroCards.map(({ albedoTex, aoTex }, i) => {
      const bright = n > 1 ? 1.0 - 0.5 * (i / (n - 1)) : 1.0
      const m = new THREE.MeshBasicMaterial({
        map: albedoTex, color: new THREE.Color(bright, bright, bright),
        transparent: false, alphaTest: 0.4,
        side: THREE.DoubleSide, depthWrite: true, toneMapped: false,
      })
      injectOverheadStamp(m, aoTex)
      return m
    })
  }, [heroCards])

  useEffect(() => () => {
    if (heroMats) for (const m of heroMats) { try { m.dispose() } catch {} }
  }, [heroMats])

  // Connect the overhead to the SELECTED chassis: seed the procedural layout off
  // the chassis identity (the GLB url), so each chassis gets its own consistent
  // branch/umbrella structure (not a generic default) that changes when you pick
  // a different chassis. Leaf-ways nudges the crown character.
  const overheadSeed = useMemo(() => {
    let h = 5381; const s = url || ''
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
    return (h % 4093) + 1
  }, [url])
  const overheadOpts = useMemo(() => {
    // Leaf arrangement → crown character: weeping droops + spreads, columnar/
    // upright pulls in + rises, fastigiate tighter. Default balanced.
    const ways = overhead?.ways
    const o = { seed: overheadSeed }
    if (ways === 'weeping') { o.centerRise = 0.7; o.dip = 0.45 }
    else if (ways === 'upright' || ways === 'columnar' || ways === 'fastigiate') { o.centerRise = 1.05; o.dip = 0.7 }
    return o
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overheadSeed, overhead?.ways])

  const branchGeo = useMemo(
    () => (overheadRec ? buildBranchSkeleton(overheadRec, overheadOpts) : null),
    [overheadRec, overheadOpts],
  )
  // Stage 2 — the translucent canopy layers hung on the branch layout: an
  // irregular umbrella shell (lobes at the tips) over a green-gradient cloud.
  const umbrellaGeo = useMemo(
    () => (overheadRec ? buildUmbrellaShell(overheadRec, overheadOpts) : null),
    [overheadRec, overheadOpts],
  )
  const cloudGeo = useMemo(
    () => (overheadRec ? buildGradientCloud(overheadRec, overheadOpts) : null),
    [overheadRec, overheadOpts],
  )
  // Stage 3 — leaf clusters at the branch tips; density/size ← the chassis's
  // leaf controls (occupancy / scale).
  const leafGeo = useMemo(
    () => (overheadRec ? buildLeafClusters(overheadRec, {
      ...overheadOpts, occupancy: overhead?.occupancy, leafScale: overhead?.scale,
    }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overheadRec, overheadOpts, overhead?.occupancy, overhead?.scale],
  )
  const branchMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: '#4f3a28', roughness: 1, metalness: 0, flatShading: true, side: THREE.DoubleSide,
    })
    injectOverheadWiggle(m)
    return m
  }, [])
  // Umbrella + cloud share a soft radial-alpha disc, tinted + faded per layer, so
  // looking down composites leaves→umbrella→cloud (depthWrite off → real blend).
  const canopyTex = useMemo(() => getCanopyGradientTex(), [])
  // Umbrella = the DARK under-canopy fill behind the leaves (shadowed interior
  // showing through gaps → depth). Fixed dark green, NOT tinted to the lit leaf
  // colour — that's what made it read as a bright blob.
  const umbrellaMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: canopyTex, color: '#20401c', roughness: 1, metalness: 0,
      transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide,
    })
    injectOverheadWiggle(m)
    return m
  }, [canopyTex])
  const cloudMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: canopyTex, color: '#2c5324', roughness: 1, metalness: 0,
      transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
    })
    injectOverheadWiggle(m)
    return m
  }, [canopyTex])
  // Leaf shell — the selected chassis's leaf PACK silhouette (shape.png), tinted
  // to tintFront; transparent + renderOrder above the umbrella so it reads on top.
  const leafTex = useMemo(() => {
    const pack = overhead?.pack
    if (!pack) return null
    const t = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/leaves/shapes/${pack}/shape.png`)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [overhead?.pack])
  const leafMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      // alphaTest 0.6 chokes the cutout past the light fringe texels at the leaf
      // edge (the white alpha halo). transparent:false → alphaTest hard-cut, no
      // blended halo. Crisp silhouette.
      map: leafTex || null, alphaTest: leafTex ? 0.6 : 0,
      color: '#3f7a34', roughness: 1, metalness: 0,
      transparent: false, depthWrite: true, side: THREE.DoubleSide,
    })
    injectOverheadWiggle(m)
    return m
  }, [leafTex])
  useEffect(() => () => {
    try { branchMat?.dispose() } catch {}
    try { umbrellaMat?.dispose() } catch {}
    try { cloudMat?.dispose() } catch {}
    try { leafMat?.dispose() } catch {}
    try { leafTex?.dispose() } catch {}
  }, [branchMat, umbrellaMat, cloudMat, leafMat, leafTex])

  // Match the canopy tints to the chassis's authored leaf tints. (Motion is the
  // shared wind — driven by the Wind toggle via treeSwayUniforms — not per-material
  // dials, so nothing to bind here beyond colour.)
  useFrame(() => {
    if (!overheadMode) return
    if (overhead?.tintFront) leafMat.color.set(overhead.tintFront)
  })

  const rot = forestryRotation ? [-Math.PI / 2, 0, 0] : [0, 0, 0]
  const [ox, oy, oz] = positionOffset
  const [rx, ry, rz] = rotationOffset

  useEffect(() => { onTopY?.(topY) }, [topY, onTopY])

  // Variant review (2026-06-25): N clones spaced along X. The deformer hashes
  // each tree's WORLD position into its lean/twist/wander, so N clones at N
  // positions auto-show N DISTINCT deformations — no new deformer logic. Clones
  // share geometry + the one treeMaterial (THREE clone() copies refs), so the
  // deformer/bark/wind uniforms apply to all. variantCount<=1 = the single
  // authoring tree (gizmo + transform). See the A1 deformer / SALON-INTERFACE.md.
  const variantClones = useMemo(() => {
    if (variantCount <= 1) return null
    return Array.from({ length: variantCount }, () => scene.clone(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, variantCount, atlas.treeMaterial])

  // Both rotation AND scale pivot at world origin (the bullseye).
  // Position is applied INSIDE both, so a tree off-bullseye orbits on
  // rotate and grows/shrinks toward the bullseye on scale — both
  // useful "you haven't centered yet" cues.
  // Stack (outer → inner): rotation → scale → position → auto-center.
  const variantSpacing = Math.max(7, (typeof topY === 'number' ? topY : 12) * 0.95)
  const autoCenter = [centerX, groundOffset, centerZ]

  // Hero-Imp preset → the side-on canopy card replaces the GLB. The az=0 cards face
  // +Z (the camera); the shells sit at their baked depth offsets so glimpsing the
  // back shell through the front's alpha gaps reads as depth. No rotation (single-
  // azimuth eye-gate — a spin would show the card edge-on; that's Phase 2 azimuth
  // selection). Back shell first so it draws behind.
  if (heroMode) {
    if (!heroCards || !heroMats) return null
    return (
      <group>
        {heroCards.map((d, bi) => d.geo && (
          <mesh key={d.key} geometry={d.geo} material={heroMats[bi]} renderOrder={heroCards.length - bi} />
        ))}
      </group>
    )
  }

  // Browse preset → the overhead hula impostor replaces the GLB. One disc-stack
  // (or N, when the "3 variants" review is on), each at a different rotY so the
  // baked fold-phase reads differently tree-to-tree (the anti-stamping eye-gate).
  // Built centred at the trunk (origin) so no autoCenter offset is applied.
  if (overheadMode) {
    const n = Math.max(1, variantCount)
    // Each variant is rotated by the golden angle so the baked rim scallop + the
    // capture land at a DIFFERENT world phase tree-to-tree — the anti-stamping
    // eye-gate (overhead shows all trees at once; a synced grid is the failure).
    const ready = snapshotDiscs && snapshotMats
    return (
      <group rotation={[rx, ry, rz]}>
        <group scale={[scale, scale, scale]}>
          {ready
            ? Array.from({ length: n }, (_, i) => (
                <group key={i}
                  position={[(i - (n - 1) / 2) * variantSpacing, 0, 0]}
                  rotation={[0, i * 2.399963267, 0]}>
                  {/* branch band low → canopy band high; alphaTest lets the crown's
                      gaps reveal the mid + branch discs beneath → real parallax. */}
                  {snapshotDiscs.map((d, bi) => d.geo && (
                    <mesh key={d.key} geometry={d.geo} material={snapshotMats[bi]} renderOrder={bi} />
                  ))}
                </group>
              ))
            // Until the RTT capture lands, fall back to the procedural relic canopy
            // (keeps the Browse preview populated for the ~1 frame before capture).
            : branchGeo && Array.from({ length: n }, (_, i) => (
                <group key={i}
                  position={[(i - (n - 1) / 2) * variantSpacing, 0, 0]}
                  rotation={[0, i * 2.399963267, 0]}>
                  <mesh geometry={branchGeo} material={branchMat} renderOrder={0} />
                  {umbrellaGeo && <mesh geometry={umbrellaGeo} material={umbrellaMat} renderOrder={2} />}
                  {leafGeo && overhead?.show !== false && <mesh geometry={leafGeo} material={leafMat} renderOrder={3} />}
                </group>
              ))}
        </group>
      </group>
    )
  }

  return (
    <group rotation={[rx, ry, rz]}>
      <group scale={[scale, scale, scale]}>
        <group position={[ox, oy, oz]}>
          {variantClones
            ? variantClones.map((v, i) => {
                // Per-clone HEIGHT variation (±16%; a real stand isn't size-cloned).
                // The scale group wraps the auto-center group, so the trunk base
                // sits at the scale group's origin → it scales ABOUT THE BASE and
                // stays grounded (no floating). X-spacing rides the same group
                // (a uniform scale leaves the X position correct).
                const hv = variantHeightSpread ? 1 + (i - (variantCount - 1) / 2) * 0.16 : 1
                return (
                  <group key={i}
                    position={[(i - (variantCount - 1) / 2) * variantSpacing, 0, 0]}
                    scale={[hv, hv, hv]}>
                    <group position={autoCenter}>
                      <primitive object={v} rotation={rot} />
                    </group>
                  </group>
                )
              })
            : (
              <group position={autoCenter}>
                <primitive object={scene} rotation={rot} />
              </group>
            )}
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
  // Brief 3A (Cant): live authored deformer range + preview re-roll seed.
  deformerRange = null,
  deformerSeed = null,
  overhead = null,              // overhead hula impostor knobs { ruffleDepth, hulaAmount }
  variantHeightSpread = false,  // 3-variants also vary in HEIGHT (a real stand isn't size-cloned)
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
  const [variantCount, setVariantCount] = useState(1)  // 1 = single authoring tree; 3 = review the deformer spread
  // Preview the three viewing CONTEXTS (the LsoD, 2026-06-23): 'street'
  // (eye-level close — full detail), 'hero' (studio mid — size-managed,
  // default), 'browse' (top-down — overhead/aerial). Each frames the camera
  // so DollyCam's distance auto-bind lands the matching bark tier (street→2,
  // hero→1, browse→0); geometry-LOD will bind to the same contexts as the
  // LoD build lands. (Evolved from Brief 13 Vantage's two ground/overhead
  // presets — the Hero/Street distinction is now explicit, not just a dolly.)
  const [camPreset, setCamPreset] = useState('hero')
  // Overhead relight PREVIEW — one slider from overcast (flat, all ambient) to
  // sunny (low ambient + strong sun → the baked AO deepens → contrast). Drives the
  // shared overheadLightUniforms; in LS this comes from the atmosphere instead.
  // Proves the parity behaviour Jacob asked about (low-contrast light → flat trees).
  const [ohLight, setOhLight] = useState(0.6)
  useEffect(() => {
    overheadLightUniforms.uSun.value = ohLight * 0.65
    overheadLightUniforms.uAmbient.value = 1.0 - ohLight * 0.65
  }, [ohLight])
  // Auto-fit camera whenever the chassis changes. Triggers on viewKey
  // (encodes species:slot:chassis:bark.ref:leaves.pack — anything that
  // remounts the Canvas) AND on the first topY emission per chassis.
  // The fit uses the ACTUAL loaded chassis height AND the current
  // camPreset — fixes the previous CATEGORY_TARGET_HEIGHT default (12m
  // broadleaf) clipping 30m chassis like Linden, and ensures e.g.
  // overhead preset re-fits to treeH+20 when a 30m chassis loads while
  // overhead is active. Operator dolly/crane tweaks AFTER fit are
  // preserved since we only re-fit on the first topY signal per chassis.
  const lastFitKeyRef = useRef(null)
  const applyFraming = (preset, treeH) => {
    if (!cameraStateRef?.current) return
    const f = presetFraming(preset, treeH)
    cameraStateRef.current.distance = f.distance
    cameraStateRef.current.height   = f.height
    cameraStateRef.current.lookAtY  = f.lookAtY
    cameraStateRef.current.topDown  = !!f.topDown
  }
  useEffect(() => {
    if (!cameraStateRef?.current || topY == null) return
    if (lastFitKeyRef.current === viewKey) return  // already fit this chassis
    lastFitKeyRef.current = viewKey
    applyFraming(camPreset, topY)
  }, [topY, viewKey, cameraStateRef, camPreset])
  // Snap to the active preset whenever the operator picks one. Reads the
  // latest known chassis height (topY if reported, else 12m default).
  // Independent of the auto-fit-on-chassis-change useEffect above — that
  // one runs once per viewKey; this one runs every time the operator
  // taps a different preset button.
  useEffect(() => {
    if (!cameraStateRef?.current) return
    const h = (typeof topY === 'number') ? topY : 12
    applyFraming(camPreset, h)
  }, [camPreset, cameraStateRef])
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        key={viewKey}
        shadows
        camera={{ near: 0.1, far: 500, fov: 38 }}
      >
        <Cyclorama />
        {/* Bullseye (centering reticle) retired 2026-06-25 — centering is
            automatic (Brief 20) and the gizmo is gone, so the floor target rings
            are vestigia. */}
        <Yardstick targetCategory={targetCategory} />
        <HumanSilhouette />
        {mode === 'skeleton' && variantCount === 1 && onRotationChange && (
          <RotatorRing
            rotationY={rotationOffset[1]}
            radius={Math.max(2, (typeof topY === 'number' ? topY : 12) * 0.32)}
            onRotate={(ry) => onRotationChange(rotationOffset[0], ry, rotationOffset[2])}
          />
        )}
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
              deformerRange={deformerRange}
              deformerSeed={deformerSeed}
              overheadMode={camPreset === 'browse'}
              heroMode={camPreset === 'heroimp'}
              overhead={overhead}
              variantCount={variantCount}
              variantHeightSpread={variantHeightSpread}
            />
          )}
        </Suspense>
        {/* TreeGizmo (translate/rotate/scale handles) retired 2026-06-25 —
            recentering is automatic (Brief 20), rotation is never needed, and
            scale is now botanical (mature-height). */}
        <DollyCam
          cameraStateRef={cameraStateRef}
          dragPanRef={dragPanRef}
          rotationY={rotationOffset[1]}
          rotationOffset={rotationOffset}
          onRotationChange={onRotationChange}
        />
        {onPerfSample && <PerfProbe onSample={onPerfSample} />}
      </Canvas>
      {/* Oubliette (top-down XZ radar) retired 2026-06-25 — chassis auto-center
          (Brief 20, dominant-trunk to origin at source) made manual X/Z
          placement vestigial. The perf readout reclaims the bottom-right. */}
      {/* Studio/Worm gizmo-mode toggle retired 2026-06-25 — Worm rode the
          (removed) Oubliette + the Street preset covers eye-level; the gizmo
          now defaults to the full Studio handles. */}
      {/* Brief 13 (Vantage, refined 2026-05-23) — two preset cameras
          driving Brief 10's bark-shader tier auto-binding. Overhead
          pins tier 0 (aerial). Ground hands off to distance-based
          tier-switching (per-frame in DollyCam): distance > 20m → tier 1
          (hero), distance < 20m → tier 2 (street). Debug pin via
          window.__setBarkShaderTier(n) overrides the auto-binding;
          window.__releaseBarkShaderTier() restores it. */}
      <div style={{
        position: 'absolute', top: 12, left: 12,
        display: 'flex', gap: 6,
      }}>
        {[
          ['worm',   'Worm',   'Worm POV — low to the ground, looking at the trunk base, to check the tree sits flat.'],
          ['street', 'Street', 'Eye-level, close — Street context (tier 2, full detail). What street-view sees: full-sized trees.'],
          ['hero',   'Hero',   'Studio mid framing — Hero context (tier 1, size-managed). The authoring default.'],
          ['heroimp','Hero Imp','Side-on, level with the canopy — eye-gate the HERO canopy-band impostor (the side-on twin of Browse). Set the Wind slider to see it breathe.'],
          ['browse', 'Browse', 'Top-down plan — Browse context (tier 0, aerial / overhead). Shows the OVERHEAD hula impostor (ruffle/hula knobs, bottom-right). Wheel zooms altitude.'],
        ].map(([key, label, title]) => (
          <button key={key}
            onClick={() => setCamPreset(key)}
            style={presetBtnStyle(camPreset === key)}
            title={title}>
            {label}
          </button>
        ))}
      </div>
      {/* Variant review (2026-06-25): 1 authoring tree, or a row of 3 deformed
          instances to SEE + eye-gate the per-tree variation (the deformer). The
          deformer hashes each tree's position, so the 3 clones differ for free.
          3 hides the gizmo (review, not authoring). */}
      <div style={{ position: 'absolute', top: 44, left: 12, display: 'flex', gap: 6 }}>
        {[1, 3].map(n => (
          <button key={n}
            onClick={() => {
              setVariantCount(n)
              if (cameraStateRef?.current) {
                const base = presetFraming(camPreset, (typeof topY === 'number' ? topY : 12)).distance || 22
                cameraStateRef.current.distance = base * (n > 1 ? 1.9 : 1)
              }
            }}
            style={presetBtnStyle(variantCount === n)}
            title={n > 1 ? 'Show 3 deformed variants side by side — review the per-tree variation' : 'Single tree (authoring + gizmo)'}>
            {n === 1 ? 'Solo' : 'Group'}
          </button>
        ))}
      </div>
      {/* Overhead RELIGHT preview (Browse only) — drag overcast ↔ sunny to eye-gate
          parity: the baked AO stays, the atmosphere sets the contrast. In LS this
          is driven by the TOD/meteorologist, not this slider. */}
      {camPreset === 'browse' && (
        <div style={{
          // Grouped with the Wind toggle at bottom-LEFT (stacked just above it),
          // clear of the perf readout at bottom-right (2026-07-11).
          position: 'absolute', bottom: 52, left: 12, width: 172,
          display: 'flex', flexDirection: 'column', gap: 4,
          padding: '6px 10px', borderRadius: 4,
          background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.08)',
          font: '11px system-ui, sans-serif', color: 'rgba(255,255,255,0.82)',
        }}>
          <span style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Light</span>
            <span style={{ opacity: 0.6 }}>{ohLight < 0.34 ? 'overcast' : ohLight > 0.66 ? 'sunny' : 'hazy'}</span>
          </span>
          <input type="range" min={0} max={1} step={0.01} value={ohLight}
            onChange={(e) => setOhLight(parseFloat(e.target.value))}
            title="Overcast (flat) → sunny (contrast). Previews how the plan-view trees track the weather."
            style={{ width: '100%' }} />
        </div>
      )}
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
