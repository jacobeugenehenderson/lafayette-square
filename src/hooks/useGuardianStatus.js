import { create } from 'zustand'
import { getDeviceHash } from '../lib/device'
import { postClaim, adminAuth, adminVerify } from '../lib/api'

const GUARDIAN_KEY = 'lsq_guardian_listings'
const ADMIN_KEY = 'lsq_admin'
const TOKEN_KEY = 'lsq_admin_token'

function loadGuardianList() {
  try {
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
  isAdmin: false,
  loading: false,
  error: null,

  // Admin passphrase modal state
  adminPromptOpen: false,
  adminPromptError: null,

  isGuardianOf(listingId) {
    return get().guardianOf.includes(listingId)
  },

  /** Open the admin passphrase modal */
  openAdminPrompt: () => set({ adminPromptOpen: true, adminPromptError: null }),

  /** Submit passphrase from the modal */
  submitAdminPassphrase: async (passphrase) => {
    if (!passphrase) {
      set({ adminPromptOpen: false })
      return
    }
    try {
      const res = await adminAuth(passphrase)
      if (res?.data?.admin_token) {
        sessionStorage.setItem(TOKEN_KEY, res.data.admin_token)
        localStorage.setItem(ADMIN_KEY, 'true')
        set({ isAdmin: true, adminPromptOpen: false, adminPromptError: null })
      } else {
        set({ adminPromptError: 'Invalid passphrase' })
      }
    } catch (err) {
      console.error('[Admin auth]', err)
      set({ adminPromptError: 'Connection failed' })
    }
  },

  /** Cancel the admin prompt */
  cancelAdminPrompt: () => set({ adminPromptOpen: false, adminPromptError: null }),

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

// Async init — check for ?admin, ?logout, or existing session
;(async function initAdmin() {
  try {
    const params = new URLSearchParams(window.location.search)

    // ?logout — drop everything
    if (params.has('logout')) {
      localStorage.removeItem(ADMIN_KEY)
      localStorage.removeItem(GUARDIAN_KEY)
      sessionStorage.removeItem(TOKEN_KEY)
      params.delete('logout')
      const clean = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (clean ? '?' + clean : ''))
      return
    }

    // ?admin — open the passphrase modal (don't use window.prompt)
    if (params.has('admin')) {
      params.delete('admin')
      const clean = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (clean ? '?' + clean : ''))
      // Delay slightly so React has mounted
      setTimeout(() => useGuardianStatus.getState().openAdminPrompt(), 300)
      return
    }

    // Returning session — verify stored token
    if (localStorage.getItem(ADMIN_KEY) === 'true') {
      const token = sessionStorage.getItem(TOKEN_KEY)
      if (token) {
        const res = await adminVerify(token)
        if (res?.data?.valid) {
          useGuardianStatus.setState({ isAdmin: true })
          return
        }
      }
      localStorage.removeItem(ADMIN_KEY)
      sessionStorage.removeItem(TOKEN_KEY)
    }
  } catch (err) {
    console.error('[Admin init]', err)
  }
})()

export default useGuardianStatus
