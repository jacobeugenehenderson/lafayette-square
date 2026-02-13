import { create } from 'zustand'

const useCamera = create((set, get) => ({
  viewMode: 'hero',       // 'hero' | 'browse' | 'street'
  previousMode: 'hero',
  streetTarget: null,
  azimuth: 0,
  flyTarget: null,
  lastInteraction: Date.now(),

  setMode: (mode) => {
    const current = get().viewMode
    if (current === mode) return
    set({
      previousMode: current,
      viewMode: mode,
      flyTarget: null,
      streetTarget: mode === 'street' ? get().streetTarget : null,
    })
  },

  enterStreetView: (position) => set({
    previousMode: get().viewMode,
    viewMode: 'street',
    streetTarget: position,
    flyTarget: null,
  }),

  exitStreetView: () => {
    const prev = get().previousMode
    set({
      viewMode: (prev === 'street' || prev === 'hero') ? 'browse' : prev,
      streetTarget: null,
      flyTarget: null,
    })
  },

  goHero: () => set({
    previousMode: get().viewMode,
    viewMode: 'hero',
    streetTarget: null,
    flyTarget: null,
  }),

  flyTo: (position, lookAt) => set({
    flyTarget: { position, lookAt },
  }),

  clearFly: () => set({ flyTarget: null }),
  setAzimuth: (angle) => set({ azimuth: angle }),
  resetIdle: () => set({ lastInteraction: Date.now() }),
}))

export default useCamera
