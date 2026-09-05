// useLabelPlacements.js — React wiring for the shared label layout.
//
// Memoizes the pure layout (labelLayout.js) over the fetched polylines. Both
// MapLayers (Designer) and LafayetteScene (player) call this, so they render the
// exact same placement set.
//
// ⛔⛔ AND NOW THEY ACTUALLY DO. This file used to read `sizeK` and
// `letterSpacing` — the only two style fields that affect LAYOUT — straight out
// of `useCartographStore`, and asserted right here that the Designer and the
// player "never drift". They drifted on every Look whose design.json set either
// field, because ONLY CARTOGRAPH HYDRATES THAT STORE. The player got the store
// DEFAULTS. Measured on lafayette-square: sizeK 0.7 vs 1 — 43% larger type —
// and letterSpacing 0.04 vs 0.05. Bigger type changes the fit gate, so it also
// changed which names abbreviated and how often they repeated. The rendered
// labels were not the ones the operator had approved, and nothing said so.
//
// ⭐ THE GATE IS `_designHydrated`, which is exactly the flag that means "the
// active Look's design.json is in this store". True → we are in Cartograph and
// the operator is authoring live, so the store wins. False → we are the player,
// and the style rides in with the geometry from the slab (streetLabels.js).
// Same rule BlockGeometryV2Debug uses to know its curbWidth is real.
import { useMemo } from 'react'
import useCartographStore from '../cartograph/stores/useCartographStore.js'
import { layoutStreetLabels } from './labelLayout.js'

/**
 * @param {Array} polylines            baked label geometry
 * @param {{sizeK?:number, letterSpacing?:number}} [bakedStyle]
 *        the style baked beside them; used whenever the Cartograph store is not
 *        hydrated (i.e. everywhere except the Designer).
 */
export function useLabelPlacements(polylines, bakedStyle) {
  const hydrated = useCartographStore(s => s._designHydrated)
  const sizeK = useCartographStore(s => s.labels?.sizeK)
  const letterSpacing = useCartographStore(s => s.labels?.letterSpacing)
  const bakedK = bakedStyle?.sizeK
  const bakedLS = bakedStyle?.letterSpacing
  return useMemo(
    () => layoutStreetLabels(
      polylines,
      hydrated ? { sizeK, letterSpacing } : { sizeK: bakedK, letterSpacing: bakedLS },
    ),
    [polylines, hydrated, sizeK, letterSpacing, bakedK, bakedLS],
  )
}
