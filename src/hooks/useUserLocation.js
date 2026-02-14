import { create } from 'zustand'

const CENTER_LAT = 38.6160
const CENTER_LON = -90.2161
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
        console.log(`[UserLocation] lat=${lat.toFixed(5)} lon=${lon.toFixed(5)} → x=${x.toFixed(1)} z=${z.toFixed(1)} dist=${dist.toFixed(1)}m acc=${pos.coords.accuracy.toFixed(1)}m inBounds=${dist <= BOUNDS_RADIUS}`)
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
