// Per-scene street labels — read from the SLAB, not recomputed at runtime.
//
// The names + placements are computed at INTAKE by cartograph/bake-labels.js
// (from the scene's own ribbons + neighborhood boundary) and baked to
// public/baked/<look>/labels.json — [{ name, x, z, angle, widthM }]. This hook
// just fetches that artifact for the active look, so every installation renders
// ITS OWN street names (Przędzalniana, not Park Avenue). Same data feeds
// LafayetteScene (Preview/player) and Cartograph's MapLayers (Designer) so they
// never drift — the shared source is now the slab, not a static ribbons import.
//
// Supersedes the old module-load compute from src/data/ribbons.json (LS-only,
// guarded off for non-LS looks). That logic moved verbatim into the bake, where
// it can e2e the geometry and gate by the real neighborhood boundary rather than
// four hardcoded LS corridors. Doctrine [[project_labels_encourage_walking]],
// [[project_preview_equals_ls_literally]], slab-is-the-contract.
import { useState, useEffect } from 'react'
import { slabFetch } from './slabUrl.js'
import { lookOf } from './lookOf.js'


/**
 * @param {string} [lookId]     — explicit Look id (cartograph passes activeLookId);
 *                                required: the Look being drawn (never a guessed one).
 * @param {number} [reread]     — bump to re-fetch after a Stage/Designer re-bake.
 * @returns {{labels, style, version, setPieceTitles}} — the labels.json artifact: `labels` is [] until loaded / if the
 *   scene has none; `style` is the town's label style baked beside them (the whole authored block from v4; v3 carried
 *   only { sizeK, letterSpacing }) — resolve it with labelStyleOf (src/lib/labelStyle.js); `setPieceTitles` places a
 *   set-piece's own title (read only by that set-piece).
 *
 * ⛔⛔ THE STYLE COMES BACK WITH THE GEOMETRY, AND THAT IS A BUG FIX. Placement
 * is computed at runtime from `sizeK` and `letterSpacing`, and both were being
 * read out of the CARTOGRAPH STORE — which only Cartograph hydrates. The
 * Designer laid out at the authored style and the player at store defaults, so
 * the rendered labels were never the ones the operator approved. Measured on
 * lafayette-square: sizeK 0.7 vs 1, letterSpacing 0.04 vs 0.05. See
 * useLabelPlacements.js, which asserted they could not drift.
 */
export function useStreetLabels(lookId, reread) {
  const resolved = lookOf(lookId, 'streetLabels')
  const [data, setData] = useState(EMPTY)
  useEffect(() => {
    let cancelled = false
    slabFetch(resolved, 'labels.json')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled) setData(j?.labels ? { labels: j.labels, style: j.style || {}, version: j.version ?? 0, setPieceTitles: j.setPieceTitles || {} } : EMPTY) })
      .catch(e => { console.warn('[streetLabels] load failed:', e); if (!cancelled) setData(EMPTY) })
    return () => { cancelled = true }
  }, [resolved, reread])
  return data
}

// Stable identity so a failed/empty load does not re-render consumers forever.
const EMPTY = { labels: [], style: {}, version: 0, setPieceTitles: {} }
