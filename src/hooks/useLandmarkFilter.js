import { create } from 'zustand'
import useBusinessData from './useBusinessData'

const useLandmarkFilter = create((set, get) => ({
  activeTags: new Set(),

  // Single-select: toggling a tag replaces the set (deselects prior)
  toggleTag: (tag) => set((state) => {
    if (state.activeTags.has(tag)) {
      return { activeTags: new Set() }
    }
    return { activeTags: new Set([tag]) }
  }),

  clearTags: () => set({ activeTags: new Set() }),
  isTagActive: (tag) => get().activeTags.has(tag),

  getFilteredLandmarks: () => {
    const { activeTags } = get()
    if (activeTags.size === 0) return []
    const { landmarks } = useBusinessData.getState()
    return landmarks.filter(l =>
      activeTags.has(l.subcategory) || activeTags.has(l.category)
    )
  },
}))

export default useLandmarkFilter
