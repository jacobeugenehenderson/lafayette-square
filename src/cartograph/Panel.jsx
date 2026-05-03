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
import { useMemo } from 'react'
import useCartographStore from './stores/useCartographStore.js'
import SurveyorPanel from './SurveyorPanel.jsx'
import { buildings as _allBuildings } from '../data/buildings'
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

  // Subjects available for designation. Arch is special (fixed in-world).
  // Buildings with a `name` are the human-meaningful subset (65 of 1056);
  // unnamed buildings are noise here.
  const options = useMemo(() => {
    const named = _allBuildings
      .filter(b => b.name)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(b => ({ kind: 'building', id: b.id, label: b.name }))
    return [{ kind: 'arch', id: 'arch', label: 'Arch' }, ...named]
  }, [])

  const currentKey = heroSubject ? `${heroSubject.kind}:${heroSubject.id}` : ''
  const currentLabel = heroSubject
    ? options.find(o => `${o.kind}:${o.id}` === currentKey)?.label || '—'
    : 'None (arch fallback)'

  return (
    <div className="carto-section">
      <h2 className="carto-section-header">
        <span className="carto-section-title" onClick={onToggle}>
          <span className="carto-section-caret"
            style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</span>
          Hero Subject
        </span>
        {!open && (
          <span className="carto-section-meta" title={currentLabel}>{currentLabel}</span>
        )}
      </h2>
      {open && (
        <>
          <div className="carto-hint">
            The Hero shot frames around this object. The camera target locks to its centroid.
          </div>
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
              <option value="">— None (arch fallback) —</option>
              {options.map(o => (
                <option key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`}>{o.label}</option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  )
}

export default function Panel() {
  const tool = useCartographStore(s => s.tool)
  const activeLookId = useCartographStore(s => s.activeLookId)
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

      {/* Active-Look reminder + visibility toggles. Visibility writes to
          the Look's layerVis and propagates everywhere; styling lives
          separately in Stage → Surfaces. */}
      <div className="carto-section">
        <div className="carto-section-header" style={{ paddingTop: 0 }}>
          <span className="carto-section-title" style={{ cursor: 'default' }}>
            Look · {activeLookId || '—'}
          </span>
        </div>
        <div className="carto-row" style={{ color: '#888', fontSize: 10, lineHeight: 1.4, paddingBottom: 4 }}>
          Visibility toggles edit the Look (Stage + Preview see the change;
          stales the bake). Colors and materials live in Stage → Surfaces.
        </div>
      </div>

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
        </Section>
      ))}
    </div>
  )
}
