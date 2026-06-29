/**
 * shotScene — the channel-variant cascade resolver (whole-look fork per shot).
 *
 * Design: HANDOFF-channel-variant-cascade.md "⭐ LOCKED DESIGN" (2026-06-29).
 * A shot is either FOLLOWING BASE or FORKED. A fork is a *full independent copy
 * of the whole channel set* stored sparsely under `scene.shotLooks[shot]`.
 * Present only for forked shots → a slab with no `shotLooks` is byte-identical
 * to today (no fork = today's behavior exactly), no 3× bloat until opt-in.
 *
 * The active look is resolved at ONE point (not per-consumer):
 *   effectiveScene = { ...base, ...(shotLooks[shot] || {}) }
 * a channel-wise (top-level key) merge — a forked shot's authored channels
 * win, every other channel falls through to base. Because production reads the
 * scene through the single shared `useSceneJson` adapter, folding this resolve
 * in there leaves every render consumer (PostProcessing, NeonBands, etc.)
 * reading `scene.<channel>` UNCHANGED — that is the blast-radius win of the
 * whole-look-fork model over a per-consumer resolveChannel(shot).
 *
 * (The platform axis slots in later as the same shape:
 *   shotLooks[shot]?.[platform] ?? shotLooks[shot] ?? base — UI deferred.)
 */

// Map the production camera viewMode → an authoring shot key. Hero IS the
// default look, so it resolves to base (no key). 'browse'/'street' map to
// their forks. Everything else (planetarium / cloud / skeleton / undefined)
// → base. Shot vocabulary mirrors the Stage `shot` store field
// (browse | hero | street), the keys a fork may be authored under.
export function shotKeyForViewMode(viewMode) {
  if (viewMode === 'browse') return 'browse'
  if (viewMode === 'street') return 'street'
  return null // hero + all special modes → base look
}

/**
 * Resolve the effective scene for a shot key. Returns the SAME object identity
 * when the shot has no fork (or there's no scene / no shotLooks), so unforked
 * Looks neither change behavior nor churn consumer renders. A forked shot
 * returns a fresh channel-merged object.
 *
 * @param {object|null} scene — the raw scene.json (base channels at top level,
 *   optional `scene.shotLooks`).
 * @param {string|null} shotKey — from shotKeyForViewMode (or a Stage shot).
 */
export function resolveShotScene(scene, shotKey) {
  if (!scene || !shotKey) return scene
  const fork = scene.shotLooks && scene.shotLooks[shotKey]
  if (!fork) return scene
  return { ...scene, ...fork }
}
