/**
 * Designer Panel — geometry tools + ephemeral visibility.
 *
 * Per the Looks model (project_cartograph_looks_model): Designer = shape;
 * Stage = look. All *styling* controls (colors, materials, shaders) live
 * in Stage's Surfaces. What stays here:
 *
 *  - Tool panels (Surveyor, Measure)
 *  - Ephemeral per-layer / per-section visibility toggles for working
 *    clarity (e.g. hide buildings while tracing centerlines, then turn
 *    them back on to verify alignment with the aerial). These write to
 *    `engineeringHidden` in the store — session-only, never persisted,
 *    never reaches the Look's design.json.
 *
 * Visibility toggles are *additive* with the active Look's persistent
 * `layerVis` (owned by Stage). Effective hidden = layerVis(false) ∪
 * engineeringHidden(true). Unchecking a layer here does NOT modify
 * the Look — the moment you reload, everything's visible again.
 */
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
  { id: 'park',           label: 'Park' },
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

function VisRow({ id, label, hidden, onToggle }) {
  return (
    <div className="carto-row">
      <input type="checkbox" className="carto-checkbox"
        checked={!hidden} onChange={() => onToggle(id)} />
      <label className="carto-label" onClick={() => onToggle(id)}>{label}</label>
    </div>
  )
}

export default function Panel() {
  const tool = useCartographStore(s => s.tool)
  const activeLookId = useCartographStore(s => s.activeLookId)
  const engineeringHidden = useCartographStore(s => s.engineeringHidden)
  const toggleHidden = useCartographStore(s => s.toggleEngineeringHidden)
  const setSectionHidden = useCartographStore(s => s.setEngineeringHiddenSection)
  const openSections = useCartographStore(s => s.openSections)
  const setOpenSections = useCartographStore(s => s.setOpenSections)

  const sectionState = (defs) => {
    let on = 0, off = 0
    for (const L of defs) (engineeringHidden[L.id] ? off++ : on++)
    if (on === 0) return 'off'
    if (off === 0) return 'on'
    return 'mixed'
  }
  const toggleSectionVis = (defs) => {
    const state = sectionState(defs)
    setSectionHidden(defs.map(L => L.id), state !== 'off')
  }
  const toggleSection = (name) => {
    setOpenSections(prev => ({ ...prev, [name]: !prev[name] }))
  }

  const heading = tool === 'surveyor' ? 'Survey'
                : tool === 'measure'  ? 'Measure'
                : 'Designer'

  const sections = [
    ['Streets',  STREETS_DEFS],
    ['Blocks',   BLOCKS_DEFS],
    ['Paths',    PATHS_DEFS],
    ['Features', FEATURES_DEFS],
    ['Labels',   LABELS_DEFS],
  ]

  return (
    <div className="carto-panel">
      <h1>{heading}</h1>

      {tool === 'surveyor' && <SurveyorPanel />}
      {tool === 'measure' && <MeasurePanel />}

      {/* Active-Look reminder + ephemeral visibility toggles. Always
          shown so a single hidden-layer doesn't get lost behind a
          tool-active state. */}
      <div className="carto-section">
        <div className="carto-section-header" style={{ paddingTop: 0 }}>
          <span className="carto-section-title" style={{ cursor: 'default' }}>
            Look · {activeLookId || '—'}
          </span>
        </div>
        <div className="carto-row" style={{ color: '#888', fontSize: 10, lineHeight: 1.4, paddingBottom: 4 }}>
          Visibility toggles below are session-only (engineering aid).
          Colors and per-Look visibility live in Stage → Surfaces.
        </div>
      </div>

      {sections.map(([name, defs]) => (
        <Section key={name} name={name}
          open={openSections[name]} onToggle={toggleSection}
          visState={sectionState(defs)}
          onToggleVis={() => toggleSectionVis(defs)}>
          {defs.map(L => (
            <VisRow key={L.id} id={L.id} label={L.label}
              hidden={!!engineeringHidden[L.id]} onToggle={toggleHidden} />
          ))}
        </Section>
      ))}
    </div>
  )
}
