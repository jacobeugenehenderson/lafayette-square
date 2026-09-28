/**
 * The building under the pointer — RENDERER-OWNED state: only the drawn pieces read it (the in-shader hover
 * highlight, the cursor). It used to live in the old player's selection store; no app reads it.
 */
import { create } from 'zustand'

const useTownHover = create((set) => ({
  hoveredId: null,
  setHovered: (id) => set({ hoveredId: id }),
  clearHovered: () => set({ hoveredId: null }),
}))

export default useTownHover
