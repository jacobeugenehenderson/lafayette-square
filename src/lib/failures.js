/**
 * The kit's ONE failure sink (BRIEF-a-refusal-is-never-swallowed, 2026-10-31). Every boundary that takes a piece of
 * the town out reports here, so nothing the kit refuses ends as a silent absence:
 *   · src/components/R3FErrorBoundary.jsx: a layer's Refusal, or a Transient it gave up retrying;
 *   · src/displays/DisplayBoundary.js: one display's failure.
 * Keyed by `<lookId>/<layer>`, so one town's failure never shows on another town (a piece outside any <Town> reports
 * with lookId null). An entry lasts until the page reloads.
 *
 * Who shows it: Stage shows every entry for the town on screen (src/stage/StageApp.jsx#FailuresBanner) and the
 * Displays section names a display's own. The Ward reads `useFailures` and decides how a visitor sees it.
 * ⛔ One sink: a second store of failures is what this file replaced (src/displays/failures.js, removed).
 * ▶ node checks/claims-a-refusal-is-never-swallowed.mjs
 */
import { create } from 'zustand'
import { Refusal } from './refusal.js'

const keyOf = (lookId, layer) => `${lookId ?? '(no town)'}/${layer}`

/** `failed`: key → { lookId, layer, kind: 'refusal' | 'gave-up', reason }. */
const useFailures = create((set) => ({
  failed: {},
  report: ({ lookId = null, layer, kind, reason }) => {
    if (!layer || !['refusal', 'gave-up'].includes(kind) || !reason) {
      throw new Refusal(`[failures] ⛔ a report needs { layer, kind: 'refusal' | 'gave-up', reason } (got ${JSON.stringify({ layer, kind, reason })})`)
    }
    set((s) => ({ failed: { ...s.failed, [keyOf(lookId, layer)]: { lookId, layer, kind, reason } } }))
  },
}))

/** The reason an error carries, as words. */
export const reasonOf = (error) => error?.message || String(error)

/** The entries for one town (and the pieces outside any town), oldest first. */
export const failuresFor = (failed, lookId) => Object.values(failed).filter((f) => f.lookId === lookId || f.lookId === null)

export default useFailures
