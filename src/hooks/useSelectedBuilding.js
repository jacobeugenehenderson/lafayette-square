import { create } from 'zustand'

const useSelectedBuilding = create((set) => ({
  selectedId: null,         // building ID (bldg-XXXX) for mesh highlighting
  selectedListingId: null,  // listing ID (lmk-NNN) for specific listing
  showCard: false,          // true only when clicked in 3D scene
  initialTab: null,         // tab to open when card first appears (e.g. 'events')
  hoveredId: null,

  // highlight() — from side panel: shows pin + roof glow, no card
  highlight: (id, buildingId) => set({
    selectedId: buildingId || id,
    selectedListingId: buildingId ? id : null,
    showCard: false,
  }),

  // select() — from 3D scene (building mesh or map pin): opens card
  // Optional initialTab param to open card to a specific tab
  select: (id, buildingId, initialTab) => set({
    selectedId: buildingId || id,
    selectedListingId: buildingId ? id : null,
    showCard: true,
    initialTab: initialTab || null,
  }),

  deselect: () => set({ selectedId: null, selectedListingId: null, showCard: false, initialTab: null }),

  clearInitialTab: () => set({ initialTab: null }),

  setHovered: (id) => set({ hoveredId: id }),
  clearHovered: () => set({ hoveredId: null }),
}))

export default useSelectedBuilding
