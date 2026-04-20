import useCartographStore from './stores/useCartographStore.js'
import { defaultMeasure, sideToStripes, CURB_WIDTH, BAND_COLORS, BAND_LABELS } from './streetProfiles.js'
import ribbonsRaw from '../data/ribbons.json'

function fmtFt(m) { return (m * 3.28084).toFixed(1) + 'ft' }

const PIPELINE_MEASURE = (() => {
  const m = new Map()
  for (const st of (ribbonsRaw.streets || [])) {
    if (st.name && st.measure) m.set(st.name, st.measure)
  }
  return m
})()

function getMeasure(st) {
  if (st.measure) return st.measure
  const fromPipeline = PIPELINE_MEASURE.get(st.name)
  if (fromPipeline) {
    return {
      left: { ...fromPipeline.left },
      right: { ...fromPipeline.right },
      symmetric: fromPipeline.left.terminal === fromPipeline.right.terminal
        && Math.abs(fromPipeline.left.treelawn - fromPipeline.right.treelawn) < 0.01
        && Math.abs(fromPipeline.left.sidewalk - fromPipeline.right.sidewalk) < 0.01,
    }
  }
  return defaultMeasure(st.type || 'residential')
}

const FT = 0.3048

function SideBlock({ sideKey, side, onChange, onReset, canReset, editable }) {
  const stripes = sideToStripes(side)

  const setTerminal = (term) => {
    const next = { ...side, terminal: term }
    if (term === 'none') { next.treelawn = 0; next.sidewalk = 0 }
    if (term === 'lawn' && side.treelawn > 0) {
      next.sidewalk = side.sidewalk + side.treelawn
      next.treelawn = 0
    }
    if ((term === 'sidewalk' || term === 'lawn') && next.sidewalk <= 0.05) {
      next.sidewalk = 5 * FT
    }
    onChange(next)
  }

  return (
    <div className="carto-side-block">
      <div className="carto-row">
        <label className="carto-label-fixed">
          {sideKey === 'left' ? 'Left' : 'Right'}
        </label>
        <select className="carto-select"
          disabled={!editable}
          value={side.terminal || 'none'}
          onChange={e => setTerminal(e.target.value)}>
          <option value="none">None (no pedestrian zone)</option>
          <option value="sidewalk">Sidewalk</option>
          <option value="lawn">Lawn</option>
        </select>
        {canReset && (
          <button className="carto-btn-reset"
            title="Reset this side to the pipeline default"
            onClick={onReset}>↺</button>
        )}
      </div>
      <div className="carto-band-list">
        {stripes.map((s, i) => (
          <div key={i} className="carto-row">
            <span className="carto-band-swatch"
              style={{ background: BAND_COLORS[s.material] || '#888' }} />
            <label className="carto-label">{BAND_LABELS[s.material] || s.material}</label>
            <span className="carto-band-width">
              {fmtFt(s.outerR - s.innerR)}
              {s.material === 'curb' ? ' (fixed)' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MeasurePanel() {
  const selectedStreet = useCartographStore(s => s.selectedStreet)
  const centerlineData = useCartographStore(s => s.centerlineData)

  if (selectedStreet === null) {
    return (
      <div className="carto-section">
        <h2>Cross-Section</h2>
        <div className="carto-hint">
          Click a centerline to select a street. Handles appear at every stripe boundary — drag to resize. Double-click between handles to insert a boundary. Right-click a handle to remove. Default mode mirrors both sides; toggle Asymmetrical to edit independently.
        </div>
      </div>
    )
  }

  const st = centerlineData.streets[selectedStreet]
  if (!st) return null

  const measure = getMeasure(st)
  const hasMeasured = !!st.measure
  const symmetric = measure.symmetric !== false

  function updateMeasure(patch) {
    if (!st.measure) st.measure = getMeasure(st)
    Object.assign(st.measure, patch)
    useCartographStore.setState({ centerlineData: { ...centerlineData, streets: [...centerlineData.streets] } })
    useCartographStore.getState()._saveCenterlines()
  }

  function updateSide(sideKey, newSide) {
    if (!st.measure) st.measure = getMeasure(st)
    const patch = { [sideKey]: newSide }
    if (symmetric) {
      // Mirror to the other side
      const other = sideKey === 'left' ? 'right' : 'left'
      patch[other] = { ...newSide }
    }
    Object.assign(st.measure, patch)
    useCartographStore.setState({ centerlineData: { ...centerlineData, streets: [...centerlineData.streets] } })
    useCartographStore.getState()._saveCenterlines()
  }

  function toggleAsymmetric() {
    updateMeasure({ symmetric: !symmetric })
  }

  function resetToDefault() {
    delete st.measure
    useCartographStore.setState({ centerlineData: { ...centerlineData, streets: [...centerlineData.streets] } })
    useCartographStore.getState()._saveCenterlines()
  }

  // Per-side reset: restore one side to the pipeline default, leaving the
  // other side untouched. Recovery affordance for handle collapses or any
  // edit the operator wants to undo without losing the other side's work.
  //
  // Even when symmetric is on, this acts on one side only — that's the
  // whole point of a per-side button. We also flip symmetric off so that
  // future drags don't immediately mirror the reset away. The user can
  // re-enable Asymmetrical → off to re-link if they want.
  function resetSide(sideKey) {
    const fromPipeline = PIPELINE_MEASURE.get(st.name)
    const restored = fromPipeline ? { ...fromPipeline[sideKey] } : defaultMeasure(st.type || 'residential')[sideKey]
    if (!st.measure) st.measure = getMeasure(st)
    st.measure[sideKey] = restored
    if (symmetric) st.measure.symmetric = false
    useCartographStore.setState({ centerlineData: { ...centerlineData, streets: [...centerlineData.streets] } })
    useCartographStore.getState()._saveCenterlines()
  }

  function copyMeasure() {
    useCartographStore.setState({
      _copiedProfile: JSON.parse(JSON.stringify(measure)),
      status: 'Measure copied: ' + st.name,
    })
  }
  function pasteMeasure() {
    const copied = useCartographStore.getState()._copiedProfile
    if (!copied) return
    st.measure = JSON.parse(JSON.stringify(copied))
    useCartographStore.setState({ centerlineData: { ...centerlineData, streets: [...centerlineData.streets] }, status: 'Measure pasted' })
    useCartographStore.getState()._saveCenterlines()
  }

  return (
    <div className="carto-section">
      <h2>
        {st.name || 'Unnamed'}{' '}
        <span className="count">{st.type || 'residential'}</span>
      </h2>

      <div className="carto-row">
        <input type="checkbox" className="carto-checkbox"
          checked={!symmetric}
          onChange={toggleAsymmetric} />
        <label className="carto-label">Asymmetrical (unlock sides)</label>
      </div>

      <SideBlock sideKey="left" side={measure.left} editable={!symmetric || true}
        onChange={s => updateSide('left', s)}
        onReset={() => resetSide('left')} canReset={hasMeasured} />
      <SideBlock sideKey="right" side={measure.right} editable={!symmetric || true}
        onChange={s => updateSide('right', s)}
        onReset={() => resetSide('right')} canReset={hasMeasured} />

      <div className="carto-actions">
        {hasMeasured && <button className="carto-btn-sm" onClick={resetToDefault}>Reset</button>}
        <button className="carto-btn-sm" onClick={copyMeasure}>Copy</button>
        {useCartographStore.getState()._copiedProfile && (
          <button className="carto-btn-sm accent" onClick={pasteMeasure}>Paste</button>
        )}
      </div>

      <div className="carto-meta">
        {hasMeasured ? 'Measured' : 'Default'} · {symmetric ? 'symmetric' : 'asymmetrical'} · curb={fmtFt(CURB_WIDTH)} (fixed)
      </div>
    </div>
  )
}
