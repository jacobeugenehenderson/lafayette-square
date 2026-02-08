import { create } from 'zustand'

const useCamera = create((set, get) => ({
  viewMode: 'plan',
  streetTarget: null,
  azimuth: 0,
  flyTarget: null,

  enterStreetView: (position) => set({
    viewMode: 'street',
    streetTarget: position,
    flyTarget: null,
  }),

  exitToPlan: () => set({
    viewMode: 'plan',
    streetTarget: null,
    flyTarget: null,
  }),

  flyTo: (position, lookAt) => set({
    flyTarget: { position, lookAt },
  }),

  clearFly: () => set({ flyTarget: null }),

  setAzimuth: (angle) => set({ azimuth: angle }),
}))

export default useCamera
