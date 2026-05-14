/**
 * Designer Panel — geometry tools + Look visibility.
 *
 * Per the Looks model (project_cartograph_looks_model): Designer = shape;
 * Stage = look. All *styling* controls (colors, materials, shaders) live
 * in Stage's Surfaces. What stays here:
 *
 *  - Tool panels (Surveyor, Measure)
 *  - Per-layer / per-section visibility toggles. These write to the active
 *    Look's `layerVis` and propagate through Stage and Preview — what you
 *    hide here is hidden everywhere. Toggling visibility stales the bake
 *    (it's a real Look edit); re-exposing a layer requires a re-bake.
 */
import { useEffect, useRef, useState } from 'react'
import useCartographStore from './stores/useCartographStore.js'
import SurveyorPanel from './SurveyorPanel.jsx'
import MeasurePanel from './MeasurePanel.jsx'

const STREETS_DEFS = [
  { id: 'street',   label: 'Asphalt' },
  { id: 'highway',  label: 'Highway' },
  { id: 'stripe',   label: 'Center Stripes' },
  { id: 'edgeline', label: 'Edge Lines' },
  { id: 'bikelane', label: 'Bike Lanes' },
]
const BLOCKS_DEFS = [
  { id: 'lot',           label: 'Parcel' },
  { id: 'curb',          label: 'Curb' },
  { id: 'sidewalk',      label: 'Sidewalks' },
  { id: 'treelawn',      label: 'Treelawn' },
  { id: 'building',      label: 'Buildings' },
  { id: 'parking_lot',   label: 'Parking' },
  { id: 'garden',        label: 'Gardens' },
  { id: 'playground',    label: 'Playgrounds' },
  { id: 'sports_centre', label: 'Sports Centres' },
]
const PATHS_DEFS = [
  { id: 'alley',    label: 'Alleys' },
  { id: 'footway',  label: 'Footways' },
  { id: 'cycleway', label: 'Cycleways' },
  { id: 'steps',    label: 'Steps' },
  { id: 'path',     label: 'Dirt Paths' },
]
// Ground-plane fills that aren't parcel-bound. Pool sits here too — same
// material/treatment as Water, just a smaller polygon.
const LAND_COVER_DEFS = [
  { id: 'water',         label: 'Water' },
  { id: 'swimming_pool', label: 'Pools' },
  { id: 'pitch',         label: 'Pitches' },
  { id: 'wood',          label: 'Woods' },
  { id: 'scrub',         label: 'Scrub' },
]
// Furniture = formerly "Features". Point/line scene props (was a junk-drawer
// catch-all). Trees here also drives `tree_row` visibility — they're the
// same conceptual layer, the linear/point split is a data-shape detail the
// panel doesn't expose.
const FURNITURE_DEFS = [
  { id: 'tree',           label: 'Trees' },
  { id: 'lamp',           label: 'Lamps' },
  { id: 'fence',          label: 'Fences' },
  { id: 'wall',           label: 'Walls' },
  { id: 'retaining_wall', label: 'Retaining Walls' },
  { id: 'hedge',          label: 'Hedges' },
]
// Layers a single panel row controls together. Toggling `tree` flips
// `tree_row` to match; section eye-state aggregates across all linked ids.
const LAYER_LINKS = {
  tree: ['tree', 'tree_row'],
}
const LABELS_DEFS = [
  { id: 'labels', label: 'Labels' },
]

function Section({ name, open, onToggle, children, visState, onToggleVis }) {
  return (
    <div className="carto-section">
      <h2 className="carto-section-header">
        <span className="carto-section-title" onClick={() => onToggle(name)}>
          <span className={`carto-section-caret${open ? ' is-open' : ''}`}>▸</span>
          {name}
        </span>
        {onToggleVis && (
          <button
            className={`carto-section-eye is-${visState || 'on'}`}
            title={visState === 'off' ? `Show all in ${name}` : `Hide all in ${name}`}
            onClick={(e) => { e.stopPropagation(); onToggleVis() }}>
            {visState === 'off' ? '◌' : visState === 'mixed' ? '◐' : '●'}
          </button>
        )}
      </h2>
      {open && children}
    </div>
  )
}

// Corners subsection — lives in the Blocks section's "Shape" group.
// Corner radius shapes the rounded-block-clip that derives every block
// polygon, so it's a block-shape concern, not a streets one (despite
// "corners" being intuitively about intersections). Exposes the
// Look-level corner-radius controls: global scale, edit-mode toggle for
// per-IX handles, and a Revert button that wipes per-IX overrides.
function CornersSubsection() {
  const stored = useCartographStore(s => s.cornerRadiusScale ?? 1)
  const setStored = useCartographStore(s => s.setCornerRadiusScale)
  const cornerEditMode = useCartographStore(s => s.cornerEditMode)
  const setCornerEditMode = useCartographStore(s => s.setCornerEditMode)
  const overrides = useCartographStore(s => s.cornerRadiusOverrides) || {}
  const cornerOverrides = useCartographStore(s => s.cornerCornerRadiusOverrides) || {}
  const clearAllIxCornerRadii = useCartographStore(s => s.clearAllIxCornerRadii)
  const overrideCount = Object.keys(overrides).length + Object.keys(cornerOverrides).length
  // Local draft tracks the slider thumb at input rate so the UI feels
  // responsive even though the store→geometry rebuild is heavy (V2's
  // Clipper booleans + ShapeGeometry triangulation in BlockGeometryV2Debug
  // run synchronously on every store change — 100ms+ on LS). rAF-throttling
  // (16ms) used to queue commits faster than the rebuild completes; we
  // now debounce trailing-edge with a 200ms idle window so geometry only
  // rebuilds when the user pauses or lifts. Pointer-up always commits the
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
    <>
      <div className="carto-row carto-row--wrap">
        <label className="carto-label-fixed" title="Multiplies every IX corner radius (1 = AASHTO baseline). Crank up for a bubblier neighborhood; down to 0 for square corners. Per-IX/per-corner authored values are preserved as the slider moves.">
          Corners
        </label>
        <input type="range" className="carto-input"
          min="0" max="11" step="0.1"
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
          min="0" max="11" step="0.1"
          onFocus={() => { draggingRef.current = true }}
          onBlur={finalCommit}
          onChange={e => {
            const v = Math.max(0, Math.min(11, parseFloat(e.target.value) || 0))
            setDraft(v)
            scheduleCommit(v)
          }}
          onKeyDown={e => {
            // Shift+Arrow = ±1.0; plain Arrow uses the input's native step (0.1).
            // Native handler fires the ±0.1 case on its own; we only intercept
            // shift to amplify, and Enter to commit immediately.
            if (e.key === 'Enter') { finalCommit(); e.currentTarget.blur(); return }
            if (!e.shiftKey) return
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
            e.preventDefault()
            const delta = e.key === 'ArrowUp' ? 1 : -1
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
          title="Edit corners: show per-IX center handles + per-corner cyan dots. Drag = world distance from cursor sets that radius.">
          <span className="carto-btn-glyph" aria-hidden="true">{cornerEditMode ? '●' : '○'}</span>
          <span className="carto-btn-text">Edit</span>
        </button>
        <button
          className="carto-btn carto-btn--icon"
          onClick={clearAllIxCornerRadii}
          disabled={overrideCount === 0 && draft === 1}
          title={overrideCount
            ? `Revert: clear ${overrideCount} authored override${overrideCount === 1 ? '' : 's'} and reset scale to 1. Every corner returns to its AASHTO/data-table default.`
            : 'Revert: reset scale to 1. (No authored overrides to clear.)'}>
          <span className="carto-btn-glyph" aria-hidden="true">↺</span>
          <span className="carto-btn-text">Revert{overrideCount ? ` (${overrideCount})` : ''}</span>
        </button>
      </div>
    </>
  )
}

// Global curb-width slider — Look-level value (meters) that V2's
// rounded-block-clip emits the curb stroke at. Uniform across the whole
// scene; per-side / per-chain curb overrides aren't supported in V2's
// unified-stroke model. Default 6 inches (0.1524 m); slider runs from
// 0 (no curb) to 0.5 m (oversized), step 0.0254 (1 inch).
function CurbSubsection() {
  const stored = useCartographStore(s => s.curbWidth ?? 0.1524)
  const setStored = useCartographStore(s => s.setCurbWidth)
  const [draft, setDraft] = useState(stored)
  const rafRef = useRef(null)
  const targetRef = useRef(stored)
  const draggingRef = useRef(false)
  useEffect(() => {
    if (!draggingRef.current) setDraft(stored)
  }, [stored])
  // rAF-throttled commit — V2's geometry rebuild on every input event
  // would stutter the slider. Slider thumb moves at input rate (setDraft);
  // store commits piggyback on the next animation frame.
  const scheduleCommit = (v) => {
    targetRef.current = v
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      setStored(targetRef.current)
    })
  }
  const finalCommit = () => {
    draggingRef.current = false
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    setStored(targetRef.current)
  }
  return (
    <div className="carto-row carto-row--wrap">
      <label className="carto-label-fixed" title="Width of the curb band that traces every block's asphalt boundary. Default 6&quot; (0.1524 m); 0 hides the curb entirely.">
        Curb
      </label>
      <input type="range" className="carto-input"
        min="0" max="0.5" step="0.0254"
        value={draft}
        onPointerDown={() => { draggingRef.current = true }}
        onPointerUp={finalCommit}
        onChange={e => {
          const v = parseFloat(e.target.value)
          setDraft(v)
          scheduleCommit(v)
        }}
        onKeyUp={finalCommit} />
      <span className="carto-meta carto-meta--value">
        {(draft * 39.3701).toFixed(1)}″
      </span>
    </div>
  )
}

// Universal alley end-cap dial. One Look-level mode — every alley
// terminates the same way (rounded semicircle / square pad / flat butt).
// Other path kinds keep their per-kind defaults in buildPathRibbons.
function AlleyCapSubsection() {
  const alleyCap = useCartographStore(s => s.alleyCap ?? 'square')
  const setAlleyCap = useCartographStore(s => s.setAlleyCap)
  // Order: increasing softness. Square (flush) → Rounded (rounded-
  // rectangle pad, with filleted corners) → Round (full semicircle).
  const MODES = ['square', 'rounded', 'round']
  return (
    <div className="carto-row carto-row--wrap">
      <label className="carto-label-fixed" title="End-cap silhouette for every alley in this Look. Other path kinds (footways, dirt paths, etc.) use built-in defaults.">
        Alley caps
      </label>
      <div className="flex gap-0.5" style={{ flex: 1 }}>
        {MODES.map(mode => (
          <button key={mode}
            onClick={() => setAlleyCap(mode)}
            className="flex-1 px-1.5 py-0.5 rounded text-caption cursor-pointer transition-colors"
            style={{
              background: alleyCap === mode ? 'var(--surface-container-highest)' : 'transparent',
              color:      alleyCap === mode ? 'var(--on-surface)' : 'var(--on-surface-subtle)',
              textTransform: 'capitalize',
            }}>
            {mode}
          </button>
        ))}
      </div>
    </div>
  )
}

function VisRow({ id, label, hidden, onToggle }) {
  return (
    <div className="carto-row">
      <input type="checkbox" className="carto-checkbox"
        checked={!hidden} onChange={() => onToggle(id)} />
      <label className="carto-label" onClick={() => onToggle(id)}>{label}</label>
    </div>
  )
}

// Labels parametric subsection — drives the Look-level `labels` style.
// One class for now (every label uses the same values); when a second
// neighborhood ships and per-class control is needed, this same control
// schema iterates over a `byClass` roster.
// Draft slider used across LabelsSubsection: commits to the store only
// after a 150ms idle window or on pointer-up, so dragging stays fluid
// even though Troika SDF text re-bakes glyph atlases on every prop
// change. Same pattern as CornersSubsection — extracted so the half-
// dozen label sliders don't each duplicate it.
function DraftRangeInput({ value, onCommit, min, max, step, formatLabel }) {
  const [draft, setDraft] = useState(value)
  const idleRef = useRef(null)
  const draggingRef = useRef(false)
  useEffect(() => { if (!draggingRef.current) setDraft(value) }, [value])
  const schedule = (v) => {
    if (idleRef.current != null) clearTimeout(idleRef.current)
    idleRef.current = setTimeout(() => { idleRef.current = null; onCommit(v) }, 150)
  }
  const finalCommit = () => {
    draggingRef.current = false
    if (idleRef.current != null) { clearTimeout(idleRef.current); idleRef.current = null }
    onCommit(draft)
  }
  const parse = (s) => {
    // Integer step => parseInt; fractional => parseFloat.
    const stepN = Number(step ?? 1)
    return Number.isInteger(stepN) ? parseInt(s, 10) : parseFloat(s)
  }
  return (
    <>
      <input type="range" className="carto-input"
        min={min} max={max} step={step}
        value={draft}
        onPointerDown={() => { draggingRef.current = true }}
        onPointerUp={finalCommit}
        onChange={e => { const v = parse(e.target.value); setDraft(v); schedule(v) }}
        onKeyUp={finalCommit} />
      <span className="carto-meta carto-meta--value">{formatLabel ? formatLabel(draft) : draft}</span>
    </>
  )
}

function LabelsSubsection() {
  const style = useCartographStore(s => s.labels) || {}
  const setLabelStyle = useCartographStore(s => s.setLabelStyle)
  const get = (k, fb) => (style[k] !== undefined ? style[k] : fb)
  const tier = style.tierScale || { street: 1, park: 2.5 }
  return (
    <>
      <div className="carto-row carto-row--wrap">
        <label className="carto-label-fixed" title="Screen height of a street label in pixels. Held constant across zoom; SceneLabel guardrails (10/96 px) clip at zoom extremes.">Size</label>
        <DraftRangeInput min="10" max="64" step="1"
          value={get('targetPx', 24)}
          onCommit={v => setLabelStyle({ targetPx: v })}
          formatLabel={v => `${v} px`} />
      </div>
      <div className="carto-row">
        <label className="carto-label-fixed" title="Park-tier multiplier. 1 = same size as a street label; 2.5 = LAFAYETTE PARK title size.">Park ×</label>
        <DraftRangeInput min="1" max="4" step="0.1"
          value={tier.park ?? 2.5}
          onCommit={v => setLabelStyle({ tierScale: { ...tier, park: v } })}
          formatLabel={v => `${Number(v).toFixed(1)}×`} />
      </div>
      <div className="carto-row">
        <label className="carto-label-fixed">Weight</label>
        <select className="carto-select"
          value={get('weight', 600)}
          onChange={e => setLabelStyle({ weight: parseInt(e.target.value, 10) })}>
          <option value={300}>Light (300)</option>
          <option value={400}>Regular (400)</option>
          <option value={500}>Medium (500)</option>
          <option value={600}>Semibold (600)</option>
          <option value={700}>Bold (700)</option>
        </select>
      </div>
      <div className="carto-row">
        <label className="carto-label-fixed">Fill</label>
        <input type="color" className="carto-input"
          value={get('fill', '#e8e8f0')}
          onChange={e => setLabelStyle({ fill: e.target.value })} />
      </div>
      <div className="carto-row">
        <label className="carto-label-fixed" title="Glyph outline color + width in fontSize units (TroikaText convention). 0.06 ≈ a 1-px-equivalent outline at typical body sizes.">Halo</label>
        <input type="color" className="carto-input"
          value={get('halo', '#14141c')}
          onChange={e => setLabelStyle({ halo: e.target.value })} />
        <DraftRangeInput min="0" max="0.2" step="0.01"
          value={get('haloWidth', 0.07)}
          onCommit={v => setLabelStyle({ haloWidth: v })}
          formatLabel={v => Number(v).toFixed(2)} />
      </div>
      <div className="carto-row">
        <label className="carto-label-fixed" title="TroikaText letterSpacing in fontSize units.">Tracking</label>
        <DraftRangeInput min="0" max="0.3" step="0.01"
          value={get('letterSpacing', 0.05)}
          onCommit={v => setLabelStyle({ letterSpacing: v })}
          formatLabel={v => Number(v).toFixed(2)} />
      </div>
      <div className="carto-row">
        <label className="carto-label-fixed" title="Text case transform applied at render time.">Case</label>
        <select className="carto-select"
          value={get('case', 'mixed')}
          onChange={e => setLabelStyle({ case: e.target.value })}>
          <option value="mixed">Mixed</option>
          <option value="upper">UPPER</option>
          <option value="lower">lower</option>
        </select>
      </div>
      <div className="carto-row carto-row--wrap">
        <label className="carto-label-fixed" title="TTF/OTF/WOFF URL. Leave empty for the Troika default (Roboto). Quick try: https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7.ttf">Font</label>
        <input type="text" className="carto-input"
          placeholder="(default)"
          value={get('font', '')}
          onChange={e => setLabelStyle({ font: e.target.value })} />
      </div>
      <div className="carto-row">
        <label className="carto-label-fixed">Opacity</label>
        <DraftRangeInput min="0" max="1" step="0.05"
          value={get('opacity', 1)}
          onCommit={v => setLabelStyle({ opacity: v })}
          formatLabel={v => Number(v).toFixed(2)} />
      </div>
    </>
  )
}

// Tool pill at the top of the panel — Survey | Measure | Design. The pill
// IS the tool selector (Toolbar's two-button group is gone) and replaces
// the old text status indicator. "Design" = no tool active = pure Look
// editing in the panel below.
function ToolPill() {
  const tool = useCartographStore(s => s.tool)
  const setTool = useCartographStore(s => s.setTool)
  const items = [
    { id: 'surveyor', label: 'Survey' },
    { id: 'measure',  label: 'Measure' },
    { id: 'design',   label: 'Design' },
  ]
  const activeId = tool === 'surveyor' ? 'surveyor'
                 : tool === 'measure'  ? 'measure'
                 : 'design'
  const onPick = (id) => {
    const target = id === 'design' ? null : id
    if (tool === target) return  // pill is no-op when clicking the active option
    setTool(target)
  }
  return (
    <div className="carto-toolgroup carto-panel-toolpill">
      {items.map(item => (
        <button
          key={item.id}
          className={activeId === item.id ? 'is-active' : ''}
          onClick={() => onPick(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export default function Panel() {
  const tool = useCartographStore(s => s.tool)
  const layerVis = useCartographStore(s => s.layerVis)
  const setLayersVis = useCartographStore(s => s.setLayersVis)
  const openSections = useCartographStore(s => s.openSections)
  const setOpenSections = useCartographStore(s => s.setOpenSections)

  // layerVis convention: unset or true = visible; false = hidden.
  const isHidden = (id) => layerVis[id] === false

  // Resolve a row id to every underlying layer it controls (Trees → tree+tree_row).
  const idsFor = (id) => LAYER_LINKS[id] || [id]

  // A linked row is hidden iff all its underlying layers are hidden.
  const rowHidden = (id) => idsFor(id).every(isHidden)

  const toggleRow = (id) => {
    const ids = idsFor(id)
    setLayersVis(ids, rowHidden(id))  // if all hidden, show all; else hide all
  }

  const sectionState = (defs) => {
    let on = 0, off = 0
    for (const L of defs) for (const id of idsFor(L.id)) (isHidden(id) ? off++ : on++)
    if (on === 0) return 'off'
    if (off === 0) return 'on'
    return 'mixed'
  }
  const toggleSectionVis = (defs) => {
    const state = sectionState(defs)
    const ids = defs.flatMap(L => idsFor(L.id))
    setLayersVis(ids, state === 'off')
  }
  const toggleSection = (name) => {
    setOpenSections(prev => ({ ...prev, [name]: !prev[name] }))
  }

  const sections = [
    ['Streets',     STREETS_DEFS],
    ['Blocks',      BLOCKS_DEFS],
    ['Paths',       PATHS_DEFS],
    ['Land Cover',  LAND_COVER_DEFS],
    ['Furniture',   FURNITURE_DEFS],
    ['Labels',      LABELS_DEFS],
  ]

  return (
    <div className="carto-panel">
      <ToolPill />

      {tool === 'surveyor' && <SurveyorPanel />}
      {tool === 'measure' && <MeasurePanel />}

      {sections.map(([name, defs]) => (
        <Section key={name} name={name}
          open={openSections[name]} onToggle={toggleSection}
          visState={sectionState(defs)}
          onToggleVis={() => toggleSectionVis(defs)}>
          {/* Block-shape controls live above the visibility list — corner
              radius and curb width shape every block's silhouette, which
              is conceptually upstream of "what do I render". */}
          {name === 'Blocks' && (
            <div className="carto-subsection">
              <div className="carto-subsection-header">Shape</div>
              <CornersSubsection />
              <CurbSubsection />
            </div>
          )}
          {name === 'Paths' && (
            <div className="carto-subsection">
              <div className="carto-subsection-header">Shape</div>
              <AlleyCapSubsection />
            </div>
          )}
          {defs.map(L => (
            <VisRow key={L.id} id={L.id} label={L.label}
              hidden={rowHidden(L.id)} onToggle={toggleRow} />
          ))}
          {name === 'Labels' && <LabelsSubsection />}
        </Section>
      ))}
    </div>
  )
}
