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
import { resolveGrove } from '../../arborist/grove-eligibility.mjs'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { createCameraTween } from '../preview/cameraTween.js'
import { OverheadBaker } from './OverheadBaker.jsx'
import { HeroImpostorBaker } from './HeroImpostorBaker.jsx'
import { partitionByDirt } from './captureKey.js'
import { OverheadSpecies, useOverheadAssets } from '../components/OverheadTrees.jsx'
import { useTreeAtlas, treeSwayUniforms } from '../components/treeAtlasMaterial.js'
import { writeCanaryTree, useCanaryTree } from '../lib/canaryTree.js'
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
// Hero capture dials — MUST mirror HeroImpostorBaker's prop defaults. They are part
// of the capture fingerprint, so changing one correctly re-dirties every species.
const HERO_AZIMUTHS = 6
const HERO_SHELLS = 2

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
  const setActiveLook = useArboristStore(s => s.setActiveLook)
  const looksRosters = useArboristStore(s => s.looksRosters)
  const toggleInLook = useArboristStore(s => s.toggleInLook)
  // The demand-ordered roster board + the two bars — the same inputs the Salon rail uses.
  const rosterCoverage = useArboristStore(s => s.rosterCoverage)
  const groveThreshold = useArboristStore(s => s.groveThreshold)
  const rosterSpecies = rosterCoverage?.species || []
  const warnedNoBoardRef = useRef(false)
  // slab library id → the dossier's canonicalId, so the owner lookup works when the two
  // disagree (`maple_sugar` on the slab, `acer_saccharum` in the roster).
  const unownedRef = useRef(new Set())

  const overheadSpecies = useMemo(() => {
    if (!activeLookId) return []
    const base = import.meta.env.BASE_URL
    const seen = new Set(), out = []
    for (const t of activeLookTrees) {
      if (seen.has(t.species)) continue
      seen.add(t.species)
      // ⛔ A species with no baked GLB cannot be captured at all — the pool is
      // eligible ∩ published. An eligible species missing its GLB is a WORK ITEM
      // (it needs publishing), never a silent omission: it is reported below.
      // ⛔ FAILS OPEN, AND SAYS SO. If the roster board has not loaded there is nothing to
      // gate with, and baking NOTHING would be worse than baking everything — but a
      // silent fall-through is how the gate quietly stops existing. Warn, then proceed.
      if (!eligibleNames.size) {
        if (!warnedNoBoardRef.current) {
          warnedNoBoardRef.current = true
          console.warn('[grove-bake] roster board not loaded — capturing the FULL look roster ungated. The bars are not being applied.')
        }
      } else if (!eligibleNames.has(t.species) && !eligibleByLibId(t.species, groveBoard, unownedRef)) continue
      out.push({ species: t.species, glbUrl: `${base}baked/${activeLookId}/trees/${t.species}/skeleton-${t.variantId}-lod1.glb` })
    }
    return out
  }, [activeLookId, activeLookTrees, eligibleNames, groveBoard])

  // ⭐ DRAIN-ON-BAKE (Jacob, 2026-07-22). Bake→Slab re-captures only what's DIRTY;
  // a species whose fingerprint still matches its stored capture is skipped. The
  // first bake after a big change may shoot everything and the next one shoots
  // nothing — the cost tapers to zero instead of being re-paid every bake, which
  // is what made a 10-species capture pass expensive enough to avoid running.
  //
  // Dirtiness is DERIVED (src/arborist/captureKey.js), not flagged: no ledger to
  // drift, and a species that fails or loses its assets is dirty again by
  // construction, so a retry is just "bake again".
  //
  // The ⟳ button deliberately FORCES all — it is the repair gesture, for when you
  // don't trust the fingerprint (changed capture code, a suspect asset on disk).
  const forceAll = useRef(false)
  const groveAtlas = useTreeAtlas(activeLookId)
  const heroDials = useMemo(() => ({ azimuths: HERO_AZIMUTHS, shells: HERO_SHELLS }), [])
  const overheadDirty = useMemo(() => {
    if (!groveAtlas?.manifest) return overheadSpecies
    return partitionByDirt(overheadSpecies, groveAtlas.manifest.overheadBySpecies, groveAtlas.manifest).dirty
  }, [overheadSpecies, groveAtlas?.manifest])
  const heroDirty = useMemo(() => {
    if (!groveAtlas?.manifest) return overheadSpecies
    return partitionByDirt(overheadSpecies, groveAtlas.manifest.heroImpostorBySpecies, groveAtlas.manifest, () => heroDials).dirty
  }, [overheadSpecies, groveAtlas?.manifest, heroDials])
  // What each baker actually receives this run — the dirty subset, or everything
  // when the operator forced a re-capture.
  const overheadBatch = forceAll.current ? overheadSpecies : overheadDirty
  const heroBatch = forceAll.current ? overheadSpecies : heroDirty

  // Bake→Slab: run the HTTP roster bake, THEN kick the in-Canvas overhead capture.
  const bakeAll = async () => {
    forceAll.current = false
    setOverheadProg(null)
    await bakeGroveToSlab()
    // Re-read dirt AFTER the roster bake — bake-look just rewrote the atlas, and a
    // species whose inputs moved becomes dirty exactly here.
    if (overheadSpecies.length) { setOverheadProg({ done: 0, total: overheadBatch.length }); setOverheadTick((t) => t + 1) }
  }
  // Re-capture BOTH impostor pools onto the ALREADY-baked slab (no 30s roster
  // re-bake) — off the current baked lod1 GLBs → POSTed into the slab.
  //
  // This used to be a hero-ONLY button, which is why the Grove had two bake
  // gestures and nobody could tell whether hero was part of Bake→Slab or a step
  // you had to remember (it is part of it — Bake→Slab chains both captures).
  // Hero got a standalone refresh because the agent building that arc needed one
  // for his own eye-gate loop; overhead never had one, and the asymmetry read as
  // meaning. The operator concept is "re-capture the impostors," singular — the
  // two pools are one product split by viewing hemisphere, and refreshing one
  // against an atlas the other hasn't seen is a drift waiting to happen.
  // Overhead's onDone chains hero, so kicking overhead runs both. (2026-07-22)
  const recaptureImpostors = () => {
    if (!overheadSpecies.length) return
    forceAll.current = true          // repair gesture — ignore the fingerprints
    setOverheadResult(null); setHeroResult(null); setImpostorGapDismissed(false)
    setOverheadProg({ done: 0, total: overheadSpecies.length }); setOverheadTick((t) => t + 1)
  }

  // Per-operator UI preference: tell the Meteorologist helper which tree
  // to use as its CanaryScene hero. Cross-tab via the `storage` event
  // (browsers fire it in OTHER tabs on same origin automatically). No
  // backend, no authored state — see ARCHITECTURE.md
  // "Arborist ↔ Meteorologist canary contract".
  // ⭐ THE LIVE CANARY, so the control can say what IS rather than only what it
  // WILL DO. It was a fire-and-forget button with a 1.5s toast: click it and the
  // panel looked identical afterwards, so there was no way to tell which tree was
  // the canary — or whether the click had landed at all (Jacob, 2026-08-23:
  // "Nothing happened to the button so we can't tell that this is now the
  // canary"). ⚠️ Especially bad here, because /grove serves BOTH `acer_saccharum`
  // and `maple_sugar` as separate tiles: two different trees, one plausible name.
  const canary = useCanaryTree()
  const toastTimerRef = useRef(null)
  const setMeteorologistCanary = (v) => {
    // ⚠ Through the shared writer, which also fires the same-tab StorageEvent —
    // Grove used to call setItem directly, so a viewer sharing THIS tab (the
    // full monte) never heard the click. Invisible while the only viewer was
    // Meteorologist in another tab.
    writeCanaryTree({ species: v.speciesId, variantId: v.variantId, lookId: activeLookId })
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

  // Trees in a RING (2026-07-11, Jacob) — every specimen equidistant from the
  // center, so none recede or occlude the way the back rows did in the old grid.
  // Radius sized so the canopies clear each other around the circumference.
  const N = Math.max(1, visible.length)
  const ringRadius = Math.max(TILE_SPACING, (visible.length * TILE_SPACING) / (2 * Math.PI)) * ringScale
  const positions = visible.map((_, i) => {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2   // first at the back, sweep around
    return [ringRadius * Math.cos(a), 0, ringRadius * Math.sin(a)]
  })

  // The two view poses (Hero = perspective, angled; Browse = straight-down, up
  // tilted to [0,0,-1] like the player's overhead). startTransition hands them to
  // the shared player tween; TransitionDriver applies the eased pose each frame.
  const poseFor = (vw) => {
    const span = ringRadius * 2 + TILE_SPACING
    return vw === 'browse'
      ? { pos: [0, span * 1.15 + 40, 0.0001], target: [0, 0, 0], up: [0, 0, -1], fov: 40 }
      : { pos: [0, span * 0.6 + 12, span * 0.9 + 18], target: [0, 4, 0], up: [0, 1, 0], fov: 40 }
  }
  const startTransition = (target) => {
    if (target === view || transitioning) return
    tweenRef.current.start({
      from: poseFor(view), to: poseFor(target), duration: 1200, ease: 'easeInOutCubic',
      onUpdate: (op, ot, fov, e, ou) => {
        poseRef.current.pos.copy(op); poseRef.current.target.copy(ot)
        poseRef.current.up.copy(ou); poseRef.current.fov = fov
        setBlend(target === 'browse' ? e : 1 - e)
      },
      onComplete: () => { setView(target); setTransitioning(false); setBlend(target === 'browse' ? 1 : 0) },
    })
    setTransitioning(true)
    // FAILSAFE. `transitioning` disables BOTH view buttons, and the only thing
    // that clears it is the tween's onComplete — which is ticked from a useFrame
    // INSIDE the Canvas. If that frame loop isn't running (Suspense boundary
    // still resolving, tab backgrounded, a WebGL context loss, or a re-render
    // that hands us a fresh tween), the flag latches true and the Hero/Browse
    // toggle is dead for the rest of the session with no error anywhere. Commit
    // the view on a timer past the 1200ms tween so the UI can never wedge.
    clearTimeout(transitionGuard.current)
    transitionGuard.current = setTimeout(() => {
      setView(target); setTransitioning(false); setBlend(target === 'browse' ? 1 : 0)
    }, 2000)
  }

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
        {/* The neighborhood IS the selector (2026-07-11, Jacob) — and as of
            2026-07-15 it is sourced from the SCENES behind the Looks, not from
            the Looks. The Grove curates a neighbourhood's trees: its census, its
            roster, its assets are all neighbourhood facts, and a Look is only a
            way to light them. Selecting one still resolves to a Look because the
            roster + custom atlas are Look-keyed ON DISK
            (looks/<id>/design.json → baked/<look>/) — that resolution is exact
            while every Look's scene equals its id, and this is the seam that
            grows a Look sub-picker the day a winter LS sits over the same
            neighbourhood. Gallery/Coverage toggle removed; Coverage belongs in
            the Salon, not here. */}
        <label style={{ fontSize: 10, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Neighborhood
        </label>
        <select value={activeScene || ''} onChange={(e) => setActiveLook(lookIdForScene(e.target.value))}
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
            color: '#ddd', borderRadius: 4, padding: '5px 9px', fontSize: 12, fontFamily: 'inherit',
          }}>
          {neighborhoods.map(n => <option key={n.scene} value={n.scene}>{n.name}</option>)}
        </select>
        {(
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'center' }}>
          {/* View: Specimen (the lit 3D you author) ↔ Browse (the slab's OWN
              overhead disc render — the exact OverheadSpecies consumer the map
              ships, so what you see here is what the map draws in plan view).
              Browse reflects the LAST Bake→Slab (the disc is a baked artifact). */}
          <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
            {[
              { v: 'gallery', label: 'Hero' },
              { v: 'browse',  label: 'Browse' },
            ].map(o => (
              <button key={o.v} onClick={() => startTransition(o.v)} disabled={transitioning}
                title={o.v === 'browse'
                  ? 'The overhead disc as the map ships it (last bake) — top-down, same OverheadSpecies consumer'
                  : 'The lit 3D specimen'}
                style={{
                  border: 'none', padding: '6px 10px', fontSize: 11,
                  background: view === o.v ? 'rgba(150,220,130,0.22)' : 'transparent',
                  color: view === o.v ? '#cfeeb4' : '#aaa',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{o.label}</button>
            ))}
          </div>
          {/* Spread — resize the ring so trees read both clustered (dense grove,
              like the map) and separate (inspect one). Applies to Hero + Browse. */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#888', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Spread
            <input type="range" min={0.25} max={3} step={0.05} value={ringScale}
              onChange={(e) => setRingScale(Number(e.target.value))}
              title="Cluster ↔ separate the ring" style={{ width: 90 }} />
          </label>
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
          <button
            onClick={bakeAll}
            disabled={groveBaking || !!(overheadProg && overheadProg !== 'done') || !!(heroProg && heroProg !== 'done') || !activeLookId}
            title={`Bake this neighborhood's roster to the slab (atlas + placements + overhead snapshots + hero canopy impostors) — what the map renders. Takes ~10-30s.`}
            style={{
              border: '1px solid rgba(150,220,130,0.4)', borderRadius: 4,
              padding: '6px 14px', fontSize: 11, fontWeight: 600,
              background: groveBaking ? 'rgba(150,220,130,0.15)' : 'rgba(150,220,130,0.22)',
              color: '#cfeeb4', fontFamily: 'inherit',
              cursor: (groveBaking || !activeLookId) ? 'not-allowed' : 'pointer',
              opacity: (groveBaking || !activeLookId) ? 0.5 : 1,
            }}>
            {groveBaking ? 'Baking…'
              : (overheadProg && overheadProg !== 'done') ? `Overhead ${overheadProg.done}/${overheadProg.total}…`
              : (heroProg && heroProg !== 'done') ? `Hero ${heroProg.done}/${heroProg.total}…`
              : 'Bake → Slab'}
          </button>
          {/* RE-CAPTURE both impostor pools onto the already-baked slab (no roster
              re-bake). A repair/iteration gesture — Bake→Slab already runs both. */}
          <button
            onClick={recaptureImpostors}
            disabled={groveBaking || !!(overheadProg && overheadProg !== 'done') || !!(heroProg && heroProg !== 'done') || !activeLookId}
            title="Re-capture BOTH impostor pools (overhead + hero) onto the already-baked slab — no full roster re-bake. Bake → Slab already does this; use it to retry after a failed capture or to re-shoot after changing capture dials."
            style={{
              border: '1px solid rgba(150,200,220,0.4)', borderRadius: 4,
              padding: '6px 12px', fontSize: 11, fontWeight: 600, marginLeft: 6,
              background: 'rgba(150,200,220,0.18)', color: '#bfe2f0', fontFamily: 'inherit',
              cursor: (groveBaking || !activeLookId) ? 'not-allowed' : 'pointer',
              opacity: (groveBaking || !activeLookId) ? 0.5 : 1,
            }}>
            {(overheadProg && overheadProg !== 'done') ? `Overhead ${overheadProg.done}/${overheadProg.total}…`
              : (heroProg && heroProg !== 'done') ? `Hero ${heroProg.done}/${heroProg.total}…`
              : '⟳ Re-capture impostors'}
          </button>
          {groveBakeResult && !groveBaking && (
            <span style={{ color: groveBakeResult.error ? '#f88' : '#bce0a0', fontSize: 11 }}>
              {groveBakeResult.error
                ? `bake failed: ${groveBakeResult.error}`
                : `✓ ${groveBakeResult.count} trees placed (${groveBakeResult.uniqueVariants} variants, ${(groveBakeResult.totalMs/1000).toFixed(0)}s)`}
              {/* ⛔ "3 of 4 species FAILED" printed an INTERNAL BATCH SIZE as if it were the
                  operator's species count. 4 was however many the drain-on-bake happened to
                  re-shoot — the other six were skipped as already-captured — so the
                  denominator meant nothing to the person reading it, and the ratio changed
                  bake to bake while the same three species kept failing. Same defect as the
                  bar label printing a row where a count belonged.
                  ⭐ Name the trees instead. An operator needs WHICH and WHAT NEXT, never a
                  ratio over a batch they cannot see. Kept loud enough to not be silent —
                  this is a real gap in the slab — but it is one line and it dismisses. */}
              {overheadProg === 'done' && !overheadResult?.fail && ` · overhead ✓ ${overheadResult?.ok ?? ''}`}
              {heroProg === 'done' && !heroResult?.fail && ` · hero ✓ ${heroResult?.ok ?? ''}`}
            </span>
          )}
        </span>
        )}
      </header>

      {(() => {
        const names = [...new Set([...(overheadResult?.failedNames || []), ...(heroResult?.failedNames || [])])]
        if (!names.length || impostorGapDismissed) return null
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px',
            background: 'rgba(200,120,60,0.10)', borderBottom: '1px solid rgba(200,120,60,0.25)',
            fontSize: 11, color: '#e0b088',
          }}>
            <span>
              no impostor: <b style={{ color: '#f0c8a0' }}>{names.join(', ')}</b>
              <span style={{ color: '#9a8878' }}> — these render as mesh at every distance. Withhold them, or fix the capture.</span>
            </span>
            <button onClick={() => setImpostorGapDismissed(true)}
              title="Dismiss until the next bake"
              style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: '#9a8878', cursor: 'pointer', fontSize: 13, padding: '0 2px' }}>×</button>
          </div>
        )
      })()}

      <div
        style={{ flex: 1, position: 'relative', minHeight: 0 }}
        onPointerDown={(e) => { downRef.current = { x: e.clientX, y: e.clientY } }}
      >
        {<>
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
          {/* Rides the Bake→Slab button: captures each roster species' overhead
              (GPU, this Canvas) → POSTs into the look's slab. See OverheadBaker. */}
          <OverheadBaker
            runTick={overheadTick}
            lookId={activeLookId}
            species={overheadBatch}
            onProgress={(done, total) => setOverheadProg({ done, total })}
            onDone={({ ok, fail }) => {
              setOverheadProg('done'); setOverheadResult({ ok, fail })
              console.log(`[overhead-bake] done — ${ok} ok, ${fail} failed`)
              // Chain the hero capture (one GPU loop at a time). Same species list.
              if (heroBatch.length) { setHeroProg({ done: 0, total: heroBatch.length }); setHeroTick((t) => t + 1) }
              else setHeroProg('done')
            }}
          />
          {/* Same Bake→Slab: captures each roster species' side-on HERO impostor
              (all N azimuths = the per-instance variety pool) → POSTs into the slab. */}
          <HeroImpostorBaker
            runTick={heroTick}
            lookId={activeLookId}
            species={heroBatch}
            onProgress={(done, total) => setHeroProg({ done, total })}
            onDone={({ ok, fail }) => {
              setHeroProg('done'); setHeroResult({ ok, fail })
              console.log(`[hero-impostor-bake] done — ${ok} ok, ${fail} failed`)
            }}
          />
          {/* Ambient breeze — advances the shared foliage-sway clock so the Grove
              reads as alive (Hero specimens rustle, Browse discs wiggle), through
              the SAME uniforms/shader the player uses. See GroveWind. */}
          <GroveWind />
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

          {/* Both tree forms mount during the transition so they CROSSFADE
              (Tile 3D specimen fades out as the Browse disc fades in), driven by
              the shared player tween's eased progress → `blend`. */}
          {(view === 'gallery' || transitioning) && (
            <Suspense fallback={null}>
              {visible.map((v, i) => (
                <Tile
                  key={`${v.speciesId}:${v.variantId}`}
                  variant={v}
                  position={positions[i]}
                  opacity={1 - blend}
                  inLook={inLook(v)}
                  hovered={hovered?.speciesId === v.speciesId && Number(hovered?.variantId) === Number(v.variantId)}
                  selected={selected?.speciesId === v.speciesId && Number(selected?.variantId) === Number(v.variantId)}
                  onHoverIn={() => setHovered({ speciesId: v.speciesId, variantId: v.variantId })}
                  onHoverOut={() => setHovered(h => (h?.speciesId === v.speciesId && Number(h?.variantId) === Number(v.variantId) ? null : h))}
                  onSelect={() => setSelected({ speciesId: v.speciesId, variantId: v.variantId })}
                />
              ))}
            </Suspense>
          )}

          {/* Browse: the slab's OWN overhead disc render (OverheadSpecies), one
              species per ring slot at the same positions as the specimens, so a
              toggle compares specimen↔shipped-disc in place. Same consumer, same
              baked bands → true parity with the map's plan view. */}
          {(view === 'browse' || transitioning) && (
            <Suspense fallback={null}>
              <GroveBrowse
                species={visible} positions={positions} lookId={activeLookId}
                opacity={blend}
                inLook={inLook} hovered={hovered} selected={selected}
                onHoverIn={(v) => setHovered({ speciesId: v.speciesId, variantId: v.variantId })}
                onHoverOut={(v) => setHovered(h => (h?.speciesId === v.speciesId && Number(h?.variantId) === Number(v.variantId) ? null : h))}
                onSelect={(v) => setSelected({ speciesId: v.speciesId, variantId: v.variantId })}
              />
            </Suspense>
          )}

          <ViewCamera view={view} count={visible.length} radius={ringRadius} transitioning={transitioning} />
          <TransitionDriver tween={tweenRef.current} poseRef={poseRef} controlsRef={groveControlsRef} />
          <OrbitControls
            ref={groveControlsRef} makeDefault
            enabled={!transitioning}
            enableRotate={view !== 'browse'}
            target={view === 'browse' ? [0, 0, 0] : [0, 4, 0]}
          />
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
            isCanary={!!canary && canary.species === selectedVariant.speciesId
                      && Number(canary.variantId) === Number(selectedVariant.variantId)}
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

// GroveWind — the Grove's SwayDriver. It has no live weather feed, so it drives a
// constant gentle authoring breeze (the canary's calm fallback, HERO_BREEZE_MPS =
// 3.0) into the SHARED treeSwayUniforms + advances uTime. Every tree shader in the
// scene — the Hero specimens' injectFoliageSway rustle AND the Browse discs'
// injectOverheadStamp wiggle — reads these same uniforms, so nothing renders a
// parallel path: what breathes here breathes in the player. (Systemic follow-on:
// a baseline rustle floor on the OVERHEAD path so calm weather isn't dead-still in
// the live map too — task #15 "B".)
const GROVE_BREEZE_MPS = 3.0
function GroveWind() {
  useFrame((_, dt) => {
    treeSwayUniforms.uTime.value += dt
    treeSwayUniforms.uWindForce.value.set(GROVE_BREEZE_MPS, 0, 0)
    treeSwayUniforms.uWindIntensity.value = GROVE_BREEZE_MPS
    treeSwayUniforms.uGustFrontVelocity.value.set(GROVE_BREEZE_MPS * 2.5, 0, 0)
    treeSwayUniforms.uGustsScale.value   = 1.5
    treeSwayUniforms.uGustEnvelope.value = 1.0
  })
  return null
}

function ViewCamera({ view, count, radius, transitioning }) {
  // Snap the camera to the committed view's pose on mount / count change — but NOT
  // during a transition (TransitionDriver owns the camera then). Re-frames only on
  // view/count, never radius (the Spread slider must not re-zoom → trees would
  // appear to shrink). Pose math MATCHES poseFor() so the tween lands here exactly.
  const { camera } = useThree()
  const radiusRef = useRef(radius)
  radiusRef.current = radius
  useEffect(() => {
    if (!count || transitioning) return
    const span = radiusRef.current * 2 + TILE_SPACING
    if (view === 'browse') {
      camera.position.set(0, span * 1.15 + 40, 0.0001)   // ~straight above center
      camera.up.set(0, 0, -1)
      camera.lookAt(0, 0, 0)
    } else {
      camera.position.set(0, span * 0.6 + 12, span * 0.9 + 18)
      camera.up.set(0, 1, 0)
      camera.lookAt(0, 4, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, count, transitioning, camera])
  return null
}

// TransitionDriver — ticks the SHARED player camera tween each frame and applies
// the eased pose to the Grove camera (position + up-tilt + target), exactly as the
// universal player animates Hero↔Browse. OrbitControls is disabled during the tween
// (feedback_orbitcontrols_disable_to_drive_camera); on finish we sync the control
// target once so OrbitControls resumes cleanly from where the tween left the camera.
function TransitionDriver({ tween, poseRef, controlsRef }) {
  const { camera } = useThree()
  const wasActive = useRef(false)
  useFrame(() => {
    if (tween.isActive()) {
      tween.tick(performance.now())
      const p = poseRef.current
      camera.position.copy(p.pos)
      camera.up.copy(p.up)
      camera.lookAt(p.target)
      wasActive.current = true
    } else if (wasActive.current) {
      wasActive.current = false
      const c = controlsRef.current
      if (c) { c.target.copy(poseRef.current.target); c.update() }
    }
  })
  return null
}

// GroveBrowse — the slab's overhead render, IN the Grove. It loads the same baked
// overhead bands through the SAME useOverheadAssets loader the map uses, and mounts
// the SAME OverheadSpecies disc-stacks (one instance per species at its ring slot).
// So what renders here IS the map's plan-view draw — no separate path, true parity.
// Reads the LAST Bake→Slab (the disc is a baked artifact); re-bake to refresh.
// The slab keys trees by LIB id (`maple_red`) while the roster board keys by the census
// display name (`Maple, Red`). Match through the board's covering ids rather than
// slugifying a name — the two have drifted before and a wrong match here silently drops a
// species from the bake.
// ⛔⛔ THIS GATE ONLY EXCLUDES WHEN IT IS CERTAIN, AND THE UNCERTAINTY IS A NAMING BUG.
// A chassis asset is named for a SPECIES (`maple_sugar`), so every lookup has to answer
// "is this an asset or a species?" — a question that should not exist. The roster calls
// sugar maple `acer_saccharum` while the slab ships `maple_sugar`, so NO roster row owns
// that asset and the only rows claiming it are species SUBSTITUTING onto it. Two
// successive heuristics here resolved `maple_sugar` first to a cultivar row and then to
// Maple, Norway — both red, both would have silently dropped a green species from the bake
// while the bake reported ALL GREEN because it never tried.
// ⭐ Jacob's fix (2026-08-25, parked): strip species names from chassis after native
// instantiation so a chassis is a FORM (`oval`), not a species. That deletes this entire
// question. Until then this refuses to guess: exclude ONLY on an exact owner match,
// otherwise include and say so once.
// ⭐ WHO OWNS THE LIB, answered by the server rather than guessed here.
// Substitution means many roster species route to one library, so "covering contains X"
// cannot answer "who owns X" — asked that way it resolved maple_sugar to a cultivar row
// and then to Maple, Norway, both red, both silently dropping a green species while the
// bake reported ALL GREEN because it never tried. roster-coverage now emits `ownsLibIds`,
// computed with vocabulary.mjs (filesystem-bound, browser-unsafe), so the two generations
// of library for one species — `acer_saccharum` and `maple_sugar` — resolve to one row.
// ⛔ Still fails OPEN on an unowned asset: dropping a tree on a guess is invisible, an
// extra capture attempt is loud and cheap.
function eligibleByLibId(libId, board, warnRef) {
  const owner = board.find(b => (b.ownsLibIds || []).includes(libId))
    || board.find(b => b.canonicalId === libId)
  if (owner) return owner.tier !== 'out'
  if (warnRef && !warnRef.current.has(libId)) {
    warnRef.current.add(libId)
    console.warn(`[grove-bake] "${libId}" has no owning roster row — INCLUDED rather than dropped; the bars are not gating it.`)
  }
  return true
}

function GroveBrowse({ species, positions, lookId, opacity = 1, inLook, hovered, selected, onHoverIn, onHoverOut, onSelect }) {
  const atlas = useTreeAtlas(lookId)
  const overheadBySpecies = atlas?.manifest?.overheadBySpecies || null
  const speciesList = useMemo(() => species.map(v => v.speciesId), [species])
  const assets = useOverheadAssets({
    enabled: !!overheadBySpecies,
    lookName: lookId,
    overheadBySpecies,
    species: speciesList,
  })
  if (!assets) return null
  return (
    <>
      {species.map((v, i) => {
        const asset = assets.get(v.speciesId)
        if (!asset) return null
        const [x, , z] = positions[i]
        const isHov = hovered?.speciesId === v.speciesId && Number(hovered?.variantId) === Number(v.variantId)
        const isSel = selected?.speciesId === v.speciesId && Number(selected?.variantId) === Number(v.variantId)
        const inL = inLook(v)
        return (
          <group key={v.speciesId}>
            <OverheadSpecies asset={asset} instances={[{ x, y: 0, z, rotY: 0, scale: 1 }]} visible opacity={opacity} />
            {/* Base plate — the SAME quality circle + selection ring as the Hero
                Tile (same size / colour / opacity logic / GROUND position). The
                overhead discs disable raycast (below) so top-down clicks reach this
                plate. Matches the Grove's existing selection design. */}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[x, 0.005, z]}
              onPointerOver={(e) => { e.stopPropagation(); onHoverIn(v) }}
              onPointerOut={() => onHoverOut(v)}
              onClick={(e) => { e.stopPropagation(); if (e.delta > 5) return; onSelect(v) }}
            >
              <circleGeometry args={[TILE_SPACING * 0.42, 48]} />
              <meshStandardMaterial
                color={QUALITY_COLOR[v.quality] || '#666'}
                opacity={inL ? ((isHov || isSel) ? 0.95 : 0.78) : ((isHov || isSel) ? 0.45 : 0.22)}
                transparent
                roughness={0.85}
              />
            </mesh>
            {isSel && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.012, z]}>
                <ringGeometry args={[TILE_SPACING * 0.44, TILE_SPACING * 0.5, 48]} />
                <meshBasicMaterial color="#bce0a0" transparent opacity={0.95} toneMapped={false} />
              </mesh>
            )}
          </group>
        )
      })}
    </>
  )
}

function Tile({ variant, position, opacity = 1, inLook, hovered, selected, onHoverIn, onHoverOut, onSelect }) {
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

  // Crossfade the specimen (the Grove Hero↔Browse transition). Default 1 leaves it
  // normal; flip `transparent` only on change (a recompile), set `opacity` cheaply.
  useEffect(() => {
    const t = opacity < 1
    cloned.traverse(o => {
      if (!o.isMesh) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (!m) continue
        if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true }
        m.opacity = opacity
        m.depthWrite = !t
      }
    })
  }, [cloned, opacity])

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
          opacity={(
            excluded ? 0.35 :
            inLook   ? ((hovered || selected) ? 0.95 : 0.78) :
                       ((hovered || selected) ? 0.45 : 0.22)
          ) * opacity}
          transparent
          roughness={0.85}
        />
      </mesh>

      {/* Selection highlight — a bright ring so the panel's binding to a
          tile is unambiguous in the 3D scene. */}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[TILE_SPACING * 0.44, TILE_SPACING * 0.5, 48]} />
          <meshBasicMaterial color="#bce0a0" transparent opacity={0.95 * opacity} toneMapped={false} />
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
function GroveEditorPanel({ variant, inLook, activeLookId, activeLookName, onSetOverride, onToggleInLook, onSetMeteorologistCanary, isCanary, onClose }) {
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
          isCanary={isCanary}
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
function EditorCard({ variant, inLook, activeLookId, activeLookName, onSetOverride, onToggleInLook, onSetMeteorologistCanary, isCanary }) {
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

      {/* ⭐ IT STATES, THEN IT OFFERS. When this variant IS the canary the control
          says so and stops inviting a click that would do nothing; otherwise it
          reads as the action. One element, two states — a separate "current
          canary" line would be a second place the same fact lives. */}
      <button
        onClick={isCanary ? undefined : onSetMeteorologistCanary}
        disabled={isCanary}
        title={isCanary
          ? 'This variant is the canary — the Meteorologist scene and the street specimen both follow it'
          : "Set as the canary tree shown in Meteorologist's CanaryScene"}
        style={{
          width: '100%', marginTop: 6,
          padding: '6px 10px', borderRadius: 3,
          background: isCanary ? 'rgba(140,200,120,0.14)' : 'rgba(255,255,255,0.04)',
          border: isCanary ? '1px solid rgba(140,200,120,0.55)' : '1px solid rgba(255,255,255,0.12)',
          color: isCanary ? '#bce0a0' : '#c8c0e0',
          fontFamily: 'inherit', fontSize: 11,
          letterSpacing: '0.04em',
          cursor: isCanary ? 'default' : 'pointer',
        }}>
        {isCanary ? '✓ This is the canary' : '→ Set as Meteorologist canary'}
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
