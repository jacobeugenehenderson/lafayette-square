import useCartographStore from './stores/useCartographStore.js'
import { defaultMeasure, sideToStripes, CURB_WIDTH, BAND_COLORS, BAND_LABELS, segmentRangesForCouplers, measureForSegment } from './streetProfiles.js'
import ribbonsRaw from '../data/ribbons.json'

function fmtFt(m) { return (m * 3.28084).toFixed(1) + 'ft' }

const PIPELINE_MEASURE = (() => {
  const m = new Map()
  for (const st of (ribbonsRaw.streets || [])) {
    if (st.name && st.measure) m.set(st.name, st.measure)
  }
  return m
})()

function chainMeasure(st) {
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
function getMeasure(st, ordinal) {
  return (Number.isFinite(ordinal) && measureForSegment(st, ordinal)) || chainMeasure(st)
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
  const selectedOrdinal = useCartographStore(s => s.selectedSegmentOrdinal)
  const centerlineData = useCartographStore(s => s.centerlineData)
  const setSegmentMeasure = useCartographStore(s => s.setSegmentMeasure)

  if (selectedStreet === null) {
    return (
      <div className="carto-section">
        <h2>Cross-Section</h2>
        <div className="carto-hint">
          Click a centerline to select a street. Handles appear at every stripe boundary — drag to resize. Ctrl/⌘-click (or right-click) a handle to remove it; same gesture in an empty band to add a boundary. Default mode mirrors both sides; toggle Asymmetrical to edit independently.
        </div>
      </div>
    )
  }

  const st = centerlineData.streets[selectedStreet]
  if (!st) return null

  // Active segment by ordinal. Falls back to first segment if nothing clicked.
  const allRanges = segmentRangesForCouplers(st.points, st.couplers || [])
  const ordinal = Number.isFinite(selectedOrdinal) && selectedOrdinal >= 0 && selectedOrdinal < allRanges.length
    ? selectedOrdinal : 0

  const measure = getMeasure(st, ordinal)
  const hasMeasured = !!(st.segmentMeasures && st.segmentMeasures[String(ordinal)])
  const symmetric = measure.symmetric !== false

  function modify(updater) {
    setSegmentMeasure(selectedStreet, ordinal, updater, getMeasure(st, ordinal))
    useCartographStore.getState()._saveCenterlines()
  }

  function updateMeasure(patch) {
    modify(m => Object.assign(m, patch))
  }

  function updateSide(sideKey, newSide) {
    modify(m => {
      m[sideKey] = newSide
      if (symmetric) {
        const other = sideKey === 'left' ? 'right' : 'left'
        m[other] = { ...newSide }
      }
    })
  }

  function toggleAsymmetric() {
    updateMeasure({ symmetric: !symmetric })
  }

  function resetToDefault() {
    const sm = { ...(st.segmentMeasures || {}) }
    delete sm[String(ordinal)]
    const streets = centerlineData.streets.map((s, i) =>
      i === selectedStreet ? { ...s, segmentMeasures: sm } : s)
    useCartographStore.setState({ centerlineData: { ...centerlineData, streets } })
    useCartographStore.getState()._saveCenterlines()
  }

  function resetSide(sideKey) {
    const fromPipeline = PIPELINE_MEASURE.get(st.name)
    const restored = fromPipeline ? { ...fromPipeline[sideKey] } : defaultMeasure(st.type || 'residential')[sideKey]
    modify(m => {
      m[sideKey] = restored
      if (symmetric) m.symmetric = false
    })
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
    modify(m => Object.assign(m, JSON.parse(JSON.stringify(copied))))
    useCartographStore.setState({ status: 'Measure pasted' })
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
        {allRanges.length > 1 ? ` · segment ${ordinal + 1} of ${allRanges.length}` : ''}
      </div>
    </div>
  )
}
