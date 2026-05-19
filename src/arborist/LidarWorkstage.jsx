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
import { OrbitControls } from '@react-three/drei'
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
function PointCloud({ url, visible = true, fitRef }) {
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
      <pointsMaterial size={0.04} sizeAttenuation color="#7fc8e0" transparent opacity={0.85} />
    </points>
  )
}


// Renders the cylinder graph as two InstancedMesh draws: trunk-like (radius
// >= medianRadius, red) + branch-like (< medianRadius, cyan). Translucent
// so the operator sees what's underneath. Skipping the cylinder when its
// radius is below minRadius is the same gate bake-tree.py applies.
function CylinderSkeleton({ nodes, medianRadius, minRadius, visible = true }) {
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
        <meshStandardMaterial color="#d44a3a" transparent opacity={0.75} roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={branchRef} args={[null, null, Math.max(1, branchData.length)]}>
        <cylinderGeometry args={[1, 1, 1, 6, 1]} />
        <meshStandardMaterial color="#4ac8d4" transparent opacity={0.65} roughness={0.6} />
      </instancedMesh>
    </>
  )
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
  const [layers, setLayers]             = useState({ points: true, cylinders: true, skeletonOnly: false, fullPreview: false })
  const fitRef = useRef()
  const cameraRef = useRef()
  const controlsRef = useRef()

  const activeSpecies = species.find(s => s.id === activeSpeciesId)
  const lidarSpecies = species.filter(s => !!s.forSpeciesName)
  const pack = suggestedLeafPack(activeSpeciesId, activeSpecies?.leafMorph)

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
        onLibrary={() => { setLidarOpen(false); setActiveSpecies(null) }}
      />

      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr', gridTemplateRows: '1fr auto', minHeight: 0 }}>
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

        {/* Right pane top — viewport + layer toggles */}
        <section style={{ ...panelStyle, gridRow: 1, position: 'relative', overflow: 'hidden' }}>
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
                  <PointCloud url={plyUrl} visible={layers.points && !layers.skeletonOnly} fitRef={fitRef} />
                </Suspense>
              )}
              {extractionResult && (
                <CylinderSkeleton
                  nodes={extractionResult.nodes}
                  medianRadius={extractionResult.stats.medianRadius}
                  minRadius={extractionParams?.minRadius ?? 0.005}
                  visible={layers.cylinders || layers.skeletonOnly || layers.fullPreview}
                />
              )}
              <OrbitControls makeDefault target={[0, 5, 0]} maxDistance={80} />
              <CameraCapture cameraRef={cameraRef} controlsRef={controlsRef} />
            </Canvas>
          )}

          {/* Layer toggles overlay */}
          {selectedTreeId && (
            <div style={overlayTLStyle}>
              <Toggle active={layers.points} onClick={() => setLayers(l => ({ ...l, points: !l.points }))}>Points</Toggle>
              <Toggle active={layers.cylinders} onClick={() => setLayers(l => ({ ...l, cylinders: !l.cylinders }))}>Cylinders</Toggle>
              <Toggle active={layers.skeletonOnly} onClick={() => setLayers(l => ({ ...l, skeletonOnly: !l.skeletonOnly }))}>Skeleton only</Toggle>
              <Toggle active={layers.fullPreview} onClick={() => setLayers(l => ({ ...l, fullPreview: !l.fullPreview }))}>Full preview</Toggle>
              <FitButton fitRef={fitRef} cameraRef={cameraRef} controlsRef={controlsRef} />
            </div>
          )}
        </section>

        {/* Left rail bottom — extraction tuner */}
        <section style={{ ...panelStyle, gridRow: 2, borderRight: panelStyle.borderRight, borderTop: panelStyle.borderRight, padding: 14 }}>
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
            </>
          )}
        </section>

        {/* Right pane bottom — statistics */}
        <section style={{ ...panelStyle, gridRow: 2, borderTop: panelStyle.borderRight, padding: '14px 18px' }}>
          <h3 style={sectionHeading}>Statistics</h3>
          {!extractionResult ? (
            <div style={hintTextStyle}>{extracting ? 'Extracting…' : 'Pick a specimen and extract to see stats.'}</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 12 }}>
              <Stat label="Points loaded"   value={extractionResult.stats.pointsRaw.toLocaleString()} />
              <Stat label="Cylinders"        value={extractionResult.stats.cylinders.toLocaleString()} />
              <Stat label="Trunk/branch"     value={`${extractionResult.stats.trunkLike} / ${extractionResult.stats.branchLike}`} />
              <Stat label="Est. lod0 tris"   value={`~${(lod0Tris / 1000).toFixed(1)}K`} />
              <Stat label="Tips"             value={extractionResult.stats.tips} />
              <Stat label="Median r"         value={`${(extractionResult.stats.medianRadius * 100).toFixed(1)}cm`} />
              <Stat label="Server ms"        value={extractionResult.serverMs ?? extractionResult.stats.elapsedMs} />
              <Stat label="Voxel pts"        value={extractionResult.stats.pointsDownsampled.toLocaleString()} />
            </div>
          )}
        </section>
      </main>
    </div>
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
      <button onClick={onLibrary} style={{ ...btnGhostStyle, marginLeft: 'auto' }}>← Library</button>
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
