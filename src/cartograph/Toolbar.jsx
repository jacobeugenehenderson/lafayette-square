import useCartographStore from './stores/useCartographStore.js'

export default function Toolbar() {
  const tool = useCartographStore(s => s.tool)
  const shot = useCartographStore(s => s.shot)
  const setTool = useCartographStore(s => s.setTool)
  const setShot = useCartographStore(s => s.setShot)
  const fillsVisible = useCartographStore(s => s.fillsVisible)
  const toggleFills = useCartographStore(s => s.toggleFills)
  const aerialVisible = useCartographStore(s => s.aerialVisible)
  const toggleAerial = useCartographStore(s => s.toggleAerial)

  const inDesigner = shot === 'designer'

  return (
    <div className="carto-toolbar carto-glass">
      {inDesigner ? (
        <>
          <button className={`carto-btn ${tool === 'surveyor' ? 'active-surveyor' : ''}`}
            onClick={() => setTool('surveyor')}>Survey</button>

          <button className={`carto-btn ${tool === 'measure' ? 'active-measure' : ''}`}
            onClick={() => setTool('measure')}>Measure</button>

          <div className="carto-toolbar-sep" />

          <button className={`carto-btn ${fillsVisible ? '' : 'carto-btn-muted'}`}
            title={fillsVisible ? 'Hide map fills for aerial-only orientation' : 'Show map fills'}
            onClick={toggleFills}>{fillsVisible ? 'Fills: On' : 'Fills: Off'}</button>

          <button className={`carto-btn ${aerialVisible ? '' : 'carto-btn-muted'}`}
            title={aerialVisible ? 'Hide aerial imagery' : 'Show aerial imagery'}
            onClick={toggleAerial}>{aerialVisible ? 'Aerial: On' : 'Aerial: Off'}</button>
        </>
      ) : (
        <>
          <button className="carto-btn" onClick={() => setShot('designer')}>← Return to Designer</button>
          <button className="carto-btn carto-btn-muted"
            onClick={() => console.log('[publish] not wired yet')}>Publish</button>
        </>
      )}

      <div className="carto-toolbar-sep" />

      <div className="carto-shot-selector">
        {['browse', 'hero', 'street'].map(s => (
          <button key={s}
            className={`carto-btn ${shot === s ? 'active-shot' : ''}`}
            onClick={() => setShot(s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
    </div>
  )
}
