/**
 * Grove — gallery of published Salon compositions, all visible at once on
 * a single ground plane. Population is roster-driven (Brief 27): a
 * composition appears once it's been Re-published in the Salon — publish
 * stamps it Hero and `syncLookRoster` adds it to the Look's
 * `design.json#/trees`. There is no separate "rate it, then add it" step;
 * visibility = published-and-in-roster, not a Fill/Mid/Hero rating.
 *
 * Two scopes: "In Look" (the active Look's roster) and "All Published"
 * (every published composition in the library — the surface for adding a
 * library composition to a Look it isn't yet in). Duds still jump out
 * side-by-side; click a tile to select it — a fixed editor panel
 * (rating, category, notes, Look membership) drives the edits rather
 * than a hover-card that chases the camera.
 *
 * Distinct from the Stage app downstream (which composes a Look from the
 * trees this view publishes). This is the operator's tree-pool review.
 *
 * Single Canvas. Tiles laid out on a square grid sized to fit the count.
 * Camera is OrbitControls (free fly) — operator wants to walk around the
 * crop and judge.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import useArboristStore from './stores/useArboristStore.js'
import { computeDominantTrunk } from './SpecimenViewport.jsx'
import CoverageView from './CoverageView.jsx'

const TILE_SPACING = 8        // meters between tiles, edge-to-edge centers
const QUALITY_COLOR = {
  2: '#4a6a9a',   // Fill (background only)
  3: '#5a8aff',   // Mid
  4: '#6a9a4a',   // Hero
}
const QUALITY_LABEL = { 1: 'Trash', 2: 'Fill', 3: 'Mid', 4: 'Hero' }
const CATEGORIES = ['broadleaf', 'conifer', 'ornamental', 'weeping', 'columnar', 'unusual']

export default function Grove() {
  const variants    = useArboristStore(s => s.groveVariants)
  const loading     = useArboristStore(s => s.groveLoading)
  const publishing  = useArboristStore(s => s.grovePublishing)
  const error       = useArboristStore(s => s.groveError)
  const setGroveOpen = useArboristStore(s => s.setGroveOpen)
  const setSalonOpen = useArboristStore(s => s.setSalonOpen)
  const loadGrove   = useArboristStore(s => s.loadGrove)
  const looks       = useArboristStore(s => s.looks)
  const activeLookId = useArboristStore(s => s.activeLookId)
  const looksRosters = useArboristStore(s => s.looksRosters)
  const toggleInLook = useArboristStore(s => s.toggleInLook)
  const setGroveVariantOverride = useArboristStore(s => s.setGroveVariantOverride)
  const bakeGroveToSlab = useArboristStore(s => s.bakeGroveToSlab)
  const groveBaking = useArboristStore(s => s.groveBaking)
  const groveBakeResult = useArboristStore(s => s.groveBakeResult)
  const activeLookTrees = looksRosters[activeLookId] || []

  // Two scopes (both populated by published compositions — visibility is
  // never gated on a Fill/Mid/Hero rating; see file header / Brief 27):
  //   'look'   — only the active Look's roster (curation review)
  //   'all'    — every published composition in the library (browse + the
  //              surface for adding a library composition to this Look)
  // Click action mirrors the scope: in 'look' the card removes from the
  // active Look; in 'all' it adds/removes membership.
  // Top-level view: 'gallery' (the by-model 3D crop) ↔ 'coverage'
  // (Brief 24 — roster-anchored have-vs-need table).
  const [view, setView] = useState('gallery')
  const [scope, setScope] = useState('look')
  const [hovered, setHovered] = useState(null)
  const [selected, setSelected] = useState(null)  // {speciesId, variantId} — click-selected tile; drives the fixed editor panel
  const [toast, setToast] = useState(null)

  // Per-operator UI preference: tell the Meteorologist helper which tree
  // to use as its CanaryScene hero. Cross-tab via the `storage` event
  // (browsers fire it in OTHER tabs on same origin automatically). No
  // backend, no authored state — see ARCHITECTURE.md
  // "Arborist ↔ Meteorologist canary contract".
  const toastTimerRef = useRef(null)
  const setMeteorologistCanary = (v) => {
    const payload = {
      species: v.speciesId,
      variantId: Number(v.variantId),
      lookId: activeLookId || null,
    }
    localStorage.setItem('meteorologist-canary-tree', JSON.stringify(payload))
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(`Set as Meteorologist canary · ${v.speciesLabel || v.speciesId} v${v.variantId}`)
    toastTimerRef.current = setTimeout(() => setToast(null), 1500)
  }
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])

  // Hover is now only a light highlight preview — the editor is
  // selection-driven (click a tile → fixed panel), so there's no
  // cursor-to-card travel to keep alive. Pointer-down coords let an
  // empty-space click deselect while rejecting an orbit drag (which
  // also ends with the cursor over empty space).
  const downRef = useRef(null)

  const activeLook = looks.find(l => l.id === activeLookId)
  const inLook = (v) => activeLookTrees.some(
    t => t.species === v.speciesId && Number(t.variantId) === Number(v.variantId),
  )

  const visible = useMemo(() => {
    let rows = variants
    if (scope === 'look') rows = rows.filter(v => inLook(v))
    // One representative per species — no duplicate / variant-group tiles.
    // Keep the highest-quality variant (ties → lowest variantId) so the gallery
    // reads as distinct trees, not 5× the same birch.
    const bySpecies = new Map()
    for (const v of rows) {
      const cur = bySpecies.get(v.speciesId)
      if (!cur || v.quality > cur.quality || (v.quality === cur.quality && v.variantId < cur.variantId)) {
        bySpecies.set(v.speciesId, v)
      }
    }
    rows = [...bySpecies.values()]
    return [...rows].sort((a, b) => {
      if (b.quality !== a.quality) return b.quality - a.quality
      const s = (a.speciesLabel || a.speciesId).localeCompare(b.speciesLabel || b.speciesId)
      if (s !== 0) return s
      return a.variantId - b.variantId
    })
  }, [variants, scope, activeLookTrees])
  // (activeLookTrees is recomputed each render via looksRosters[activeLookId])

  const cols = Math.max(1, Math.ceil(Math.sqrt(visible.length)))
  const positions = visible.map((_, i) => {
    const cx = i % cols
    const cz = Math.floor(i / cols)
    return [
      (cx - (cols - 1) / 2) * TILE_SPACING,
      0,
      cz * TILE_SPACING,
    ]
  })

  // The click-selected tile's data drives the fixed editor panel.
  // Derived from the visible set so it stays bound to what's on screen;
  // if a scope/view change filters the tile out, drop the selection.
  const selectedVariant = selected
    ? visible.find(v => v.speciesId === selected.speciesId && Number(v.variantId) === Number(selected.variantId))
    : null
  useEffect(() => {
    if (selected && !visible.some(v => v.speciesId === selected.speciesId && Number(v.variantId) === Number(selected.variantId))) {
      setSelected(null)
    }
  }, [visible, selected])

  return (
    <div style={{
      position: 'fixed', inset: 0, color: '#ddd',
      fontFamily: '-apple-system, sans-serif', fontSize: 12,
      display: 'flex', flexDirection: 'column',
      background: '#111',
    }}>
      <header style={{
        padding: '10px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <button onClick={() => { setGroveOpen(false); setSalonOpen(true) }} style={btn()}>← Salon</button>
        <strong style={{
          letterSpacing: '0.1em', textTransform: 'uppercase',
          fontSize: 12, color: '#fff',
        }}>Grove</strong>
        <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
          {[
            { v: 'gallery',  label: 'Gallery' },
            { v: 'coverage', label: 'Coverage' },
          ].map(o => (
            <button key={o.v} onClick={() => setView(o.v)}
              style={{
                border: 'none', padding: '6px 12px', fontSize: 11,
                background: view === o.v ? 'rgba(255,255,255,0.16)' : 'transparent',
                color: view === o.v ? '#fff' : '#aaa',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>{o.label}</button>
          ))}
        </div>
        <span style={{ color: '#888' }}>
          {view === 'coverage'
            ? <>roster-anchored coverage · read-only</>
            : scope === 'look'
            ? <>published compositions in <strong style={{ color: '#bce0a0' }}>{activeLook?.name || '—'}</strong> · click to remove</>
            : <>all published compositions · click to add/remove from <strong style={{ color: '#bce0a0' }}>{activeLook?.name || '—'}</strong></>}
        </span>
        {view === 'gallery' && (
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
            {[
              { v: 'look', label: 'In Look' },
              { v: 'all',  label: 'All Published' },
            ].map(o => (
              <button key={o.v} onClick={() => setScope(o.v)}
                style={{
                  border: 'none', padding: '6px 10px', fontSize: 11,
                  background: scope === o.v ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: scope === o.v ? '#fff' : '#aaa',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{o.label}</button>
            ))}
          </div>
          <button onClick={loadGrove} style={btn()} title="Reload manifests">↻</button>
          <span style={{ color: '#888' }}>
            {scope === 'look' ? `${visible.length} in roster` : `${visible.length} of ${variants.length}`}
          </span>
          <button
            onClick={bakeGroveToSlab}
            disabled={groveBaking || !activeLookId}
            title={`Bake this Look's roster to the slab (atlas + placements) — what LS renders. Takes ~10-30s.`}
            style={{
              border: '1px solid rgba(150,220,130,0.4)', borderRadius: 4,
              padding: '6px 14px', fontSize: 11, fontWeight: 600,
              background: groveBaking ? 'rgba(150,220,130,0.15)' : 'rgba(150,220,130,0.22)',
              color: '#cfeeb4', fontFamily: 'inherit',
              cursor: (groveBaking || !activeLookId) ? 'not-allowed' : 'pointer',
              opacity: (groveBaking || !activeLookId) ? 0.5 : 1,
            }}>
            {groveBaking ? 'Baking…' : 'Bake → Slab'}
          </button>
          {groveBakeResult && !groveBaking && (
            <span style={{ color: groveBakeResult.error ? '#f88' : '#bce0a0', fontSize: 11 }}>
              {groveBakeResult.error
                ? `bake failed: ${groveBakeResult.error}`
                : `✓ ${groveBakeResult.count} trees placed (${groveBakeResult.uniqueVariants} variants, ${(groveBakeResult.totalMs/1000).toFixed(0)}s)`}
            </span>
          )}
        </span>
        )}
      </header>

      <div
        style={{ flex: 1, position: 'relative', minHeight: 0 }}
        onPointerDown={(e) => { downRef.current = { x: e.clientX, y: e.clientY } }}
      >
        {view === 'coverage' && <CoverageView />}
        {view === 'gallery' && <>
        {publishing && (
          <div style={overlayMsg}>Publishing your Salon edits…</div>
        )}
        {loading && !publishing && (
          <div style={overlayMsg}>Loading manifests…</div>
        )}
        {error && (
          <div style={{ ...overlayMsg, color: '#f88' }}>Grove failed: {error}</div>
        )}
        {!loading && !error && visible.length === 0 && (
          <div style={overlayMsg}>
            {scope === 'look'
              ? <>No compositions in <strong>{activeLook?.name || 'this Look'}</strong> yet. Compose a species in the Salon and Re-publish, or switch to <em>All Published</em> above to add an existing composition.</>
              : <>No published compositions yet. Compose a species in the Salon and Re-publish — published compositions show up here automatically.</>}
          </div>
        )}

        <Canvas
          shadows
          camera={{ position: [0, 30, 60], near: 0.5, far: 1000, fov: 40 }}
          onPointerMissed={(e) => {
            // Click that hit nothing → deselect. Skip if the pointer
            // travelled far between down/up (an orbit drag, not a click).
            const d = downRef.current
            if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return
            setSelected(null)
          }}
        >
          <color attach="background" args={['#f7f5f1']} />
          <hemisphereLight args={['#ffffff', '#e8e4dc', 0.85]} />
          <directionalLight
            position={[40, 80, 30]} intensity={0.55} castShadow
            shadow-mapSize-width={2048} shadow-mapSize-height={2048}
            shadow-camera-left={-200} shadow-camera-right={200}
            shadow-camera-top={200} shadow-camera-bottom={-200}
            shadow-camera-near={0.5} shadow-camera-far={400}
          />
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
            onClick={(e) => { if (e.delta > 5) return; setSelected(null) }}
          >
            <planeGeometry args={[2000, 2000]} />
            <meshStandardMaterial color="#f7f5f1" roughness={1} />
          </mesh>

          <Suspense fallback={null}>
            {visible.map((v, i) => (
              <Tile
                key={`${v.speciesId}:${v.variantId}`}
                variant={v}
                position={positions[i]}
                inLook={inLook(v)}
                hovered={hovered?.speciesId === v.speciesId && Number(hovered?.variantId) === Number(v.variantId)}
                selected={selected?.speciesId === v.speciesId && Number(selected?.variantId) === Number(v.variantId)}
                onHoverIn={() => setHovered({ speciesId: v.speciesId, variantId: v.variantId })}
                onHoverOut={() => setHovered(h => (h?.speciesId === v.speciesId && Number(h?.variantId) === Number(v.variantId) ? null : h))}
                onSelect={() => setSelected({ speciesId: v.speciesId, variantId: v.variantId })}
              />
            ))}
          </Suspense>

          <FitToContent count={visible.length} cols={cols} />
          <OrbitControls makeDefault target={[0, 4, ((Math.ceil(visible.length / cols) - 1) * TILE_SPACING) / 2]} />
        </Canvas>

        {selectedVariant && (
          <GroveEditorPanel
            variant={selectedVariant}
            inLook={inLook(selectedVariant)}
            activeLookId={activeLookId}
            activeLookName={activeLook?.name}
            onSetOverride={(key, val) => setGroveVariantOverride(selectedVariant.speciesId, selectedVariant.variantId, key, val)}
            onToggleInLook={() => toggleInLook(activeLookId, selectedVariant.speciesId, selectedVariant.variantId)}
            onSetMeteorologistCanary={() => setMeteorologistCanary(selectedVariant)}
            onClose={() => setSelected(null)}
          />
        )}

        {toast && (
          <div style={{
            position: 'absolute', bottom: 24, left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(20,20,24,0.95)',
            color: '#c0e0a8',
            padding: '8px 14px', borderRadius: 4,
            border: '1px solid #5a8a5a',
            fontSize: 11, letterSpacing: '0.04em',
            pointerEvents: 'none', zIndex: 3,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}>{toast}</div>
        )}
        </>}
      </div>
    </div>
  )
}

function FitToContent({ count, cols }) {
  // Reposition camera once when count changes so the grid is framed.
  const { camera } = useThree()
  useEffect(() => {
    if (!count) return
    const rows = Math.ceil(count / cols)
    const w = cols * TILE_SPACING
    const d = rows * TILE_SPACING
    const span = Math.max(w, d)
    camera.position.set(0, span * 0.7 + 12, span * 0.9 + 20)
    camera.lookAt(0, 4, (rows - 1) * TILE_SPACING / 2)
  }, [count, cols, camera])
  return null
}

function Tile({ variant, position, inLook, hovered, selected, onHoverIn, onHoverOut, onSelect }) {
  const { glbUrl, normalizeScale, position: posOv, rotation: rotOv, quality, excluded, speciesLabel, variantId } = variant
  const { scene } = useGLTF(glbUrl)
  // Clone so each tile has its own scene graph (drei caches by URL).
  const cloned = useMemo(() => scene.clone(true), [scene])
  useEffect(() => {
    cloned.traverse(o => {
      if (!o.isMesh) return
      o.castShadow = true
      o.receiveShadow = true
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (m?.vertexColors) { m.vertexColors = false; m.needsUpdate = true }
      }
    })
  }, [cloned])

  // Mirror Workstage's Skeleton transform stack EXACTLY. GLB-source
  // trees are already Y-up after publish-glb.js, so Workstage passes
  // forestryRotation={false} — no rotation on the primitive. Grove
  // matches that, otherwise operator rotation overrides double-up.
  const { centerX, centerZ, groundOffset } = useMemo(() => {
    cloned.rotation.set(0, 0, 0)
    cloned.updateMatrixWorld(true)
    const trunk = computeDominantTrunk(cloned)
    if (!trunk) return { centerX: 0, centerZ: 0, groundOffset: 0 }
    return { centerX: -trunk.x, centerZ: -trunk.z, groundOffset: -trunk.minY }
  }, [cloned])

  const [px, py, pz] = position
  const ox = posOv?.x ?? 0, oy = posOv?.y ?? 0, oz = posOv?.z ?? 0
  const rx = rotOv?.x ?? 0, ry = rotOv?.y ?? 0, rz = rotOv?.z ?? 0
  // Tiles not in the active Look render slightly smaller so the eye
  // separates "in roster" from "available". Excluded variants get an
  // additional tint (kill-switched at species level, beats Look opt-in).
  const effScale = inLook ? normalizeScale : normalizeScale * 0.82
  const baseColor = QUALITY_COLOR[quality] || '#666'

  return (
    <group position={[px, py, pz]}>
      {/* Tile base — color = quality. Click selects the tile (opens the
          fixed editor panel); hover is a light highlight preview only.
          e.delta rejects an orbit drag registering as a click. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.005, 0]}
        receiveShadow
        onPointerOver={(e) => { e.stopPropagation(); onHoverIn() }}
        onPointerOut={onHoverOut}
        onClick={(e) => { e.stopPropagation(); if (e.delta > 5) return; onSelect() }}
      >
        <circleGeometry args={[TILE_SPACING * 0.42, 48]} />
        <meshStandardMaterial
          color={excluded ? '#3a3a3a' : baseColor}
          opacity={
            excluded ? 0.35 :
            inLook   ? ((hovered || selected) ? 0.95 : 0.78) :
                       ((hovered || selected) ? 0.45 : 0.22)
          }
          transparent
          roughness={0.85}
        />
      </mesh>

      {/* Selection highlight — a bright ring so the panel's binding to a
          tile is unambiguous in the 3D scene. */}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[TILE_SPACING * 0.44, TILE_SPACING * 0.5, 48]} />
          <meshBasicMaterial color="#bce0a0" transparent opacity={0.95} toneMapped={false} />
        </mesh>
      )}

      {/* Stack mirrors SpecimenViewport's Skeleton (rotation → scale →
          positionOverride → trunk auto-center). The forestry rotation is
          set on the scene root above; primitive below renders it as-is. */}
      <group rotation={[rx, ry, rz]}>
        <group scale={[effScale, effScale, effScale]}>
          <group position={[ox, oy, oz]}>
            <group position={[centerX, groundOffset, centerZ]}>
              <primitive object={cloned} />
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

// Fixed editor rail for the click-selected tile. Anchored to the Grove
// chrome (right side of the gallery), so it never chases the camera the
// way the old tile-anchored Html card did. Per
// feedback_focus_one_over_grid_for_3d_inspection: a focused panel beats
// a grid of transient hover-cards.
function GroveEditorPanel({ variant, inLook, activeLookId, activeLookName, onSetOverride, onToggleInLook, onSetMeteorologistCanary, onClose }) {
  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 320,
      background: 'rgba(16,16,20,0.97)',
      borderLeft: '3px solid ' + (inLook ? '#5a8a5a' : 'rgba(255,255,255,0.15)'),
      boxShadow: '-6px 0 24px rgba(0,0,0,0.45)',
      zIndex: 4, display: 'flex', flexDirection: 'column',
      color: '#ddd', fontFamily: '-apple-system, sans-serif', fontSize: 12,
    }}>
      <div style={{
        padding: '10px 14px', display: 'flex', alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Editor</span>
        <button onClick={onClose} title="Close (or click empty space)" style={{
          marginLeft: 'auto', background: 'transparent', border: 'none',
          color: '#aaa', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 0,
        }}>×</button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        <EditorCard
          variant={variant}
          inLook={inLook}
          activeLookId={activeLookId}
          activeLookName={activeLookName}
          onSetOverride={onSetOverride}
          onToggleInLook={onToggleInLook}
          onSetMeteorologistCanary={onSetMeteorologistCanary}
        />
      </div>
    </div>
  )
}

// Editor body for the selected tile — rating, category, notes, Look
// membership, canary. Rendered inside the fixed GroveEditorPanel (no
// longer a tile-anchored Html card), so it carries no positioning
// chrome of its own. All edits go through setGroveVariantOverride /
// toggleInLook (POST + optimistic local update).
function EditorCard({ variant, inLook, activeLookId, activeLookName, onSetOverride, onToggleInLook, onSetMeteorologistCanary }) {
  const { speciesId, speciesLabel, variantId, quality, category, excluded, operatorNotes } = variant
  const [notes, setNotes] = useState(operatorNotes || '')
  useEffect(() => { setNotes(operatorNotes || '') }, [speciesId, variantId, operatorNotes])

  const setQuality = (q) => onSetOverride('qualityOverride', q)
  const setCategory = (c) => onSetOverride('categoryOverride', c === category ? null : c)
  const saveNotes = () => onSetOverride('operatorNotes', notes.trim() ? notes : null)

  return (
    <div style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
        <strong style={{ color: '#fff' }}>{speciesLabel}</strong>
        <span style={{ color: '#888', fontSize: 11 }}>· v{variantId}</span>
        {excluded && (
          <span style={{
            marginLeft: 'auto', color: '#e88', fontSize: 10,
            letterSpacing: '0.08em',
          }}>EXCLUDED</span>
        )}
      </div>

      {/* Rating ladder — 3 buttons covering the in-runtime tiers */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>rating</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { n: 2, label: 'Fill', dark: '#3a5a8a', light: '#4a6a9a' },
            { n: 3, label: 'Mid',  dark: '#3a5a8a', light: '#4a6a9a' },
            { n: 4, label: 'Hero', dark: '#5a8a3a', light: '#6a9a4a' },
          ].map(({ n, label, dark, light }) => {
            const active = quality === n
            return (
              <button key={n} onClick={() => setQuality(n)}
                style={{
                  flex: 1, padding: '5px 4px', borderRadius: 3, fontSize: 11,
                  background: active ? dark : 'rgba(255,255,255,0.05)',
                  color: active ? '#fff' : '#aaa',
                  border: '1px solid ' + (active ? light : 'rgba(255,255,255,0.1)'),
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{label}</button>
            )
          })}
        </div>
      </div>

      {/* Category — single select, click to toggle override */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>category</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {CATEGORIES.map(c => {
            const on = category === c
            return (
              <button key={c} onClick={() => setCategory(c)}
                style={{
                  padding: '3px 8px', borderRadius: 3, fontSize: 10,
                  background: on ? '#3a5a8a' : 'rgba(255,255,255,0.05)',
                  color: on ? '#fff' : '#888',
                  border: '1px solid ' + (on ? '#4a6a9a' : 'rgba(255,255,255,0.1)'),
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{c}</button>
            )
          })}
        </div>
      </div>

      {/* Notes — textarea, blur saves */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>notes</div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="quirks, manual fixes…"
          style={{
            width: '100%', minHeight: 40, resize: 'vertical', boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#ddd', borderRadius: 3, padding: '5px 7px',
            fontFamily: 'inherit', fontSize: 11,
          }}
        />
      </div>

      {/* Toggle membership in active Look — adds when not in, removes when in. */}
      <button
        disabled={!activeLookId}
        onClick={onToggleInLook}
        title={
          !activeLookId ? 'No Look active' :
          inLook        ? `Remove from ${activeLookName || 'this Look'}` :
                          `Add to ${activeLookName || 'this Look'}`
        }
        style={{
          width: '100%',
          padding: '6px 10px', borderRadius: 3,
          background: !activeLookId
            ? 'rgba(255,255,255,0.04)'
            : (inLook ? 'rgba(154,74,74,0.3)' : 'rgba(74,134,74,0.3)'),
          border: '1px solid ' + (
            !activeLookId ? 'rgba(255,255,255,0.08)' :
            inLook        ? '#9a4a4a' : '#5a8a5a'
          ),
          color: !activeLookId ? '#666' : (inLook ? '#f0c0c0' : '#c0e0a8'),
          fontFamily: 'inherit', fontSize: 11,
          cursor: activeLookId ? 'pointer' : 'default',
          letterSpacing: '0.04em',
        }}>
        {!activeLookId
          ? 'No Look active'
          : (inLook
              ? `Remove from ${activeLookName || 'Look'}`
              : `Add to ${activeLookName || 'Look'}`)}
      </button>

      <button
        onClick={onSetMeteorologistCanary}
        title="Set as the canary tree shown in Meteorologist's CanaryScene"
        style={{
          width: '100%', marginTop: 6,
          padding: '6px 10px', borderRadius: 3,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#c8c0e0',
          fontFamily: 'inherit', fontSize: 11,
          cursor: 'pointer',
          letterSpacing: '0.04em',
        }}>
        → Set as Meteorologist canary
      </button>
    </div>
  )
}

const overlayMsg = {
  position: 'absolute', top: '40%', left: 0, right: 0,
  textAlign: 'center', color: '#888', fontSize: 13,
  pointerEvents: 'none', zIndex: 2,
}

function btn() {
  return {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#ccc', padding: '5px 10px', borderRadius: 4,
    fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
  }
}
