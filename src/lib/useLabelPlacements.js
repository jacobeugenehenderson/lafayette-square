// useLabelPlacements.js — React wiring for the shared label layout.
//
// Memoizes the pure layout (labelLayout.js) over the fetched polylines. Both MapLayers (Designer) and LafayetteScene
// (player) call this, so they render the exact same placement set — at the STYLE THE CALLER HANDS IT.
//
// ⭐ The style is a parameter, never a store read (2026-09-28). This file used to pick between the authoring store
// (when `_designHydrated`) and the baked style — which put the authoring store in the renderer's import closure, and
// importing that store ran the whole authoring load on every page that drew a town. Now the renderer passes the town's
// label style (<Town>'s context: labels.json's `style` under Stage's live override) and the Designer passes its live
// store values. ▶ node checks/claims-the-town-reads-no-player-store.mjs
import { useMemo } from 'react'
import { layoutStreetLabels } from './labelLayout.js'

/**
 * @param {Array} polylines   baked label geometry
 * @param {{sizeK?:number, letterSpacing?:number}} style   the label style to lay out at (only these two fields affect layout)
 */
export function useLabelPlacements(polylines, style) {
  const sizeK = style?.sizeK
  const letterSpacing = style?.letterSpacing
  return useMemo(
    () => layoutStreetLabels(polylines, { sizeK, letterSpacing }),
    [polylines, sizeK, letterSpacing],
  )
}
