/**
 * API client for the Google Apps Script backend.
 * Set VITE_API_URL in .env to the deployed Apps Script web app URL.
 */

const API_URL = import.meta.env.VITE_API_URL || ''
const USE_MOCKS = !API_URL && import.meta.env.DEV

// ── Dev mocks (in-memory, no backend needed) ───────────────────────────────
const _mockReviews = []
const _mockEvents = []
const _mockHandles = {}       // device_hash -> handle
const _mockBulletins = []
const _mockThreads = []
const _mockMessages = []
const _mockComments = []
let _mockIdCounter = 1

const _mockReplies = []

const MOCKS = {
  'checkin':        () => ({ data: { logged: true, distinct_days: 1, is_local: true } }),
  'checkin-status': () => ({ data: { distinct_days: 1, threshold: 1, is_local: true } }),
  'claim':          () => ({ data: { success: true } }),
  'claim-secret':   () => ({ data: { claim_secret: 'mock1234' } }),
  'review':         (body) => {
    _mockReviews.push({ id: String(Date.now()), text: body.text, rating: body.rating, listing_id: body.listing_id, handle: body.handle || '', created_at: new Date().toISOString() })
    return { data: { success: true } }
  },
  'reviews':        (params) => ({ data: _mockReviews.filter(r => r.listing_id === params.lid).map(r => ({ ...r, replies: _mockReplies.filter(rp => rp.review_id === r.id) })) }),
  'reply':          (body) => {
    _mockReplies.push({ id: String(Date.now()), review_id: body.review_id, listing_id: body.listing_id, handle: body.handle || 'guardian', text: body.text, created_at: new Date().toISOString() })
    return { data: { success: true } }
  },
  'event':          (body) => {
    _mockEvents.push({ id: String(Date.now()), title: body.title, description: body.description, listing_id: body.listing_id, type: body.type || 'event', start_date: body.start_date, end_date: body.end_date, created_at: new Date().toISOString() })
    return { data: { success: true } }
  },
  'events':         () => ({ data: _mockEvents }),
  'listings':       () => ({ data: [] }),
  'update-listing': (body) => ({ data: { success: true, updated: Object.keys(body.fields || {}) } }),
  'accept-listing': () => ({ data: { success: true } }),
  'remove-listing': () => ({ data: { success: true } }),
  // Handle mocks
  'handle':         (params) => ({ data: { handle: _mockHandles[params.dh] || null } }),
  'check-handle':   (params) => ({ data: { available: !Object.values(_mockHandles).some(h => h.toLowerCase() === (params.h || '').toLowerCase()) } }),
  'set-handle':     (body) => {
    if (_mockHandles[body.device_hash]) return { data: { success: true, handle: _mockHandles[body.device_hash], already_set: true } }
    _mockHandles[body.device_hash] = body.handle
    return { data: { success: true, handle: body.handle } }
  },
  // Bulletin mocks
  'bulletins':       (params) => ({ data: _mockBulletins.filter(b => b.status === 'active').map(b => ({ ...b, is_mine: !!params.dh && b._device_hash === params.dh, comment_count: _mockComments.filter(c => c.bulletin_id === b.id).length })) }),
  'bulletin':        (body) => {
    const id = 'blt-' + (_mockIdCounter++)
    const now = new Date().toISOString()
    const anon = !!body.anonymous
    _mockBulletins.unshift({ id, handle: anon ? null : (_mockHandles[body.device_hash] || 'anon'), section: body.section, text: body.text, anonymous: anon, _device_hash: body.device_hash, created_at: now, expires_at: now, status: 'active' })
    return { data: { id, success: true } }
  },
  'remove-bulletin': () => ({ data: { success: true } }),
  // Thread mocks
  'threads':          (params) => ({ data: _mockThreads }),
  'start-thread':     (body) => {
    const id = 'thr-' + (_mockIdCounter++)
    _mockThreads.push({ id, bulletin_id: body.bulletin_id, other_handle: 'neighbor', last_message: null, last_message_at: new Date().toISOString(), message_count: 0, created_at: new Date().toISOString() })
    return { data: { thread_id: id, success: true } }
  },
  'send-message':     (body) => {
    const id = 'msg-' + (_mockIdCounter++)
    _mockMessages.push({ id, thread_id: body.thread_id, is_mine: true, text: body.text, created_at: new Date().toISOString() })
    return { data: { id, success: true } }
  },
  'thread-messages':  (params) => ({ data: { messages: _mockMessages.filter(m => m.thread_id === params.tid) } }),
  'close-thread':     () => ({ data: { success: true } }),
  // Comment mocks
  'comments':         (params) => ({ data: _mockComments.filter(c => c.bulletin_id === params.bid).map(c => ({ ...c, is_mine: !!params.dh && c._device_hash === params.dh })) }),
  'remove-comment':   (body) => {
    const idx = _mockComments.findIndex(c => c.id === body.comment_id)
    if (idx !== -1) _mockComments.splice(idx, 1)
    return { data: { success: true } }
  },
  'comment':          (body) => {
    const id = 'cmt-' + (_mockIdCounter++)
    const now = new Date().toISOString()
    const anon = !!body.anonymous
    _mockComments.push({ id, bulletin_id: body.bulletin_id, handle: anon ? null : (_mockHandles[body.device_hash] || 'anon'), anonymous: anon, _device_hash: body.device_hash, text: body.text, created_at: now })
    return { data: { id, success: true } }
  },
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
    headers: { 'Content-Type': 'text/plain' },
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

export async function postReview(deviceHash, listingId, text, rating, handle) {
  return post('review', { device_hash: deviceHash, listing_id: listingId, business_id: listingId, text, rating, handle: handle || '' })
}

export async function getReviews(listingId) {
  return get('reviews', { lid: listingId })
}

export async function postReply(deviceHash, reviewId, listingId, text) {
  return post('reply', { device_hash: deviceHash, review_id: reviewId, listing_id: listingId, text })
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

// ── Claim secret ─────────────────────────────────────────────────────

export async function getClaimSecret(listingId, deviceHash) {
  return get('claim-secret', { lid: listingId, dh: deviceHash })
}

export async function getClaimSecretAdmin(listingId) {
  return get('claim-secret', { lid: listingId, admin: 'lafayette1850' })
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

// ── Handles ─────────────────────────────────────────────────────────

export async function getHandle(deviceHash) {
  return get('handle', { dh: deviceHash })
}

export async function checkHandleAvailability(handle) {
  return get('check-handle', { h: handle })
}

export async function setHandle(deviceHash, handle) {
  return post('set-handle', { device_hash: deviceHash, handle })
}

// ── Bulletins ───────────────────────────────────────────────────────

export async function getBulletins(deviceHash) {
  return get('bulletins', deviceHash ? { dh: deviceHash } : {})
}

export async function postBulletin(deviceHash, section, text, anonymous = false) {
  return post('bulletin', { device_hash: deviceHash, section, text, anonymous })
}

export async function removeBulletin(deviceHash, bulletinId) {
  return post('remove-bulletin', { device_hash: deviceHash, bulletin_id: bulletinId })
}

// ── Comments ───────────────────────────────────────────────────────

export async function getComments(bulletinId, deviceHash) {
  return get('comments', { bid: bulletinId, ...(deviceHash ? { dh: deviceHash } : {}) })
}

export async function postComment(deviceHash, bulletinId, text, anonymous = false) {
  return post('comment', { device_hash: deviceHash, bulletin_id: bulletinId, text, anonymous })
}

export async function removeComment(deviceHash, commentId) {
  return post('remove-comment', { device_hash: deviceHash, comment_id: commentId })
}

// ── Threads / Messages ──────────────────────────────────────────────

export async function startThread(deviceHash, bulletinId) {
  return post('start-thread', { device_hash: deviceHash, bulletin_id: bulletinId })
}

export async function sendMessage(deviceHash, threadId, text) {
  return post('send-message', { device_hash: deviceHash, thread_id: threadId, text })
}

export async function getThreads(deviceHash) {
  return get('threads', { dh: deviceHash })
}

export async function getThreadMessages(threadId, deviceHash) {
  return get('thread-messages', { tid: threadId, dh: deviceHash })
}

export async function closeThread(deviceHash, threadId) {
  return post('close-thread', { device_hash: deviceHash, thread_id: threadId })
}
