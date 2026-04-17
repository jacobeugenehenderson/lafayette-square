import { useState, useEffect } from 'react'
import useCartographStore from './stores/useCartographStore.js'
import SurveyorPanel from './SurveyorPanel.jsx'
import MeasurePanel from './MeasurePanel.jsx'
import StagePanelReal, { defaultKeyframes } from './StagePanel.jsx'
import { DEFAULT_LAYER_COLORS, DEFAULT_LU_COLORS } from './m3Colors.js'

// ── Layer definitions — labels + order; colors come from DEFAULT_LAYER_COLORS.
const LAYER_DEFS = [
  // aerial moved to the toolbar (orientation aid, not a styling layer)
  { id: 'ground',     label: 'Ground' },
  { id: 'sidewalk',   label: 'Sidewalks' },
  { id: 'lot',        label: 'Blocks' },
  { id: 'park',       label: 'Park' },
  { id: 'curb',       label: 'Curb' },
  { id: 'street',     label: 'Streets' },
  { id: 'alley',      label: 'Alleys' },
  { id: 'building',   label: 'Buildings' },
  { id: 'stripe',     label: 'Center Stripes' },
  { id: 'edgeline',   label: 'Edge Lines' },
  { id: 'bikelane',   label: 'Bike Lanes' },
  { id: 'centerline', label: 'Centerlines' },
  { id: 'labels',     label: 'Labels' },
  { id: 'footway',    label: 'Paths/Walks' },
  // lamp / tree / labels intentionally omitted until each has its own authoring
  // section (light color+intensity for lamps, foliage material for trees,
  // typography for labels — not a single color picker).
]
const LAYERS = LAYER_DEFS.map(L => ({ ...L, fill: DEFAULT_LAYER_COLORS[L.id] }))

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
    useCartographStore.setState({ layerVis, layerColors, luColors, bgColor })
  }, [layerVis, layerColors, luColors, bgColor])

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
          {/* ── Layers ─────────────────────────────────────────── */}
          <div className="carto-section">
            <h2>Layers</h2>
            {LAYERS.map(L => (
              <div key={L.id} className="carto-row">
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
            ))}
          </div>

          {/* ── Land Use ───────────────────────────────────────── */}
          <div className="carto-section">
            <h2>Land Use</h2>
            {LAND_USE.map(L => (
              <div key={L.id} className="carto-row">
                <label className="carto-label carto-landuse-indent">{L.label}</label>
                <input type="color" className="carto-color" value={luColors[L.id]}
                  onInput={e => setLuColor(L.id, e.target.value)} />
                <button className="carto-btn-reset" title="Reset"
                  onClick={() => resetLuColor(L.id)}>&#x21BA;</button>
              </div>
            ))}
          </div>

        </>
      )}
    </div>
  )
}
