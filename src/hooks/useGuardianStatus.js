import { create } from 'zustand'
import { getDeviceHash } from '../lib/device'
import { postClaim, adminAuth, adminVerify } from '../lib/api'

const GUARDIAN_KEY = 'lsq_guardian_listings'
const ADMIN_KEY = 'lsq_admin'
const TOKEN_KEY = 'lsq_admin_token'

const ALL_PERMS = ['menu', 'events', 'replies', 'photos', 'hours']

function loadGuardianList() {
  try {
    const old = localStorage.getItem('lsq_guardian_businesses')
    if (old && !localStorage.getItem(GUARDIAN_KEY)) {
      localStorage.setItem(GUARDIAN_KEY, old)
      localStorage.removeItem('lsq_guardian_businesses')
    }
    const raw = JSON.parse(localStorage.getItem(GUARDIAN_KEY) || '[]')
    // Migrate: old format was string[], new format is { id, role, permissions }[]
    if (raw.length > 0 && typeof raw[0] === 'string') {
      const migrated = raw.map(id => ({ id, role: 'guardian', permissions: ALL_PERMS }))
      localStorage.setItem(GUARDIAN_KEY, JSON.stringify(migrated))
      return migrated
    }
    return raw
  } catch { return [] }
}

function saveList(list) {
  localStorage.setItem(GUARDIAN_KEY, JSON.stringify(list))
}

const useGuardianStatus = create((set, get) => ({
  guardianOf: loadGuardianList(),
  isAdmin: false,
  loading: false,
  error: null,

  // Admin passphrase modal state
  adminPromptOpen: false,
  adminPromptError: null,

  /** Any role (guardian or keyholder) on this listing */
  isGuardianOf(listingId) {
    return get().guardianOf.some(e => e.id === listingId)
  },

  /** Full guardian only */
  isFullGuardianOf(listingId) {
    return get().guardianOf.some(e => e.id === listingId && e.role === 'guardian')
  },

  /** Returns 'guardian', 'keyholder', or null */
  roleFor(listingId) {
    const entry = get().guardianOf.find(e => e.id === listingId)
    return entry ? entry.role : null
  },

  /** Returns permissions array for listing */
  permissionsFor(listingId) {
    const entry = get().guardianOf.find(e => e.id === listingId)
    if (!entry) return []
    if (entry.role === 'guardian') return ALL_PERMS
    return entry.permissions || []
  },

  /** Check a specific permission (guardians always true) */
  hasPermission(listingId, perm) {
    return get().permissionsFor(listingId).includes(perm)
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

  /** Claim guardian/keyholder status via secret QR code */
  claim: async (listingId, secret) => {
    set({ loading: true, error: null })
    try {
      const dh = await getDeviceHash()
      const res = await postClaim(dh, listingId, secret)
      const d = res.data
      if (d.success || d.claimed || d.already_claimed) {
        const role = d.role || 'guardian'
        const permissions = d.permissions || (role === 'guardian' ? ALL_PERMS : [])
        const existing = get().guardianOf.filter(e => e.id !== listingId)
        const list = [...existing, { id: listingId, role, permissions }]
        saveList(list)
        set({ guardianOf: list, loading: false })
        return { success: true, role, permissions }
      }
      set({ loading: false, error: d.error || 'Claim failed' })
      return { success: false, error: d.error }
    } catch (err) {
      set({ loading: false, error: err.message })
      return { success: false, error: err.message }
    }
  },
}))

// Sync init — check URL params immediately (before React mounts)
const _initParams = new URLSearchParams(window.location.search)

if (_initParams.has('logout')) {
  localStorage.removeItem(ADMIN_KEY)
  localStorage.removeItem(GUARDIAN_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
  useGuardianStatus.setState({ isAdmin: false, guardianOf: [] })
  _initParams.delete('logout')
  const clean = _initParams.toString()
  window.history.replaceState({}, '', window.location.pathname + (clean ? '?' + clean : ''))
}

// ?admin — set adminPromptOpen synchronously so Scene never mounts.
// The AdminPrompt component handles the input after React renders.
const _wantsAdmin = _initParams.has('admin')
if (_wantsAdmin) {
  _initParams.delete('admin')
  const clean = _initParams.toString()
  window.history.replaceState({}, '', window.location.pathname + (clean ? '?' + clean : ''))
  // Set directly on store — Scene reads this before mounting
  useGuardianStatus.setState({ adminPromptOpen: true })
}

// Async: verify existing session token (doesn't affect mounting)
if (!_wantsAdmin && localStorage.getItem(ADMIN_KEY) === 'true') {
  const _token = sessionStorage.getItem(TOKEN_KEY)
  if (_token) {
    adminVerify(_token).then(res => {
      if (res?.data?.valid) {
        useGuardianStatus.setState({ isAdmin: true })
      } else {
        localStorage.removeItem(ADMIN_KEY)
        sessionStorage.removeItem(TOKEN_KEY)
      }
    }).catch(() => {
      localStorage.removeItem(ADMIN_KEY)
      sessionStorage.removeItem(TOKEN_KEY)
    })
  } else {
    localStorage.removeItem(ADMIN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
  }
}

export default useGuardianStatus
