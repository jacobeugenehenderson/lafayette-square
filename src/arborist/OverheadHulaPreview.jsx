/**
 * OverheadHulaPreview — the Salon surface where Jacob perfects the OVERHEAD
 * "hula" tree impostor looking straight down (HANDOFF-overhead-hula-impostor.md).
 *
 * A grid of overhead disc-stacks (buildOverheadHulaGeometry), instanced with
 * varied per-placement rotY so the ruche fold-phase differs tree-to-tree (the
 * anti-stamping guarantee — overhead shows all trees at once, a synced grid is
 * the failure). Skinned with the SAME shared atlas material the LS runtime + the
 * mesh trees use (one shader program, full optical parity) so the MOTION is
 * perfectable immediately; the captured top-down RTT skin (real canopy-from-above)
 * is the next pass on this same geometry.
 *
 * Three layered deformers ride the shared vertex path:
 *   1. ruche  — standing rim scallop, amplitude flexed by uRuffleDepth (knob 1)
 *   2. hula   — base-anchored per-layer disc rock, uHulaAmount (knob 2)
 *   3. wind   — the SHARED treeSwayUniforms (same weather as the mesh trees),
 *               driven here so a live gust leans + ripples the discs downwind.
 *
 * Two sliders write composition.deformer.overhead via the workstage's onParams
 * (setSalonSlotParams → autosave). The numbers are Jacob's eye's call.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  useTreeAtlas,
  treeSwayUniforms,
  applyOverheadDeformerUniforms,
} from '../components/treeAtlasMaterial.js'
import { buildOverheadHulaGeometry } from '../components/impostorGeometry.js'

// Grid of disc-stacks. Kept small (readable overhead, cheap) but big enough
// that the "weather moves across the neighborhood" read is legible.
const GRID = 4                    // GRID×GRID stacks
const DEFAULTS = { ruffleDepth: 0.35, hulaAmount: 0.5 }

// Deterministic per-index pseudo-random in [0,1) (no Math.random → stable
// layout across re-renders, so the operator isn't chasing a shuffling grid).
function hash01(i, salt) {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

// The instanced disc-stack grid. Builds one geometry from the species rec and
// stamps GRID² instance matrices (varied position + rotY + slight scale).
function HulaGrid({ rec, material, ruffleDepth, hulaAmount, windStrength }) {
  const meshRef = useRef()
  const geometry = useMemo(() => (rec ? buildOverheadHulaGeometry(rec, 'summer') : null), [rec])

  const R = Math.max(0.5, rec?.canopyRadiusM || 5)
  const spacing = 2.35 * R
  const count = GRID * GRID

  const matrices = useMemo(() => {
    const arr = []
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()
    const yUp = new THREE.Vector3(0, 1, 0)
    for (let i = 0; i < count; i++) {
      const gx = i % GRID, gz = Math.floor(i / GRID)
      const x = (gx - (GRID - 1) / 2) * spacing
      const z = (gz - (GRID - 1) / 2) * spacing
      // Golden-angle rotY → every stack's baked scallop lands at a different
      // world phase (the anti-stamping lever, off the instance matrix rotation).
      const rotY = i * 2.399963267
      const s = 0.82 + 0.32 * hash01(i, 3)
      pos.set(x, 0, z)
      q.setFromAxisAngle(yUp, rotY)
      scl.set(s, s, s)
      m.compose(pos, q, scl)
      arr.push(m.clone())
    }
    return arr
  }, [count, spacing])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m))
    mesh.instanceMatrix.needsUpdate = true
    mesh.frustumCulled = false
  }, [matrices])

  // Drive the SHARED wind + the two knob uniforms every frame. The wind uses
  // the exact synthetic mapping the workstage's Skeleton preview uses (east
  // drift + gusts), so a live gust travels across the grid. applyOverhead* sets
  // the knobs on the shared material — gated per-vertex by aOverhead, so this
  // never perturbs any mesh tree sharing the material.
  useFrame((_, dt) => {
    treeSwayUniforms.uTime.value += dt
    const speed = Math.max(0, windStrength) * 5.0
    treeSwayUniforms.uWindForce.value.set(speed, 0, 0)
    treeSwayUniforms.uWindIntensity.value = speed
    treeSwayUniforms.uGustFrontVelocity.value.set(10, 0, 0)
    treeSwayUniforms.uGustsScale.value = windStrength * 4.0
    treeSwayUniforms.uGustEnvelope.value = windStrength > 0 ? 1.0 : 0.0
    applyOverheadDeformerUniforms(material, { ruffleDepth, hulaAmount })
  })

  if (!geometry || !material) return null
  return (
    <instancedMesh ref={meshRef} args={[geometry, material, count]} castShadow receiveShadow />
  )
}

// Top-down plan camera — the operator perfects looking straight down (the
// Browse framing, presetFraming('browse') in SpecimenViewport). up=(0,0,-1)
// avoids the +Y/up gimbal singularity, +X reads screen-right.
function TopDownCamera({ radius }) {
  const { camera } = useThree()
  useEffect(() => {
    const extent = GRID * 2.35 * radius
    camera.up.set(0, 0, -1)
    camera.position.set(0, extent * 1.15, 0)
    camera.lookAt(0, 0, 0)
    camera.near = 1
    camera.far = extent * 4
    camera.updateProjectionMatrix()
  }, [camera, radius])
  return null
}

export default function OverheadHulaPreview({ deformer, onParams, lookId = 'lafayette-square' }) {
  const atlas = useTreeAtlas(lookId)
  const persisted = deformer?.overhead || {}
  const [ruffleDepth, setRuffleDepth] = useState(
    Number.isFinite(persisted.ruffleDepth) ? persisted.ruffleDepth : DEFAULTS.ruffleDepth)
  const [hulaAmount, setHulaAmount] = useState(
    Number.isFinite(persisted.hulaAmount) ? persisted.hulaAmount : DEFAULTS.hulaAmount)
  const [windEnabled, setWindEnabled] = useState(true)
  const approved = persisted.approved === true

  // Pick a representative leafy rec. Overhead motion is species-agnostic; any
  // full-canopy species reads the deformers. Prefer a broadleaf with a wide
  // canopy (maple/oak/linden) for a legible disc.
  const rec = useMemo(() => {
    const byS = atlas.manifest?.impostorBySpecies
    if (!byS) return null
    const prefer = ['maple_sugar', 'oak_white', 'linden_american', 'maple_red', 'birch']
    for (const k of prefer) if (byS[k]) return byS[k]
    const first = Object.keys(byS)[0]
    return first ? byS[first] : null
  }, [atlas.manifest])

  const push = (next) => {
    // Write the whole overhead sub-block each time (setSalonSlotParams merges
    // the `deformer` object shallowly, so we replace `overhead` wholesale).
    onParams?.({ deformer: { overhead: {
      ruffleDepth: next.ruffleDepth ?? ruffleDepth,
      hulaAmount:  next.hulaAmount  ?? hulaAmount,
      approved:    next.approved    ?? approved,
    } } })
  }

  const R = Math.max(0.5, rec?.canopyRadiusM || 5)

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0b0d12' }}>
      <Canvas shadows camera={{ fov: 38, near: 1, far: 4000 }}>
        <color attach="background" args={['#0b0d12']} />
        <hemisphereLight args={['#ffffff', '#20242c', 0.9]} />
        <directionalLight position={[6, 40, 10]} intensity={0.7} />
        <TopDownCamera radius={R} />
        <Suspense fallback={null}>
          {atlas.status === 'ready' && rec && (
            <HulaGrid
              rec={rec}
              material={atlas.treeMaterial}
              ruffleDepth={ruffleDepth}
              hulaAmount={hulaAmount}
              windStrength={windEnabled ? 1.0 : 0}
            />
          )}
        </Suspense>
      </Canvas>

      {/* Status / empty states */}
      {atlas.status !== 'ready' && (
        <div style={overlayMsg}>
          {atlas.status === 'error' ? 'atlas failed to load' : 'loading atlas…'}
        </div>
      )}
      {atlas.status === 'ready' && !rec && (
        <div style={overlayMsg}>no impostor record baked in this look's atlas</div>
      )}

      {/* Header */}
      <div style={{
        position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 10,
        color: '#cdd6df', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        <span>Overhead hula — plan view</span>
        <button type="button"
          onClick={() => { const a = !approved; push({ approved: a }) }}
          title={approved ? 'Approved — the overhead impostor motion is signed off (click to unset)' : 'Approve the overhead impostor motion'}
          style={{
            width: 20, height: 20, borderRadius: 4, cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0,
            border: '1px solid ' + (approved ? 'rgba(80,200,140,0.7)' : 'rgba(255,255,255,0.2)'),
            background: approved ? 'rgba(80,200,140,0.28)' : 'rgba(0,0,0,0.45)',
            color: approved ? '#9ed8b0' : '#999',
          }}>
          {approved ? '★' : '·'}
        </button>
      </div>

      {/* The two knobs (+ wind toggle) */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, right: 12,
        background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 5, padding: '10px 12px',
        display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, color: '#bbb',
      }}>
        <Knob label="Ruffle depth" value={ruffleDepth} min={0} max={1} step={0.01}
          onChange={(v) => { setRuffleDepth(v); push({ ruffleDepth: v }) }} />
        <Knob label="Hula amount" value={hulaAmount} min={0} max={3} step={0.02}
          onChange={(v) => { setHulaAmount(v); push({ hulaAmount: v }) }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 2 }}>
          <input type="checkbox" checked={windEnabled}
            onChange={(e) => setWindEnabled(e.target.checked)} style={{ margin: 0 }} />
          <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Live wind gust</span>
        </label>
      </div>
    </div>
  )
}

function Knob({ label, value, min, max, step, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 92, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1 }} />
      <span style={{ width: 40, textAlign: 'right', color: '#888' }}>{value.toFixed(2)}</span>
    </label>
  )
}

const overlayMsg = {
  position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
  color: '#667', fontSize: 12, pointerEvents: 'none',
}
