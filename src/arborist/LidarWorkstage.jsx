/**
 * LidarWorkstage — Phase L Cycle 1 (2026-05-19).
 *
 * Third top-level mode alongside Procedural + Grove. Browses LiDAR
 * specimens of the active species, drives `lidar_extract.py` for
 * live QSM cylinder skeleton tuning, and previews the result composed
 * over the raw point cloud. No bake, no GLB write, no manifest emission
 * — that's Cycle 2's bake/publish step.
 *
 * Layout:
 *   ┌── header (mode toggle, active species, auto-suggested leaf pack) ──┐
 *   │ left rail ─ specimen browser (top) + extraction tuner (bottom)     │
 *   │ right pane ─ 3D viewport (top) + statistics (bottom)               │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * Cycle 2 owns: outer-shell A2C cards on the LiDAR skeleton, inner-mass
 * THREE.Points canopy, per-region bark binding to manifest, bake/publish.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import * as THREE from 'three'
import useArboristStore from './stores/useArboristStore.js'
import LEAF_PACK_BINDINGS from '../../arborist/leaf-pack-bindings.json'


// ── Helpers ──────────────────────────────────────────────────────────────

// Look up the auto-suggested leaf pack for a species. Cycle 1 informational
// only; bake-look.js performs the real binding in Cycle 2.
function suggestedLeafPack(speciesId, speciesMorph) {
  if (!speciesId) return null
  const override = LEAF_PACK_BINDINGS.speciesOverrides?.[speciesId]
  if (override === null) {
    // Coverage gap explicitly marked — no vendor pack available.
    return { packId: null, label: 'coverage gap — no vendor pack', morphology: null }
  }
  if (override) {
    // Resolve morphology from the pack id via reverse lookup so the label reads right.
    for (const [morph, packs] of Object.entries(LEAF_PACK_BINDINGS.morphologyToPacks)) {
      const hit = packs.find(p => p.packId === override)
      if (hit) return { packId: override, label: hit.label, morphology: morph }
    }
    return { packId: override, label: override, morphology: null }
  }
  // Fall back to species's shape → morphology → first candidate.
  const morph = LEAF_PACK_BINDINGS.shapeToMorphology?.[speciesMorph] || speciesMorph
  const candidates = LEAF_PACK_BINDINGS.morphologyToPacks?.[morph]
  if (!candidates || candidates.length === 0) return null
  return { packId: candidates[0].packId, label: candidates[0].label, morphology: morph }
}


// ── Viewport children ────────────────────────────────────────────────────

// Raw .laz → PLY conversion lives on the server (existing cached
// /specimens/:treeId/preview.ply endpoint). We render as THREE.Points; the
// forestry rotation lifts Z-up to Y-up so it stacks with our skeleton.
//
// Frame convention (resolved N.0, 2026-05-19): viewport is Y-up. The
// PLY arrives in source forestry Z-up and is rotated here at load.
function PointCloud({ url, visible = true, opacity = 0.85, fitRef }) {
  const geometry = useLoader(PLYLoader, url)
  const oriented = useMemo(() => {
    const g = geometry.clone()
    g.rotateX(-Math.PI / 2)
    g.computeBoundingBox()
    // Report bounding box up so the camera-fit button can frame the tree.
    if (fitRef) fitRef.current = g.boundingBox
    return g
  }, [geometry, fitRef])
  if (!visible) return null
  return (
    <points geometry={oriented}>
      <pointsMaterial size={0.04} sizeAttenuation color="#7fc8e0" transparent opacity={opacity} />
    </points>
  )
}


// Renders the cylinder graph as two InstancedMesh draws: trunk-like (radius
// >= medianRadius, red) + branch-like (< medianRadius, cyan). Translucent
// so the operator sees what's underneath. Skipping the cylinder when its
// radius is below minRadius is the same gate bake-tree.py applies.
function CylinderSkeleton({ nodes, medianRadius, minRadius, visible = true, opacity = 0.75,
                            trunkColor = '#d44a3a', branchColor = '#4ac8d4' }) {
  const trunkRef = useRef()
  const branchRef = useRef()

  const { trunkData, branchData } = useMemo(() => {
    if (!nodes || nodes.length === 0) return { trunkData: [], branchData: [] }
    const trunkData = []
    const branchData = []
    const up = new THREE.Vector3(0, 1, 0)
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      if (n.parentIdx < 0) continue
      const p = nodes[n.parentIdx]
      // Forestry XYZ → Three's Y-up. Z is up in the file; map (x,z,-y).
      const a = new THREE.Vector3(p.x, p.z, -p.y)
      const b = new THREE.Vector3(n.x, n.z, -n.y)
      const dir = new THREE.Vector3().subVectors(b, a)
      const len = dir.length()
      if (len < 1e-3) continue
      const radius = Math.min(p.radius, n.radius)
      if (radius < minRadius) continue
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize())
      const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(radius, len, radius))
      ;(radius >= medianRadius ? trunkData : branchData).push(m)
    }
    return { trunkData, branchData }
  }, [nodes, medianRadius, minRadius])

  useEffect(() => {
    if (!trunkRef.current) return
    trunkData.forEach((m, i) => trunkRef.current.setMatrixAt(i, m))
    trunkRef.current.count = trunkData.length
    trunkRef.current.instanceMatrix.needsUpdate = true
  }, [trunkData])
  useEffect(() => {
    if (!branchRef.current) return
    branchData.forEach((m, i) => branchRef.current.setMatrixAt(i, m))
    branchRef.current.count = branchData.length
    branchRef.current.instanceMatrix.needsUpdate = true
  }, [branchData])

  if (!visible) return null

  return (
    <>
      <instancedMesh ref={trunkRef} args={[null, null, Math.max(1, trunkData.length)]}>
        <cylinderGeometry args={[1, 1, 1, 8, 1]} />
        <meshStandardMaterial color={trunkColor} transparent opacity={opacity} roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={branchRef} args={[null, null, Math.max(1, branchData.length)]}>
        <cylinderGeometry args={[1, 1, 1, 6, 1]} />
        <meshStandardMaterial color={branchColor} transparent opacity={opacity * 0.85} roughness={0.6} />
      </instancedMesh>
    </>
  )
}


// Project: Li'l Vera Stage N.2.1 (2026-05-20, Tycho) — debug heatmap of the
// observational memory field. Each consolidated 3D candidate is rendered as
// a coloured point; the colour encodes the selected M_obs channel
// (silhouette_count / medial_count / body_count / rigs_seen) or the Phase 2b
// tomography classification (noise / linear-interior / junction / tip).
// This IS the N.2.1 visual gate per the brief: "does M_obs concentrate along
// tree-shaped regions?".
const MEMORY_CHANNELS = ['rigsSeen', 'medialCount', 'silhouetteCount', 'bodyCount', 'classification']
const CLASSIFICATION_COLORS = {
  'noise':           [0.40, 0.40, 0.45],
  'linear-interior': [0.20, 0.80, 0.85],  // cyan
  'junction':        [0.95, 0.30, 0.85],  // magenta
  'tip':             [1.00, 0.85, 0.20],  // yellow
  'unclassified':    [0.30, 0.30, 0.30],
}
function viridis(t) {
  // 5-stop viridis approximation, t in [0, 1].
  const t1 = Math.max(0, Math.min(1, t))
  const stops = [
    [0.267, 0.005, 0.329],   // dark purple
    [0.282, 0.140, 0.458],
    [0.254, 0.265, 0.530],
    [0.207, 0.372, 0.553],
    [0.165, 0.471, 0.558],
    [0.128, 0.567, 0.551],
    [0.135, 0.659, 0.518],
    [0.267, 0.749, 0.441],
    [0.478, 0.821, 0.318],
    [0.741, 0.873, 0.150],
    [0.993, 0.906, 0.144],   // yellow
  ]
  const f = t1 * (stops.length - 1)
  const i = Math.floor(f)
  const j = Math.min(stops.length - 1, i + 1)
  const k = f - i
  const a = stops[i], b = stops[j]
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}
function MemoryHeatPoints({ nodes, channel = 'rigsSeen', visible = true, opacity = 0.9, pointSize = 0.08 }) {
  const geom = useMemo(() => {
    if (!nodes || nodes.length === 0) return null
    const N = nodes.length
    const positions = new Float32Array(N * 3)
    const colors = new Float32Array(N * 3)
    let max = 1
    if (channel !== 'classification') {
      for (let i = 0; i < N; i++) {
        const v = nodes[i][channel] || 0
        if (v > max) max = v
      }
    }
    for (let i = 0; i < N; i++) {
      const n = nodes[i]
      // Forestry XYZ → Three's Y-up. Z is up in the file; map (x,z,-y).
      positions[i * 3 + 0] = n.x
      positions[i * 3 + 1] = n.z
      positions[i * 3 + 2] = -n.y
      let rgb
      if (channel === 'classification') {
        rgb = CLASSIFICATION_COLORS[n.classification] || CLASSIFICATION_COLORS.unclassified
      } else {
        const v = n[channel] || 0
        rgb = viridis(v / max)
      }
      colors[i * 3 + 0] = rgb[0]
      colors[i * 3 + 1] = rgb[1]
      colors[i * 3 + 2] = rgb[2]
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('color',    new THREE.BufferAttribute(colors,    3))
    return g
  }, [nodes, channel])
  if (!visible || !geom) return null
  return (
    <points geometry={geom}>
      <pointsMaterial size={pointSize} sizeAttenuation vertexColors transparent opacity={opacity} />
    </points>
  )
}


// ── Project: Li'l Vera Cycle 1 rev. 2 — N.3.0 First Light (2026-05-20, Penzias). ──
//
// 6th alignment-oracle layer. Renders the rev. 2 apparatus output:
//   • candidates as colour-coded points (combined_confidence / prior_likelihood
//     / classification / geometric_confidence)
//   • tip anchors as small instanced spheres (orange-gold #f0a040)
// Lives alongside the 5th layer ("Li'l Vera v1 baseline" — cyan-magenta
// CylinderSkeleton); both visible simultaneously so the operator can
// compare rev. 1 voxel-graph vs rev. 2 species-conditioned classification.
const VERA2_CHANNELS = [
  'combined_confidence',
  'prior_likelihood',
  'geometric_confidence',
  'classification',
]
const VERA2_CLASS_COLORS = {
  'noise':           [0.30, 0.30, 0.35],
  'linear-interior': [0.94, 0.62, 0.25],  // orange-gold
  'junction':        [0.85, 0.30, 0.45],  // crimson — bimodal joints
  'tip':             [1.00, 0.85, 0.30],  // bright gold
  'sheet':           [0.45, 0.45, 0.65],
  'unclassified':    [0.25, 0.25, 0.25],
}
function teal_to_gold(t) {
  // Orange-gold (#f0a040) ↔ deep-teal (#208070) ramp for prior-likelihood
  // / combined-confidence channels. t∈[0,1]; t=0 → teal, t=1 → gold.
  const t1 = Math.max(0, Math.min(1, t))
  const teal = [0.125, 0.502, 0.439]   // #208070
  const gold = [0.941, 0.627, 0.251]   // #f0a040
  return [
    teal[0] + (gold[0] - teal[0]) * t1,
    teal[1] + (gold[1] - teal[1]) * t1,
    teal[2] + (gold[2] - teal[2]) * t1,
  ]
}
function VeraV2Candidates({ candidates, channel = 'combined_confidence',
                            visible = true, opacity = 0.85, pointSize = 0.06,
                            confidenceFloor = 0.0 }) {
  const geom = useMemo(() => {
    if (!candidates || candidates.length === 0) return null
    // Filter for visualization clarity — candidates below confidenceFloor
    // are hidden (operator can dial the floor to see the discriminator in
    // action: at floor=0 everything renders, at floor=0.3 only the
    // species-prior-confident structural skeleton remains).
    const filtered = candidates.filter(c =>
      channel === 'classification' || ((c[channel] || 0) >= confidenceFloor))
    const N = filtered.length
    if (N === 0) return null
    const positions = new Float32Array(N * 3)
    const colors = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      const c = filtered[i]
      positions[i * 3 + 0] = c.x
      positions[i * 3 + 1] = c.z
      positions[i * 3 + 2] = -c.y
      let rgb
      if (channel === 'classification') {
        rgb = VERA2_CLASS_COLORS[c.classification] || VERA2_CLASS_COLORS.unclassified
      } else {
        rgb = teal_to_gold(c[channel] || 0)
      }
      colors[i * 3 + 0] = rgb[0]
      colors[i * 3 + 1] = rgb[1]
      colors[i * 3 + 2] = rgb[2]
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('color',    new THREE.BufferAttribute(colors,    3))
    return g
  }, [candidates, channel, confidenceFloor])
  if (!visible || !geom) return null
  return (
    <points geometry={geom}>
      <pointsMaterial size={pointSize} sizeAttenuation vertexColors
        transparent opacity={opacity} />
    </points>
  )
}
function VeraV2TipAnchors({ anchors, visible = true, opacity = 0.95,
                            radius = 0.08, color = '#f0a040' }) {
  const ref = useRef()
  useEffect(() => {
    if (!ref.current || !anchors) return
    const m = new THREE.Matrix4()
    const s = new THREE.Vector3(radius, radius, radius)
    const q = new THREE.Quaternion()
    for (let i = 0; i < anchors.length; i++) {
      const p = anchors[i].position
      // Forestry XYZ → Y-up.
      m.compose(new THREE.Vector3(p[0], p[2], -p[1]), q, s)
      ref.current.setMatrixAt(i, m)
    }
    ref.current.count = anchors.length
    ref.current.instanceMatrix.needsUpdate = true
  }, [anchors, radius])
  if (!visible || !anchors || anchors.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[null, null, Math.max(1, anchors.length)]}>
      <sphereGeometry args={[1, 12, 8]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4}
        transparent opacity={opacity} roughness={0.4} />
    </instancedMesh>
  )
}


// N.0 Alignment Oracle layer — the published GLB straight off disk, no
// transform. bake-tree.py applies the Z→Y rotation at bake time so the
// artifact ships Y-up; runtime three.js consumers (InstancedTrees and this
// oracle) add no further rotation. See arborist/NOTES.md 2026-05-19 evening.
function BakedGlbOracle({ url, visible = true, opacity = 1.0 }) {
  const { scene } = useGLTF(url)
  const cloned = useMemo(() => {
    const s = scene.clone(true)
    // Clone materials too so opacity mutations don't bleed across mounts
    // (Object3D.clone shares material refs by default).
    let meshCount = 0
    const bbox = new THREE.Box3()
    s.traverse(o => {
      if (o.isMesh) {
        meshCount++
        if (Array.isArray(o.material)) o.material = o.material.map(m => m.clone())
        else if (o.material) o.material = o.material.clone()
        bbox.expandByObject(o)
      }
    })
    const size = new THREE.Vector3(); bbox.getSize(size)
    const ctr = new THREE.Vector3(); bbox.getCenter(ctr)
    console.log('[BakedGlbOracle] loaded', url, '— meshes:', meshCount,
      'bbox center:', ctr.toArray().map(n => n.toFixed(2)),
      'size:', size.toArray().map(n => n.toFixed(2)))
    return s
  }, [scene, url])
  useEffect(() => {
    cloned.traverse(o => {
      if (!o.isMesh || !o.material) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const mat of mats) {
        if (opacity >= 0.999) {
          mat.transparent = false
          mat.opacity = 1.0
          mat.depthWrite = true
        } else {
          mat.transparent = true
          mat.opacity = opacity
          mat.depthWrite = false
        }
        mat.needsUpdate = true
      }
    })
  }, [cloned, opacity])
  if (!visible) return null
  return <primitive object={cloned} />
}


// Captures the Canvas's camera + OrbitControls into parent refs so the
// HTML FitButton (mounted OUTSIDE the Canvas) can imperatively re-frame
// without using R3F hooks itself (hooks only work inside Canvas children).
function CameraCapture({ cameraRef, controlsRef }) {
  const camera = useThree(s => s.camera)
  const controls = useThree(s => s.controls)
  useEffect(() => {
    cameraRef.current = camera
    controlsRef.current = controls
  }, [camera, controls, cameraRef, controlsRef])
  return null
}

function FitButton({ fitRef, cameraRef, controlsRef }) {
  return (
    <button
      onClick={() => {
        const camera = cameraRef.current
        const controls = controlsRef.current
        const box = fitRef.current
        if (!box || !camera || !controls) return
        const center = new THREE.Vector3()
        const size = new THREE.Vector3()
        box.getCenter(center); box.getSize(size)
        const maxD = Math.max(size.x, size.y, size.z)
        const dist = maxD * 1.6
        camera.position.set(center.x + dist, center.y + dist * 0.4, center.z + dist)
        controls.target.copy(center)
        controls.update()
      }}
      style={btnGhostStyle}
      title="Re-center camera on the loaded specimen">
      Fit
    </button>
  )
}


// ── Main component ──────────────────────────────────────────────────────

export default function LidarWorkstage() {
  const species             = useArboristStore(s => s.species)
  const activeSpeciesId     = useArboristStore(s => s.activeSpeciesId)
  const setActiveSpecies    = useArboristStore(s => s.setActiveSpecies)
  const specimens           = useArboristStore(s => s.specimens)
  const specimensError      = useArboristStore(s => s.specimensError)
  const loadSpecimens       = useArboristStore(s => s.loadSpecimens)
  const setProceduralOpen   = useArboristStore(s => s.setProceduralOpen)
  const setGroveOpen        = useArboristStore(s => s.setGroveOpen)
  const setLidarOpen        = useArboristStore(s => s.setLidarOpen)
  const setSalonOpen        = useArboristStore(s => s.setSalonOpen)
  // Phase L Cycle 2 publish.
  const lidarPublishing     = useArboristStore(s => s.lidarPublishing)
  const lidarPublishError   = useArboristStore(s => s.lidarPublishError)
  const publishLidarSpecimen = useArboristStore(s => s.publishLidarSpecimen)
  const [publishResult, setPublishResult] = useState(null)

  // Default to first LiDAR-source species the first time the user enters LiDAR mode.
  useEffect(() => {
    if (activeSpeciesId) return
    const first = species.find(s => !!s.forSpeciesName)
    if (first) setActiveSpecies(first.id)
  }, [species, activeSpeciesId, setActiveSpecies])

  useEffect(() => {
    if (activeSpeciesId) loadSpecimens(activeSpeciesId)
  }, [activeSpeciesId, loadSpecimens])

  // Local UI state — kept out of the store to avoid leaking into the
  // procedural workstage when both modes are toggled in one session.
  const [filter, setFilter]             = useState('')
  const [selectedTreeId, setSelected]   = useState(null)
  const [extractionParams, setParams]   = useState(null)  // { voxelSize, minRadius, tipRadius }
  const [displayName, setDisplayName]   = useState('')
  const [displayNamesMap, setDNMap]     = useState({})
  const [extractionResult, setResult]   = useState(null)  // { nodes, stats }
  const [extracting, setExtracting]     = useState(false)
  const [extractError, setExtractError] = useState(null)
  const [savingSeedling, setSaving]     = useState(false)
  const [seedlingsList, setSeedlings]   = useState([])
  // N.0 Alignment Oracle: three layers, each with a visibility toggle and
  // an opacity slider. `pointsOpacity` etc. are decoupled from visibility so
  // operator can dim a layer without losing its toggle state.
  const [layers, setLayers]             = useState({
    points: true, cylinders: true, baked: true, bidi: true, lilVera: true,
    veraHeat: false,
    lilVera2: true, lilVera2Tips: true,
    pointsOpacity: 0.85, cylindersOpacity: 0.75, bakedOpacity: 1.0,
    bidiOpacity: 0.85, lilVeraOpacity: 0.85, veraHeatOpacity: 0.95,
    lilVera2Opacity: 0.85, lilVera2TipsOpacity: 0.95,
    veraHeatChannel: 'rigsSeen', // 'rigsSeen' | 'medialCount' | 'silhouetteCount' | 'bodyCount' | 'classification'
    lilVera2Channel: 'combined_confidence', // 'combined_confidence' | 'prior_likelihood' | 'geometric_confidence' | 'classification'
    lilVera2ConfidenceFloor: 0.0,
  })
  // Phase N.1 — bidirectional-growth spike. Lives alongside QSM extraction
  // (above) so the alignment oracle can show both as overlapped layers for
  // operator-visual comparison. Params seeded with module defaults; operator
  // tweaks via the tuner sub-section, hits Re-extract explicitly. No
  // auto-extract — bidirectional takes seconds, not milliseconds.
  const [bidiParams, setBidiParams]     = useState({ voxelSize: 0.05, kNearest: 20, viewCount: 12, minRadius: 0.005 })
  const [bidiResult, setBidiResult]     = useState(null)
  const [bidiExtracting, setBidiExt]    = useState(false)
  const [bidiError, setBidiError]       = useState(null)
  // Project: Li'l Vera, Stage N.2.0 (2026-05-20, Tycho). Posture-B
  // observational skeleton apparatus. Sibling to Bidirectional but a
  // separate algorithm + separate saved-run JSON store; the alignment
  // oracle shows all three as overlapped layers for visual comparison.
  // Single primary knob N (rig count); kOrient is structural at N.2.0 and
  // will be load-bearing at N.2.1 (orientation tomography). No auto-extract
  // — N=50 dev runs take seconds, N=500 overnight runs take minutes.
  // `voxelSize` here is the OUTPUT-side consolidation voxel — the knob the
  // operator perceives as "resolution / chain density". Source-cloud
  // downsample stays at the lil_vera.py default (0.03m); power users can
  // override via the CLI `--voxelSize` flag. See N.2.0 status note
  // "consolidationVoxel is the visible knob, not source voxelSize."
  const [veraParams, setVeraParams]     = useState({ N: 50, kOrient: 200, pitch: 0.3, consolidationVoxel: 0.05, passes: 1 })
  const [veraResult, setVeraResult]     = useState(null)
  const [veraExtracting, setVeraExt]    = useState(false)
  const [veraError, setVeraError]       = useState(null)
  const [veraSavedRuns, setVeraSavedRuns] = useState([])
  const [veraSelectedRun, setVeraSelectedRun] = useState('') // '' = current extract
  // Project: Li'l Vera Cycle 1 rev. 2 — N.3.0 First Light (2026-05-20, Penzias).
  // Rev. 2 is a fresh build per brief; v1 (above) stays as baseline-
  // comparison artifact. v2 emits per-candidate classification + tip
  // anchors (NOT a cylinder graph); the 6th alignment-oracle layer
  // renders candidates as priors-coloured dots + tip anchors as orange-
  // gold spheres for direct visual comparison vs v1 cyan-magenta.
  const [veraV2Params, setVeraV2Params] = useState({
    N: 50, seed: 42, kOrient: 200, pitch: 0.3,
    consolidationVoxel: 0.05,
    tipGeometricMin: 0.12, tipElongationMin: 2.5,
    tauTipPrior: 0.5, tipNeighborhoodRadius: 0.25, minNbhdCount: 6,
  })
  const [veraV2Result, setVeraV2Result] = useState(null)
  const [veraV2Extracting, setVeraV2Ext] = useState(false)
  const [veraV2Error, setVeraV2Error]   = useState(null)
  const [veraV2SavedRuns, setVeraV2SavedRuns] = useState([])
  const [veraV2SelectedRun, setVeraV2SelectedRun] = useState('')
  // Per-hero baked manifest cache. Keyed by heroSpecies so we don't re-fetch
  // on every selection change within the same species.
  const [heroManifest, setHeroManifest] = useState(null)
  const fitRef = useRef()
  const cameraRef = useRef()
  const controlsRef = useRef()

  const activeSpecies = species.find(s => s.id === activeSpeciesId)
  const lidarSpecies = species.filter(s => !!s.forSpeciesName)
  const pack = suggestedLeafPack(activeSpeciesId, activeSpecies?.leafMorph)
  // Hero species id — where bake-tree.py writes the artifact (set on the
  // scan-source decl via species-map.json's `heroSpecies` field). Trust the
  // last publish's response first (covers the case where the in-memory
  // species list pre-dates the heroSpecies field landing on /species), then
  // the species-list field, then the active id as fallback.
  const heroSpeciesId = publishResult?.heroSpecies
    || activeSpecies?.heroSpecies
    || activeSpeciesId

  // Fetch the hero manifest so the oracle can look up `variantId` for the
  // currently-selected specimen. One fetch per heroSpecies switch.
  useEffect(() => {
    if (!heroSpeciesId) { setHeroManifest(null); return }
    let cancelled = false
    fetch(`/api/arborist/species/${heroSpeciesId}?t=${Date.now()}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setHeroManifest(d) })
      .catch(() => { if (!cancelled) setHeroManifest(null) })
    return () => { cancelled = true }
  }, [heroSpeciesId])

  // Variant matching the selected specimen, if any. Used to build the baked
  // GLB URL for the oracle layer.
  const bakedVariant = useMemo(() => {
    if (!heroManifest || !selectedTreeId) return null
    return (heroManifest.variants || []).find(
      v => String(v.treeId) === String(selectedTreeId),
    ) || null
  }, [heroManifest, selectedTreeId])
  const bakedGlbUrl = useMemo(() => {
    if (!bakedVariant || !heroSpeciesId) return null
    const lod = bakedVariant.skeletons?.lod0
    if (!lod) return null
    // Bust cache on every re-bake so a fresh publish doesn't show stale GLB.
    return `${import.meta.env.BASE_URL || '/'}trees/${heroSpeciesId}/${lod}?v=${heroManifest.bakedAt || 0}`
  }, [bakedVariant, heroSpeciesId, heroManifest])

  // Load saved seedlings + displayNames for the active species. Mirrors the
  // Scan-mode Workstage's fetch — the two modes share one seedlings.json.
  useEffect(() => {
    if (!activeSpeciesId) return
    let cancelled = false
    fetch(`/api/arborist/species/${activeSpeciesId}/seedlings?t=${Date.now()}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return
        setSeedlings(Array.isArray(d.seedlings) ? d.seedlings : [])
        setDNMap(d.displayNames || {})
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [activeSpeciesId])

  // When the operator picks a specimen, fetch its seedling-state to pre-fill
  // the extraction tuner + display name. Returns config defaults if unsaved.
  useEffect(() => {
    if (!activeSpeciesId || !selectedTreeId) { setParams(null); setDisplayName(''); return }
    let cancelled = false
    fetch(`/api/arborist/lidar/specimen/${selectedTreeId}/seedling-state?species=${activeSpeciesId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return
        setParams(d.extractionParams)
        setDisplayName(d.displayName || '')
        setResult(null)
        setExtractError(null)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [activeSpeciesId, selectedTreeId])

  // Auto-extract once when a specimen is picked + params are loaded. The
  // operator can re-extract via the Re-extract button after slider changes.
  const autoFiredRef = useRef(null)
  useEffect(() => {
    if (!selectedTreeId || !extractionParams) return
    const key = `${selectedTreeId}:${extractionParams.voxelSize}:${extractionParams.minRadius}:${extractionParams.tipRadius}`
    if (autoFiredRef.current === key) return
    autoFiredRef.current = key
    runExtract()
  }, [selectedTreeId, extractionParams])

  async function runExtract() {
    if (!selectedTreeId || !extractionParams) return
    setExtracting(true); setExtractError(null)
    try {
      const r = await fetch(`/api/arborist/lidar/specimen/${selectedTreeId}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ species: activeSpeciesId, ...extractionParams }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setResult(d)
    } catch (err) {
      setExtractError(String(err.message || err))
    } finally {
      setExtracting(false)
    }
  }

  async function runBidiExtract() {
    if (!selectedTreeId || bidiExtracting) return
    setBidiExt(true); setBidiError(null)
    try {
      const r = await fetch(`/api/arborist/lidar/specimen/${selectedTreeId}/bidirectional-extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ species: activeSpeciesId, ...bidiParams }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setBidiResult(d)
    } catch (err) {
      setBidiError(String(err.message || err))
    } finally {
      setBidiExt(false)
    }
  }

  // Reset the bidirectional result when the operator picks a new specimen —
  // stale skeleton from prior tree shouldn't keep overlaying.
  useEffect(() => { setBidiResult(null); setBidiError(null) }, [selectedTreeId])

  // Project: Li'l Vera handlers + saved-runs fetch.
  async function runVeraExtract() {
    if (!selectedTreeId || veraExtracting) return
    setVeraExt(true); setVeraError(null); setVeraSelectedRun('')
    try {
      const r = await fetch(`/api/arborist/lidar/specimen/${selectedTreeId}/lil-vera-extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ species: activeSpeciesId, ...veraParams }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setVeraResult(d)
      refreshVeraRuns()
    } catch (err) {
      setVeraError(String(err.message || err))
    } finally {
      setVeraExt(false)
    }
  }

  async function refreshVeraRuns() {
    if (!selectedTreeId) return
    try {
      const r = await fetch(`/api/arborist/lidar/specimen/${selectedTreeId}/lil-vera-runs?t=${Date.now()}`)
      if (!r.ok) return
      const d = await r.json()
      setVeraSavedRuns(Array.isArray(d.runs) ? d.runs : [])
    } catch { /* non-fatal */ }
  }

  async function loadVeraRun(filename) {
    if (!selectedTreeId || !filename) {
      setVeraSelectedRun('')
      return
    }
    setVeraSelectedRun(filename)
    try {
      const r = await fetch(`/api/arborist/lidar/specimen/${selectedTreeId}/lil-vera-run/${encodeURIComponent(filename)}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      setVeraResult(d)
      setVeraError(null)
    } catch (err) {
      setVeraError(`Load run failed: ${String(err.message || err)}`)
    }
  }

  // Refresh saved-runs list whenever the specimen changes, and clear
  // any current Li'l Vera overlay so stale skeleton from prior tree
  // doesn't keep showing.
  useEffect(() => {
    setVeraResult(null); setVeraError(null); setVeraSelectedRun('')
    setVeraSavedRuns([])
    if (selectedTreeId) refreshVeraRuns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTreeId])

  // Project: Li'l Vera v2 (Penzias, N.3.0) — sibling handlers + saved-runs.
  async function runVeraV2Extract() {
    if (!selectedTreeId || veraV2Extracting) return
    setVeraV2Ext(true); setVeraV2Error(null); setVeraV2SelectedRun('')
    try {
      const r = await fetch(`/api/arborist/lidar/specimen/${selectedTreeId}/lil-vera-v2-extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ species: activeSpeciesId, ...veraV2Params }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setVeraV2Result(d)
      refreshVeraV2Runs()
    } catch (err) {
      setVeraV2Error(String(err.message || err))
    } finally {
      setVeraV2Ext(false)
    }
  }
  async function refreshVeraV2Runs() {
    if (!selectedTreeId) return
    try {
      const r = await fetch(`/api/arborist/lidar/specimen/${selectedTreeId}/lil-vera-v2-runs?t=${Date.now()}`)
      if (!r.ok) return
      const d = await r.json()
      setVeraV2SavedRuns(Array.isArray(d.runs) ? d.runs : [])
    } catch { /* non-fatal */ }
  }
  async function loadVeraV2Run(filename) {
    if (!selectedTreeId || !filename) { setVeraV2SelectedRun(''); return }
    setVeraV2SelectedRun(filename)
    try {
      const r = await fetch(`/api/arborist/lidar/specimen/${selectedTreeId}/lil-vera-v2-run/${encodeURIComponent(filename)}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      setVeraV2Result(d)
      setVeraV2Error(null)
    } catch (err) {
      setVeraV2Error(`Load run failed: ${String(err.message || err)}`)
    }
  }
  useEffect(() => {
    setVeraV2Result(null); setVeraV2Error(null); setVeraV2SelectedRun('')
    setVeraV2SavedRuns([])
    if (selectedTreeId) refreshVeraV2Runs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTreeId])

  async function runPublish() {
    if (!selectedTreeId || !activeSpeciesId || !extractionParams || lidarPublishing) return
    setPublishResult(null)
    try {
      const r = await publishLidarSpecimen({
        treeId: selectedTreeId,
        species: activeSpeciesId,
        tuneParams: extractionParams,
        displayName: displayName || null,
      })
      setPublishResult(r)
      // Refresh hero manifest so the oracle picks up the new variant
      // immediately. Use r.heroSpecies (the actual hero just published to)
      // rather than the closed-over heroSpeciesId, which can still be the
      // pre-publish fallback (active id) until the next render cycle.
      const heroJustPublished = r?.heroSpecies
      if (heroJustPublished) {
        try {
          const m = await fetch(`/api/arborist/species/${heroJustPublished}?t=${Date.now()}`)
            .then(rr => rr.ok ? rr.json() : null)
          if (m) setHeroManifest(m)
        } catch { /* non-fatal */ }
      }
    } catch {
      // error is captured into store.lidarPublishError + reflected below
    }
  }

  async function saveSeedling() {
    if (!selectedTreeId || !activeSpeciesId || !extractionParams) return
    setSaving(true)
    try {
      // Build the next seedlings list — replace if existing, else append.
      const exists = seedlingsList.find(s => String(s.treeId) === String(selectedTreeId))
      const nextSeedlings = exists
        ? seedlingsList.map(s =>
            String(s.treeId) === String(selectedTreeId)
              ? { ...s, tuneParams: extractionParams } : s)
        : [...seedlingsList, {
            id: (seedlingsList.length ? Math.max(...seedlingsList.map(s => s.id || 0)) : 0) + 1,
            treeId: String(selectedTreeId),
            treeH: specimens.find(sp => String(sp.treeId) === String(selectedTreeId))?.treeH,
            tuneParams: extractionParams,
          }]
      const nextDN = { ...displayNamesMap }
      if (displayName) nextDN[selectedTreeId] = displayName
      else delete nextDN[selectedTreeId]
      const r = await fetch(`/api/arborist/species/${activeSpeciesId}/seedlings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          starred: nextSeedlings.map(s => String(s.treeId)),
          seedlings: nextSeedlings,
          displayNames: nextDN,
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setSeedlings(nextSeedlings)
      setDNMap(nextDN)
    } catch (err) {
      setExtractError('save failed: ' + String(err.message || err))
    } finally {
      setSaving(false)
    }
  }

  // Specimen list: filter by display-name substring or height range, sort
  // by treeH descending (tallest first per brief).
  const filteredSpecimens = useMemo(() => {
    if (!specimens) return []
    const q = filter.trim().toLowerCase()
    const heightRange = q.match(/^(\d+)-(\d+)$/)
    const items = specimens.filter(sp => {
      if (!q) return true
      if (heightRange) {
        const lo = +heightRange[1], hi = +heightRange[2]
        return sp.treeH >= lo && sp.treeH <= hi
      }
      const dn = displayNamesMap[sp.treeId] || ''
      return dn.toLowerCase().includes(q) || String(sp.treeId).includes(q)
    })
    return items.slice().sort((a, b) => (b.treeH || 0) - (a.treeH || 0))
  }, [specimens, filter, displayNamesMap])

  const plyUrl = selectedTreeId ? `/api/arborist/specimens/${selectedTreeId}/preview.ply` : null
  const lod0Tris = useMemo(() => {
    if (!extractionResult) return null
    // Trunk uses 8-radial cylinder, branch uses 6 — match Cycle 2 publish-glb.
    // Per-cylinder tri count ≈ radial × 2 (side faces). Caps are skipped at
    // emit time when bake-tree.py meshes (it doesn't write caps either at
    // the open-ended seam in practice).
    const trunk = extractionResult.stats.trunkLike * 8 * 2
    const branch = extractionResult.stats.branchLike * 6 * 2
    return trunk + branch
  }, [extractionResult])

  // ── Render ──
  return (
    <div style={shellStyle}>
      <Header
        activeSpeciesId={activeSpeciesId}
        lidarSpecies={lidarSpecies}
        onSpeciesChange={setActiveSpecies}
        pack={pack}
        onProcedural={() => { setLidarOpen(false); setProceduralOpen(true) }}
        onGrove={() => { setLidarOpen(false); setGroveOpen(true) }}
        onLibrary={() => { setLidarOpen(false); setActiveSpecies(null); setSalonOpen(true) }}
      />

      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr', gridTemplateRows: '1fr 1fr', minHeight: 0 }}>
        {/* Left rail top — specimen browser */}
        <section style={{ ...panelStyle, gridRow: 1, borderRight: panelStyle.borderRight, overflow: 'auto' }}>
          <h3 style={sectionHeading}>Specimens</h3>
          <input
            value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="filter (name or height range '8-12')"
            style={inputStyle}
          />
          {specimensError && <div style={errorTextStyle}>Backend: {specimensError}</div>}
          {!activeSpeciesId && <div style={hintTextStyle}>Pick a species above.</div>}
          {activeSpeciesId && filteredSpecimens.length === 0 && (
            <div style={hintTextStyle}>No specimens for {activeSpecies?.label}.</div>
          )}
          <div style={{ display: 'grid', gap: 2, marginTop: 8 }}>
            {filteredSpecimens.map(sp => {
              const isActive = String(sp.treeId) === String(selectedTreeId)
              const dn = displayNamesMap[sp.treeId]
              const saved = seedlingsList.some(s => String(s.treeId) === String(sp.treeId))
              return (
                <button key={sp.treeId} onClick={() => setSelected(sp.treeId)}
                  style={{
                    ...rowBtnStyle,
                    background: isActive ? 'rgba(232,184,96,0.22)' : 'rgba(255,255,255,0.025)',
                    borderColor: isActive ? 'rgba(232,184,96,0.55)' : 'rgba(255,255,255,0.07)',
                    color: isActive ? '#fff' : '#ccc',
                  }}>
                  <span style={{ width: 12, color: saved ? '#e8b860' : '#666' }}>{saved ? '✦' : '◯'}</span>
                  <span style={{ minWidth: 36, color: '#888' }}>{(sp.treeH || 0).toFixed(0)}m</span>
                  <span style={{ minWidth: 38, fontSize: 10, color: '#888', letterSpacing: '0.05em' }}>{sp.dataType || ''}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {dn || `tree ${sp.treeId}`}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* Right pane — viewport + layer toggles, spans both rows */}
        <section style={{ ...panelStyle, gridRow: '1 / span 2', position: 'relative', overflow: 'hidden' }}>
          {!selectedTreeId ? (
            <div style={{ ...hintTextStyle, padding: 24 }}>Select a specimen to preview.</div>
          ) : (
            <Canvas
              shadows
              dpr={[1, 2]}
              gl={{ antialias: true, logarithmicDepthBuffer: false }}
              camera={{ position: [12, 8, 12], fov: 45, near: 0.1, far: 500 }}
              style={{ background: '#0c0e10' }}>
              <ambientLight intensity={0.55} />
              <directionalLight position={[12, 18, 8]} intensity={0.85} />
              <gridHelper args={[40, 40, '#333', '#1f1f1f']} position={[0, 0, 0]} />
              {plyUrl && (
                <Suspense fallback={null}>
                  <PointCloud
                    url={plyUrl}
                    visible={layers.points}
                    opacity={layers.pointsOpacity}
                    fitRef={fitRef} />
                </Suspense>
              )}
              {extractionResult && (
                <CylinderSkeleton
                  nodes={extractionResult.nodes}
                  medianRadius={extractionResult.stats.medianRadius}
                  minRadius={extractionParams?.minRadius ?? 0.005}
                  visible={layers.cylinders}
                  opacity={layers.cylindersOpacity}
                />
              )}
              {bidiResult && (
                <CylinderSkeleton
                  nodes={bidiResult.nodes}
                  medianRadius={bidiResult.stats.medianRadius}
                  minRadius={bidiParams.minRadius}
                  visible={layers.bidi}
                  opacity={layers.bidiOpacity}
                  trunkColor="#e070d8"
                  branchColor="#f0d460"
                />
              )}
              {veraResult && (
                <CylinderSkeleton
                  nodes={veraResult.nodes}
                  medianRadius={veraResult.stats.medianRadius}
                  minRadius={0.005}
                  visible={layers.lilVera}
                  opacity={layers.lilVeraOpacity}
                  trunkColor="#22e0e0"
                  branchColor="#d040c0"
                />
              )}
              {veraResult && (
                <MemoryHeatPoints
                  nodes={veraResult.memoryNodes || veraResult.nodes}
                  channel={layers.veraHeatChannel}
                  visible={layers.veraHeat}
                  opacity={layers.veraHeatOpacity}
                />
              )}
              {veraV2Result && (
                <VeraV2Candidates
                  candidates={veraV2Result.candidates}
                  channel={layers.lilVera2Channel}
                  visible={layers.lilVera2}
                  opacity={layers.lilVera2Opacity}
                  confidenceFloor={layers.lilVera2ConfidenceFloor}
                />
              )}
              {veraV2Result && (
                <VeraV2TipAnchors
                  anchors={veraV2Result.tipAnchors}
                  visible={layers.lilVera2Tips}
                  opacity={layers.lilVera2TipsOpacity}
                />
              )}
              {bakedGlbUrl && (
                <Suspense fallback={null}>
                  <BakedGlbOracle
                    url={bakedGlbUrl}
                    visible={layers.baked}
                    opacity={layers.bakedOpacity}
                  />
                </Suspense>
              )}
              <OrbitControls makeDefault target={[0, 5, 0]} maxDistance={80} />
              <CameraCapture cameraRef={cameraRef} controlsRef={controlsRef} />
            </Canvas>
          )}

          {/* N.0 Alignment Oracle controls — three persistent layers + opacity */}
          {selectedTreeId && (
            <div style={overlayTLStyle}>
              <LayerControl
                label="Points"
                active={layers.points}
                onToggle={() => setLayers(l => ({ ...l, points: !l.points }))}
                opacity={layers.pointsOpacity}
                onOpacity={v => setLayers(l => ({ ...l, pointsOpacity: v }))}
              />
              <LayerControl
                label="Cylinders"
                active={layers.cylinders}
                onToggle={() => setLayers(l => ({ ...l, cylinders: !l.cylinders }))}
                opacity={layers.cylindersOpacity}
                onOpacity={v => setLayers(l => ({ ...l, cylindersOpacity: v }))}
              />
              <LayerControl
                label="Bidirectional"
                active={layers.bidi}
                onToggle={() => setLayers(l => ({ ...l, bidi: !l.bidi }))}
                opacity={layers.bidiOpacity}
                onOpacity={v => setLayers(l => ({ ...l, bidiOpacity: v }))}
                missing={!bidiResult}
                missingHint={bidiExtracting ? '(extracting…)' : '(hit Bidirectional → Re-extract)'}
              />
              <LayerControl
                label="Li'l Vera"
                active={layers.lilVera}
                onToggle={() => setLayers(l => ({ ...l, lilVera: !l.lilVera }))}
                opacity={layers.lilVeraOpacity}
                onOpacity={v => setLayers(l => ({ ...l, lilVeraOpacity: v }))}
                missing={!veraResult}
                missingHint={veraExtracting ? '(extracting…)' : '(hit Li’l Vera → Re-extract)'}
              />
              <LayerControl
                label="M_obs heat"
                active={layers.veraHeat}
                onToggle={() => setLayers(l => ({ ...l, veraHeat: !l.veraHeat }))}
                opacity={layers.veraHeatOpacity}
                onOpacity={v => setLayers(l => ({ ...l, veraHeatOpacity: v }))}
                missing={!veraResult}
                missingHint='(N.2.1 visual gate — extract Li’l Vera first)'
              />
              {layers.veraHeat && veraResult && (
                <div style={{ marginLeft: 6, marginTop: -4, marginBottom: 4 }}>
                  <select
                    value={layers.veraHeatChannel}
                    onChange={e => setLayers(l => ({ ...l, veraHeatChannel: e.target.value }))}
                    style={{ ...selectStyle, fontSize: 10, padding: '2px 6px', width: 160 }}
                    title="Which per-point M_obs / tomography channel to colour by">
                    <option value="rigsSeen">rigs_seen (viridis)</option>
                    <option value="medialCount">medial_count (viridis)</option>
                    <option value="silhouetteCount">silhouette_count (viridis)</option>
                    <option value="bodyCount">body_count (viridis)</option>
                    <option value="classification">tomography class (categorical)</option>
                  </select>
                </div>
              )}
              <LayerControl
                label="Li'l Vera v2"
                active={layers.lilVera2}
                onToggle={() => setLayers(l => ({ ...l, lilVera2: !l.lilVera2 }))}
                opacity={layers.lilVera2Opacity}
                onOpacity={v => setLayers(l => ({ ...l, lilVera2Opacity: v }))}
                missing={!veraV2Result}
                missingHint={veraV2Extracting ? '(extracting…)' : '(hit Li’l Vera v2 → Re-extract)'}
              />
              {layers.lilVera2 && veraV2Result && (
                <div style={{ marginLeft: 6, marginTop: -4, marginBottom: 4 }}>
                  <select
                    value={layers.lilVera2Channel}
                    onChange={e => setLayers(l => ({ ...l, lilVera2Channel: e.target.value }))}
                    style={{ ...selectStyle, fontSize: 10, padding: '2px 6px', width: 200 }}
                    title="Which per-candidate channel to colour by (orange-gold ↔ deep-teal ramp)">
                    <option value="combined_confidence">combined_confidence (gold heat)</option>
                    <option value="prior_likelihood">prior_likelihood (gold heat)</option>
                    <option value="geometric_confidence">geometric_confidence (gold heat)</option>
                    <option value="classification">classification (categorical)</option>
                  </select>
                  <div style={{ fontSize: 9, color: '#888', marginTop: 4 }}>
                    Conf. floor {layers.lilVera2ConfidenceFloor.toFixed(2)}
                  </div>
                  <input type="range" min={0} max={1} step={0.02}
                    value={layers.lilVera2ConfidenceFloor}
                    onChange={e => setLayers(l => ({ ...l, lilVera2ConfidenceFloor: parseFloat(e.target.value) }))}
                    disabled={layers.lilVera2Channel === 'classification'}
                    style={{ width: '100%' }} />
                </div>
              )}
              <LayerControl
                label="Tip anchors"
                active={layers.lilVera2Tips}
                onToggle={() => setLayers(l => ({ ...l, lilVera2Tips: !l.lilVera2Tips }))}
                opacity={layers.lilVera2TipsOpacity}
                onOpacity={v => setLayers(l => ({ ...l, lilVera2TipsOpacity: v }))}
                missing={!veraV2Result || (veraV2Result.tipAnchors || []).length === 0}
                missingHint={veraV2Result ? '(no anchors emitted — surface as scope drift)'
                                          : '(extract Li’l Vera v2 first)'}
              />
              <LayerControl
                label="Baked GLB"
                active={layers.baked}
                onToggle={() => setLayers(l => ({ ...l, baked: !l.baked }))}
                opacity={layers.bakedOpacity}
                onOpacity={v => setLayers(l => ({ ...l, bakedOpacity: v }))}
                missing={!bakedGlbUrl}
                missingHint={heroManifest === null
                  ? '(loading manifest…)'
                  : '(not yet baked — pick a published specimen or hit Publish)'}
              />
              <FitButton fitRef={fitRef} cameraRef={cameraRef} controlsRef={controlsRef} />
            </div>
          )}
        </section>

        {/* Left rail bottom — extraction tuner */}
        <section style={{ ...panelStyle, gridRow: 2, borderRight: panelStyle.borderRight, borderTop: panelStyle.borderRight, padding: 14, overflow: 'auto', minHeight: 0 }}>
          <h3 style={sectionHeading}>Skeleton extraction</h3>
          {!selectedTreeId && <div style={hintTextStyle}>Pick a specimen first.</div>}
          {selectedTreeId && extractionParams && (
            <>
              <DraftSlider label="Voxel size" min={0.01} max={0.1} step={0.005}
                value={extractionParams.voxelSize}
                onCommit={v => setParams(p => ({ ...p, voxelSize: v }))} unit="m" />
              <DraftSlider label="Min radius" min={0.001} max={0.05} step={0.001}
                value={extractionParams.minRadius}
                onCommit={v => setParams(p => ({ ...p, minRadius: v }))} unit="m" />
              <DraftSlider label="Tip radius" min={0.005} max={0.08} step={0.005}
                value={extractionParams.tipRadius}
                onCommit={v => setParams(p => ({ ...p, tipRadius: v }))} unit="m" />

              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={runExtract} disabled={extracting || lidarPublishing} style={btnPrimaryStyle}>
                  {extracting ? 'Extracting…' : 'Re-extract'}
                </button>
                <button onClick={saveSeedling}
                  disabled={savingSeedling || extracting || !extractionResult || lidarPublishing}
                  style={btnSecondaryStyle}>
                  {savingSeedling ? 'Saving…' : 'Save seedling'}
                </button>
                <button onClick={runPublish}
                  disabled={!extractionResult || extracting || savingSeedling || lidarPublishing}
                  style={btnPrimaryStyle}
                  title="Save + bake-tree + LOD split + add to active Look + bake-look (awaited)">
                  {lidarPublishing ? 'Publishing…' : 'Publish'}
                </button>
              </div>
              {publishResult && (
                <div style={{ marginTop: 10, fontSize: 11, color: '#6acf6a' }}>
                  Published → {publishResult.heroSpecies} (bake {publishResult.timings?.bakeMs}ms ·
                  LOD {publishResult.timings?.lodMs}ms
                  {publishResult.timings?.bakeLookMs != null ? ` · look ${publishResult.timings.bakeLookMs}ms` : ''})
                  {publishResult.rosterMutated ? ' · added to Look' : ''}
                </div>
              )}
              {lidarPublishError && (
                <div style={{ marginTop: 10, fontSize: 11, color: '#cf6a6a' }}>
                  Publish failed: {lidarPublishError}
                </div>
              )}

              {/* Specimen details + display-name editor */}
              <div style={{ marginTop: 14, padding: 10, background: 'rgba(255,255,255,0.025)', borderRadius: 4 }}>
                <div style={{ fontSize: 10, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Specimen details
                </div>
                <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8 }}>
                  treeId {selectedTreeId} · {(specimens.find(sp => String(sp.treeId) === String(selectedTreeId))?.dataType || 'TLS')}
                  {' · '}{(specimens.find(sp => String(sp.treeId) === String(selectedTreeId))?.treeH || 0).toFixed(1)}m
                </div>
                <input
                  value={displayName} onChange={e => setDisplayName(e.target.value)}
                  placeholder="display name (optional)"
                  style={{ ...inputStyle, marginBottom: 0 }} />
              </div>

              {extractError && <div style={errorTextStyle}>{extractError}</div>}

              {/* Phase N.1 — Bidirectional-growth tuner. Sibling of the QSM
                  tuner above; emits {x,y,z,radius,parentIdx} in the same
                  source-frame shape so the cylinder renderer above handles
                  both interchangeably. Operator clicks Re-extract; not
                  auto-fired. */}
              <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ ...sectionHeading, color: '#e070d8', marginBottom: 4 }}>
                  Bidirectional · Phase N.1 spike
                </div>
                <DraftSlider label="Voxel size" min={0.02} max={0.15} step={0.005}
                  value={bidiParams.voxelSize}
                  onCommit={v => setBidiParams(p => ({ ...p, voxelSize: v }))} unit="m" />
                <DraftSlider label="k-nearest" min={6} max={40} step={1}
                  value={bidiParams.kNearest}
                  onCommit={v => setBidiParams(p => ({ ...p, kNearest: v }))} />
                <DraftSlider label="View count" min={6} max={24} step={1}
                  value={bidiParams.viewCount}
                  onCommit={v => setBidiParams(p => ({ ...p, viewCount: v }))} />
                <DraftSlider label="Min radius" min={0.001} max={0.05} step={0.001}
                  value={bidiParams.minRadius}
                  onCommit={v => setBidiParams(p => ({ ...p, minRadius: v }))} unit="m" />
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <button onClick={runBidiExtract} disabled={bidiExtracting || lidarPublishing}
                    style={{ ...btnPrimaryStyle, background: 'rgba(224,112,216,0.18)',
                             borderColor: 'rgba(224,112,216,0.5)', color: '#e8a8e0' }}>
                    {bidiExtracting ? 'Extracting…' : 'Re-extract (bidirectional)'}
                  </button>
                </div>
                {bidiResult && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#aaa' }}>
                    {bidiResult.stats.tips} tips · {bidiResult.stats.nodes} nodes ·
                    {' '}{bidiResult.stats.cylinders} cyl · {bidiResult.serverMs ?? bidiResult.stats.elapsedMs}ms
                  </div>
                )}
                {bidiError && <div style={errorTextStyle}>{bidiError}</div>}
              </div>

              {/* Project: Li'l Vera, Stage N.2.0 (2026-05-20, Tycho).
                  Posture-B observational skeleton apparatus. Sibling to
                  Bidirectional but a separate algorithm + separate saved-run
                  store; the alignment oracle shows all three as overlapped
                  layers. Single primary knob N; kOrient is structural at
                  N.2.0, load-bearing at N.2.1 (orientation tomography). */}
              <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ ...sectionHeading, color: '#22e0e0', marginBottom: 4 }}>
                  Li'l Vera · Stage N.2.0 apparatus
                </div>
                <DraftSlider label="N (rigs)" min={6} max={500} step={1}
                  value={veraParams.N}
                  onCommit={v => setVeraParams(p => ({ ...p, N: Math.round(v) }))} />
                <DraftSlider label="K orient" min={50} max={500} step={10}
                  value={veraParams.kOrient}
                  onCommit={v => setVeraParams(p => ({ ...p, kOrient: Math.round(v) }))} />
                <DraftSlider label="Pitch ratio" min={0.1} max={1.0} step={0.05}
                  value={veraParams.pitch}
                  onCommit={v => setVeraParams(p => ({ ...p, pitch: v }))} />
                <DraftSlider label="Voxel size" min={0.02} max={0.20} step={0.005}
                  value={veraParams.consolidationVoxel}
                  onCommit={v => setVeraParams(p => ({ ...p, consolidationVoxel: v }))} unit="m" />
                <DraftSlider label="Passes" min={1} max={8} step={1}
                  value={veraParams.passes}
                  onCommit={v => setVeraParams(p => ({ ...p, passes: Math.round(v) }))} />
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <button onClick={runVeraExtract} disabled={veraExtracting || lidarPublishing}
                    style={{ ...btnPrimaryStyle, background: 'rgba(34,224,224,0.18)',
                             borderColor: 'rgba(34,224,224,0.5)', color: '#a8e8e0' }}>
                    {veraExtracting ? 'Observing…' : 'Re-extract (Li’l Vera)'}
                  </button>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, color: '#888', letterSpacing: '0.08em',
                                textTransform: 'uppercase', marginBottom: 4 }}>
                    Saved runs
                  </div>
                  <select
                    value={veraSelectedRun}
                    onChange={e => loadVeraRun(e.target.value)}
                    style={{ ...selectStyle, width: '100%' }}>
                    <option value="">— current extract / none —</option>
                    {veraSavedRuns.map(r => (
                      <option key={r.filename} value={r.filename}>
                        {r.filename} · N{r.N} · {r.nodes}n · {(r.sizeBytes / 1024).toFixed(0)}KB
                      </option>
                    ))}
                  </select>
                </div>
                {veraResult && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#aaa' }}>
                    N{veraResult.hyperparams?.N} · {veraResult.stats.rigs} rigs ·
                    {' '}{veraResult.stats.nodes} nodes · {veraResult.stats.cylinders} cyl ·
                    {' '}{veraResult.stats.candidatesPreConsolidation} cand ·
                    {' '}{veraResult.serverMs ?? veraResult.stats.elapsedMs}ms
                    {veraResult.savedTo && (
                      <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                        → {veraResult.savedTo}
                      </div>
                    )}
                  </div>
                )}
                {veraError && <div style={errorTextStyle}>{veraError}</div>}
              </div>

              {/* Project: Li'l Vera Cycle 1 rev. 2 — N.3.0 First Light
                  (2026-05-20, Penzias). Sibling to v1 above; rev. 2 is a
                  fresh build with species-conditioned classification +
                  precision-gated tip detector. v1 remains as baseline
                  comparison artifact. Operator tunes the six tip-detector
                  gates + the priors-softness blend; visual gate is the
                  6th alignment-oracle layer in the viewport. */}
              <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ ...sectionHeading, color: '#f0a040', marginBottom: 4 }}>
                  Li'l Vera v2 · N.3.0 First Light
                </div>
                <DraftSlider label="N (rigs)" min={6} max={500} step={1}
                  value={veraV2Params.N}
                  onCommit={v => setVeraV2Params(p => ({ ...p, N: Math.round(v) }))} />
                <DraftSlider label="Seed" min={1} max={9999} step={1}
                  value={veraV2Params.seed}
                  onCommit={v => setVeraV2Params(p => ({ ...p, seed: Math.round(v) }))} />
                <DraftSlider label="K orient" min={50} max={500} step={10}
                  value={veraV2Params.kOrient}
                  onCommit={v => setVeraV2Params(p => ({ ...p, kOrient: Math.round(v) }))} />
                <DraftSlider label="Pitch ratio" min={0.1} max={1.0} step={0.05}
                  value={veraV2Params.pitch}
                  onCommit={v => setVeraV2Params(p => ({ ...p, pitch: v }))} />
                <DraftSlider label="Tip geom min" min={0.05} max={0.6} step={0.01}
                  value={veraV2Params.tipGeometricMin}
                  onCommit={v => setVeraV2Params(p => ({ ...p, tipGeometricMin: v }))} />
                <DraftSlider label="Tip elongation min" min={1.5} max={8.0} step={0.1}
                  value={veraV2Params.tipElongationMin}
                  onCommit={v => setVeraV2Params(p => ({ ...p, tipElongationMin: v }))} />
                <DraftSlider label="τ tip prior" min={0.05} max={0.9} step={0.05}
                  value={veraV2Params.tauTipPrior}
                  onCommit={v => setVeraV2Params(p => ({ ...p, tauTipPrior: v }))} />
                <DraftSlider label="Tip nbhd radius" min={0.05} max={0.50} step={0.01}
                  value={veraV2Params.tipNeighborhoodRadius}
                  onCommit={v => setVeraV2Params(p => ({ ...p, tipNeighborhoodRadius: v }))} unit="m" />
                <DraftSlider label="Min nbhd count" min={3} max={20} step={1}
                  value={veraV2Params.minNbhdCount}
                  onCommit={v => setVeraV2Params(p => ({ ...p, minNbhdCount: Math.round(v) }))} />
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <button onClick={runVeraV2Extract} disabled={veraV2Extracting || lidarPublishing}
                    style={{ ...btnPrimaryStyle, background: 'rgba(240,160,64,0.18)',
                             borderColor: 'rgba(240,160,64,0.5)', color: '#f0c878' }}>
                    {veraV2Extracting ? 'Observing…' : 'Re-extract (Li’l Vera v2)'}
                  </button>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, color: '#888', letterSpacing: '0.08em',
                                textTransform: 'uppercase', marginBottom: 4 }}>
                    Saved runs (v2)
                  </div>
                  <select value={veraV2SelectedRun}
                    onChange={e => loadVeraV2Run(e.target.value)}
                    style={{ ...selectStyle, width: '100%' }}>
                    <option value="">— current extract / none —</option>
                    {veraV2SavedRuns.map(r => (
                      <option key={r.filename} value={r.filename}>
                        {r.filename} · N{r.N} · {r.candidates}c · {r.tipAnchorCount}t · {(r.sizeBytes / 1024).toFixed(0)}KB
                      </option>
                    ))}
                  </select>
                </div>
                {veraV2Result && <VeraV2Diagnostics result={veraV2Result} />}
                {veraV2Error && <div style={errorTextStyle}>{veraV2Error}</div>}
              </div>
            </>
          )}
        </section>

      </main>

      {/* Full-width bottom strip — statistics. Parked at window bottom so the
          viewport above gets the whole vertical preview space. */}
      <footer style={{ ...panelStyle, borderTop: panelStyle.borderRight, padding: '8px 18px', flex: '0 0 auto' }}>
        {!extractionResult ? (
          <div style={{ ...hintTextStyle, fontSize: 11 }}>{extracting ? 'Extracting…' : 'Pick a specimen and extract to see stats.'}</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 11, alignItems: 'baseline' }}>
            <InlineStat label="Points loaded"  value={extractionResult.stats.pointsRaw.toLocaleString()} />
            <InlineStat label="Cylinders"       value={extractionResult.stats.cylinders.toLocaleString()} />
            <InlineStat label="Trunk/branch"    value={`${extractionResult.stats.trunkLike} / ${extractionResult.stats.branchLike}`} />
            <InlineStat label="Est. lod0 tris"  value={`~${(lod0Tris / 1000).toFixed(1)}K`} />
            <InlineStat label="Tips"            value={extractionResult.stats.tips} />
            <InlineStat label="Median r"        value={`${(extractionResult.stats.medianRadius * 100).toFixed(1)}cm`} />
            <InlineStat label="Server ms"       value={extractionResult.serverMs ?? extractionResult.stats.elapsedMs} />
            <InlineStat label="Voxel pts"       value={extractionResult.stats.pointsDownsampled.toLocaleString()} />
          </div>
        )}
      </footer>
    </div>
  )
}

function VeraV2Diagnostics({ result }) {
  const stats = result.stats || {}
  const pass1 = (result.perPassDiagnostics || [])[0] || {}
  const fr = stats.classFractionsOfStructural || {}
  const ef = stats.expectedFractions || {}
  const rejection = pass1.tipRejectionLog || {}
  const fmt = v => (v === null || v === undefined ? '—' : (typeof v === 'number' ? (v < 1 ? v.toFixed(3) : v.toLocaleString()) : v))
  const pct = v => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`)
  const compare = (label, raw, exp) => {
    const ok = raw != null && exp != null && Math.abs(raw - exp) < 0.15
    return (
      <tr><td style={{ color: '#888', paddingRight: 10 }}>{label}</td>
        <td style={{ color: ok ? '#6acf6a' : '#cf8a3a', fontVariantNumeric: 'tabular-nums' }}>{pct(raw)}</td>
        <td style={{ color: '#666', paddingLeft: 10 }}>exp {pct(exp)}</td></tr>
    )
  }
  return (
    <div style={{ marginTop: 10, padding: 8, background: 'rgba(240,160,64,0.04)',
                  border: '1px solid rgba(240,160,64,0.15)', borderRadius: 4 }}>
      <div style={{ fontSize: 10, color: '#f0a040', letterSpacing: '0.08em',
                    textTransform: 'uppercase', marginBottom: 6 }}>
        N.3.0 acceptance diagnostics
      </div>
      <div style={{ fontSize: 11, color: '#aaa', marginBottom: 6 }}>
        N{stats.rigs} · {fmt(stats.candidates)} candidates · {fmt(stats.tipAnchorCount)} tip anchors · {fmt(stats.elapsedMs)}ms
      </div>
      <table style={{ fontSize: 10, color: '#aaa', borderCollapse: 'collapse' }}>
        <tbody>
          {compare('linear-interior', fr['linear-interior'], ef['linear-interior'])}
          {compare('junction',        fr['junction'],        ef['junction'])}
          {compare('tip',             fr['tip'],             ef['tip'])}
        </tbody>
      </table>
      <div style={{ fontSize: 10, color: '#888', marginTop: 6 }}>
        Trunk verticality {(stats.trunkVerticalityDeg || 0).toFixed(2)}° · inlier frac {(stats.trunkInlierFraction || 0).toFixed(2)}
      </div>
      <div style={{ fontSize: 10, color: '#888', marginTop: 6 }}>
        Tip rejection breakdown: class≠tip {rejection.classNotTip}, geom &lt; min {rejection.geomConfBelow},
        nbhd &lt; min {rejection.nbhdTooSmall}, elong &lt; min {rejection.elongationBelow},
        taper ≮ 0 {rejection.taperNotNegative}, prior &lt; τ {rejection.priorTipBelow}
      </div>
      {result.savedTo && (
        <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
          → {result.savedTo} · priorsHash {result.hyperparams?.priorsHash?.slice(0, 8)}
        </div>
      )}
    </div>
  )
}

function InlineStat({ label, value }) {
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <span style={{ color: '#888', letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 10 }}>{label}</span>
      <span style={{ color: '#e8e8e8', marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </span>
  )
}


// ── Sub-components ──────────────────────────────────────────────────────

function Header({ activeSpeciesId, lidarSpecies, onSpeciesChange, pack, onProcedural, onGrove, onLibrary }) {
  return (
    <header style={headerStyle}>
      <strong style={{ letterSpacing: '0.15em', textTransform: 'uppercase', fontSize: 12 }}>Arborist</strong>
      <div style={{ display: 'flex', gap: 4, marginLeft: 6 }}>
        <ModeButton onClick={onProcedural}>Procedural</ModeButton>
        <ModeButton active>LiDAR</ModeButton>
        <ModeButton onClick={onGrove}>Grove</ModeButton>
      </div>
      <label style={{ marginLeft: 14, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#888' }}>
        <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Species</span>
        <select value={activeSpeciesId || ''} onChange={e => onSpeciesChange(e.target.value)} style={selectStyle}>
          {!activeSpeciesId && <option value="">(pick)</option>}
          {lidarSpecies.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
      {pack && (
        <span style={{ marginLeft: 12, fontSize: 11, color: '#888' }}>
          Leaves:{' '}
          <span style={{ color: pack.packId ? '#e8c878' : '#f88' }}>
            {pack.packId || 'coverage gap'}
          </span>
          <span style={{ color: '#666' }}> · {pack.label}</span>
        </span>
      )}
      <button onClick={onLibrary} style={{ ...btnGhostStyle, marginLeft: 'auto' }}>← Salon</button>
    </header>
  )
}

function ModeButton({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      style={{
        background: active ? 'rgba(232,184,96,0.22)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? 'rgba(232,184,96,0.55)' : 'rgba(255,255,255,0.1)'}`,
        color: active ? '#fff' : '#bbb',
        padding: '5px 12px', borderRadius: 4,
        fontFamily: 'inherit', fontSize: 12,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        cursor: active ? 'default' : 'pointer',
      }}>{children}</button>
  )
}

// N.0 Alignment Oracle layer control: toggle + opacity slider in one
// vertical chip so the three layers (Points / Cylinders / Baked GLB) read
// at a glance. Opacity is decoupled from visibility — dimming a layer
// doesn't lose its toggle state.
function LayerControl({ label, active, onToggle, opacity, onOpacity, missing, missingHint }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      background: 'rgba(0,0,0,0.6)',
      border: `1px solid ${active ? 'rgba(126,200,224,0.4)' : 'rgba(255,255,255,0.1)'}`,
      borderRadius: 3, padding: '4px 8px', minWidth: 110,
    }}>
      <button onClick={onToggle} disabled={missing} style={{
        background: 'transparent', border: 'none', padding: 0,
        color: missing ? '#555' : (active ? '#7fc8e0' : '#888'),
        fontFamily: 'inherit', fontSize: 11, textAlign: 'left',
        cursor: missing ? 'not-allowed' : 'pointer',
      }}>{label}</button>
      {missing ? (
        <span style={{ fontSize: 9, color: '#555' }}>{missingHint}</span>
      ) : (
        <input type="range" min={0} max={1} step={0.05} value={opacity}
          onChange={e => onOpacity(parseFloat(e.target.value))}
          disabled={!active}
          style={{ width: '100%', accentColor: '#7fc8e0', opacity: active ? 1 : 0.4 }} />
      )}
    </div>
  )
}

function Toggle({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      style={{
        background: active ? 'rgba(126,200,224,0.18)' : 'rgba(0,0,0,0.45)',
        border: `1px solid ${active ? 'rgba(126,200,224,0.4)' : 'rgba(255,255,255,0.1)'}`,
        color: active ? '#7fc8e0' : '#888',
        padding: '4px 10px', borderRadius: 3,
        fontFamily: 'inherit', fontSize: 11, cursor: 'pointer',
      }}>{children}</button>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, color: '#fff', marginTop: 2 }}>{value}</div>
    </div>
  )
}

// DraftSlider — 150ms idle commit + pointer-up final commit. Matches the
// pattern in ProceduralWorkstage (per [[feedback_heavy_render_sliders_need_draft]])
// so dragging the voxel slider doesn't queue 60 server round-trips.
function DraftSlider({ label, min, max, step, value, onCommit, unit }) {
  const [draft, setDraft] = useState(value)
  const idleTimerRef = useRef(null)
  useEffect(() => { setDraft(value) }, [value])
  const commit = (v) => { onCommit(v) }
  const onChange = (e) => {
    const v = parseFloat(e.target.value)
    setDraft(v)
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => commit(v), 150)
  }
  const onPointerUp = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    commit(draft)
  }
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#aaa' }}>
        <span>{label}</span>
        <span style={{ color: '#7fc8e0' }}>{draft?.toFixed?.(3) ?? draft}{unit ? ` ${unit}` : ''}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={draft}
        onChange={onChange} onPointerUp={onPointerUp} onMouseUp={onPointerUp}
        style={{ width: '100%' }} />
    </div>
  )
}


// ── Styles ──────────────────────────────────────────────────────────────

const shellStyle = {
  position: 'fixed', inset: 0, color: '#ddd',
  fontFamily: '-apple-system, sans-serif', fontSize: 13,
  display: 'flex', flexDirection: 'column', background: '#0c0e10',
}
const headerStyle = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)',
}
const panelStyle = {
  padding: '12px 14px', background: 'rgba(255,255,255,0.015)',
  borderRight: '1px solid rgba(255,255,255,0.06)',
  minHeight: 0,
}
const sectionHeading = {
  margin: '0 0 8px 0', fontSize: 11, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: '#888', fontWeight: 600,
}
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#ddd', padding: '5px 8px', borderRadius: 3,
  fontFamily: 'inherit', fontSize: 12, marginBottom: 8,
}
const selectStyle = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#ddd', padding: '4px 8px', borderRadius: 4,
  fontFamily: 'inherit', fontSize: 12, minWidth: 200,
}
const rowBtnStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  border: '1px solid rgba(255,255,255,0.07)', borderRadius: 3,
  padding: '5px 8px', textAlign: 'left',
  fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
}
const btnPrimaryStyle = {
  flex: 1, background: 'rgba(232,184,96,0.18)',
  border: '1px solid rgba(232,184,96,0.5)', color: '#e8c878',
  padding: '6px 10px', borderRadius: 3,
  fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
}
const btnSecondaryStyle = {
  flex: 1, background: 'rgba(126,200,224,0.12)',
  border: '1px solid rgba(126,200,224,0.4)', color: '#7fc8e0',
  padding: '6px 10px', borderRadius: 3,
  fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
}
const btnGhostStyle = {
  background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#bbb', padding: '5px 10px', borderRadius: 3,
  fontFamily: 'inherit', fontSize: 11, cursor: 'pointer',
}
const overlayTLStyle = {
  position: 'absolute', top: 12, left: 12,
  display: 'flex', flexWrap: 'wrap', gap: 6,
}
const errorTextStyle  = { color: '#f88', fontSize: 11, marginTop: 8 }
const hintTextStyle   = { color: '#666', fontSize: 12, marginTop: 4 }
