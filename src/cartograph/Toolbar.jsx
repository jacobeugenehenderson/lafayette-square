import useCartographStore from './stores/useCartographStore.js'

export default function Toolbar() {
  const mode = useCartographStore(s => s.mode)
  const setMode = useCartographStore(s => s.setMode)
  const fillsVisible = useCartographStore(s => s.fillsVisible)
  const toggleFills = useCartographStore(s => s.toggleFills)
  const aerialVisible = useCartographStore(s => s.aerialVisible)
  const toggleAerial = useCartographStore(s => s.toggleAerial)

  return (
    <div className="carto-toolbar carto-glass">
      <button className={`carto-btn ${mode === 'surveyor' ? 'active-surveyor' : ''}`}
        onClick={() => setMode('surveyor')}>Survey</button>

      <button className={`carto-btn ${mode === 'measure' ? 'active-measure' : ''}`}
        onClick={() => setMode('measure')}>Measure</button>

      <button className={`carto-btn ${mode === 'stage' ? 'active-stage' : ''}`}
        onClick={() => setMode('stage')}>Stage</button>

      <div className="carto-toolbar-sep" />

      <button className={`carto-btn ${fillsVisible ? '' : 'carto-btn-muted'}`}
        title={fillsVisible ? 'Hide map fills for aerial-only orientation' : 'Show map fills'}
        onClick={toggleFills}>{fillsVisible ? 'Fills: On' : 'Fills: Off'}</button>

      <button className={`carto-btn ${aerialVisible ? '' : 'carto-btn-muted'}`}
        title={aerialVisible ? 'Hide aerial imagery' : 'Show aerial imagery'}
        onClick={toggleAerial}>{aerialVisible ? 'Aerial: On' : 'Aerial: Off'}</button>
    </div>
  )
}
