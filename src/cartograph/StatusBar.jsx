import useCartographStore from './stores/useCartographStore.js'

export default function StatusBar() {
  const status = useCartographStore(s => s.status)
  const saveBlocked = useCartographStore(s => s.overlaySaveBlocked)
  const freezeMissing = useCartographStore(s => s.shapeFreezeMissing)
  const census = useCartographStore(s => s.curbProducerCensus)

  // Loud, non-dismissable warning: the Survey store is un-hydrated (usually
  // after a Vite hot-reload), so _saveOverlay is aborting and edits are NOT
  // reaching overlay.json. Surfacing it stops silent edit-loss — the operator
  // hard-refreshes to re-sync rather than discovering the loss after a bake.
  if (saveBlocked) {
    return (
      <div
        className="carto-status carto-glass carto-status--alarm"
        title="The Survey store is un-hydrated (typically after a hot-reload), so Survey edits are not writing to overlay.json. Hard-refresh the app to re-sync, then re-author."
      >
        ⚠ Survey edits are NOT saving — hard-refresh to re-sync
      </div>
    )
  }

  // ⛔ [ROADMAP A02] Loud, non-dismissable warning: outside Survey the frozen
  // `shape.json` is supposed to OWN the render — that is the Data Wall's promise.
  // It is absent or unreadable, so what is on screen is a LIVE re-derivation that
  // looks identical to the frozen shape. Before this existed the fallback was a
  // bare console.warn, which on a town whose freeze failed meant the operator saw
  // a plausible map and never learned the wall had not held. LS always has a
  // freeze, so this never fires in the scene you would use to prove the wall
  // works — which is precisely why it had to be surfaced (`CLAUDE.md` Layer 0).
  if (freezeMissing) {
    return (
      <div
        className="carto-status carto-glass carto-status--alarm"
        title={freezeMissing}
      >
        ⚠ NOT the frozen shape — live re-derivation (the Data Wall is not holding)
      </div>
    )
  }

  // ⭐ [ROADMAP A07] The producer disclosure. The kit's most-quoted invariant is
  // "the curb is a concentric offset"; on LS that is true of 59 of 101 blocks, and
  // on Księży Młyn of 19 of 77. Until this line existed the tool could not tell you
  // which producer drew the block in front of you, so a defect on a carved tile was
  // debugged with offset-side reasoning that could never apply to it.
  // ⛔ NOT an alarm — a median or a sliver taking the carve is CORRECT. Plain status.
  if (census && !status) {
    const label = census.unstamped
      ? `curb producers: unstamped (${census.total} tiles) — pre-A07 bake`
      : `curb: ${census.offset}/${census.total} offset · ${census.carve} carve`
    const title = census.unstamped
      ? 'This frozen shape was baked before A07, so it carries no per-tile producer stamp. Re-bake to record which producer built each curb.'
      : 'Which producer built each block\u2019s curb. OFFSET = the per-edge parallel offset the docs describe (D6a). CARVE = the legacy boolean carve, which is the CORRECT construction for medians, slivers and opt-outs — not a defect. Reasons: '
        + Object.entries(census.byReason).map(([k, v]) => `${v} ${k}`).join(' · ')
    return <div className="carto-status carto-glass" title={title}>{label}</div>
  }

  if (!status) return null
  return <div className="carto-status carto-glass">{status}</div>
}
