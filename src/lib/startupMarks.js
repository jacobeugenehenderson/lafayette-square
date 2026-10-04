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
 * WARD USABLE (Jacob, 2026-10-04): the ground and the buildings are on screen and the visitor can move and tap. The
 * controls and the building pointer mount with the canvas, before either draws, so WARD USABLE is the FIRST TRUTHFUL
 * FRAME: the first frame that has drawn both. TIME TO WARD is that mark's time from navigation start.
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
  { id: 'first-truthful-frame', label: 'FIRST TRUTHFUL FRAME = WARD USABLE', short: 'USABLE', blocking: true },
  { id: 'trees', label: 'trees (progressive)', short: 'trees', blocking: false },
]

// The two pieces a truthful frame needs; when both have drawn, the frame is marked.
const TRUTHFUL = ['ground', 'buildings']

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
