import useCartographStore from './stores/useCartographStore.js'

export default function MarkerFAB() {
  const markerActive = useCartographStore(s => s.markerActive)
  const eraserActive = useCartographStore(s => s.markerEraserActive)
  const strokes = useCartographStore(s => s.markerStrokes)
  const toggleMarker = useCartographStore(s => s.toggleMarker)
  const toggleEraser = useCartographStore(s => s.toggleMarkerEraser)
  const undo = useCartographStore(s => s.undoMarkerStroke)
  const clearAll = useCartographStore(s => s.clearMarkerStrokes)

  const hasStrokes = strokes.length > 0

  return (
    <div className="carto-fab-wrap">
      {markerActive && (
        <div className="carto-fab-stack">
          <button
            className={`carto-fab-mini ${eraserActive ? 'active' : ''}`}
            title="Eraser — click a stroke to remove it"
            onClick={toggleEraser}
          >
            <EraserIcon />
          </button>
          <button
            className="carto-fab-mini"
            title="Undo last stroke"
            disabled={!hasStrokes}
            onClick={undo}
          >
            <UndoIcon />
          </button>
          <button
            className="carto-fab-mini danger"
            title="Clear all strokes"
            disabled={!hasStrokes}
            onClick={clearAll}
          >
            <TrashIcon />
          </button>
        </div>
      )}

      <button
        className={`carto-fab ${markerActive ? 'active' : ''}`}
        title={markerActive ? 'Turn marker off' : 'Mark the map'}
        onClick={toggleMarker}
      >
        <PencilIcon />
      </button>
    </div>
  )
}

function PencilIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19l7-7 3 3-7 7H12v-3z" />
      <path d="M18 13l-1.5-7.5L2 20l7.5-1.5L18 13z" />
    </svg>
  )
}

function EraserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21l6-6 9 9H9" />
      <path d="M21 15l-6-6L9 15l6 6" />
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6" />
      <path d="M3 13a9 9 0 1 0 3-7" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 14h10l1-14" />
    </svg>
  )
}
