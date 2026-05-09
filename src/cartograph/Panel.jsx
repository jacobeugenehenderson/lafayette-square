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
  // responsive even though the store→geometry rebuild is heavy (Clipper
  // booleans + ShapeGeometry triangulation in StreetRibbons run synchronously
  // on every store change). Commits to the store are rAF-throttled and
  // always finalized on pointer-up so the persisted value matches the thumb.
  const [draft, setDraft] = useState(stored)
  const rafRef = useRef(null)
  const targetRef = useRef(stored)
  const draggingRef = useRef(false)
  // Resync the slider when the store changes externally (Look switch, etc.)
  // but not mid-drag — that would clobber the user's in-progress motion.
  useEffect(() => {
    if (!draggingRef.current) setDraft(stored)
  }, [stored])
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
    <>
      <div className="carto-row carto-row--wrap">
        <label className="carto-label-fixed" title="Multiplies every IX corner radius (default 1 = AASHTO baseline). Crank up for a bubblier neighborhood; down to 0 for square corners.">
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
        <span className="carto-meta" style={{ minWidth: 34, textAlign: 'right' }}>
          {Number(draft).toFixed(2)}×
        </span>
      </div>
      <div className="carto-row">
        <button
          className={`carto-btn${cornerEditMode ? ' is-active' : ''}`}
          style={{ flex: 1 }}
          onClick={() => setCornerEditMode(!cornerEditMode)}
          title="Show draggable handles at every intersection center. Drag a handle: world distance from cursor to IX = new corner radius. Release to commit.">
          {cornerEditMode ? '● Edit corners' : '○ Edit corners'}
        </button>
        <button
          className="carto-btn"
          onClick={clearAllIxCornerRadii}
          disabled={overrideCount === 0}
          title={overrideCount
            ? `Clear ${overrideCount} per-IX override${overrideCount === 1 ? '' : 's'} — every corner reverts to its default radius (the AASHTO/data-table baseline). Global scale is unaffected.`
            : 'No per-IX overrides to revert.'}>
          Revert{overrideCount ? ` (${overrideCount})` : ''}
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
      <span className="carto-meta" style={{ minWidth: 40, textAlign: 'right' }}>
        {(draft * 39.3701).toFixed(1)}″
      </span>
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
function LabelsSubsection() {
  const style = useCartographStore(s => s.labels) || {}
  const setLabelStyle = useCartographStore(s => s.setLabelStyle)
  const get = (k, fb) => (style[k] !== undefined ? style[k] : fb)
  return (
    <>
      <div className="carto-row carto-row--wrap">
        <label className="carto-label-fixed" title="World-space height of each label, in meters.">Size</label>
        <input type="range" className="carto-input"
          min="1" max="12" step="0.25"
          value={get('size', 4)}
          onChange={e => setLabelStyle({ size: parseFloat(e.target.value) })} />
        <span className="carto-meta" style={{ minWidth: 40, textAlign: 'right' }}>
          {Number(get('size', 4)).toFixed(2)} m
        </span>
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
          value={get('fill', '#ffffff')}
          onChange={e => setLabelStyle({ fill: e.target.value })} />
      </div>
      <div className="carto-row">
        <label className="carto-label-fixed" title="Chip background. Set alpha to 0 to drop the chip and use a halo instead.">Chip</label>
        <input type="color" className="carto-input"
          value={get('bg', '#3a3a38')}
          onChange={e => setLabelStyle({ bg: e.target.value })} />
        <input type="range" className="carto-input"
          min="0" max="1" step="0.05"
          value={get('bgAlpha', 1)}
          onChange={e => setLabelStyle({ bgAlpha: parseFloat(e.target.value) })} />
        <span className="carto-meta" style={{ minWidth: 32, textAlign: 'right' }}>
          {Number(get('bgAlpha', 1)).toFixed(2)}
        </span>
      </div>
      <div className="carto-row">
        <label className="carto-label-fixed" title="Glyph stroke. 0 px = no halo (use the chip instead). Try chip alpha 0 + halo width 2–3 px for a haloed-only look.">Halo</label>
        <input type="color" className="carto-input"
          value={get('halo', '#000000')}
          onChange={e => setLabelStyle({ halo: e.target.value })} />
        <input type="range" className="carto-input"
          min="0" max="6" step="0.5"
          value={get('haloWidth', 0)}
          onChange={e => setLabelStyle({ haloWidth: parseFloat(e.target.value) })} />
        <span className="carto-meta" style={{ minWidth: 36, textAlign: 'right' }}>
          {Number(get('haloWidth', 0)).toFixed(1)} px
        </span>
      </div>
      <div className="carto-row">
        <label className="carto-label-fixed">Opacity</label>
        <input type="range" className="carto-input"
          min="0" max="1" step="0.05"
          value={get('opacity', 1)}
          onChange={e => setLabelStyle({ opacity: parseFloat(e.target.value) })} />
        <span className="carto-meta" style={{ minWidth: 32, textAlign: 'right' }}>
          {Number(get('opacity', 1)).toFixed(2)}
        </span>
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
