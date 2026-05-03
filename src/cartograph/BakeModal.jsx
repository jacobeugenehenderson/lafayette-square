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
              Freezing your design into the per-Look bake bundle —
              ground geometry, AO lightmap, buildings, lamps, and a scene
              snapshot. The runtime (Stage shots, Preview, the deployed
              app) loads this bundle directly; nothing is recomputed at
              render time.
            </div>
            <div className="carto-bake-modal-spinner" />
          </>
        )}
      </div>
    </div>
  )
}
