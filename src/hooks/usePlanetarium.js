import { create } from 'zustand'

const usePlanetarium = create((set, get) => ({
  isActive: false,
  mode: 'live', // 'live' | 'planetarium'
  toggle: () => set({ isActive: !get().isActive }),
  setMode: (mode) => set({ mode }),
}))

export default usePlanetarium
