import useCartographStore from './stores/useCartographStore.js'

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
  const setAnchor = useCartographStore(s => s.setAnchor)

  if (selectedStreet === null) {
    return (
      <div className="carto-section">
        <h2>Survey</h2>
        <div className="carto-hint">
          Click a street to select it.
        </div>
      </div>
    )
  }

  const st = centerlineData.streets[selectedStreet]
  if (!st) return null

  return (
    <div className="carto-section">
      <h2>Survey</h2>

      <div className="carto-row">
        <label className="carto-label-fixed">Name</label>
        <input type="text" className="carto-input"
          value={st.name || ''}
          onChange={e => updateStreetField('name', e.target.value)} />
      </div>

      <div className="carto-row">
        <label className="carto-label-fixed">Type</label>
        <select className="carto-select"
          value={st.type || 'residential'}
          onChange={e => updateStreetField('type', e.target.value)}>
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="carto-row">
        <input type="checkbox" className="carto-checkbox" checked={!!st.oneway}
          onChange={e => updateStreetField('oneway', e.target.checked)} />
        <label className="carto-label">One-way</label>
      </div>

      {/* Anchor: where the chain centerline sits relative to the cross-section.
          'center' (default) = ribbon grows symmetrically. 'inner-edge' (auto-set
          for divided carriageways) = ribbon grows outward only from the
          median-facing edge. Auto-detected from corridor pairing; operator can
          override. innerSign != 0 means a paired chain was detected. */}
      <div className="carto-row">
        <label className="carto-label-fixed">Anchor</label>
        <select className="carto-select"
          value={st.anchor || 'center'}
          onChange={e => setAnchor(selectedStreet, e.target.value)}>
          <option value="center">Center (symmetric ribbon)</option>
          <option value="inner-edge" disabled={!st.innerSign}>
            Inner-edge {st.innerSign ? '' : '(no paired chain detected)'}
          </option>
        </select>
      </div>

      {/* Per-endpoint cap: None = connected to other geometry, Round = cul-de-sac,
          Blunt = flat termination. Operator sets these per-endpoint. */}
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
        <label className="carto-label-fixed">Smooth</label>
        <input type="range" className="carto-input" min="0" max="1" step="0.05"
          value={st.smooth || 0}
          onChange={e => updateStreetField('smooth', parseFloat(e.target.value))} />
        <span className="carto-meta" style={{ minWidth: 32, textAlign: 'right' }}>
          {(st.smooth || 0).toFixed(2)}
        </span>
      </div>

      <div className="carto-meta">
        {st.points.length} nodes
        {(() => {
          const couplers = (st.couplers || []).map(c => typeof c === 'number' ? c : c?.pointIdx).filter(Number.isFinite)
          const segs = couplers.length + 1
          return ` · ${couplers.length} coupler${couplers.length === 1 ? '' : 's'} · ${segs} segment${segs === 1 ? '' : 's'}`
        })()}
        {selectedNode !== null ? ' · node ' + selectedNode : ''}
      </div>
      <div className="carto-hint">
        Ctrl/⌘-click an interior node to toggle a coupler.
      </div>
    </div>
  )
}
