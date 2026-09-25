import useCartographStore from './stores/useCartographStore.js'

// Modal overlay shown while the cartograph bake is running. Blocks input
// against the canvas so an operator's drag/click can't fight the bake's
// own state writes. Auto-dismisses when bakeRunning flips false.
export default function BakeModal() {
  const bakeRunning = useCartographStore(s => s.bakeRunning)
  const bakeError = useCartographStore(s => s.bakeError)
  const ribbonsStale = useCartographStore(s => s.ribbonsStale)
  const repourConfirm = useCartographStore(s => s.repourConfirm)
  if (!bakeRunning && !bakeError && !ribbonsStale && !repourConfirm) return null
  // ⛔ A CODE change would re-pour the town (the server stopped first and named the files). Say it; run on confirm.
  if (!bakeRunning && repourConfirm) {
    const { scene, files = [], resume = {} } = repourConfirm
    return (
      <div className="carto-bake-modal">
        <div className="carto-bake-modal-card">
          <div className="carto-bake-modal-title">This Bake will re-pour {scene}</div>
          <div className="carto-bake-modal-msg">
            The pour code changed since {scene} was last poured, so baking now re-derives its map before baking it:
            <ul>{files.map(f => <li key={f}><code>{f}</code></li>)}</ul>
          </div>
          <button className="carto-bake-modal-dismiss" onClick={() => { useCartographStore.setState({ repourConfirm: null }); useCartographStore.getState().runBake({ ...resume, repour: true }) }}>Re-pour and bake</button>
          <button className="carto-bake-modal-dismiss" onClick={() => useCartographStore.setState({ repourConfirm: null })}>Cancel</button>
        </div>
      </div>
    )
  }
  // ⛔ The 2D map is built live from ribbons loaded with the page; after a re-pour it is stale until reload.
  if (!bakeRunning && !bakeError && ribbonsStale) return (
    <div className="carto-bake-modal">
      <div className="carto-bake-modal-card">
        <div className="carto-bake-modal-title">The 2D map is out of date</div>
        <div className="carto-bake-modal-msg">Baked. But {ribbonsStale}. Reload to draw what was poured.</div>
        <button className="carto-bake-modal-dismiss" onClick={() => window.location.reload()}>Reload</button>
        <button className="carto-bake-modal-dismiss" onClick={() => useCartographStore.setState({ ribbonsStale: null })}>Dismiss</button>
      </div>
    </div>
  )

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
