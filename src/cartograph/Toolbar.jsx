import useCartographStore from './stores/useCartographStore.js'

export default function Toolbar() {
  const mode = useCartographStore(s => s.mode)
  const markerActive = useCartographStore(s => s.markerActive)
  const setMode = useCartographStore(s => s.setMode)
  const toggleMarker = useCartographStore(s => s.toggleMarker)
  const markerStrokes = useCartographStore(s => s.markerStrokes)
  const undoMarkerStroke = useCartographStore(s => s.undoMarkerStroke)
  const clearMarkerStrokes = useCartographStore(s => s.clearMarkerStrokes)

  return (
    <div className="carto-toolbar">
      <button className={`carto-btn ${markerActive ? 'active-marker' : ''}`}
        onClick={toggleMarker}>Marker</button>

      {markerActive && markerStrokes.length > 0 && (
        <>
          <button className="carto-btn" onClick={undoMarkerStroke}>Undo</button>
          <button className="carto-btn" onClick={clearMarkerStrokes}>Clear All</button>
        </>
      )}

      <button className={`carto-btn ${mode === 'surveyor' ? 'active-surveyor' : ''}`}
        onClick={() => setMode('surveyor')}>Surveyor</button>

      <button className={`carto-btn ${mode === 'measure' ? 'active-measure' : ''}`}
        onClick={() => setMode('measure')}>Measure</button>

      <button className={`carto-btn ${mode === 'stage' ? 'active-surveyor' : ''}`}
        onClick={() => setMode('stage')}>Stage</button>
    </div>
  )
}
