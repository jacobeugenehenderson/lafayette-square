import useCartographStore from './stores/useCartographStore.js'
import { stepWords, stepList } from '../lib/stepWords.js'

export default function StatusBar() {
  const status = useCartographStore(s => s.status)
  const saveBlocked = useCartographStore(s => s.overlaySaveBlocked)
  const freezeMissing = useCartographStore(s => s.shapeFreezeMissing)
  const lookMissing = useCartographStore(s => s.lookMissingForScene)
  const slabAge = useCartographStore(s => s.slabAge)
  const inStage = useCartographStore(s => ['browse', 'hero', 'street'].includes(s.shot))
  const bakeRunning = useCartographStore(s => s.bakeRunning)
  const runBake = useCartographStore(s => s.runBake)

  // Loud: no Look belongs to this scene, so Designer edits have nowhere to save — before 2026-09-25 they saved
  // into whichever town's Look was left active.
  if (lookMissing) {
    return (
      <div
        className="carto-status carto-glass carto-status--alarm"
        title={`No Look's scene is "${lookMissing}", so Plan (style) edits have nowhere to save. Create a Look for this neighborhood.`}
      >
        ⚠ No Look for {lookMissing} — Plan edits are NOT saving
      </div>
    )
  }

  // ⛔ Loud: Stage is drawing a slab OLDER than what the bake reads (the bake route's own plan, store `slabAge`), or its
  // age could not be measured. Entering Stage on a reload or a link never bakes, so this is the only place it is said.
  // ⛔ A BLOCKER (a required input missing: the plan's `blocker` entry, serve.js#runIfDirty) is not a stale step: a Bake would
  // refuse on it, so it says what must happen first, and offers no Bake.
  const blockers = slabAge?.stale?.filter(s => s.blocker) || []
  if (inStage && !bakeRunning && blockers.length) return (
    <div className="carto-status carto-glass carto-status--alarm" title={blockers.map(b => `${stepWords(b.step)}: ${b.why.join(' · ')}`).join('\n')}>
      ⛔ The Foundry can't run until: {blockers.flatMap(b => b.why).join(' · ')}
    </div>
  )
  if (inStage && !bakeRunning && (slabAge?.error || slabAge?.stale?.length)) {
    const steps = slabAge.error ? [] : slabAge.stale.map(s => s.step)
    const title = slabAge.error
      ? `The Slab's age could not be measured: ${slabAge.error}`
      : slabAge.stale.map(s => `${stepWords(s.step)}${s.repour ? ' (every step re-runs)' : ''}: ${s.why.slice(0, 4).join(', ')}${s.why.length > 4 ? ` … +${s.why.length - 4}` : ''}`).join('\n')
    return (
      <div className="carto-status carto-glass carto-status--alarm" title={title}>
        {slabAge.error
          ? '⚠ The Slab\'s age is unknown — it may not be the Foundry\'s latest'
          : `⚠ The Foundry owes ${steps.length} step${steps.length === 1 ? '' : 's'}: ${stepList(steps)}`}
        {' '}<button className="carto-status-action" onClick={() => runBake()}>Run the Foundry</button>
      </div>
    )
  }

  // Loud, non-dismissable warning: the Survey store is un-hydrated (usually
  // after a Vite hot-reload), so _saveOverlay is aborting and edits are NOT
  // reaching overlay.json. Surfacing it stops silent edit-loss — the operator
  // hard-refreshes to re-sync rather than discovering the loss after a bake.
  if (saveBlocked) {
    return (
      <div
        className="carto-status carto-glass carto-status--alarm"
        title="The Survey store is un-hydrated (typically after a hot-reload), so Survey edits are not being saved. Hard-refresh the app to re-sync, then re-author."
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
        ⚠ NOT the sealed shape — live re-derivation (the Seal is not holding)
      </div>
    )
  }

  if (!status) return null
  return <div className="carto-status carto-glass">{status}</div>
}
