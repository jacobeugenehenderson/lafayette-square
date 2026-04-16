import useCartographStore from './stores/useCartographStore.js'
import {
  getDefaultBands, bandsToCumulative,
  BAND_COLORS, BAND_LABELS,
} from './streetProfiles.js'

const FT = 0.3048

const AVAILABLE_BANDS = [
  'asphalt', 'parking-parallel', 'parking-angled', 'curb', 'gutter',
  'treelawn', 'sidewalk', 'lawn',
]

function fmtDim(m) {
  return (m * 3.28084).toFixed(1) + 'ft (' + m.toFixed(2) + 'm)'
}

function getStreetBands(st) {
  if (st._bands) return st._bands
  return getDefaultBands(st.type || 'residential')
}

export default function MeasurePanel() {
  const selectedStreet = useCartographStore(s => s.selectedStreet)
  const centerlineData = useCartographStore(s => s.centerlineData)

  if (selectedStreet === null) {
    return (
      <div className="carto-section">
        <h2>Cross-Section</h2>
        <div className="carto-hint">
          Click a street to select it. Drag caustic edges to adjust. Right-click to add treelawn/sidewalk.
        </div>
      </div>
    )
  }

  const st = centerlineData.streets[selectedStreet]
  if (!st) return null

  const bands = getStreetBands(st)
  const cum = bandsToCumulative(bands)
  const totalR = cum.length ? cum[cum.length - 1].outerR : 0
  const hasMeasured = !!st._bands

  function updateBands(newBands) {
    st._bands = newBands
    useCartographStore.setState({ centerlineData: { ...centerlineData } })
    useCartographStore.getState()._saveCenterlines()
  }

  function moveBand(fromIdx, toIdx) {
    const b = [...bands]
    const [item] = b.splice(fromIdx, 1)
    b.splice(toIdx, 0, item)
    updateBands(b)
  }

  function removeBand(idx) {
    const b = [...bands]
    b.splice(idx, 1)
    updateBands(b)
  }

  function addBand(material) {
    if (!st._bands) st._bands = [...getDefaultBands(st.type || 'residential')]
    // Default widths
    const defaults = {
      'parking-parallel': 7 * FT, 'parking-angled': 18 * FT,
      curb: 6 * 0.0254, gutter: 1.5 * FT,
      treelawn: 4.5 * FT, sidewalk: 5 * FT, lawn: 3 * FT,
      asphalt: 3.05,
    }
    st._bands.push({ material, width: defaults[material] || 1.5 })
    useCartographStore.setState({ centerlineData: { ...centerlineData } })
    useCartographStore.getState()._saveCenterlines()
  }

  // Bands not yet in the stack
  const existing = new Set(bands.map(b => b.material))
  const addable = AVAILABLE_BANDS.filter(m => !existing.has(m))

  return (
    <div className="carto-section">
      <h2>
        {st.name || 'Unnamed'}{' '}
        <span className="count">{st.type || 'residential'}</span>
      </h2>

      {/* Band stack — ordered list */}
      <div style={{ marginTop: 4 }}>
        {bands.map((band, i) => (
          <div key={i} className="carto-row">
            {/* Color swatch */}
            <span style={{
              width: 10, height: 10, borderRadius: 2,
              background: BAND_COLORS[band.material] || '#888',
              flexShrink: 0,
            }} />
            {/* Label */}
            <label className="carto-label" style={{ flex: 1 }}>
              {BAND_LABELS[band.material] || band.material}
            </label>
            {/* Width */}
            <span style={{
              fontSize: 10, color: '#0cc', fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap', minWidth: 55, textAlign: 'right',
            }}>
              {fmtDim(band.width)}
            </span>
            {/* Reorder + remove */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginLeft: 2 }}>
              {i > 0 && (
                <button className="carto-btn-reset" style={{ fontSize: 7, height: 10, lineHeight: '10px' }}
                  onClick={() => moveBand(i, i - 1)} title="Move inward">&#x25B2;</button>
              )}
              {i < bands.length - 1 && (
                <button className="carto-btn-reset" style={{ fontSize: 7, height: 10, lineHeight: '10px' }}
                  onClick={() => moveBand(i, i + 1)} title="Move outward">&#x25BC;</button>
              )}
            </div>
            <button className="carto-btn-reset" onClick={() => removeBand(i)} title="Remove">&#x2715;</button>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="carto-row" style={{ marginTop: 4, borderTop: '1px solid var(--carto-border-subtle)', paddingTop: 4 }}>
        <label className="carto-label" style={{ fontWeight: 600 }}>Total half-width</label>
        <span style={{ fontSize: 10, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
          {fmtDim(totalR)}
        </span>
      </div>

      {/* Add band */}
      {addable.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <select className="carto-select" style={{ width: '100%' }}
            value=""
            onChange={e => { if (e.target.value) addBand(e.target.value) }}>
            <option value="">+ Add band...</option>
            {addable.map(m => (
              <option key={m} value={m}>{BAND_LABELS[m] || m}</option>
            ))}
          </select>
        </div>
      )}

      {/* Actions */}
      <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {hasMeasured && (
          <button className="carto-btn-sm" onClick={() => {
            delete st._bands
            useCartographStore.setState({ centerlineData: { ...centerlineData } })
            useCartographStore.getState()._saveCenterlines()
          }}>Reset to Default</button>
        )}
        <button className="carto-btn-sm" onClick={() => {
          const copy = bands.map(b => ({ ...b }))
          useCartographStore.setState({ _copiedProfile: copy, status: 'Profile copied: ' + st.name })
        }}>Copy</button>
        {useCartographStore.getState()._copiedProfile && (
          <button className="carto-btn-sm accent" onClick={() => {
            const copied = useCartographStore.getState()._copiedProfile
            st._bands = copied.map(b => ({ ...b }))
            useCartographStore.setState({ centerlineData: { ...centerlineData }, status: 'Profile applied' })
            useCartographStore.getState()._saveCenterlines()
          }}>Paste</button>
        )}
      </div>

      <div className="carto-meta" style={{ marginTop: 6 }}>
        {hasMeasured ? 'Measured' : 'Default'} · {bands.length} bands · {st.points.length} nodes
      </div>
    </div>
  )
}
