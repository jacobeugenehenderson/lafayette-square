// extentRadius.js — the Extent page's two radius decisions, pure, so a check can plant them (ExtentApp.jsx calls both; there is
import { Refusal } from '../lib/refusal.js'
// no other copy). ▶ checks/claims-extent-never-seeds-a-committed-radius.mjs
//
// ⛔ 2026-10-28, LS: a failed neighborhood load left a COMMITTED town looking fresh, the seed put 1689 m over its applied 892 m,
// and the draft autosave wrote it. A failed load now refuses (api.js#fetchNeighborhood) and never hydrates, and these two rules
// keep a committed town's radius its own.

/**
 * A COMMITTED town's draft radius at hydration: its own `draftRadius`, else the radius it was APPLIED at (the boundary's disc).
 * ⛔ Never a seed, and a committed town with neither refuses by name rather than draw or save a guess.
 * @param nb the scene's neighborhood.json (as loaded) · @param b its boundary record (or null) · @returns metres, or null when
 * the town is not committed (the caller's own hydration and seed apply)
 */
export function committedDraftRadius(nb, b, scene) {
  if (!nb?.committed) return null
  if (nb.draftRadius > 0) return Math.round(nb.draftRadius)
  if (b && b.radius > 0) return Math.round(b.radius)
  throw new Refusal(`[Extent] ⛔ '${scene}' is committed, but neither its draft radius nor its applied radius (the boundary's) could be read. Nothing is shown or saved — reload when the server is back.`)
}

/**
 * The radius a FRESH scene is seeded with, or null for no seed. Only a hydrated, uncommitted scene with no applied radius and no
 * radius held or touched is seeded: from the tint it was searched with (`coverageFit`), else the kept buildings plus 120 m (a
 * reopened pre-tint scene).
 */
export function seedRadius({ hydrated, committed, appliedRadius, radiusM, radiusTouched, coverageFit, keptFit }) {
  if (!hydrated || committed || appliedRadius > 0) return null
  if (radiusM > 0 || radiusTouched) return null
  if (coverageFit?.radius > 0) return coverageFit.radius
  if (keptFit?.radius) return keptFit.radius + 120
  return null
}
