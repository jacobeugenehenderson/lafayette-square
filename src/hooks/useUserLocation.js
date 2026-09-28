import { create } from 'zustand'
import { townPlace } from '../lib/townPlace.js'
import { getSceneStencil } from '../components/sceneStencilState'

// ⛔ Both numbers here used to be Lafayette Square's: LON_TO_METERS = 86774 (metres per degree of longitude
// at 38.6°N) and an 800 m "in bounds" radius (its streets, by name). In any other town the dot sat east or
// west of where the visitor stood — 5% off at Provincetown — and "in the neighbourhood" meant LS's size.
// The projection is now the TOWN's own (lib/townPlace.js, the one the sun uses), and "in bounds" is the
// town's own disc (ground.json#stencil, published by BakedGround). An unknown disc is said, never guessed.
let _warnedNoDisc = false

const useUserLocation = create((set, get) => ({
  x: null,
  z: null,
  accuracy: null,
  inBounds: false,
  active: false,
  error: null,
  _watchId: null,

  start: () => {
    if (get()._watchId != null) return
    if (!navigator.geolocation) {
      set({ error: 'Geolocation not supported' })
      return
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const place = townPlace()
        const x = (pos.coords.longitude - place.lon) * place.lonToMeters
        const z = (place.lat - pos.coords.latitude) * place.latToMeters
        const disc = getSceneStencil()
        if (!disc && !_warnedNoDisc) {
          _warnedNoDisc = true
          console.error(`[userLocation] "${place.lookId}" has published no scene disc yet — the visitor is treated as outside the town until it has`)
        }
        const [cx, cz] = disc?.center ?? [0, 0]
        set({
          x,
          z,
          accuracy: pos.coords.accuracy,
          inBounds: !!disc && Math.hypot(x - cx, z - cz) <= disc.radius,
          active: true,
          error: null,
        })
      },
      (err) => {
        set({ error: err.message, active: false })
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    )

    set({ _watchId: id })
  },

  stop: () => {
    const id = get()._watchId
    if (id != null) {
      navigator.geolocation.clearWatch(id)
      set({ _watchId: null, active: false })
    }
  },
}))

export default useUserLocation
