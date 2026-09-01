// Per-scene ATTRIBUTION — read from the SLAB, like every other public fact.
//
// The credits are computed at bake time by cartograph/bake-sources.js from the
// inputs actually on THIS town's disk, and written to
// public/baked/<look>/sources.json. This hook fetches that artifact for the
// active look, so every installation credits ITS OWN sources — Lafayette Square
// names Microsoft because it has ML footprints on disk, Księży Młyn does not
// because it took hand-mapped OSM instead.
//
// ⛔ THERE IS NO LIST IN THIS FILE, AND THERE MUST NEVER BE ONE. A hardcoded
// credit is correct for the town it was written against and silently wrong for
// every other — which is the failure this whole surface exists to prevent, and
// it would be wrong in the worst direction: a legal notice that looks right.
//
// ⛔ AND NO FALLBACK. A look with no sources.json gets an empty list and the
// surface renders a visible to-do (SidePanel.jsx's "features degrade, they
// don't detonate"). It never borrows another look's credits: showing a visitor
// St. Louis's data providers for a Polish map is a false statement about
// provenance, and a false credit is worse than an absent one.
//
// Why the map owes this at all: OpenStreetMap's data is ODbL, and a rendered
// map is a Produced Work. ODbL §4.3 wants a notice naming the database and the
// licence; the OSMF attribution guidelines want it visible on a browsable map,
// collapsible but always findable. See cartograph/intake-rows.mjs `licence`.
import { useState, useEffect } from 'react'
import { INSTANCE } from '../instance.js'

function resolveLookId(propLookId) {
  if (propLookId) return propLookId
  if (typeof window === 'undefined') return INSTANCE.lookId
  const m = window.location.search.match(/[?&]look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : INSTANCE.lookId
}

/**
 * @param {string} [lookId] — explicit Look id; falls back to `?look=`, then INSTANCE.
 * @returns {{credits: Array, owed: Array, loaded: boolean}}
 *   credits — [{ source, sourceUrl, credit, licence, licenceUrl, requires, from }]
 *   owed    — filled inputs whose terms the kit cannot state (never credited)
 *   loaded  — false until the fetch settles, so the UI can hold its space
 *             instead of flashing a to-do at every visitor on first paint.
 */
export function useSources(lookId) {
  const resolved = resolveLookId(lookId)
  const [state, setState] = useState({ credits: [], owed: [], loaded: false })
  useEffect(() => {
    let cancelled = false
    setState({ credits: [], owed: [], loaded: false })
    fetch(`${import.meta.env.BASE_URL}baked/${resolved}/sources.json`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (cancelled) return
        setState({ credits: j?.credits || [], owed: j?.owed || [], loaded: true })
      })
      .catch(e => {
        // Loud in the console, quiet-but-honest on screen. An operator needs to
        // know the artifact is missing; a visitor is not served by a stack trace.
        console.warn(`[sources] no attribution for look '${resolved}':`, e)
        if (!cancelled) setState({ credits: [], owed: [], loaded: true })
      })
    return () => { cancelled = true }
  }, [resolved])
  return state
}

/**
 * The one-line credit for the map chrome. ODbL §4.3 asks that the notice name
 * the database and say it is available under the licence; the OSMF guidelines
 * accept "© OpenStreetMap contributors" as the credit half.
 *
 * ⭐ Only sources whose obligation IS attribution appear here. CDLA Permissive
 * 2.0 (Microsoft's footprints) does not ask to be credited — it asks that the
 * licence text be made available — so putting it in this line would state an
 * obligation we were not under while leaving the real one undone. It belongs in
 * the full list, which is what the line links to.
 */
export function creditLine(credits) {
  const attributed = credits.filter(c => c.requires === 'attribution')
  if (!attributed.length) return null
  return attributed.map(c => c.credit || `© ${c.source}`).join(' · ')
}
