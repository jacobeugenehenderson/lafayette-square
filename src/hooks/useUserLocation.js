import { create } from 'zustand'
import { INSTANCE } from '../instance.js'

const CENTER_LAT = INSTANCE.geography.lat
const CENTER_LON = INSTANCE.geography.lon
const LON_TO_METERS = 86774
const LAT_TO_METERS = 111000
const BOUNDS_RADIUS = 800 // meters from center — covers Truman/Chouteau/Jefferson/44 box

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
        const lon = pos.coords.longitude
        const lat = pos.coords.latitude
        const x = (lon - CENTER_LON) * LON_TO_METERS
        const z = (CENTER_LAT - lat) * LAT_TO_METERS
        const dist = Math.sqrt(x * x + z * z)
        set({
          x,
          z,
          accuracy: pos.coords.accuracy,
          inBounds: dist <= BOUNDS_RADIUS,
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
