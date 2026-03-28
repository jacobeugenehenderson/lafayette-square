import { create } from 'zustand'
import useLandmarkFilter from './useLandmarkFilter'
import useSelectedBuilding from './useSelectedBuilding'

const useCamera = create((set, get) => ({
  viewMode: 'hero',       // 'hero' | 'browse' | 'planetarium'
  previousMode: 'hero',
  panelState: 'neutral',       // 'collapsed' | 'neutral' | 'browse' | 'full'
  panelOpen: true,          // derived compat — false only when collapsed
  panelCollapsedPx: 0,
  activeTab: 'almanac',     // 'almanac' | 'bulletin' | 'lafayettepages'
  azimuth: 0,
  flyTarget: null,
  planetariumOrigin: null,  // [x, z] ground position for street-level sky view
  lastInteraction: Date.now(),

  setPanelState: (state) => set({ panelState: state, panelOpen: state !== 'collapsed' }),
  // Compat: old code calls setPanelOpen(true/false)
  setPanelOpen: (open) => set({
    panelState: open ? 'neutral' : 'collapsed',
    panelOpen: open,
  }),

  setMode: (mode) => {
    const current = get().viewMode
    if (current === mode) return
    set({
      previousMode: current,
      viewMode: mode,
      flyTarget: null,
      lastInteraction: Date.now(),
    })
  },

  enterPlanetarium: (x, z) => {
    const current = get().viewMode
    if (current === 'planetarium') return
    set({
      previousMode: current,
      viewMode: 'planetarium',
      flyTarget: null,
      planetariumOrigin: [x, z],
    })
  },

  exitPlanetarium: () => {
    const prev = get().previousMode
    set({
      viewMode: prev === 'planetarium' ? 'browse' : prev,
      flyTarget: null,
      lastInteraction: Date.now(),
    })
  },

  goHero: () => {
    const from = get().viewMode
    useLandmarkFilter.getState().clearTags()
    useSelectedBuilding.getState().deselect()
    set({
      previousMode: from,
      viewMode: 'hero',
      flyTarget: null,
      panelState: 'neutral',
      panelOpen: true,
    })
  },

  flyTo: (position, lookAt) => {
    set({
      flyTarget: { position, lookAt },
      lastInteraction: Date.now(),
    })
  },

  clearFly: () => set({ flyTarget: null }),
  setAzimuth: (angle) => set({ azimuth: angle }),
  resetIdle: () => set({ lastInteraction: Date.now() }),
}))

export default useCamera
