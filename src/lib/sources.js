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
// ⛔ AND NO FALLBACK. A look with no sources.json gets an empty list, never
// another look's credits: showing a visitor St. Louis's data providers for a
// Polish map is a false statement about provenance, and a false credit is worse
// than an absent one. What each surface then does:
//   · the map's corner (MapCredit.jsx) renders nothing;
//   · the info panel's Sources section (InfoModal.jsx) says "No sources recorded
//     for this map yet";
//   · a share image (ShareCapture.jsx#creditFor) refuses the capture.
// Each of these is also said in the console by useSources, naming the Look and
// the URL: a 404, a failed fetch, and a file with no credits list alike.
//
// Why the map owes this at all: OpenStreetMap's data is ODbL, and a rendered
// map is a Produced Work. ODbL §4.3 wants a notice naming the database and the
// licence; the OSMF attribution guidelines want it visible on a browsable map,
// collapsible but always findable. See cartograph/intake-rows.mjs `licence`.
import { useState, useEffect } from 'react'
import { slabFetch } from './slabUrl.js'
import { lookOf } from './lookOf.js'


/**
 * @param {string} lookId — REQUIRED: the Look whose slab is read (lib/lookOf.js). <Town> passes the one it draws
 *   (MapCredit); app code that means "this page's Look" resolves it first (InfoModal: resolveLookId). ⛔ No fallback
 *   here: this module is in <Town>'s closure, which never reaches the kit's registry
 *   (checks/claims-the-town-reads-no-player-store.mjs).
 * @returns {{credits: Array, owed: Array, loaded: boolean}}
 *   credits — [{ source, sourceUrl, credit, licence, licenceUrl, requires, from }]
 *   owed    — filled inputs whose terms the kit cannot state (never credited)
 *   loaded  — false until the fetch settles, so the UI can hold its space
 *             instead of flashing a to-do at every visitor on first paint.
 */
export function useSources(lookId) {
  const resolved = lookOf(lookId, 'useSources')
  const [state, setState] = useState({ credits: [], owed: [], loaded: false })
  useEffect(() => {
    let cancelled = false
    setState({ credits: [], owed: [], loaded: false })
    slabFetch(resolved, 'sources.json')
      .then(async r => {
        // ⛔ A non-ok response is a MISSING credit, not an empty one: a town that owes the OSM credit and shows none
        // is a silent licence failure (Layer 0 q2). So a 404 warns like a thrown fetch, naming the Look and the URL.
        if (!r.ok) throw new Error(`${r.status} at ${r.url || 'sources.json'}`)
        const j = await r.json()
        if (!Array.isArray(j?.credits)) throw new Error(`no credits list in ${r.url || 'sources.json'}`)
        return j
      })
      .then(j => {
        if (cancelled) return
        setState({ credits: j.credits, owed: j.owed || [], loaded: true })
      })
      .catch(e => {
        // Loud in the console, quiet-but-honest on screen. An operator needs to
        // know the artifact is missing; a visitor is not served by a stack trace.
        console.warn(`[sources] ⛔ no attribution for look '${resolved}' — ${e?.message || e}`)
        if (!cancelled) setState({ credits: [], owed: [], loaded: true })
      })
    return () => { cancelled = true }
  }, [resolved])
  return state
}

/**
 * The credits the map must SHOW: only sources whose obligation IS attribution. ODbL §4.3 asks that the notice name
 * the database and say it is available under the licence; the OSMF guidelines accept "© OpenStreetMap contributors"
 * as the credit, linked to the source's copyright page (`sourceUrl`), which carries the licence.
 *
 * ⭐ CDLA Permissive 2.0 (Microsoft's footprints) does not ask to be credited — it asks that the licence text be
 * made available — so putting it here would state an obligation we were not under while leaving the real one
 * undone. It belongs in the full Sources list (InfoModal).
 * → [{ text, url }]
 */
export function attributedCredits(credits) {
  return credits.filter(c => c.requires === 'attribution').map(c => ({ text: c.credit || `© ${c.source}`, url: c.sourceUrl || null }))
}

/**
 * The credit as PRINTED, for an image that cannot carry a link (a share JPEG): each credit followed by its URL,
 * written out — the OSMF guidelines' rule for a static image with no hyperlink. null when nothing is owed.
 */
export function printedCredit(credits) {
  const a = attributedCredits(credits)
  if (!a.length) return null
  return a.map(c => (c.url ? `${c.text} · ${c.url.replace(/^https?:\/\/(www\.)?/, '')}` : c.text)).join('  ·  ')
}
