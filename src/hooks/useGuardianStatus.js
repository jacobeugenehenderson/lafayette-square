import { create } from 'zustand'
import { getDeviceHash } from '../lib/device'
import { postClaim, adminAuth, adminVerify } from '../lib/api'

const GUARDIAN_KEY = 'lsq_guardian_listings'
const ADMIN_KEY = 'lsq_admin'
const TOKEN_KEY = 'lsq_admin_token'

// On load: if ?admin is in URL, prompt for passphrase and validate server-side.
// If ?logout is in URL, drop admin + guardian status.
// Otherwise, check if we have a valid session token from a previous login.
async function checkAdminStatus() {
  try {
    const params = new URLSearchParams(window.location.search)

    // ?logout — drop everything, clean URL
    if (params.has('logout')) {
      localStorage.removeItem(ADMIN_KEY)
      localStorage.removeItem(GUARDIAN_KEY)
      sessionStorage.removeItem(TOKEN_KEY)
      params.delete('logout')
      const clean = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (clean ? '?' + clean : ''))
      return false
    }

    // ?admin — prompt for passphrase, validate server-side
    if (params.has('admin')) {
      params.delete('admin')
      const clean = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (clean ? '?' + clean : ''))

      const passphrase = window.prompt('Admin passphrase:')
      if (!passphrase) return localStorage.getItem(ADMIN_KEY) === 'true'

      const res = await adminAuth(passphrase)
      if (res?.data?.admin_token) {
        sessionStorage.setItem(TOKEN_KEY, res.data.admin_token)
        localStorage.setItem(ADMIN_KEY, 'true')
        return true
      }
      return false
    }

    // Returning session — check if stored token is still valid
    if (localStorage.getItem(ADMIN_KEY) === 'true') {
      const token = sessionStorage.getItem(TOKEN_KEY)
      if (token) {
        const res = await adminVerify(token)
        if (res?.data?.valid) return true
      }
      // Token expired or missing — drop admin flag
      localStorage.removeItem(ADMIN_KEY)
      sessionStorage.removeItem(TOKEN_KEY)
    }

    return false
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
  isAdmin: false, // set asynchronously after server check
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

// Async init — check admin status server-side
checkAdminStatus().then(isAdmin => {
  useGuardianStatus.setState({ isAdmin })
})

export default useGuardianStatus
