// useLabelPlacements.js — React wiring for the shared label layout.
//
// Reads the panel label style from the store and memoizes the pure layout
// (labelLayout.js) over the fetched polylines. Both MapLayers (Designer) and
// LafayetteScene (player) call this, so they render the exact same placement
// set and never drift ([[project_preview_equals_ls_literally]]).
//
// Only the style fields that affect LAYOUT are subscribed (sizeK, letterSpacing)
// — recoloring or reweighting labels doesn't recompute positions. (LOD adds a
// camera argument here in the next step.)
import { useMemo } from 'react'
import useCartographStore from '../cartograph/stores/useCartographStore.js'
import { layoutStreetLabels } from './labelLayout.js'

export function useLabelPlacements(polylines) {
  const sizeK = useCartographStore(s => s.labels?.sizeK)
  const letterSpacing = useCartographStore(s => s.labels?.letterSpacing)
  return useMemo(
    () => layoutStreetLabels(polylines, { sizeK, letterSpacing }),
    [polylines, sizeK, letterSpacing],
  )
}
