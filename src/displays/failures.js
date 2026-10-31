/**
 * The displays that failed at runtime, by id → reason (written by ./DisplayBoundary.js). Stage's Displays section shows
 * each as a banner, "Display <id> failed: <reason>"; a reload clears them.
 */
import { create } from 'zustand'

const useDisplayFailures = create((set) => ({
  failed: {},
  report: (id, reason) => set((s) => ({ failed: { ...s.failed, [id]: reason } })),
}))

export default useDisplayFailures
