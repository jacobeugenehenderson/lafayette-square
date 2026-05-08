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
import { useEffect, useMemo, useRef, useState } from 'react'
import useCartographStore from './stores/useCartographStore.js'
import SurveyorPanel from './SurveyorPanel.jsx'
import landmarksData from '../data/landmarks.json'
import MeasurePanel from './MeasurePanel.jsx'

const STREETS_DEFS = [
  { id: 'street',   label: 'Asphalt' },
  { id: 'highway',  label: 'Highway' },
  { id: 'stripe',   label: 'Center Stripes' },
  { id: 'edgeline', label: 'Edge Lines' },
  { id: 'bikelane', label: 'Bike Lanes' },
]
const BLOCKS_DEFS = [
  { id: 'lot',           label: 'Block' },
  { id: 'curb',          label: 'Curb' },
  { id: 'sidewalk',      label: 'Sidewalks' },
  { id: 'treelawn',      label: 'Treelawn' },
  { id: 'building',      label: 'Buildings' },
  { id: 'parking_lot',   label: 'Parking' },
  { id: 'garden',        label: 'Gardens' },
  { id: 'playground',    label: 'Playgrounds' },
  { id: 'swimming_pool', label: 'Pools' },
  { id: 'pitch',         label: 'Pitches' },
  { id: 'sports_centre', label: 'Sports Centres' },
  { id: 'wood',          label: 'Woods' },
  { id: 'scrub',         label: 'Scrub' },
  { id: 'tree_row',      label: 'Tree Rows' },
]
const PATHS_DEFS = [
  { id: 'alley',    label: 'Alleys' },
  { id: 'footway',  label: 'Footways' },
  { id: 'cycleway', label: 'Cycleways' },
  { id: 'steps',    label: 'Steps' },
  { id: 'path',     label: 'Dirt Paths' },
]
const FEATURES_DEFS = [
  { id: 'water',          label: 'Water' },
  { id: 'tree',           label: 'Trees' },
  { id: 'lamp',           label: 'Lamps' },
  { id: 'fence',          label: 'Fences' },
  { id: 'wall',           label: 'Walls' },
  { id: 'retaining_wall', label: 'Retaining Walls' },
  { id: 'hedge',          label: 'Hedges' },
]
const LABELS_DEFS = [
  { id: 'labels', label: 'Labels' },
]

function Section({ name, open, onToggle, children, visState, onToggleVis }) {
  return (
    <div className="carto-section">
      <h2 className="carto-section-header">
        <span className="carto-section-title" onClick={() => onToggle(name)}>
          <span className="carto-section-caret"
            style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</span>
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

// Corners subsection — lives inside the Streets section and exposes the
// Look-level corner-radius controls. Phase 1 of 3: global scale slider.
// Phase 2 will add a "Corner edit mode" toggle that surfaces draggable
// per-IX center handles; phase 3 the per-corner handles. The whole
// authoring stack lands here, not in a sibling section, so all
// corner-shaping lives in one place inside the Streets menu.
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
      <div className="carto-row" style={{ flexWrap: 'wrap', gap: 6 }}>
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
      <div className="carto-row" style={{ gap: 6 }}>
        <button
          className="carto-button"
          onClick={() => setCornerEditMode(!cornerEditMode)}
          style={{
            background: cornerEditMode ? 'var(--vic-gold, #ffaa00)' : 'transparent',
            color: cornerEditMode ? '#000' : 'var(--on-surface, #ddd)',
            border: '1px solid var(--outline-variant, #555)',
            padding: '4px 10px',
            cursor: 'pointer',
            flex: 1,
          }}
          title="Show draggable handles at every intersection center. Drag a handle: world distance from cursor to IX = new corner radius. Release to commit.">
          {cornerEditMode ? '● Edit corners' : '○ Edit corners'}
        </button>
        <button
          className="carto-button"
          onClick={clearAllIxCornerRadii}
          disabled={overrideCount === 0}
          style={{
            background: 'transparent',
            color: overrideCount ? 'var(--on-surface, #ddd)' : 'var(--on-surface-disabled, #555)',
            border: '1px solid var(--outline-variant, #555)',
            padding: '4px 10px',
            cursor: overrideCount ? 'pointer' : 'default',
            opacity: overrideCount ? 1 : 0.4,
          }}
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
  return (
    <div className="carto-row" style={{ flexWrap: 'wrap', gap: 6 }}>
      <label className="carto-label-fixed" title="Width of the curb band that traces every block's asphalt boundary. Default 6&quot; (0.1524 m); 0 hides the curb entirely.">
        Curb
      </label>
      <input type="range" className="carto-input"
        min="0" max="0.5" step="0.0254"
        value={stored}
        onChange={e => setStored(parseFloat(e.target.value))} />
      <span className="carto-meta" style={{ minWidth: 40, textAlign: 'right' }}>
        {(stored * 39.3701).toFixed(1)}″
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

function HeroSubjectPicker({ open, onToggle }) {
  const heroSubject = useCartographStore(s => s.heroSubject)
  const setHeroSubject = useCartographStore(s => s.setHeroSubject)

  // Roster: every landmark in Lafayette Square. Wiring is academic for now;
  // the operator-visible roster matches the public Landmarks list.
  const options = useMemo(() => {
    const landmarks = (landmarksData.landmarks || [])
      .map(l => ({ kind: 'landmark', id: l.id, label: l.name }))
      .sort((a, b) => a.label.localeCompare(b.label))
    // Gateway Arch is the titular hero — pinned to the top, kept separate
    // from the landmark roster so its identity (and the camera anchor) stay
    // distinct from the dining/listings data.
    return [{ kind: 'arch', id: 'arch', label: 'Gateway Arch' }, ...landmarks]
  }, [])

  const currentKey = heroSubject ? `${heroSubject.kind}:${heroSubject.id}` : ''
  const currentLabel =
    options.find(o => `${o.kind}:${o.id}` === currentKey)?.label || '—'

  return (
    <div className="carto-section">
      <h2 className="carto-section-header">
        <span className="carto-section-title" onClick={onToggle}>
          <span className="carto-section-caret"
            style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</span>
          Hero
        </span>
        {!open && (
          <span className="carto-section-meta" title={currentLabel}>{currentLabel}</span>
        )}
      </h2>
      {open && (
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
      )}
    </div>
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
  const toggleLayerVis = useCartographStore(s => s.toggleLayerVis)
  const setLayersVis = useCartographStore(s => s.setLayersVis)
  const openSections = useCartographStore(s => s.openSections)
  const setOpenSections = useCartographStore(s => s.setOpenSections)

  // layerVis convention: unset or true = visible; false = hidden.
  const isHidden = (id) => layerVis[id] === false

  const sectionState = (defs) => {
    let on = 0, off = 0
    for (const L of defs) (isHidden(L.id) ? off++ : on++)
    if (on === 0) return 'off'
    if (off === 0) return 'on'
    return 'mixed'
  }
  const toggleSectionVis = (defs) => {
    const state = sectionState(defs)
    // If anything is currently visible (state !== 'off'), hide all.
    // Otherwise show all.
    setLayersVis(defs.map(L => L.id), state === 'off')
  }
  const toggleSection = (name) => {
    setOpenSections(prev => ({ ...prev, [name]: !prev[name] }))
  }

  const sections = [
    ['Streets',  STREETS_DEFS],
    ['Blocks',   BLOCKS_DEFS],
    ['Paths',    PATHS_DEFS],
    ['Features', FEATURES_DEFS],
    ['Labels',   LABELS_DEFS],
  ]

  return (
    <div className="carto-panel">
      <ToolPill />

      {tool === 'surveyor' && <SurveyorPanel />}
      {tool === 'measure' && <MeasurePanel />}

      <HeroSubjectPicker
        open={!!openSections['HeroSubject']}
        onToggle={() => toggleSection('HeroSubject')} />

      {sections.map(([name, defs]) => (
        <Section key={name} name={name}
          open={openSections[name]} onToggle={toggleSection}
          visState={sectionState(defs)}
          onToggleVis={() => toggleSectionVis(defs)}>
          {defs.map(L => (
            <VisRow key={L.id} id={L.id} label={L.label}
              hidden={isHidden(L.id)} onToggle={toggleLayerVis} />
          ))}
          {name === 'Streets' && <><CornersSubsection /><CurbSubsection /></>}
        </Section>
      ))}
    </div>
  )
}
