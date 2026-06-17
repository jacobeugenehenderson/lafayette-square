import useCartographStore from './stores/useCartographStore.js'

export default function StatusBar() {
  const status = useCartographStore(s => s.status)
  const saveBlocked = useCartographStore(s => s.overlaySaveBlocked)

  // Loud, non-dismissable warning: the Survey store is un-hydrated (usually
  // after a Vite hot-reload), so _saveOverlay is aborting and edits are NOT
  // reaching overlay.json. Surfacing it stops silent edit-loss — the operator
  // hard-refreshes to re-sync rather than discovering the loss after a bake.
  if (saveBlocked) {
    return (
      <div
        className="carto-status carto-glass"
        style={{ background: '#b00020', color: '#fff', fontWeight: 600 }}
        title="The Survey store is un-hydrated (typically after a hot-reload), so Survey edits are not writing to overlay.json. Hard-refresh the app to re-sync, then re-author."
      >
        ⚠ Survey edits are NOT saving — hard-refresh to re-sync
      </div>
    )
  }

  if (!status) return null
  return <div className="carto-status carto-glass">{status}</div>
}
