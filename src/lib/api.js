/**
 * API client for the Google Apps Script backend.
 * Set VITE_API_URL in .env to the deployed Apps Script web app URL.
 */

const API_URL = import.meta.env.VITE_API_URL || ''
const USE_MOCKS = !API_URL && import.meta.env.DEV

// ── Dev mocks (in-memory, no backend needed) ───────────────────────────────
const _mockReviews = []
const _mockEvents = []
const _mockBusinessTags = new Map()

const MOCKS = {
  'checkin':        () => ({ data: { logged: true, distinct_days: 1, is_local: true } }),
  'checkin-status': () => ({ data: { distinct_days: 1, threshold: 1, is_local: true } }),
  'claim':          () => ({ data: { success: true } }),
  'review':         (body) => {
    _mockReviews.push({ id: String(Date.now()), text: body.text, rating: body.rating, business_id: body.business_id, created_at: new Date().toISOString() })
    return { data: { success: true } }
  },
  'reviews':        (params) => ({ data: { reviews: _mockReviews.filter(r => r.business_id === params.bid) } }),
  'event':          (body) => {
    _mockEvents.push({ id: String(Date.now()), title: body.title, description: body.description, business_id: body.business_id, start_date: body.start_date, end_date: body.end_date, created_at: new Date().toISOString() })
    return { data: { success: true } }
  },
  'events':         () => ({ data: { events: _mockEvents } }),
  'business-tags':  (params) => {
    const entry = _mockBusinessTags.get(params.bid)
    return { data: entry || { business_id: params.bid, primary_tag: null, tags: [], updated_at: null } }
  },
  'save-business-tags': (body) => {
    _mockBusinessTags.set(body.business_id, {
      business_id: body.business_id,
      primary_tag: body.primary_tag,
      tags: body.tags,
      updated_at: new Date().toISOString(),
    })
    return { data: { success: true } }
  },
  'businesses':     () => ({ data: { businesses: [] } }),
  'categories':     () => ({ data: { categories: [] } }),
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

export async function postClaim(deviceHash, businessId, secret) {
  return post('claim', { device_hash: deviceHash, business_id: businessId, secret })
}

// ── Reviews (local-only) ────────────────────────────────────────────────

export async function postReview(deviceHash, businessId, text, rating) {
  return post('review', { device_hash: deviceHash, business_id: businessId, text, rating })
}

export async function getReviews(businessId) {
  return get('reviews', { bid: businessId })
}

// ── Events (guardian-only) ──────────────────────────────────────────────

export async function postEvent(deviceHash, businessId, title, description, startDate, endDate) {
  return post('event', {
    device_hash: deviceHash,
    business_id: businessId,
    title, description,
    start_date: startDate,
    end_date: endDate,
  })
}

export async function getEvents() {
  return get('events')
}

// ── Community posts (local-only) ────────────────────────────────────────

export async function postCommunityPost(deviceHash, text) {
  return post('community-post', { device_hash: deviceHash, text })
}

// ── Business tags (guardian-only) ────────────────────────────────────────

export async function getBusinessTags(businessId) {
  return get('business-tags', { bid: businessId })
}

export async function saveBusinessTags(deviceHash, businessId, primaryTag, tags) {
  return post('save-business-tags', {
    device_hash: deviceHash,
    business_id: businessId,
    primary_tag: primaryTag,
    tags,
  })
}

// ── Read-only data ──────────────────────────────────────────────────────

export async function getBusinesses() {
  return get('businesses')
}

export async function getCategories() {
  return get('categories')
}
