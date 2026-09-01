import { useMemo, useState, useEffect, useRef } from 'react'
import useCartographStore from './stores/useCartographStore.js'
import landmarksData from '../data/landmarks.json'
import { ASSET_BASE } from '../lib/bakedUrl.js'

// Roadway classes only. The dropdown writes st.type on a STREET
// (ribbons.streets); paths/alleys render from ribbons.paths/ribbons.alleys keyed
// off their own kind, never st.type — so footway/cycleway/steps/pedestrian on a
// street were inert (mislabel, no reroute) and pedestrian rendered nowhere. They
// were trimmed; we are NOT adding path/alley authoring (those stay OSM-default).
// Service kept — LS has a real service road (relabeled from "Service/Alley":
// alleys come from ribbons.alleys, not from typing a street). Highway classes
// (motorway, etc.) route through the Highway toggle, not this dropdown.
const TYPES = [
  ['residential', 'Residential'], ['secondary', 'Secondary'], ['primary', 'Primary'],
  ['service', 'Service'],
]

// Hero subject picker — lives in Survey because picking the scene's hero
// subject is a survey act (you're identifying a real-world building/landmark
// as the privileged subject). Stage and Browse read heroSubject for camera
// anchoring; Designer doesn't need to expose it.
function HeroSubjectPicker() {
  const heroSubject = useCartographStore(s => s.heroSubject)
  const setHeroSubject = useCartographStore(s => s.setHeroSubject)
  const activeLookId = useCartographStore(s => s.activeLookId)
  const archInstalled = useCartographStore(s => !!s.arch)
  // Offer the landscape (backdrop) hero ONLY when the active look has a baked
  // landscape asset (piece-2 manifest). A backdrop is the §10 third subject kind;
  // selecting it swaps the Hero Controls to its placement/snowline/atmosphere knobs.
  const [landscape, setLandscape] = useState(null)   // { label } | null
  useEffect(() => {
    let ok = true
    setLandscape(null)
    if (!activeLookId) return
    fetch(`${ASSET_BASE}baked/${activeLookId}/landscape/landscape.json?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(m => { if (ok && m) setLandscape({ label: m.label || 'Mountain Backdrop' }) })
      .catch(() => {})
    return () => { ok = false }
  }, [activeLookId])
  const options = useMemo(() => {
    const landmarks = (landmarksData.landmarks || [])
      .map(l => ({ kind: 'landmark', id: l.id, label: l.name }))
      .sort((a, b) => a.label.localeCompare(b.label))
    // The hood itself — always available, and the answer for any installation
    // that owns no set-piece and no privileged building.
    const base = [{ kind: 'centroid', id: 'centroid', label: 'Neighborhood Centroid' }]
    // The arch is a SET-PIECE: offered only where the Look installed it (an
    // `arch` channel), the same rule the landscape option below runs on. A hood
    // that doesn't want it simply doesn't carry it — and picks the centroid.
    if (archInstalled) base.push({ kind: 'arch', id: 'arch', label: 'Gateway Arch' })
    base.push(...landmarks)
    if (landscape) base.push({ kind: 'landscape', id: 'backdrop', label: landscape.label })
    return base
  }, [landscape, archInstalled])
  const currentKey = heroSubject ? `${heroSubject.kind}:${heroSubject.id}` : ''
  return (
    <div className="carto-section">
      <h2>Hero</h2>
      <div className="carto-row">
        <select
          className="carto-select"
          value={currentKey}
          onChange={(e) => {
            const v = e.target.value
            if (!v) { setHeroSubject(null); return }
            const [kind, ...rest] = v.split(':')
            setHeroSubject({ kind, id: rest.join(':') })
          }}
        >
          {options.map(o => (
            <option key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

// (The global "Smoothing" slider was retired 2026-06-04. Street smoothing is
// now always-on at fixed render quality — the clamped-Hermite smoother rounds
// bends without overshoot and keeps junctions hard with no operator dial. The
// control + its store wiring (streetSmooth / setStreetSmooth) were removed.)

// Corner-radius kit — the corner SHAPE authoring, a Survey concern (the corner
// is two things in two tools: SHAPE here, FILL in Section — ARCHITECTURE §2.1).
// Moved out of "Blocks › Shape" into Survey, next to smoothing + caps. Exposes
// the 3-tier radius control: global "Corners" scale, an edit-mode toggle (each
// corner becomes a draggable magenta handle that lies on the achieved curb arc),
// and a Revert that wipes every authored override + resets the scale. Per-IX and
// per-corner overrides are authored on-canvas (CornerEditHandles, Survey-gated).
function CornersSubsection() {
  const stored = useCartographStore(s => s.cornerRadiusScale ?? 1)
  const setStored = useCartographStore(s => s.setCornerRadiusScale)
  const cornerEditMode = useCartographStore(s => s.cornerEditMode)
  const setCornerEditMode = useCartographStore(s => s.setCornerEditMode)
  const overrides = useCartographStore(s => s.cornerRadiusOverrides) || {}
  const cornerOverrides = useCartographStore(s => s.cornerCornerRadiusOverrides) || {}
  const clearAllIxCornerRadii = useCartographStore(s => s.clearAllIxCornerRadii)
  const scene = useCartographStore(s => s.scene)
  const resetToySelected = useCartographStore(s => s.resetToySelected)
  const resetToyNeighborhood = useCartographStore(s => s.resetToyNeighborhood)
  const revertSurveyToSkeleton = useCartographStore(s => s.revertSurveyToSkeleton)
  const revertSurveyToDefault = useCartographStore(s => s.revertSurveyToDefault)
  const setSurveyDefault = useCartographStore(s => s.setSurveyDefault)
  const surveyDefault = useCartographStore(s => s.surveyDefault)
  const surveyOverrideCount = useCartographStore(s => s.surveyOverrideCount)
  const selectedStreet = useCartographStore(s => s.selectedStreet)
  const selectedName = useCartographStore(s =>
    s.selectedStreet != null ? s.centerlineData?.streets?.[s.selectedStreet]?.name : null)
  const overrideCount = Object.keys(overrides).length + Object.keys(cornerOverrides).length
  // Local draft tracks the slider thumb at input rate so the UI feels
  // responsive even though the store→geometry rebuild is heavy. Debounce
  // trailing-edge with a 200ms idle window; pointer-up always commits the
  // final value so the persisted store matches the thumb.
  const [draft, setDraft] = useState(stored)
  const idleRef = useRef(null)
  const targetRef = useRef(stored)
  const draggingRef = useRef(false)
  useEffect(() => {
    if (!draggingRef.current) setDraft(stored)
  }, [stored])
  const scheduleCommit = (v) => {
    targetRef.current = v
    if (idleRef.current != null) clearTimeout(idleRef.current)
    idleRef.current = setTimeout(() => {
      idleRef.current = null
      setStored(targetRef.current)
    }, 200)
  }
  const finalCommit = () => {
    draggingRef.current = false
    if (idleRef.current != null) { clearTimeout(idleRef.current); idleRef.current = null }
    setStored(targetRef.current)
  }
  return (
    <div className="carto-section">
      <h2>Corners</h2>
      <div className="carto-row carto-row--wrap">
        <label className="carto-label-fixed" title="Multiplies every IX corner radius (1 = AASHTO baseline). Crank up for a bubblier neighborhood; down to 0 for square corners. Per-IX/per-corner authored values are preserved as the slider moves.">
          Radius
        </label>
        <input type="range" className="carto-input"
          min="0" max="11" step="0.01"
          value={draft}
          onPointerDown={() => { draggingRef.current = true }}
          onPointerUp={finalCommit}
          onChange={e => {
            const v = parseFloat(e.target.value)
            setDraft(v)
            scheduleCommit(v)
          }}
          onKeyUp={finalCommit} />
        <input type="number"
          className="carto-meta carto-meta--value carto-meta--editable"
          value={Number(draft).toFixed(2)}
          min="0" max="11" step="0.01"
          onFocus={() => { draggingRef.current = true }}
          onBlur={finalCommit}
          onChange={e => {
            const v = Math.max(0, Math.min(11, parseFloat(e.target.value) || 0))
            setDraft(v)
            scheduleCommit(v)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') { finalCommit(); e.currentTarget.blur(); return }
            if (!e.shiftKey) return
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
            e.preventDefault()
            const delta = e.key === 'ArrowUp' ? 0.1 : -0.1
            const v = Math.max(0, Math.min(11, +(draft + delta).toFixed(2)))
            setDraft(v)
            scheduleCommit(v)
          }} />
        <span className="carto-meta carto-meta--unit">×</span>
      </div>
      <div className="carto-row carto-corner-buttons">
        <button
          className={`carto-btn carto-btn--icon${cornerEditMode ? ' is-active' : ''}`}
          onClick={() => setCornerEditMode(!cornerEditMode)}
          title="Edit corners: each corner becomes a magenta handle on the achieved curb arc. Drag a corner to set its radius (distance from the intersection = radius; drag to centre for a square corner). Right-click a corner to revert just that one.">
          <span className="carto-btn-glyph" aria-hidden="true">{cornerEditMode ? '●' : '○'}</span>
          <span className="carto-btn-text">Edit</span>
        </button>
        <button
          className="carto-btn carto-btn--icon"
          onClick={clearAllIxCornerRadii}
          disabled={overrideCount === 0 && draft === 1}
          title={overrideCount
            ? `Revert ALL: clear ${overrideCount} authored corner override${overrideCount === 1 ? '' : 's'} and reset scale to 1. Every corner returns to its default. (Right-click a single corner in edit mode to revert just that one.)`
            : 'Revert: reset scale to 1. (No authored overrides to clear.)'}>
          <span className="carto-btn-glyph" aria-hidden="true">↺</span>
          <span className="carto-btn-text">Revert{overrideCount ? ` (${overrideCount})` : ''}</span>
        </button>
      </div>
      {/* SURVEY revert (real scene). Skeleton = clear all your edits → surveyed
          widths + AASHTO radii (the frame as delivered). Default = the state you
          blessed with Set Default. ⌃-click any handle reverts just that one to
          Default. Field-scoped: leaves Section's ped edits intact. */}
      {scene !== 'toy' && (
        <div className="carto-row carto-corner-buttons">
          <button
            className="carto-btn carto-btn--icon"
            onClick={() => setSurveyDefault()}
            title="Bless the current Survey state (widths + corner radii) as the Default — the state Revert to Default and ⌃-click return to. Persisted with the Look.">
            <span className="carto-btn-glyph" aria-hidden="true">★</span>
            <span className="carto-btn-text">Set Default</span>
          </button>
          <button
            className="carto-btn carto-btn--icon"
            disabled={!surveyDefault}
            onClick={() => revertSurveyToDefault()}
            title={surveyDefault
              ? 'Revert Survey (widths + corner radii) to the blessed Default. Section ped edits are untouched.'
              : 'No Default set yet — use Set Default first.'}>
            <span className="carto-btn-glyph" aria-hidden="true">↺</span>
            <span className="carto-btn-text">Revert to Default</span>
          </button>
          <button
            className="carto-btn carto-btn--icon"
            disabled={(surveyOverrideCount?.() || 0) === 0}
            onClick={() => {
              if (confirm('Revert to Skeleton? This clears EVERY Survey edit (widths + corner radii) back to the frame as delivered — surveyed widths + AASHTO radii. Section ped edits are kept.')) revertSurveyToSkeleton()
            }}
            title="Clear every Survey width + corner-radius edit → the frame as delivered (surveyed widths, AASHTO radii). Section ped edits are kept.">
            <span className="carto-btn-glyph" aria-hidden="true">⤓</span>
            <span className="carto-btn-text">Revert to Skeleton</span>
          </button>
        </div>
      )}
      {/* Reset the toy's user-authored session layer back to the fixture
          baseline. Toy-only authoring affordance. */}
      {scene === 'toy' && (
        <div className="carto-row carto-corner-buttons">
          <button
            className="carto-btn carto-btn--icon"
            disabled={selectedStreet == null}
            onClick={() => {
              if (confirm(`Reset ${selectedName || 'the selected street'} to the fixture baseline? Its measure customs and per-block sidewalk/treelawn edits will be cleared and the map re-baked. This cannot be undone.`)) {
                resetToySelected()
              }
            }}
            title="Clear the selected chain's measure + per-block customs back to the toy fixture baseline, then re-bake.">
            <span className="carto-btn-glyph" aria-hidden="true">⟲</span>
            <span className="carto-btn-text">Reset Selected</span>
          </button>
          <button
            className="carto-btn carto-btn--icon"
            onClick={() => {
              if (confirm('Reset the whole toy neighborhood to the fixture baseline? Every street returns to its generic cross-section, all per-block customs clear, and all corner radii reset to default. Authored test features (Benton, Waverly) are kept. This cannot be undone.')) {
                resetToyNeighborhood()
              }
            }}
            title="Clear all measure customs, per-block customs, and corner radii scene-wide back to the toy fixture baseline, then re-bake. Authored test features are kept.">
            <span className="carto-btn-glyph" aria-hidden="true">⟲</span>
            <span className="carto-btn-text">Reset Neighborhood</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default function SurveyorPanel() {
  const selectedStreet = useCartographStore(s => s.selectedStreet)
  const selectedNode = useCartographStore(s => s.selectedNode)
  const centerlineData = useCartographStore(s => s.centerlineData)
  const updateStreetField = useCartographStore(s => s.updateStreetField)
  const setAnchor = useCartographStore(s => s.setAnchor)
  const editSidesSeparately = useCartographStore(s => s.editSidesSeparately)
  const setEditSidesSeparately = useCartographStore(s => s.setEditSidesSeparately)
  const measureMode = useCartographStore(s => s.measureMode)
  const setMeasureMode = useCartographStore(s => s.setMeasureMode)

  if (selectedStreet === null) {
    return (
      <>
        <HeroSubjectPicker />
        <div className="carto-section">
          <h2>Survey</h2>
          <div className="carto-hint">
            Click a street to select it.
          </div>
        </div>
        <CornersSubsection />
      </>
    )
  }

  const st = centerlineData.streets[selectedStreet]
  if (!st) return null

  return (
    <>
      <HeroSubjectPicker />
      <div className="carto-section">
        <h2>Survey</h2>

      {/* Asymmetric authoring — when off (default) an asphalt-edge drag mirrors
          to both sides; when on, each side is set independently. Mirrors the
          Measure control; works directly on the tile per-side asphalt width. */}
      <div className="carto-row">
        <input type="checkbox" className="carto-checkbox"
          checked={!!editSidesSeparately}
          onChange={() => setEditSidesSeparately(!editSidesSeparately)} />
        <label className="carto-label">Asymmetric (edit sides separately)</label>
      </div>

      {/* Whole-chain vs per-block scope — whole-chain (default) fans an asphalt
          edit to the entire chain side (chain.measure); per-block writes only the
          block-edge at the click anchor (per-fe), which the tile resolves per
          segment so the asphalt edge steps at that block. */}
      <div className="carto-row">
        <button
          className={`carto-btn-sm carto-btn--grow${measureMode?.type === 'global' ? ' is-active' : ''}`}
          onClick={() => setMeasureMode({ type: measureMode?.type === 'global' ? 'block' : 'global' })}
          title={measureMode?.type === 'global'
            ? 'Whole-chain (default): an asphalt edit fans to the entire chain side. Click to switch to per-block.'
            : 'Per-block: an asphalt edit writes only the block at the click anchor. Click to switch back to whole-chain.'}>
          {measureMode?.type === 'global' ? '● Edit whole chain' : '○ Edit whole chain'}
        </button>
      </div>

      <div className="carto-row">
        <label className="carto-label-fixed">Name</label>
        <input type="text" className="carto-input"
          value={st.name || ''}
          onChange={e => updateStreetField('name', e.target.value)} />
      </div>

      <div className="carto-row">
        <label className="carto-label-fixed">Type</label>
        <select className="carto-select"
          value={st.type || 'residential'}
          onChange={e => updateStreetField('type', e.target.value)}>
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="carto-row">
        <input type="checkbox" className="carto-checkbox" checked={!!st.oneway}
          onChange={e => updateStreetField('oneway', e.target.checked)} />
        <label className="carto-label">One-way</label>
      </div>

      {/* Anchor: where the chain centerline sits relative to the cross-section.
          'center' (default) = ribbon grows symmetrically. 'inner-edge' (auto-set
          for divided carriageways) = ribbon grows outward only from the
          median-facing edge. Auto-detected from corridor pairing; operator can
          override. innerSign != 0 means a paired chain was detected. */}
      <div className="carto-row">
        <label className="carto-label-fixed">Anchor</label>
        <select className="carto-select"
          value={st.anchor || 'center'}
          onChange={e => setAnchor(selectedStreet, e.target.value)}>
          <option value="center">Center (symmetric ribbon)</option>
          <option value="inner-edge" disabled={!st.innerSign}>
            Inner-edge {st.innerSign ? '' : '(no paired chain detected)'}
          </option>
        </select>
      </div>

      {/* Per-endpoint cap: None = connected to other geometry, Round = cul-de-sac,
          Blunt = flat termination. Operator sets these per-endpoint. */}
      <div className="carto-row">
        <label className="carto-label-fixed">Cap Start</label>
        <select className="carto-select"
          value={st.capStart || 'none'}
          onChange={e => updateStreetField('capStart', e.target.value === 'none' ? null : e.target.value)}>
          <option value="none">None (connected)</option>
          <option value="round">Round (cul-de-sac)</option>
          <option value="blunt">Blunt (flat end)</option>
        </select>
      </div>
      <div className="carto-row">
        <label className="carto-label-fixed">Cap End</label>
        <select className="carto-select"
          value={st.capEnd || 'none'}
          onChange={e => updateStreetField('capEnd', e.target.value === 'none' ? null : e.target.value)}>
          <option value="none">None (connected)</option>
          <option value="round">Round (cul-de-sac)</option>
          <option value="blunt">Blunt (flat end)</option>
        </select>
      </div>

        <div className="carto-meta">
          {st.points.length} nodes
          {selectedNode !== null ? ' · node ' + selectedNode : ''}
        </div>
      </div>
      <CornersSubsection />
    </>
  )
}
