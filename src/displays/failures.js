/**
 * The displays that failed at runtime, by `<lookId>/<display id>` → reason (keyed by the town too, so one town's
 * failure never shows on another town's display of the same id) (written by ./DisplayBoundary.js). Stage's Displays section shows
 * each as a banner, "Display <id> failed: <reason>"; a reload clears them.
 */
import { create } from 'zustand'

const useDisplayFailures = create((set) => ({
  failed: {},
  report: (lookId, id, reason) => set((s) => ({ failed: { ...s.failed, [`${lookId}/${id}`]: reason } })),
}))

export default useDisplayFailures
