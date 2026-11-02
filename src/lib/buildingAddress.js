// buildingAddress.js — a building's street address from the town's slab, for an app that draws no town (the Ward's
// place card). Moved out of Town.jsx on 2026-11-02 (Usher) so it can stand in the renderer-free door, TownPure.js: it reads
// only the slab's building index (hooks/useSlabBuildingIndex.js), no renderer state.
import useSlabBuildingIndex from '../hooks/useSlabBuildingIndex.js'

/**
 * A building's street address, as the town's slab carries it (SLAB-CONTRACT §6.3, cartograph/building-address.mjs):
 *   null                                   the buildings have not loaded yet
 *   { error }                              an id this town does not have, or a slab baked before addresses — say so
 *   { address, source, candidates? }       address null = none known, or ambiguous (then `candidates` lists what the
 *                                          town's inputs disagree on — the Ward shows them or none, never picks one)
 * The words are the source's (whitespace collapsed); formatting for display is the app's.
 */
export function useBuildingAddress(id) {
  const index = useSlabBuildingIndex((s) => s.index)
  if (!index || id == null) return null
  const e = index.byId.get(id)
  if (!e) return { error: `this town has no building "${id}"` }
  if (e.address === undefined) return { error: 'this town\'s slab was baked before addresses — re-bake its buildings' }
  return { address: e.address, source: e.addressSource, ...(e.addressCandidates && { candidates: e.addressCandidates }) }
}
