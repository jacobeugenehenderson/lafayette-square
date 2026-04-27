import { useState, useEffect, useRef } from 'react'
import useCartographStore from './stores/useCartographStore.js'
import SurveyorPanel from './SurveyorPanel.jsx'
import MeasurePanel from './MeasurePanel.jsx'
import StagePanelReal, { defaultKeyframes } from './StagePanel.jsx'
import { DEFAULT_LAYER_COLORS, DEFAULT_LU_COLORS, DEFAULT_LAYER_STROKES } from './m3Colors.js'

// ── Panel sections ─────────────────────────────────────────
// Five-section structure. Ground + Centerlines intentionally absent:
// ground is the circle-fade background, centerlines live in the Surveyor tool.
const STREETS_DEFS = [
  { id: 'street',     label: 'Asphalt' },
  { id: 'highway',    label: 'Highway' },
  { id: 'stripe',     label: 'Center Stripes' },
  { id: 'edgeline',   label: 'Edge Lines' },
  { id: 'bikelane',   label: 'Bike Lanes' },
]

const BLOCKS_DEFS = [
  { id: 'lot',         label: 'Block' },
  { id: 'curb',        label: 'Curb' },
  { id: 'sidewalk',    label: 'Sidewalks' },
  { id: 'treelawn',    label: 'Treelawn' },
  { id: 'building',    label: 'Buildings' },
  { id: 'parking_lot', label: 'Parking',     noColor: true }, // colors from Land Use > Parking
  { id: 'garden',      label: 'Gardens' },
  { id: 'playground',  label: 'Playgrounds' },
  { id: 'swimming_pool', label: 'Pools' },
  { id: 'pitch',       label: 'Pitches' },
  { id: 'sports_centre', label: 'Sports Centres' },
  { id: 'wood',        label: 'Woods' },
  { id: 'scrub',       label: 'Scrub' },
  { id: 'tree_row',    label: 'Tree Rows' },
]

const PATHS_DEFS = [
  { id: 'alley',      label: 'Alleys' },
  { id: 'footway',    label: 'Footways' },
  { id: 'cycleway',   label: 'Cycleways' },
  { id: 'steps',      label: 'Steps' },
  { id: 'path',       label: 'Dirt Paths' },
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
  { id: 'labels',     label: 'Labels' },
]

// Combined list used anywhere we iterate all layers (visibility dict, etc.)
const LAYER_DEFS = [...STREETS_DEFS, ...BLOCKS_DEFS, ...PATHS_DEFS, ...FEATURES_DEFS, ...LABELS_DEFS]
const LAYERS = LAYER_DEFS.map(L => ({ ...L, fill: DEFAULT_LAYER_COLORS[L.id] }))
const STREETS =  STREETS_DEFS.map(L => ({ ...L, fill: DEFAULT_LAYER_COLORS[L.id] }))
const BLOCKS =   BLOCKS_DEFS.map(L => ({ ...L, fill: DEFAULT_LAYER_COLORS[L.id] }))
const PATHS =    PATHS_DEFS.map(L => ({ ...L, fill: DEFAULT_LAYER_COLORS[L.id] }))
const FEATURES = FEATURES_DEFS.map(L => ({ ...L, fill: DEFAULT_LAYER_COLORS[L.id] }))
const LABELS =   LABELS_DEFS.map(L => ({ ...L, fill: DEFAULT_LAYER_COLORS[L.id] }))

const LAND_USE_DEFS = [
  { id: 'residential',       label: 'Residential' },
  { id: 'commercial',        label: 'Commercial' },
  { id: 'vacant',            label: 'Vacant' },
  { id: 'vacant-commercial', label: 'Vacant Com.' },
  { id: 'parking',           label: 'Parking' },
  { id: 'institutional',     label: 'Institutional' },
  { id: 'recreation',        label: 'Recreation' },
  { id: 'industrial',        label: 'Industrial' },
]
const LAND_USE = LAND_USE_DEFS.map(L => ({ ...L, fill: DEFAULT_LU_COLORS[L.id] }))

export default function Panel() {
  const tool = useCartographStore(s => s.tool)

  const [layerVis, setLayerVis] = useState(() => {
    const v = {}
    for (const L of LAYERS) v[L.id] = true
    v.centerline = false
    return v
  })
  const toggleVis = (id) => setLayerVis(prev => ({ ...prev, [id]: !prev[id] }))
  // Section-level visibility: "any visible → hide all, all hidden → show all"
  // so one click clears the section, another click brings everything back.
  const setSectionVis = (defs, on) => setLayerVis(prev => {
    const next = { ...prev }
    for (const L of defs) next[L.id] = on
    return next
  })
  const sectionState = (defs) => {
    let on = 0, off = 0
    for (const L of defs) (layerVis[L.id] ? on++ : off++)
    if (on === 0) return 'off'
    if (off === 0) return 'on'
    return 'mixed'
  }
  const toggleSectionVis = (defs) => {
    const state = sectionState(defs)
    setSectionVis(defs, state === 'off')   // off → all on; on or mixed → all off
  }

  const [layerColors, setLayerColors] = useState(() => {
    const c = {}
    for (const L of LAYERS) c[L.id] = L.fill
    return c
  })
  const setLayerColor = (id, val) => setLayerColors(prev => ({ ...prev, [id]: val }))
  const resetLayerColor = (id) => {
    const def = LAYERS.find(L => L.id === id)
    if (def) setLayerColors(prev => ({ ...prev, [id]: def.fill }))
  }

  const [layerStrokes, setLayerStrokes] = useState(() => {
    const s = {}
    for (const L of LAYERS) {
      if (L.hasStroke) s[L.id] = { ...(DEFAULT_LAYER_STROKES[L.id] || { color: '#1a1a18', width: 0.1, enabled: false }) }
    }
    return s
  })
  const setLayerStroke = (id, patch) => setLayerStrokes(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const [luColors, setLuColors] = useState(() => {
    const c = {}
    for (const L of LAND_USE) c[L.id] = L.fill
    return c
  })
  const setLuColor = (id, val) => setLuColors(prev => ({ ...prev, [id]: val }))
  const resetLuColor = (id) => {
    const def = LAND_USE.find(L => L.id === id)
    if (def) setLuColors(prev => ({ ...prev, [id]: def.fill }))
  }


  // Ground color drives both the ground plane and the canvas background —
  // so off-map area always reads as a single base color.
  const bgColor = layerColors.ground

  const [openSections, setOpenSections] = useState({
    Streets: true, Blocks: true, Paths: false, Features: false, Labels: false,
  })
  const toggleSection = (name) => setOpenSections(prev => ({ ...prev, [name]: !prev[name] }))

  // Hydrate local state from overlay.design once the store loads it. We merge
  // over defaults so newly-added layers keep their default until the user
  // overrides them. Only runs once — guarded by hydratedRef.
  const hydratedRef = useRef(false)
  useEffect(() => {
    const apply = () => {
      const s = useCartographStore.getState()
      if (!s._designHydrated) return false
      if (s.layerVis && Object.keys(s.layerVis).length)
        setLayerVis(prev => ({ ...prev, ...s.layerVis }))
      if (s.layerColors && Object.keys(s.layerColors).length)
        setLayerColors(prev => ({ ...prev, ...s.layerColors }))
      if (s.layerStrokes && Object.keys(s.layerStrokes).length)
        setLayerStrokes(prev => ({ ...prev, ...s.layerStrokes }))
      if (s.luColors && Object.keys(s.luColors).length)
        setLuColors(prev => ({ ...prev, ...s.luColors }))
      if (s.openSections && Object.keys(s.openSections).length)
        setOpenSections(prev => ({ ...prev, ...s.openSections }))
      hydratedRef.current = true
      return true
    }
    if (apply()) return
    const unsub = useCartographStore.subscribe((s) => {
      if (s._designHydrated && !hydratedRef.current) {
        if (apply()) unsub()
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    useCartographStore.setState({ layerVis, layerColors, layerStrokes, luColors, bgColor, openSections })
    // Persist only after hydration — the first sync mirrors hydrated values
    // back to the store and would otherwise echo a redundant write.
    if (hydratedRef.current) useCartographStore.getState()._saveDesignDebounced()
  }, [layerVis, layerColors, layerStrokes, luColors, bgColor, openSections])

  const isToolActive = tool === 'surveyor' || tool === 'measure'

  return (
    <div className="carto-panel">
      <h1>{tool === 'surveyor' ? 'Survey' : tool === 'measure' ? 'Measure' : 'Cartograph'}</h1>

      {/* ── Tool-specific panels ── */}
      {tool === 'surveyor' && <SurveyorPanel />}
      {tool === 'measure' && <MeasurePanel />}

      {/* ── Map controls (only shown when no authoring tool is active) ── */}
      {!isToolActive && (
        <>
          <Section name="Streets" open={openSections.Streets} onToggle={toggleSection}
            visState={sectionState(STREETS)} onToggleVis={() => toggleSectionVis(STREETS)}>
            {STREETS.map(L => (
              <LayerRow key={L.id} L={L}
                layerVis={layerVis} toggleVis={toggleVis}
                layerColors={layerColors} setLayerColor={setLayerColor} resetLayerColor={resetLayerColor}
                layerStrokes={layerStrokes} setLayerStroke={setLayerStroke} />
            ))}
          </Section>

          <Section name="Blocks" open={openSections.Blocks} onToggle={toggleSection}
            visState={sectionState(BLOCKS)} onToggleVis={() => toggleSectionVis(BLOCKS)}>
            {BLOCKS.map(L => (
              <LayerRow key={L.id} L={L}
                layerVis={layerVis} toggleVis={toggleVis}
                layerColors={layerColors} setLayerColor={setLayerColor} resetLayerColor={resetLayerColor}
                layerStrokes={layerStrokes} setLayerStroke={setLayerStroke} />
            ))}
            <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8, marginBottom: 2 }}>Land Use</div>
            {LAND_USE.map(L => (
              <div key={L.id} className="carto-row">
                <label className="carto-label carto-landuse-indent">{L.label}</label>
                <input type="color" className="carto-color" value={luColors[L.id]}
                  onInput={e => setLuColor(L.id, e.target.value)} />
                <button className="carto-btn-reset" title="Reset"
                  onClick={() => resetLuColor(L.id)}>&#x21BA;</button>
              </div>
            ))}
          </Section>

          <Section name="Paths" open={openSections.Paths} onToggle={toggleSection}
            visState={sectionState(PATHS)} onToggleVis={() => toggleSectionVis(PATHS)}>
            {PATHS.map(L => (
              <LayerRow key={L.id} L={L}
                layerVis={layerVis} toggleVis={toggleVis}
                layerColors={layerColors} setLayerColor={setLayerColor} resetLayerColor={resetLayerColor}
                layerStrokes={layerStrokes} setLayerStroke={setLayerStroke} />
            ))}
          </Section>

          <Section name="Features" open={openSections.Features} onToggle={toggleSection}
            visState={sectionState(FEATURES)} onToggleVis={() => toggleSectionVis(FEATURES)}>
            {FEATURES.map(L => (
              <LayerRow key={L.id} L={L}
                layerVis={layerVis} toggleVis={toggleVis}
                layerColors={layerColors} setLayerColor={setLayerColor} resetLayerColor={resetLayerColor}
                layerStrokes={layerStrokes} setLayerStroke={setLayerStroke} />
            ))}
          </Section>

          <Section name="Labels" open={openSections.Labels} onToggle={toggleSection}
            visState={sectionState(LABELS)} onToggleVis={() => toggleSectionVis(LABELS)}>
            {LABELS.map(L => (
              <LayerRow key={L.id} L={L}
                layerVis={layerVis} toggleVis={toggleVis}
                layerColors={layerColors} setLayerColor={setLayerColor} resetLayerColor={resetLayerColor}
                layerStrokes={layerStrokes} setLayerStroke={setLayerStroke} />
            ))}
          </Section>

        </>
      )}
    </div>
  )
}

// Collapsible section wrapper. Header click toggles open/close. The eye
// button on the right batch-hides/shows every layer in the section.
//   visState: 'on' = all visible, 'off' = all hidden, 'mixed' = partial.
function Section({ name, open, onToggle, children, visState, onToggleVis }) {
  return (
    <div className="carto-section">
      <h2 className="carto-section-header">
        <span className="carto-section-title" onClick={() => onToggle(name)}>
          <span className="carto-section-caret" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</span>
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

// Reusable per-layer row: visibility + color + expandable stroke controls.
function LayerRow({ L, layerVis, toggleVis, layerColors, setLayerColor, resetLayerColor, layerStrokes, setLayerStroke }) {
  return (
    <div>
      <div className="carto-row">
        <input type="checkbox" className="carto-checkbox"
          checked={layerVis[L.id]} onChange={() => toggleVis(L.id)} />
        <label className="carto-label" onClick={() => toggleVis(L.id)}>{L.label}</label>
        {!L.noColor && (
          <>
            <input type="color" className="carto-color" value={layerColors[L.id]}
              onInput={e => setLayerColor(L.id, e.target.value)} />
            <button className="carto-btn-reset" title="Reset color"
              onClick={() => resetLayerColor(L.id)}>&#x21BA;</button>
          </>
        )}
      </div>
      {L.hasStroke && layerStrokes[L.id] && (
        <div className="carto-row" style={{ paddingLeft: 24, fontSize: 10, color: '#888', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" className="carto-checkbox"
            checked={layerStrokes[L.id].enabled}
            onChange={e => setLayerStroke(L.id, { enabled: e.target.checked })} />
          <span style={{ flex: 1 }}>Stroke</span>
          <input type="color" className="carto-color" value={layerStrokes[L.id].color}
            onInput={e => setLayerStroke(L.id, { color: e.target.value })} />
          <button className="carto-btn-reset" title="Thinner"
            onClick={() => setLayerStroke(L.id, { width: Math.max(0, +(layerStrokes[L.id].width - 0.05).toFixed(2)) })}>−</button>
          <span style={{ minWidth: 38, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {layerStrokes[L.id].width.toFixed(2)}m
          </span>
          <button className="carto-btn-reset" title="Thicker"
            onClick={() => setLayerStroke(L.id, { width: Math.min(2, +(layerStrokes[L.id].width + 0.05).toFixed(2)) })}>+</button>
        </div>
      )}
    </div>
  )
}
