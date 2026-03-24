/**
 * Anonymous device identity for check-in and guardian systems.
 * Each browser gets a unique random ID on first visit, persisted in localStorage.
 */

const STORAGE_KEY = 'lsq_device_hash'

function generateDeviceId() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

let cached = null

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
