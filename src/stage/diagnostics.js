/**
 * diagnostics.js — Stage's DIAGNOSTIC switches. Session-only on purpose: a diagnostic is not authoring, so it never
 * reaches design.json or the bake (layerVis does both). Read by CartographApp, which passes it to <Town layers>.
 */
import { create } from 'zustand'

export const useDiagnostics = create((set) => ({
  shoreMedian: false,
  setShoreMedian: (v) => set({ shoreMedian: !!v }),
}))
