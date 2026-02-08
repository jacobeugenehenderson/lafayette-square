/**
 * Anonymous device fingerprint for check-in and guardian systems.
 * Generates a consistent hash per device, stored in localStorage.
 * Not personally identifiable — many devices can share the same fingerprint.
 */

const STORAGE_KEY = 'lsq_device_hash'

async function generateFingerprint() {
  const raw = [
    screen.width,
    screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    navigator.platform,
    navigator.hardwareConcurrency || 0,
  ].join('|')

  const encoded = new TextEncoder().encode(raw)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

let cached = null

export async function getDeviceHash() {
  if (cached) return cached

  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    cached = stored
    return stored
  }

  const hash = await generateFingerprint()
  localStorage.setItem(STORAGE_KEY, hash)
  cached = hash
  return hash
}
