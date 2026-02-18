import { create } from 'zustand'

const usePlaceState = create((set, get) => ({
  openBuildings: new Set(),
  openPercentage: 0,

  toggleBuilding: (id) => set((state) => {
    const newSet = new Set(state.openBuildings)
    newSet.has(id) ? newSet.delete(id) : newSet.add(id)
    return { openBuildings: newSet }
  }),

  randomize: (buildingIds, percentage = null) => {
    const pct = percentage ?? get().openPercentage
    const newSet = new Set()
    buildingIds.forEach(id => {
      if (Math.random() * 100 < pct) newSet.add(id)
    })
    set({ openBuildings: newSet, openPercentage: pct })
  },

  setOpenPercentage: (pct) => set({ openPercentage: pct }),
  closeAll: () => set({ openBuildings: new Set() }),
  openAll: (ids) => set({ openBuildings: new Set(ids) }),
}))

export default usePlaceState
