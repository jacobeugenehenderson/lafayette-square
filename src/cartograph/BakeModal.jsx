import useCartographStore from './stores/useCartographStore.js'

// Modal overlay shown while the cartograph bake is running. Blocks input
// against the canvas so an operator's drag/click can't fight the bake's
// own state writes. Auto-dismisses when bakeRunning flips false.
export default function BakeModal() {
  const bakeRunning = useCartographStore(s => s.bakeRunning)
  const bakeError = useCartographStore(s => s.bakeError)
  if (!bakeRunning && !bakeError) return null

  return (
    <div className="carto-bake-modal">
      <div className="carto-bake-modal-card">
        {bakeError ? (
          <>
            <div className="carto-bake-modal-title">Bake failed</div>
            <div className="carto-bake-modal-msg">{bakeError}</div>
            <button
              className="carto-bake-modal-dismiss"
              onClick={() => useCartographStore.setState({ bakeError: null })}>
              Dismiss
            </button>
          </>
        ) : (
          <>
            <div className="carto-bake-modal-title">Baking the cartograph…</div>
            <div className="carto-bake-modal-msg">
              Generating <code>cartograph-ground.svg</code> from your design.
              This is the only artifact the runtime needs — the buildings,
              trees, lamps, and lighting come from their own data.
            </div>
            <div className="carto-bake-modal-spinner" />
          </>
        )}
      </div>
    </div>
  )
}
