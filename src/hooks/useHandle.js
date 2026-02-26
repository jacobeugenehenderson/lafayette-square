import { create } from 'zustand'
import { getDeviceHash, clearCachedHash } from '../lib/device'
import { getHandle, setHandle as apiSetHandle, checkHandleAvailability, updateAvatar as apiUpdateAvatar } from '../lib/api'

const STORAGE_KEY = 'lsq_handle'
const AVATAR_KEY = 'lsq_avatar'
const DEVICE_KEY = 'lsq_device_hash'

const useHandle = create((set, get) => ({
  handle: localStorage.getItem(STORAGE_KEY) || null,
  avatar: localStorage.getItem(AVATAR_KEY) || null,
  loading: false,
  error: null,

  /** Refresh handle from backend */
  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const dh = await getDeviceHash()
      const res = await getHandle(dh)
      const handle = res.data?.handle || null
      const avatar = res.data?.avatar || null
      if (handle) localStorage.setItem(STORAGE_KEY, handle)
      if (avatar) localStorage.setItem(AVATAR_KEY, avatar)
      else localStorage.removeItem(AVATAR_KEY)
      set({ handle, avatar, loading: false })
    } catch (err) {
      set({ loading: false, error: err.message })
    }
  },

  /** Set handle for the first time */
  setHandle: async (handle, avatar) => {
    set({ loading: true, error: null })
    try {
      const dh = await getDeviceHash()
      const res = await apiSetHandle(dh, handle, avatar)
      if (res.data?.error) {
        set({ loading: false, error: res.data.error })
        return false
      }
      const h = res.data?.handle || handle
      const a = res.data?.avatar || avatar || null
      localStorage.setItem(STORAGE_KEY, h)
      if (a) localStorage.setItem(AVATAR_KEY, a)
      set({ handle: h, avatar: a, loading: false })
      return true
    } catch (err) {
      set({ loading: false, error: err.message })
      return false
    }
  },

  /** Update avatar only (handle stays permanent) */
  updateAvatar: async (avatar) => {
    set({ loading: true, error: null })
    try {
      const dh = await getDeviceHash()
      const res = await apiUpdateAvatar(dh, avatar)
      if (res.data?.error) {
        set({ loading: false, error: res.data.error })
        return false
      }
      const a = res.data?.avatar || avatar || null
      if (a) localStorage.setItem(AVATAR_KEY, a)
      else localStorage.removeItem(AVATAR_KEY)
      set({ avatar: a, loading: false })
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

  /** Adopt identity from another device (link flow) */
  adoptIdentity: (deviceHash, handle, avatar) => {
    localStorage.setItem(DEVICE_KEY, deviceHash)
    localStorage.setItem(STORAGE_KEY, handle)
    if (avatar) localStorage.setItem(AVATAR_KEY, avatar)
    else localStorage.removeItem(AVATAR_KEY)
    clearCachedHash()
    set({ handle, avatar: avatar || null, loading: false, error: null })
  },
}))

// Auto-refresh on first import
useHandle.getState().refresh()

export default useHandle
