/**
 * Grove — gallery of every rated GLB variant in the library, all visible
 * at once on a single ground plane. Use case: "I rated a bunch of trees
 * and a couple don't really work; I have no way of easily figuring out
 * which they are." The Grove shows them side-by-side so duds jump out;
 * one click on a tile flips `excluded` and the runtime drops the variant
 * from the picker.
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
import { OrbitControls, useGLTF, Html } from '@react-three/drei'
import useArboristStore from './stores/useArboristStore.js'
import { computeDominantTrunk } from './SpecimenViewport.jsx'

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
  const error       = useArboristStore(s => s.groveError)
  const setGroveOpen = useArboristStore(s => s.setGroveOpen)
  const loadGrove   = useArboristStore(s => s.loadGrove)
  const looks       = useArboristStore(s => s.looks)
  const activeLookId = useArboristStore(s => s.activeLookId)
  const looksRosters = useArboristStore(s => s.looksRosters)
  const toggleInLook = useArboristStore(s => s.toggleInLook)
  const setGroveVariantOverride = useArboristStore(s => s.setGroveVariantOverride)
  const activeLookTrees = looksRosters[activeLookId] || []

  // Two viewing modes:
  //   'look'   — only the active Look's roster (curation review)
  //   'all'    — every rated variant in the library (browse mode)
  // Click action mirrors the mode: in 'look' mode click removes from
  // the active Look; in 'all' mode click adds/removes membership.
  const [scope, setScope] = useState('look')
  const [filterQuality, setFilterQuality] = useState(0)
  const [hovered, setHovered] = useState(null)

  // Hover persistence — cursor can move tile → card without losing
  // focus. Tile-out + card-out both schedule a delayed clear; tile-in
  // and card-in cancel any pending clear.
  const closeTimerRef = useRef(null)
  const cancelClose = () => {
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null }
  }
  const scheduleClose = (delay = 250) => {
    cancelClose()
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null
      setHovered(null)
    }, delay)
  }
  const enterHover = (id) => { cancelClose(); setHovered(id) }

  const activeLook = looks.find(l => l.id === activeLookId)
  const inLook = (v) => activeLookTrees.some(
    t => t.species === v.speciesId && Number(t.variantId) === Number(v.variantId),
  )

  const visible = useMemo(() => {
    let rows = variants
    if (scope === 'look') rows = rows.filter(v => inLook(v))
    if (filterQuality > 0) rows = rows.filter(v => v.quality >= filterQuality)
    return [...rows].sort((a, b) => {
      if (b.quality !== a.quality) return b.quality - a.quality
      const s = (a.speciesLabel || a.speciesId).localeCompare(b.speciesLabel || b.speciesId)
      if (s !== 0) return s
      return a.variantId - b.variantId
    })
  }, [variants, scope, filterQuality, activeLookTrees])
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
        <button onClick={() => setGroveOpen(false)} style={btn()}>← Library</button>
        <strong style={{
          letterSpacing: '0.1em', textTransform: 'uppercase',
          fontSize: 12, color: '#fff',
        }}>Grove</strong>
        <span style={{ color: '#888' }}>
          {scope === 'look'
            ? <>roster for <strong style={{ color: '#bce0a0' }}>{activeLook?.name || '—'}</strong> · click to remove</>
            : <>all rated variants · click to add/remove from <strong style={{ color: '#bce0a0' }}>{activeLook?.name || '—'}</strong></>}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
            {[
              { v: 'look', label: 'In Look' },
              { v: 'all',  label: 'All Rated' },
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
          <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
            {[
              { v: 0, label: 'All' },
              { v: 2, label: '≥ Fill' },
              { v: 3, label: '≥ Mid' },
              { v: 4, label: 'Hero' },
            ].map(o => (
              <button key={o.v} onClick={() => setFilterQuality(o.v)}
                style={{
                  border: 'none', padding: '6px 10px', fontSize: 11,
                  background: filterQuality === o.v ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: filterQuality === o.v ? '#fff' : '#aaa',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{o.label}</button>
            ))}
          </div>
          <button onClick={loadGrove} style={btn()} title="Reload manifests">↻</button>
          <span style={{ color: '#888' }}>
            {scope === 'look' ? `${visible.length} in roster` : `${visible.length} of ${variants.length}`}
          </span>
        </span>
      </header>

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {loading && (
          <div style={overlayMsg}>Loading manifests…</div>
        )}
        {error && (
          <div style={{ ...overlayMsg, color: '#f88' }}>Grove failed: {error}</div>
        )}
        {!loading && !error && visible.length === 0 && (
          <div style={overlayMsg}>
            {scope === 'look'
              ? <>No trees in <strong>{activeLook?.name || 'this Look'}</strong> yet. Switch to <em>All Rated</em> above, or rate variants in the species workstage and tap "Add to {activeLook?.name || 'Look'}".</>
              : <>No rated variants yet. Rate variants in a species workstage (Fill / Mid / Hero) and they'll show up in the Grove.</>}
          </div>
        )}

        <Canvas
          shadows
          camera={{ position: [0, 30, 60], near: 0.5, far: 1000, fov: 40 }}
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
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
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
                activeLookId={activeLookId}
                hovered={hovered?.speciesId === v.speciesId && hovered?.variantId === v.variantId}
                onHoverIn={() => enterHover({ speciesId: v.speciesId, variantId: v.variantId })}
                onHoverOut={() => scheduleClose()}
                onSetOverride={(key, val) => setGroveVariantOverride(v.speciesId, v.variantId, key, val)}
                onRemove={() => toggleInLook(activeLookId, v.speciesId, v.variantId)}
              />
            ))}
          </Suspense>

          <FitToContent count={visible.length} cols={cols} />
          <OrbitControls makeDefault target={[0, 4, ((Math.ceil(visible.length / cols) - 1) * TILE_SPACING) / 2]} />
        </Canvas>
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

function Tile({ variant, position, inLook, activeLookId, hovered, onHoverIn, onHoverOut, onSetOverride, onRemove }) {
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
      {/* Tile base — color = quality. Hover opens an editor card; the
          tile itself no longer toggles roster on click (avoids
          accidental removes). Removal is an explicit button in the card. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.005, 0]}
        receiveShadow
        onPointerOver={(e) => { e.stopPropagation(); onHoverIn() }}
        onPointerOut={onHoverOut}
      >
        <circleGeometry args={[TILE_SPACING * 0.42, 48]} />
        <meshStandardMaterial
          color={excluded ? '#3a3a3a' : baseColor}
          opacity={
            excluded ? 0.35 :
            inLook   ? (hovered ? 0.95 : 0.78) :
                       (hovered ? 0.45 : 0.22)
          }
          transparent
          roughness={0.85}
        />
      </mesh>

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

      {/* Hover card — interactive editor: rating, category, notes,
          remove. Stays open while the cursor is over the card itself. */}
      {hovered && (
        <Html position={[0, 0.05, 0]}>
          <EditorCard
            variant={variant}
            inLook={inLook}
            activeLookId={activeLookId}
            onSetOverride={onSetOverride}
            onRemove={onRemove}
            onPointerEnter={onHoverIn}
            onPointerLeave={onHoverOut}
          />
        </Html>
      )}
    </group>
  )
}

// Hover editor card. Stays open while the cursor is over it; exposes
// rating, category, notes, and Remove. All edits go through the
// store's setGroveVariantOverride (POST + optimistic local update).
function EditorCard({ variant, inLook, activeLookId, onSetOverride, onRemove, onPointerEnter, onPointerLeave }) {
  const { speciesId, speciesLabel, variantId, quality, category, excluded, operatorNotes } = variant
  const [notes, setNotes] = useState(operatorNotes || '')
  useEffect(() => { setNotes(operatorNotes || '') }, [speciesId, variantId, operatorNotes])

  const setQuality = (q) => onSetOverride('qualityOverride', q)
  const setCategory = (c) => onSetOverride('categoryOverride', c === category ? null : c)
  const saveNotes = () => onSetOverride('operatorNotes', notes.trim() ? notes : null)

  return (
    <div
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={{
        background: 'rgba(20,20,24,0.96)',
        color: '#ddd',
        padding: '10px 12px', borderRadius: 6,
        fontFamily: '-apple-system, sans-serif', fontSize: 12,
        width: 280,
        border: '1px solid ' + (inLook ? '#5a8a5a' : 'rgba(255,255,255,0.15)'),
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        // Position above the tile (Html anchors at world point);
        // a small upward translate keeps it from overlapping the tree.
        transform: 'translate(-50%, -100%)',
        marginTop: -8,
      }}
    >
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

      {/* Remove from active Look */}
      <button
        disabled={!activeLookId || !inLook}
        onClick={onRemove}
        title={
          !activeLookId ? 'No Look active' :
          !inLook       ? 'Not in this Look' :
          'Remove from the active Look'
        }
        style={{
          width: '100%',
          padding: '6px 10px', borderRadius: 3,
          background: inLook ? 'rgba(154,74,74,0.3)' : 'rgba(255,255,255,0.04)',
          border: '1px solid ' + (inLook ? '#9a4a4a' : 'rgba(255,255,255,0.08)'),
          color: inLook ? '#f0c0c0' : '#666',
          fontFamily: 'inherit', fontSize: 11,
          cursor: inLook ? 'pointer' : 'default',
          letterSpacing: '0.04em',
        }}>
        {inLook ? 'Remove from Look' : 'Not in Look'}
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
