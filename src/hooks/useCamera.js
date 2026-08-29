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

// ── `?shot=` — an embed asks for an AUTHORED shot by name ────────────────────
// ⭐ THE SITE NAMES A SHOT; THE PRODUCT DECIDES THE NUMBERS. An embedding page
// wants a particular framing — an overhead of the whole neighbourhood, say — and
// before this it had no way to ask for one, so the only route open to it was to
// carry a centre and a zoom of its own. That is the fork `theward-online`'s
// INTEGRATION.md forbids outright ("an embed must never fork the thing it
// embeds"), and it is Layer 0's failure mode besides: a framing baked into the
// page is Lafayette Square's framing, inherited by every town after it.
//
// So the page sends a NAME and the slab supplies the geometry.
// `scene.json#shots.values` already holds it, authored per look in Stage's
// Camera/Shots card — `browse` carries `fov`, `padding` and `bounds{cx,cz,w,h}`,
// which is exactly the centre and zoom an embed was reaching for. Re-frame the
// marketing shot in Stage and every page framing it moves, with no site change.
//
// ⚠ FRAMED-ONLY, like `?layer=` and `?embed=`. Unframed this is inert and the
// app boots on 'hero' exactly as it always has.
// ⛔ AND IT IS LOUD ON A NAME IT DOES NOT KNOW. A typo'd shot silently showing
// the default is the plausible-looking success the kit cannot afford — the
// operator sees a framing, believes it is the one they authored, and never
// learns otherwise. Say so in the console and stay on 'hero'.
const SHOT_MODES = { hero: 'hero', browse: 'browse', street: 'planetarium' }
function initialViewMode() {
  if (!FRAMED) return 'hero'
  let asked = null
  try { asked = new URLSearchParams(window.location.search).get('shot') } catch { return 'hero' }
  if (!asked) return 'hero'
  const mode = SHOT_MODES[asked]
  if (!mode) {
    console.error(`[ward] ⛔ ?shot=${asked} is not a shot this app knows — `
      + `expected one of ${Object.keys(SHOT_MODES).join(', ')}. Showing the hero shot instead; `
      + `the framing you authored is NOT what is on screen.`)
    return 'hero'
  }
  return mode
}

const useCamera = create((set, get) => ({
  viewMode: initialViewMode(),   // 'hero' | 'browse' | 'planetarium'
  // Seeded to match, so the first setMode() out of an embed's shot does not
  // record a transition from a mode the app was never in.
  previousMode: initialViewMode(),
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
