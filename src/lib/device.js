/**
 * Anonymous device identity for check-in and guardian systems.
 * Each browser gets a unique random ID on first visit, persisted in localStorage.
 */

export const DEVICE_HASH_KEY = 'lsq_device_hash'
const STORAGE_KEY = DEVICE_HASH_KEY

function generateDeviceId() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

let cached = null

/**
 * Read the device hash WITHOUT minting one.
 *
 * ⭐ Deliberately does not generate: this is used by the Supabase client to
 * attach the `x-device-hash` header that `requests` RLS checks (migration 010),
 * and the transport layer must not be what creates a person's identity. Before
 * `getDeviceHash()` has run there is simply no hash and no header — and the
 * policies fail closed, which is the correct direction.
 */
export function peekDeviceHash() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null // private mode / storage disabled
  }
}

export function clearCachedHash() {
  cached = null
}

export async function getDeviceHash() {
  if (cached) return cached

  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    cached = stored
    return stored
  }

  const hash = generateDeviceId()
  localStorage.setItem(STORAGE_KEY, hash)
  cached = hash
  return hash
}
