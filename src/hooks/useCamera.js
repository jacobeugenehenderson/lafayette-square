import { create } from 'zustand'
import useLandmarkFilter from './useLandmarkFilter'
import useSelectedBuilding from './useSelectedBuilding'

// Embed anchor. Framed, the panel starts COLLAPSED — down to its three-part
// bar, with the neighbourhood showing behind it.
//
// Someone arriving at lafayette-square.com came for the commons, so the panel
// opens on it. Someone meeting this in a frame on somebody else's page did
// not: they came for whatever that page is about, they will give it a few
// seconds, and what they should see first is the place. The bar is still
// right there to open.
//
// Reading `window.top` across a cross-origin parent can throw, so it is
// guarded — and a throw means we ARE framed. Unframed, nothing changes.
function isFramed() {
  try { return window.self !== window.top } catch { return true }
}
// Exported because it is the gate on the whole embed surface, and there must be
// exactly one answer to "are we framed?" in the app.
export const FRAMED = typeof window !== 'undefined' && isFramed()

const useCamera = create((set, get) => ({
  viewMode: 'hero',       // 'hero' | 'browse' | 'planetarium'
  previousMode: 'hero',
  panelState: FRAMED ? 'collapsed' : 'neutral',  // 'collapsed' | 'neutral' | 'browse' | 'full'
  panelOpen: !FRAMED,       // derived compat — false only when collapsed
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
    // Dismiss any open place card: a double-click's FIRST click can select a
    // building (opening the near-fullscreen PlaceCard, which carries
    // `data-scene-pause` and freezes the render loop); without this, dropping to
    // street level leaves the dark glass card up over a frozen frame ("screen
    // goes dark"). goHero() deselects for the same reason.
    useSelectedBuilding.getState().deselect()
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
