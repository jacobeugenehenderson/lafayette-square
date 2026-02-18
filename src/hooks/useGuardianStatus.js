import { create } from 'zustand'
import { getDeviceHash } from '../lib/device'
import { postClaim } from '../lib/api'

const GUARDIAN_KEY = 'lsq_guardian_listings'
const ADMIN_KEY = 'lsq_admin'
const ADMIN_SECRET = 'lafayette1850'

// Check for ?admin= param on load, persist to localStorage
function checkAdminParam() {
  try {
    const params = new URLSearchParams(window.location.search)
    const secret = params.get('admin')
    if (secret === ADMIN_SECRET) {
      localStorage.setItem(ADMIN_KEY, 'true')
      // Clean URL
      params.delete('admin')
      const clean = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (clean ? '?' + clean : ''))
      return true
    }
    return localStorage.getItem(ADMIN_KEY) === 'true'
  } catch { return false }
}

function loadGuardianList() {
  try {
    // Migrate old key if present
    const old = localStorage.getItem('lsq_guardian_businesses')
    if (old && !localStorage.getItem(GUARDIAN_KEY)) {
      localStorage.setItem(GUARDIAN_KEY, old)
      localStorage.removeItem('lsq_guardian_businesses')
    }
    return JSON.parse(localStorage.getItem(GUARDIAN_KEY) || '[]')
  } catch { return [] }
}

const useGuardianStatus = create((set, get) => ({
  guardianOf: loadGuardianList(),
  isAdmin: checkAdminParam(),
  loading: false,
  error: null,

  isGuardianOf(listingId) {
    return get().isAdmin || get().guardianOf.includes(listingId)
  },

  /** Claim guardian ownership of a listing via secret QR code */
  claim: async (listingId, secret) => {
    set({ loading: true, error: null })
    try {
      const dh = await getDeviceHash()
      const res = await postClaim(dh, listingId, secret)
      const d = res.data
      if (d.success || d.claimed || d.already_claimed) {
        const list = [...new Set([...get().guardianOf, listingId])]
        localStorage.setItem(GUARDIAN_KEY, JSON.stringify(list))
        set({ guardianOf: list, loading: false })
        return { success: true }
      }
      set({ loading: false, error: d.error || 'Claim failed' })
      return { success: false, error: d.error }
    } catch (err) {
      set({ loading: false, error: err.message })
      return { success: false, error: err.message }
    }
  },
}))

export default useGuardianStatus
