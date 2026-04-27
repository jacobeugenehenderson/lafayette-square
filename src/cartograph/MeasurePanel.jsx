import { useState, useEffect } from 'react'
import useCartographStore from './stores/useCartographStore.js'
import { defaultMeasure, CURB_WIDTH, BAND_COLORS, segmentRangesForCouplers, measureForSegment } from './streetProfiles.js'
import ribbonsRaw from '../data/ribbons.json'

const FT_PER_M = 3.28084
const M_PER_FT = 0.3048
const fmtFt = (m) => (m * FT_PER_M).toFixed(1)

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

// Infer terminal from numeric values so the operator never has to set it.
//   treelawn > 0 → 'sidewalk' (asphalt + curb + treelawn + sidewalk band)
//   only sidewalk → 'lawn'    (asphalt + curb + sidewalk band, no treelawn)
//   nothing → 'none'          (asphalt + curb, no ped zone)
function inferTerminal(side) {
  const tl = side.treelawn || 0
  const sw = side.sidewalk || 0
  if (tl > 0.01) return 'sidewalk'
  if (sw > 0.01) return 'lawn'
  return 'none'
}

// One editable numeric row. Local state for typing; commit on blur or Enter.
// Empty/non-numeric reverts to the previous value.
function NumberRow({ label, swatch, valueM, onCommit, readOnly }) {
  const [text, setText] = useState(fmtFt(valueM))
  // Re-sync external changes (e.g. a drag handle moves) into the input.
  useEffect(() => { setText(fmtFt(valueM)) }, [valueM])

  const commit = () => {
    const parsed = parseFloat(text)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setText(fmtFt(valueM)); return
    }
    const meters = parsed * M_PER_FT
    if (Math.abs(meters - valueM) < 0.001) {
      setText(fmtFt(valueM)); return
    }
    onCommit(meters)
  }

  return (
    <div className="carto-row carto-band-row">
      <span className="carto-band-swatch"
        style={{ background: swatch || '#888' }} />
      <label className="carto-label">{label}</label>
      {readOnly ? (
        <span className="carto-band-width">{text}</span>
      ) : (
        <input
          type="text"
          className="carto-band-input"
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
        />
      )}
      <span className="carto-band-unit">ft</span>
    </div>
  )
}

function SideBlock({ sideKey, side, onChange, single }) {
  const cw = Number.isFinite(side.curb) ? side.curb : CURB_WIDTH
  const set = (patch) => {
    const next = { ...side, ...patch }
    next.terminal = inferTerminal(next)
    onChange(next)
  }

  return (
    <div className="carto-side-block">
      {!single && (
        <div className="carto-side-label">
          {sideKey === 'left' ? 'Left' : 'Right'}
        </div>
      )}
      <NumberRow label="Asphalt" swatch={BAND_COLORS.asphalt}
        valueM={side.pavementHW || 0}
        onCommit={v => set({ pavementHW: v })} />
      <NumberRow label="Curb" swatch={BAND_COLORS.curb}
        valueM={cw}
        onCommit={v => set({ curb: v })} />
      <NumberRow label="Treelawn" swatch={BAND_COLORS.treelawn}
        valueM={side.treelawn || 0}
        onCommit={v => set({ treelawn: v })} />
      <NumberRow label="Sidewalk" swatch={BAND_COLORS.sidewalk}
        valueM={side.sidewalk || 0}
        onCommit={v => set({ sidewalk: v })} />
    </div>
  )
}

export default function MeasurePanel() {
  const selectedStreet = useCartographStore(s => s.selectedStreet)
  const selectedOrdinal = useCartographStore(s => s.selectedSegmentOrdinal)
  const centerlineData = useCartographStore(s => s.centerlineData)
  const setSegmentMeasure = useCartographStore(s => s.setSegmentMeasure)
  const setStreetDisabled = useCartographStore(s => s.setStreetDisabled)

  if (selectedStreet === null) {
    return (
      <div className="carto-section">
        <h2>Cross-Section</h2>
      </div>
    )
  }

  const st = centerlineData.streets[selectedStreet]
  if (!st) return null

  const allRanges = segmentRangesForCouplers(st.points, st.couplers || [])
  const ordinal = Number.isFinite(selectedOrdinal) && selectedOrdinal >= 0 && selectedOrdinal < allRanges.length
    ? selectedOrdinal : 0

  const measure = getMeasure(st, ordinal)
  const hasMeasured = !!(st.segmentMeasures && st.segmentMeasures[String(ordinal)])
  const symmetric = measure.symmetric !== false

  function modify(updater) {
    setSegmentMeasure(selectedStreet, ordinal, updater, getMeasure(st, ordinal))
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
    modify(m => { m.symmetric = !symmetric })
  }

  function resetToDefault() {
    const sm = { ...(st.segmentMeasures || {}) }
    delete sm[String(ordinal)]
    const streets = centerlineData.streets.map((s, i) =>
      i === selectedStreet ? { ...s, segmentMeasures: sm } : s)
    useCartographStore.setState({ centerlineData: { ...centerlineData, streets } })
    useCartographStore.getState()._saveOverlay()
  }

  return (
    <div className="carto-section">
      <h2 className="carto-measure-header">
        <span>{st.name || 'Unnamed'}</span>
        <button
          className={`carto-eye${st.disabled ? ' off' : ''}`}
          title={st.disabled ? 'Show this chain' : 'Hide this chain'}
          onClick={() => setStreetDisabled(selectedStreet, !st.disabled)}>
          {st.disabled ? '◌' : '●'}
        </button>
      </h2>

      <div className="carto-row">
        <input type="checkbox" className="carto-checkbox"
          checked={!symmetric}
          onChange={toggleAsymmetric} />
        <label className="carto-label">Asymmetric (edit sides separately)</label>
      </div>

      {symmetric ? (
        <SideBlock sideKey="left" side={measure.left} single
          onChange={s => updateSide('left', s)} />
      ) : (
        <>
          <SideBlock sideKey="left" side={measure.left}
            onChange={s => updateSide('left', s)} />
          <SideBlock sideKey="right" side={measure.right}
            onChange={s => updateSide('right', s)} />
        </>
      )}

      <div className="carto-meta">
        {st.type || 'residential'} · {st.points.length} nodes · {hasMeasured ? 'measured' : 'default'}
        {allRanges.length > 1 ? ` · segment ${ordinal + 1} of ${allRanges.length}` : ''}
      </div>

      {hasMeasured && (
        <div className="carto-actions">
          <button className="carto-btn-sm" onClick={resetToDefault}>Reset to default</button>
        </div>
      )}
    </div>
  )
}
