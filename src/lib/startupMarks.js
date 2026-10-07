/**
 * STARTUP MARKS — the town's cold start, as invisible anchors (`performance.mark`) that any instrument can read.
 *
 * Owns: the names and the order of the spec's startup sequence (Phase 2, "Cold Start / Time to Ward"):
 *   HTML → application runtime → scene manifest → minimum ground → minimum buildings → FIRST TRUTHFUL FRAME → progressive
 * Each boundary is marked ONCE per page, where the shared renderer crosses it, so Preview and the Ward carry the same
 * marks from the same code. A mark draws nothing and costs one timestamp; it is read by Preview's startup gauge
 * (the strip's cold start, src/preview/phoneBus.js#recordColdStart, and the files tab); the drawn ones by `<DrawnAnchor>` (src/components/DrawnAnchor.jsx) or by anything holding a PerformanceObserver.
 *
 * ⭐ "Drawn" means DRAWN: `<DrawnAnchor>` fires on the first draw call of a mesh under its group (three's
 * `onAfterRender`), not on a fetch landing or a component mounting. A hidden group (Preview's layer toggle) never draws,
 * so it never marks: the mark says what the GPU was asked to draw, nothing else.
 *
 * WARD USABLE = THE REVEAL (Jacob, 2026-10-06; it was "ground + buildings", 2026-10-04): ground, buildings and trees
 * with their pages are prepared out of sight and shown on ONE frame (src/lib/reveal.js, Town.jsx#RevealGate), so the
 * FIRST TRUTHFUL FRAME is the first frame that has drawn all three. TIME TO WARD is that mark's time from navigation start.
 * ▶ node checks/claims-startup-marks-fire-in-order.mjs
 */
export const MARK_PREFIX = 'ward:'

/** The sequence, in the spec's order (`short`: the strip's tick label). `html` is the browser's own (navigation timing), not a mark. */
export const STARTUP_SEQUENCE = [
  { id: 'html', label: 'HTML', short: 'HTML', blocking: true },
  { id: 'runtime', label: 'application runtime', short: 'runtime', blocking: true },
  { id: 'manifest', label: 'scene manifest', short: 'manifest', blocking: true },
  { id: 'ground', label: 'minimum ground', short: 'ground', blocking: true },
  { id: 'buildings', label: 'minimum buildings', short: 'buildings', blocking: true },
  { id: 'trees', label: 'trees (with their card pages)', short: 'trees', blocking: true },
  { id: 'first-truthful-frame', label: 'THE REVEAL = WARD USABLE', short: 'USABLE', blocking: true },
]

// The pieces a truthful frame needs; when all have drawn, the frame is marked. Jacob ruled WARD USABLE = THE REVEAL
// (2026-10-06): ground, buildings and trees, prepared and shown together (src/lib/reveal.js), so the trees are in it.
const TRUTHFUL = ['ground', 'buildings', 'trees']

export const hasPerf = typeof performance !== 'undefined' && typeof performance.mark === 'function'

export function markStartup(id) {
  if (!hasPerf) return
  const name = MARK_PREFIX + id
  if (performance.getEntriesByName(name, 'mark').length) return
  performance.mark(name)
  if (TRUTHFUL.includes(id) && TRUTHFUL.every((t) => performance.getEntriesByName(MARK_PREFIX + t, 'mark').length)) {
    markStartup('first-truthful-frame')
  }
}

/** The marks this page has so far, by id → ms since navigation start. `html` is the document's responseEnd. */
export function readStartupMarks() {
  if (!hasPerf) return {}
  const out = {}
  const nav = performance.getEntriesByType('navigation')[0]
  if (nav) out.html = nav.responseEnd
  for (const e of performance.getEntriesByType('mark')) {
    if (e.name.startsWith(MARK_PREFIX)) out[e.name.slice(MARK_PREFIX.length)] = e.startTime
  }
  return out
}

export const isMarked = (id) => hasPerf && performance.getEntriesByName(MARK_PREFIX + id, 'mark').length > 0

/**
 * A TIMELINE MARK — an instant on Preview's frame timeline (src/preview/phoneBus.js), for work the renderer does that a
 * hitch may sit on (a KTX2 page transcoded, an image decoded on the main thread). One `performance.mark('tl:<kind>')`,
 * as cheap as the startup marks and with no Preview import, so the shared renderer can carry it into the Ward.
 */
export const TIMELINE_PREFIX = 'tl:'
export function markTimeline(kind, label) {
  if (hasPerf) performance.mark(TIMELINE_PREFIX + kind, { detail: label })
}
