import { create } from 'zustand'
import { getDeviceHash } from '../lib/device'
import { getCheckinStatus, postCheckin } from '../lib/api'

const LOCAL_TOKEN_KEY = 'lsq_local_token'

const useLocalStatus = create((set, get) => ({
  isLocal: !!localStorage.getItem(LOCAL_TOKEN_KEY),
  distinctDays: 0,
  threshold: 3,
  loading: false,
  error: null,

  /** Refresh local status from the backend */
  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const dh = await getDeviceHash()
      const res = await getCheckinStatus(dh)
      const isLocal = res.data.is_local
      if (isLocal) {
        localStorage.setItem(LOCAL_TOKEN_KEY, 'true')
      }
      set({
        isLocal,
        distinctDays: res.data.distinct_days,
        threshold: res.data.threshold,
        loading: false,
      })
    } catch (err) {
      set({ loading: false, error: err.message })
    }
  },

  /** Log a check-in at a local place */
  checkin: async (locationId) => {
    set({ loading: true, error: null })
    try {
      const dh = await getDeviceHash()
      const res = await postCheckin(dh, locationId)
      const d = res.data
      if (d.is_local) {
        localStorage.setItem(LOCAL_TOKEN_KEY, 'true')
      }
      set({
        isLocal: d.is_local || false,
        distinctDays: d.distinct_days || get().distinctDays,
        loading: false,
      })
      return d
    } catch (err) {
      set({ loading: false, error: err.message })
      return { logged: false, error: err.message }
    }
  },
}))

export default useLocalStatus
