/**
 * API client for the Google Apps Script backend.
 * Set VITE_API_URL in .env to the deployed Apps Script web app URL.
 */

const API_URL = import.meta.env.VITE_API_URL || ''
const USE_MOCKS = !API_URL && import.meta.env.DEV

// ── Dev mocks (in-memory, no backend needed) ───────────────────────────────
const _mockReviews = []
const _mockEvents = []

const MOCKS = {
  'checkin':        () => ({ data: { logged: true, distinct_days: 1, is_local: true } }),
  'checkin-status': () => ({ data: { distinct_days: 1, threshold: 1, is_local: true } }),
  'claim':          () => ({ data: { success: true } }),
  'review':         (body) => {
    _mockReviews.push({ id: String(Date.now()), text: body.text, rating: body.rating, listing_id: body.listing_id, created_at: new Date().toISOString() })
    return { data: { success: true } }
  },
  'reviews':        (params) => ({ data: _mockReviews.filter(r => r.listing_id === params.lid) }),
  'event':          (body) => {
    _mockEvents.push({ id: String(Date.now()), title: body.title, description: body.description, listing_id: body.listing_id, type: body.type || 'event', start_date: body.start_date, end_date: body.end_date, created_at: new Date().toISOString() })
    return { data: { success: true } }
  },
  'events':         () => ({ data: _mockEvents }),
  'listings':       () => ({ data: [] }),
  'update-listing': (body) => ({ data: { success: true, updated: Object.keys(body.fields || {}) } }),
  'accept-listing': () => ({ data: { success: true } }),
  'remove-listing': () => ({ data: { success: true } }),
}

async function get(action, params = {}) {
  if (USE_MOCKS && MOCKS[action]) return MOCKS[action](params)
  const url = new URL(API_URL)
  url.searchParams.set('action', action)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) throw new Error(`API GET ${action} failed: ${res.status}`)
  return res.json()
}

async function post(action, body = {}) {
  if (USE_MOCKS && MOCKS[action]) return MOCKS[action](body)
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  })
  if (!res.ok) throw new Error(`API POST ${action} failed: ${res.status}`)
  return res.json()
}

// ── Check-in (local determiner) ─────────────────────────────────────────

export async function postCheckin(deviceHash, locationId) {
  return post('checkin', { device_hash: deviceHash, location_id: locationId })
}

export async function getCheckinStatus(deviceHash) {
  return get('checkin-status', { dh: deviceHash })
}

// ── Guardian claim ──────────────────────────────────────────────────────

export async function postClaim(deviceHash, listingId, secret) {
  return post('claim', { device_hash: deviceHash, listing_id: listingId, business_id: listingId, secret })
}

// ── Reviews (local-only) ────────────────────────────────────────────────

export async function postReview(deviceHash, listingId, text, rating) {
  return post('review', { device_hash: deviceHash, listing_id: listingId, business_id: listingId, text, rating })
}

export async function getReviews(listingId) {
  return get('reviews', { lid: listingId })
}

// ── Events (guardian-only) ──────────────────────────────────────────────

export async function postEvent(deviceHash, listingId, title, description, startDate, endDate, type) {
  return post('event', {
    device_hash: deviceHash,
    listing_id: listingId,
    business_id: listingId,
    title, description,
    start_date: startDate,
    end_date: endDate,
    type: type || 'event',
  })
}

export async function getEvents() {
  return get('events')
}

// ── Listings ────────────────────────────────────────────────────────────

export async function getListings() {
  return get('listings')
}

export async function updateListing(deviceHash, listingId, fields) {
  return post('update-listing', { device_hash: deviceHash, listing_id: listingId, business_id: listingId, fields })
}

export async function acceptListing(deviceHash, listingId) {
  return post('accept-listing', { device_hash: deviceHash, listing_id: listingId })
}

export async function removeListing(deviceHash, listingId) {
  return post('remove-listing', { device_hash: deviceHash, listing_id: listingId })
}
