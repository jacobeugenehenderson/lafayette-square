import useCartographStore from './stores/useCartographStore.js'

const FT = 0.3048
const SV_STREETS = {
  residential: { laneWidth: 10 * FT, parkingWidth: 7 * FT, gutterWidth: 1.5 * FT, lanes: 2 },
  secondary: { laneWidth: 11 * FT, parkingWidth: 7 * FT, gutterWidth: 1.5 * FT, lanes: 2 },
  primary: { laneWidth: 11 * FT, parkingWidth: 8 * FT, gutterWidth: 1.5 * FT, lanes: 4 },
  service: { laneWidth: 7.5 * FT, parkingWidth: 0, gutterWidth: 0, lanes: 2 },
  footway: { laneWidth: 3 * FT, parkingWidth: 0, gutterWidth: 0, lanes: 1 },
  cycleway: { laneWidth: 5 * FT, parkingWidth: 0, gutterWidth: 0, lanes: 1 },
  pedestrian: { laneWidth: 5 * FT, parkingWidth: 0, gutterWidth: 0, lanes: 1 },
  steps: { laneWidth: 4 * FT, parkingWidth: 0, gutterWidth: 0, lanes: 1 },
}
const SV_TREELAWN = 4.5 * FT, SV_SIDEWALK = 5 * FT, SV_CURB = 6 * 0.0254

function crossSection(type) {
  const sp = SV_STREETS[type] || SV_STREETS.residential
  const pav = (sp.lanes / 2) * sp.laneWidth + sp.parkingWidth + sp.gutterWidth
  return {
    pavement: pav,
    curb: pav + SV_CURB,
    treelawn: pav + SV_CURB + SV_TREELAWN,
    sidewalk: pav + SV_CURB + SV_TREELAWN + SV_SIDEWALK,
  }
}

const TYPES = [
  ['residential', 'Residential'], ['secondary', 'Secondary'], ['primary', 'Primary'],
  ['service', 'Service/Alley'], ['footway', 'Footway'], ['cycleway', 'Cycleway'],
  ['pedestrian', 'Pedestrian'], ['steps', 'Steps'],
]

export default function SurveyorPanel() {
  const selectedStreet = useCartographStore(s => s.selectedStreet)
  const selectedNode = useCartographStore(s => s.selectedNode)
  const centerlineData = useCartographStore(s => s.centerlineData)
  const updateStreetField = useCartographStore(s => s.updateStreetField)
  const toggleNodeHidden = useCartographStore(s => s.toggleNodeHidden)
  const toggleStreetDisabled = useCartographStore(s => s.toggleStreetDisabled)
  const revertStreet = useCartographStore(s => s.revertStreet)
  const undoStreet = useCartographStore(s => s.undoStreet)
  const splitAtNode = useCartographStore(s => s.splitAtNode)

  if (selectedStreet === null) {
    return (
      <div className="carto-section">
        <h2>Survey</h2>
        <div className="carto-hint">
          Click a street to select it. Drag nodes to edit.
        </div>
      </div>
    )
  }

  const st = centerlineData.streets[selectedStreet]
  if (!st) return null

  const cs = crossSection(st.type || 'residential')
  const smoothVal = Math.round((st.smooth || 0) * 100)

  return (
    <div className="carto-section">
      <h2>Survey</h2>

      {/* Name */}
      <div className="carto-row">
        <label className="carto-label-fixed">Name</label>
        <input type="text" className="carto-input"
          value={st.name || ''}
          onChange={e => updateStreetField('name', e.target.value)} />
      </div>

      {/* Type */}
      <div className="carto-row">
        <label className="carto-label-fixed">Type</label>
        <select className="carto-select"
          value={st.type || 'residential'}
          onChange={e => updateStreetField('type', e.target.value)}>
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* Checkboxes */}
      <div className="carto-row">
        <input type="checkbox" className="carto-checkbox" checked={!!st.oneway}
          onChange={e => updateStreetField('oneway', e.target.checked)} />
        <label className="carto-label">One-way</label>
      </div>

      {/* Per-endpoint cap: None = connected to other geometry, Round = cul-de-sac,
          Blunt = flat termination. Operator sets these per-endpoint — no auto-detection. */}
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

      <div className="carto-row">
        <input type="checkbox" className="carto-checkbox" checked={!!st.loop}
          onChange={e => updateStreetField('loop', e.target.checked)} />
        <label className="carto-label">Loop</label>
      </div>

      {/* Smooth slider */}
      <div className="carto-row">
        <label className="carto-label-fixed">Smooth</label>
        <input type="range" className="carto-range" min="0" max="100"
          value={smoothVal}
          onInput={e => {
            const v = +e.target.value / 100
            const { centerlineData } = useCartographStore.getState()
            centerlineData.streets[selectedStreet].smooth = v
            useCartographStore.setState({ centerlineData: { ...centerlineData } })
          }}
          onChange={() => { useCartographStore.getState()._saveCenterlines() }} />
        <span className="carto-slider-value">{smoothVal}</span>
      </div>

      {/* Action buttons */}
      <div className="carto-actions">
        <button className="carto-btn-sm" onClick={undoStreet}>
          Undo (⌘Z)
        </button>
        {selectedNode !== null && selectedNode > 0 && selectedNode < st.points.length - 1 && (
          <button className="carto-btn-sm accent" onClick={splitAtNode}>
            Split Here
          </button>
        )}
        <button className="carto-btn-sm"
          onClick={() => { if (selectedNode !== null) toggleNodeHidden(selectedNode) }}>
          Toggle Node
        </button>
        <button className="carto-btn-sm danger" onClick={toggleStreetDisabled}>
          Toggle Street
        </button>
        <button className="carto-btn-sm" onClick={revertStreet}>
          Revert
        </button>
      </div>

      {/* Status line */}
      <div className="carto-meta">
        {st.points.length} nodes
        {st.source ? ' \u00b7 ' + st.source : ''}
        {' \u00b7 pav=' + cs.pavement.toFixed(1) + 'm sw=' + cs.sidewalk.toFixed(1) + 'm'}
        {selectedNode !== null ? ' \u00b7 node ' + selectedNode : ''}
      </div>
    </div>
  )
}
