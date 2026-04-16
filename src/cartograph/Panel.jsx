import { useState, useEffect } from 'react'
import useCartographStore from './stores/useCartographStore.js'
import SurveyorPanel from './SurveyorPanel.jsx'
import MeasurePanel from './MeasurePanel.jsx'
import StagePanelReal, { defaultKeyframes } from './StagePanel.jsx'

// ── Layer definitions (from render.js LD array) ─────────────
const LAYERS = [
  { id: 'aerial',     label: 'Aerial',       fill: '#446688', noColor: true },
  { id: 'ground',     label: 'Ground',       fill: '#2a2a26' },
  { id: 'sidewalk',   label: 'Sidewalks',    fill: '#7a756a' },
  { id: 'lot',        label: 'Blocks',       fill: '#3a4a2a' },
  { id: 'park',       label: 'Park',         fill: '#2a4a1a' },
  { id: 'curb',       label: 'Curb',         fill: '#555550' },
  { id: 'street',     label: 'Streets',      fill: '#3a3a38' },
  { id: 'alley',      label: 'Alleys',       fill: '#353532' },
  { id: 'building',   label: 'Buildings',    fill: '#2a2a28' },
  { id: 'stripe',     label: 'Center Lines', fill: '#c8b430' },
  { id: 'edgeline',   label: 'Edge Lines',   fill: '#888888' },
  { id: 'bikelane',   label: 'Bike Lanes',   fill: '#44aa88' },
  { id: 'centerline', label: 'Centerlines',  fill: '#ffffff' },
  { id: 'labels',     label: 'Labels',       fill: '#666666' },
  { id: 'footway',    label: 'Paths/Walks',  fill: '#666655' },
  { id: 'lamp',       label: 'Streetlamps',  fill: '#ffdd44' },
  { id: 'tree',       label: 'Trees',        fill: '#2a5528' },
]

const LAND_USE = [
  { id: 'residential',  label: 'Residential',  fill: '#3a4a2a' },
  { id: 'commercial',   label: 'Commercial',   fill: '#4a4438' },
  { id: 'vacant',       label: 'Vacant',       fill: '#2a3020' },
  { id: 'vacant-com',   label: 'Vacant Com.',  fill: '#3a3830' },
  { id: 'parking',      label: 'Parking',      fill: '#3a3a38' },
  { id: 'institutional',label: 'Institutional', fill: '#3a3a4a' },
  { id: 'recreation',   label: 'Recreation',   fill: '#2a3a1a' },
  { id: 'industrial',   label: 'Industrial',   fill: '#4a4040' },
]

export default function Panel() {
  const mode = useCartographStore(s => s.mode)

  const [layerVis, setLayerVis] = useState(() => {
    const v = {}
    for (const L of LAYERS) v[L.id] = true
    v.centerline = false
    v.aerial = false
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

  const [bgColor, setBgColor] = useState('#1a1a18')

  useEffect(() => {
    useCartographStore.setState({ layerVis, layerColors, luColors, bgColor })
  }, [layerVis, layerColors, luColors, bgColor])

  const isToolMode = mode === 'surveyor' || mode === 'measure' || mode === 'stage'

  return (
    <div className="carto-panel">
      <h1>{mode === 'surveyor' ? 'Surveyor' : mode === 'measure' ? 'Measure' : mode === 'stage' ? 'Stage' : 'Cartograph'}</h1>

      {/* ── Tool-specific panels ── */}
      {mode === 'surveyor' && <SurveyorPanel />}
      {mode === 'measure' && <MeasurePanel />}
      {/* Stage panel rendered separately — see CartographApp */}

      {/* ── Map controls (only shown when not in a tool mode) ── */}
      {!isToolMode && (
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
                <label className="carto-label" style={{ paddingLeft: 20 }}>{L.label}</label>
                <input type="color" className="carto-color" value={luColors[L.id]}
                  onInput={e => setLuColor(L.id, e.target.value)} />
                <button className="carto-btn-reset" title="Reset"
                  onClick={() => resetLuColor(L.id)}>&#x21BA;</button>
              </div>
            ))}
          </div>

          {/* ── Background ─────────────────────────────────────── */}
          <div className="carto-section">
            <div className="carto-row">
              <label className="carto-label">Background</label>
              <input type="color" className="carto-color" value={bgColor}
                onInput={e => setBgColor(e.target.value)} />
              <button className="carto-btn-reset" title="Reset"
                onClick={() => setBgColor('#1a1a18')}>&#x21BA;</button>
            </div>
          </div>

          {/* ── Launch ────────────────────────────────────────── */}
          <div style={{ marginTop: 16 }}>
            <button className="carto-btn-launch"
              onClick={() => window.open('/', '_blank')}>
              Launch Hero View
            </button>
          </div>
        </>
      )}
    </div>
  )
}
