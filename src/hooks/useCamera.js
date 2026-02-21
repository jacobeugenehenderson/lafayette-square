import { create } from 'zustand'
import useLandmarkFilter from './useLandmarkFilter'
import useSelectedBuilding from './useSelectedBuilding'

// ── Debug logger (visible with ?debug URL param) ──
window.__cameraLog = []
function _dlog(msg) {
  const t = new Date().toISOString().slice(14, 23)
  window.__cameraLog.push(`${t} ${msg}`)
  if (window.__cameraLog.length > 30) window.__cameraLog.shift()
  console.log(`[cam] ${msg}`)
}

const useCamera = create((set, get) => ({
  viewMode: 'hero',       // 'hero' | 'browse' | 'planetarium'
  previousMode: 'hero',
  panelOpen: false,
  azimuth: 0,
  flyTarget: null,
  planetariumOrigin: null,  // [x, z] ground position for street-level sky view
  lastInteraction: Date.now(),

  setPanelOpen: (open) => set({ panelOpen: open }),

  setMode: (mode) => {
    const current = get().viewMode
    if (current === mode) return
    _dlog(`setMode ${current}→${mode}`)
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
    const stack = new Error().stack || ''
    const caller = stack.split('\n').slice(1, 4).map(s => s.trim()).join(' < ')
    _dlog(`goHero from=${from} via: ${caller}`)
    useLandmarkFilter.getState().clearTags()
    useSelectedBuilding.getState().deselect()
    set({
      previousMode: from,
      viewMode: 'hero',
      flyTarget: null,
      panelOpen: false,
    })
  },

  flyTo: (position, lookAt) => {
    _dlog(`flyTo pos=[${position.map(v=>v.toFixed(0))}]`)
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
