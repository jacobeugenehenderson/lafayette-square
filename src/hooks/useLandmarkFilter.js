import { create } from 'zustand'
import useListings from './useListings'

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

  getFilteredListings: () => {
    const { activeTags } = get()
    if (activeTags.size === 0) return []
    const { listings } = useListings.getState()
    return listings.filter(l =>
      activeTags.has(l.subcategory) || activeTags.has(l.category) ||
      // ⭐ A listing with no category is UNCLASSIFIED, and it is reachable. Before the
      // zoning fallback was removed there was no such listing — everything unknown was
      // asserted residential — so this branch is new, and without it those buildings
      // would match no tag and quietly leave the Society Pages (`categories.js`, the
      // unclassified section).
      (activeTags.has('unclassified') && !l.category)
    )
  },
}))

export default useLandmarkFilter
