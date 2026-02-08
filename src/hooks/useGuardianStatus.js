import { create } from 'zustand'
import { getDeviceHash } from '../lib/device'
import { postClaim } from '../lib/api'

const GUARDIAN_KEY = 'lsq_guardian_businesses'

function loadGuardianList() {
  try {
    return JSON.parse(localStorage.getItem(GUARDIAN_KEY) || '[]')
  } catch { return [] }
}

const useGuardianStatus = create((set, get) => ({
  guardianOf: loadGuardianList(),
  loading: false,
  error: null,

  isGuardianOf(businessId) {
    return get().guardianOf.includes(businessId)
  },

  /** Claim guardian ownership of a business via secret QR code */
  claim: async (businessId, secret) => {
    set({ loading: true, error: null })
    try {
      const dh = await getDeviceHash()
      const res = await postClaim(dh, businessId, secret)
      const d = res.data
      if (d.success) {
        const list = [...new Set([...get().guardianOf, businessId])]
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
