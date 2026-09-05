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
import { INSTANCE } from '../instance.js'
import { ASSET_BASE } from './bakedUrl.js'

function resolveLookId(propLookId) {
  if (propLookId) return propLookId
  if (typeof window === 'undefined') return INSTANCE.lookId
  const m = window.location.search.match(/[?&]look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : INSTANCE.lookId
}

/**
 * @param {string} [lookId]     — explicit Look id (cartograph passes activeLookId);
 *                                falls back to the URL `?look=` param, then INSTANCE.
 * @param {number} [cacheBust]  — bump to re-fetch after a Stage/Designer re-bake.
 * @returns {{labels: Array<{name,widthM,points}>, style: {sizeK?:number, letterSpacing?:number}}}
 *   `labels` is [] until loaded / if the scene has none. `style` is the LAYOUT
 *   style baked beside them (v3+); {} on an older artifact, which lays out Auto.
 *
 * ⛔⛔ THE STYLE COMES BACK WITH THE GEOMETRY, AND THAT IS A BUG FIX. Placement
 * is computed at runtime from `sizeK` and `letterSpacing`, and both were being
 * read out of the CARTOGRAPH STORE — which only Cartograph hydrates. The
 * Designer laid out at the authored style and the player at store defaults, so
 * the rendered labels were never the ones the operator approved. Measured on
 * lafayette-square: sizeK 0.7 vs 1, letterSpacing 0.04 vs 0.05. See
 * useLabelPlacements.js, which asserted they could not drift.
 */
export function useStreetLabels(lookId, cacheBust) {
  const resolved = resolveLookId(lookId)
  const [data, setData] = useState(EMPTY)
  useEffect(() => {
    let cancelled = false
    const bust = cacheBust != null ? `?t=${cacheBust}` : ''
    fetch(`${ASSET_BASE}baked/${resolved}/labels.json${bust}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled) setData(j?.labels ? { labels: j.labels, style: j.style || {} } : EMPTY) })
      .catch(e => { console.warn('[streetLabels] load failed:', e); if (!cancelled) setData(EMPTY) })
    return () => { cancelled = true }
  }, [resolved, cacheBust])
  return data
}

// Stable identity so a failed/empty load does not re-render consumers forever.
const EMPTY = { labels: [], style: {} }
