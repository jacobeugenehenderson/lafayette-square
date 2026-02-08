import { create } from 'zustand'

const usePlanetarium = create((set, get) => ({
  isActive: false,
  toggle: () => set({ isActive: !get().isActive }),
}))

export default usePlanetarium
