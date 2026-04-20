import { useState, useEffect } from 'react'
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

  useEffect(() => {
    useCartographStore.setState({ layerVis, layerColors, layerStrokes, luColors, bgColor })
  }, [layerVis, layerColors, layerStrokes, luColors, bgColor])

  const [openSections, setOpenSections] = useState({
    Streets: true, Blocks: true, Paths: false, Features: false, Labels: false,
  })
  const toggleSection = (name) => setOpenSections(prev => ({ ...prev, [name]: !prev[name] }))

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
          <Section name="Streets" open={openSections.Streets} onToggle={toggleSection}>
            {STREETS.map(L => (
              <LayerRow key={L.id} L={L}
                layerVis={layerVis} toggleVis={toggleVis}
                layerColors={layerColors} setLayerColor={setLayerColor} resetLayerColor={resetLayerColor}
                layerStrokes={layerStrokes} setLayerStroke={setLayerStroke} />
            ))}
          </Section>

          <Section name="Blocks" open={openSections.Blocks} onToggle={toggleSection}>
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

          <Section name="Paths" open={openSections.Paths} onToggle={toggleSection}>
            {PATHS.map(L => (
              <LayerRow key={L.id} L={L}
                layerVis={layerVis} toggleVis={toggleVis}
                layerColors={layerColors} setLayerColor={setLayerColor} resetLayerColor={resetLayerColor}
                layerStrokes={layerStrokes} setLayerStroke={setLayerStroke} />
            ))}
          </Section>

          <Section name="Features" open={openSections.Features} onToggle={toggleSection}>
            {FEATURES.map(L => (
              <LayerRow key={L.id} L={L}
                layerVis={layerVis} toggleVis={toggleVis}
                layerColors={layerColors} setLayerColor={setLayerColor} resetLayerColor={resetLayerColor}
                layerStrokes={layerStrokes} setLayerStroke={setLayerStroke} />
            ))}
          </Section>

          <Section name="Labels" open={openSections.Labels} onToggle={toggleSection}>
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

// Collapsible section wrapper. Click the header to toggle open/closed.
function Section({ name, open, onToggle, children }) {
  return (
    <div className="carto-section">
      <h2 onClick={() => onToggle(name)} style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ display: 'inline-block', width: 10, transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 120ms', fontSize: 10 }}>▸</span>
        {name}
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
