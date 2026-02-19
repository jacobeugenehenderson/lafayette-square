import { create } from 'zustand'
import { getDeviceHash } from '../lib/device'
import { getHandle, setHandle as apiSetHandle, checkHandleAvailability } from '../lib/api'

const STORAGE_KEY = 'lsq_handle'

const useHandle = create((set, get) => ({
  handle: localStorage.getItem(STORAGE_KEY) || null,
  loading: false,
  error: null,

  /** Refresh handle from backend */
  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const dh = await getDeviceHash()
      const res = await getHandle(dh)
      const handle = res.data?.handle || null
      if (handle) localStorage.setItem(STORAGE_KEY, handle)
      set({ handle, loading: false })
    } catch (err) {
      set({ loading: false, error: err.message })
    }
  },

  /** Set handle for the first time */
  setHandle: async (handle) => {
    set({ loading: true, error: null })
    try {
      const dh = await getDeviceHash()
      const res = await apiSetHandle(dh, handle)
      if (res.data?.error) {
        set({ loading: false, error: res.data.error })
        return false
      }
      const h = res.data?.handle || handle
      localStorage.setItem(STORAGE_KEY, h)
      set({ handle: h, loading: false })
      return true
    } catch (err) {
      set({ loading: false, error: err.message })
      return false
    }
  },

  /** Check if a handle is available */
  checkAvailability: async (handle) => {
    try {
      const res = await checkHandleAvailability(handle)
      return res.data?.available ?? false
    } catch {
      return false
    }
  },
}))

// Auto-refresh on first import
useHandle.getState().refresh()

export default useHandle
