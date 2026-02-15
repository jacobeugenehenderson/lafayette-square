import { create } from 'zustand'
import { getDeviceHash } from '../lib/device'
import { postClaim } from '../lib/api'

const GUARDIAN_KEY = 'lsq_guardian_listings'

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
  loading: false,
  error: null,

  isGuardianOf(listingId) {
    return get().guardianOf.includes(listingId)
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
