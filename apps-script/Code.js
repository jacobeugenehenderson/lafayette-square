/**
 * Lafayette Square — Google Apps Script Backend
 *
 * Deploy as: Web App (Execute as: Me, Access: Anyone)
 * The deployed URL becomes the API base for the front-end.
 *
 * Three-layer architecture:
 *   Building  — static buildings.json, not in Sheets
 *   Listing   — what occupies a building, guardian-editable (Listings sheet)
 *   Activity  — events, specials, sales, partnerships (Events sheet)
 *
 * Endpoints:
 *   GET  ?action=listings          → all non-removed listings
 *   GET  ?action=reviews&lid=X     → reviews for a listing
 *   GET  ?action=events            → all active (non-expired) events
 *   GET  ?action=checkin-status&dh=X → check if device qualifies as local
 *   POST ?action=checkin           → log anonymous check-in
 *   POST ?action=review            → submit a review (requires local token)
 *   POST ?action=event             → post event/special (requires guardian)
 *   POST ?action=claim             → guardian claims a listing via QR
 *   POST ?action=update-listing    → guardian edits listing fields
 *   POST ?action=accept-listing    → guardian accepts a pending listing
 *   POST ?action=remove-listing    → guardian removes a listing
 */

// ─── Configuration ──────────────────────────────────────────────────────────

const SPREADSHEET_ID = '1UuNAXIbrWTKYrhpRcf3MSRmM_XHyGjlasvvwgGpiZso'
const LOCAL_THRESHOLD = 3          // check-ins needed to become a local
const LOCAL_WINDOW_DAYS = 14       // rolling window for distinct-day counting
const TIMEZONE = 'America/Chicago' // Central Time for date calculations

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSheet(name) {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name)
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues()
  if (data.length < 2) return []
  const headers = data[0]
  return data.slice(1).map(row => {
    const obj = {}
    headers.forEach((h, i) => {
      if (h && row[i] !== '') obj[h] = row[i]
    })
    return obj
  })
}

function jsonResponse(data, status) {
  const output = ContentService.createTextOutput(JSON.stringify({
    status: status || 'ok',
    data: data,
    timestamp: new Date().toISOString()
  }))
  output.setMimeType(ContentService.MimeType.JSON)
  return output
}

function errorResponse(message, code) {
  return jsonResponse({ error: message }, code || 'error')
}

function generateId(prefix) {
  return prefix + '-' + Utilities.getUuid().split('-')[0]
}

function nowISO() {
  return new Date().toISOString()
}

function todayCentral() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd')
}

// Sheets auto-converts date strings to Date objects; normalize for string comparison
function toDateStr(val) {
  if (val instanceof Date) return Utilities.formatDate(val, TIMEZONE, 'yyyy-MM-dd')
  return String(val || '')
}

function parseJsonField(val) {
  if (!val) return null
  try { return JSON.parse(val) } catch (e) { return null }
}

// ─── Sheet helpers ──────────────────────────────────────────────────────────

/** Get header indices for a sheet, returns { headerName: columnIndex } */
function getHeaderMap(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
  const map = {}
  headers.forEach((h, i) => { if (h) map[h] = i })
  return map
}

/** Find a row by matching column value. Returns { rowIndex (1-based), rowData } or null */
function findRow(sheet, columnName, value) {
  const data = sheet.getDataRange().getValues()
  if (data.length < 2) return null
  const headers = data[0]
  const colIdx = headers.indexOf(columnName)
  if (colIdx === -1) return null
  for (let i = 1; i < data.length; i++) {
    if (data[i][colIdx] === value) {
      const obj = {}
      headers.forEach((h, j) => { if (h && data[i][j] !== '') obj[h] = data[i][j] })
      return { rowIndex: i + 1, rowData: obj }
    }
  }
  return null
}

/** Update specific cells in a row */
function updateCell(sheet, rowIndex, headerMap, columnName, value) {
  const colIdx = headerMap[columnName]
  if (colIdx === undefined) return
  sheet.getRange(rowIndex, colIdx + 1).setValue(value)
}

/** Delete all rows where columnName === value. Iterates bottom-up to preserve indices. */
function deleteRowsByColumn(sheet, columnName, value) {
  if (!sheet) return
  var data = sheet.getDataRange().getValues()
  if (data.length < 2) return
  var col = data[0].indexOf(columnName)
  if (col === -1) return
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][col] === value) {
      sheet.deleteRow(i + 1)
    }
  }
}

// ─── GET handler ────────────────────────────────────────────────────────────

function doGet(e) {
  const action = (e.parameter.action || '').toLowerCase()

  try {
    switch (action) {
      case 'listings':        return getListings()
      case 'reviews':         return getReviews(e.parameter.lid)
      case 'events':
      case 'ev':              return getEvents()
      case 'checkin-status':  return getCheckinStatus(e.parameter.dh)
      case 'handle':          return getHandle(e.parameter.dh)
      case 'check-handle':    return checkHandle(e.parameter.h)
      case 'bulletins':       return getBulletins(e.parameter.dh)
      case 'threads':         return getThreads(e.parameter.dh)
      case 'thread-messages': return getThreadMessages(e.parameter.tid, e.parameter.dh)
      case 'comments':        return getComments(e.parameter.bid, e.parameter.dh)
      case 'claim-secret':   return getClaimSecret(e.parameter.lid, e.parameter.dh, e.parameter.admin)
      case 'getdesign':      return getDesign(e.parameter.bizId)
      default:                return errorResponse('Unknown action: ' + action, 'bad_request')
    }
  } catch (err) {
    return errorResponse(err.message, 'server_error')
  }
}

// ─── POST handler ───────────────────────────────────────────────────────────

function doPost(e) {
  let body = {}
  try {
    body = JSON.parse(e.postData.contents)
  } catch (err) {
    return errorResponse('Invalid JSON body', 'bad_request')
  }

  const action = (body.action || '').toLowerCase()

  try {
    switch (action) {
      case 'checkin':          return postCheckin(body)
      case 'review':           return postReview(body)
      case 'event':            return postEvent(body)
      case 'claim':            return postClaim(body)
      case 'update-listing':   return postUpdateListing(body)
      case 'accept-listing':   return postAcceptListing(body)
      case 'remove-listing':   return postRemoveListing(body)
      case 'set-handle':       return postSetHandle(body)
      case 'bulletin':         return postBulletin(body)
      case 'remove-bulletin':  return postRemoveBulletin(body)
      case 'start-thread':     return postStartThread(body)
      case 'send-message':     return postSendMessage(body)
      case 'close-thread':     return postCloseThread(body)
      case 'comment':          return postComment(body)
      case 'remove-comment':   return postRemoveComment(body)
      case 'reply':            return postReply(body)
      case 'savedesign':       return saveDesign(body)
      // Read-only actions via POST to bypass Google's redirect cache
      case 'events':           return getEvents()
      case 'listings':         return getListings()
      default:                 return errorResponse('Unknown action: ' + action, 'bad_request')
    }
  } catch (err) {
    return errorResponse(err.message, 'server_error')
  }
}

// ─── GET: Listings ──────────────────────────────────────────────────────────

function getListings() {
  const rows = sheetToObjects(getSheet('Listings'))
  const visible = rows.filter(r => r.status !== 'removed')

  // Build guardian lookup from Guardians sheet
  const guardianRows = sheetToObjects(getSheet('Guardians'))
  const guardianMap = {}
  guardianRows.forEach(r => { guardianMap[r.listing_id] = true })

  const parsed = visible.map(listing => {
    const out = {
      ...listing,
      hours:     parseJsonField(listing.hours_json),
      amenities: parseJsonField(listing.amenities_json),
      tags:      parseJsonField(listing.tags_json),
      photos:    parseJsonField(listing.photos_json),
      history:   parseJsonField(listing.history_json),
    }
    // Strip guardian secrets from response
    delete out.guardian_hash
    delete out.guardian_token
    delete out.claim_secret
    delete out.hours_json
    delete out.amenities_json
    delete out.tags_json
    delete out.photos_json
    delete out.history_json
    // Expose guardian status as boolean
    out.has_guardian = !!(guardianMap[listing.id] || listing.guardian_hash)
    return out
  })

  return jsonResponse(parsed)
}

// ─── GET: Reviews for a listing ─────────────────────────────────────────────

function getReviews(listingId) {
  if (!listingId) return errorResponse('Missing lid parameter', 'bad_request')
  const rows = sheetToObjects(getSheet('Reviews'))
  const filtered = rows
    .filter(r => r.listing_id === listingId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  // Attach replies to each review
  var replySheet = getSheet('Replies')
  var replyRows = replySheet ? sheetToObjects(replySheet) : []
  var replyMap = {}
  replyRows.forEach(function(r) {
    if (!replyMap[r.review_id]) replyMap[r.review_id] = []
    replyMap[r.review_id].push({
      id: r.id,
      handle: r.handle || '',
      text: r.text,
      created_at: r.created_at
    })
  })
  filtered.forEach(function(r) {
    r.replies = replyMap[r.id] || []
  })

  return jsonResponse(filtered)
}

// ─── GET: Active events ─────────────────────────────────────────────────────

function getEvents() {
  const rows = sheetToObjects(getSheet('Events'))
  const today = todayCentral()
  const active = rows.filter(r => {
    var endRaw = r.end_date || r.start_date
    var end = endRaw instanceof Date
      ? Utilities.formatDate(endRaw, TIMEZONE, 'yyyy-MM-dd')
      : String(endRaw)
    return end >= today
  })
  // Normalize Date objects to strings before sending
  active.forEach(r => {
    if (r.start_date instanceof Date) r.start_date = Utilities.formatDate(r.start_date, TIMEZONE, 'yyyy-MM-dd')
    if (r.end_date instanceof Date) r.end_date = Utilities.formatDate(r.end_date, TIMEZONE, 'yyyy-MM-dd')
  })
  return jsonResponse(active.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || '')))
}

// ─── GET: Check-in status (is device a local?) ─────────────────────────────

function getCheckinStatus(deviceHash) {
  if (!deviceHash) return errorResponse('Missing dh parameter', 'bad_request')

  const rows = sheetToObjects(getSheet('Checkins'))
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - LOCAL_WINDOW_DAYS)
  const cutoffStr = Utilities.formatDate(cutoff, TIMEZONE, 'yyyy-MM-dd')

  const distinctDates = new Set()
  rows.forEach(r => {
    var d = toDateStr(r.date)
    if (r.device_hash === deviceHash && d >= cutoffStr) {
      distinctDates.add(d)
    }
  })

  return jsonResponse({
    device_hash: deviceHash,
    distinct_days: distinctDates.size,
    threshold: LOCAL_THRESHOLD,
    window_days: LOCAL_WINDOW_DAYS,
    is_local: distinctDates.size >= LOCAL_THRESHOLD,
  })
}

// ─── POST: Check-in ─────────────────────────────────────────────────────────

function postCheckin(body) {
  const { device_hash, location_id } = body
  if (!device_hash || !location_id) {
    return errorResponse('Missing device_hash or location_id', 'bad_request')
  }

  const sheet = getSheet('Checkins')
  const date = todayCentral()
  const timestamp = nowISO()

  const existing = sheetToObjects(sheet)
  const alreadyToday = existing.some(r =>
    r.device_hash === device_hash &&
    r.location_id === location_id &&
    toDateStr(r.date) === date
  )
  if (!alreadyToday) {
    sheet.appendRow([device_hash, location_id, timestamp, date])
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - LOCAL_WINDOW_DAYS)
  const cutoffStr = Utilities.formatDate(cutoff, TIMEZONE, 'yyyy-MM-dd')
  const distinctDates = new Set()
  existing.forEach(r => {
    var d = toDateStr(r.date)
    if (r.device_hash === device_hash && d >= cutoffStr) {
      distinctDates.add(d)
    }
  })
  distinctDates.add(date)

  return jsonResponse({
    logged: !alreadyToday,
    reason: alreadyToday ? 'Already checked in here today' : undefined,
    distinct_days: distinctDates.size,
    is_local: distinctDates.size >= LOCAL_THRESHOLD,
  })
}

// ─── POST: Review ───────────────────────────────────────────────────────────

function postReview(body) {
  const { device_hash, listing_id, text, rating, handle } = body
  if (!device_hash || !listing_id || !text) {
    return errorResponse('Missing required fields', 'bad_request')
  }

  // Verify device is a local
  const checkins = sheetToObjects(getSheet('Checkins'))
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - LOCAL_WINDOW_DAYS)
  const cutoffStr = Utilities.formatDate(cutoff, TIMEZONE, 'yyyy-MM-dd')
  const distinctDates = new Set()
  checkins.forEach(r => {
    if (r.device_hash === device_hash && r.date >= cutoffStr) {
      distinctDates.add(r.date)
    }
  })
  if (distinctDates.size < LOCAL_THRESHOLD) {
    return jsonResponse({ error: 'Not a verified townie', status: 'not_townie', message: 'Become a Townie to post reviews — visit 3 local spots within 14 days by scanning their QR codes.' }, 'not_townie')
  }

  // Look up handle if not provided
  var reviewHandle = handle || ''
  if (!reviewHandle) {
    var handleRow = findRow(getSheet('Handles'), 'device_hash', device_hash)
    if (handleRow) reviewHandle = handleRow.rowData.handle || ''
  }

  const sheet = getSheet('Reviews')
  const id = generateId('rev')
  sheet.appendRow([id, listing_id, device_hash, reviewHandle, text, rating || '', nowISO()])

  return jsonResponse({ id: id, logged: true })
}

// ─── POST: Reply (guardian replies to a review) ─────────────────────────────

function postReply(body) {
  var device_hash = body.device_hash
  var review_id = body.review_id
  var listing_id = body.listing_id
  var text = body.text
  if (!device_hash || !review_id || !listing_id || !text) {
    return errorResponse('Missing required fields', 'bad_request')
  }

  // Must be a guardian of the listing
  if (!isGuardianOf(listing_id, device_hash)) {
    return errorResponse('Not a guardian for this listing', 'unauthorized')
  }

  // Look up handle
  var handleRow = findRow(getSheet('Handles'), 'device_hash', device_hash)
  var handle = handleRow ? handleRow.rowData.handle : ''

  var sheet = getSheet('Replies')
  var id = generateId('rpl')
  sheet.appendRow([id, review_id, listing_id, device_hash, handle, text, nowISO()])
  return jsonResponse({ id: id, success: true })
}

// ─── POST: Event ────────────────────────────────────────────────────────────

function postEvent(body) {
  const { device_hash, listing_id, title, description, start_date, end_date, type } = body
  if (!device_hash || !listing_id || !title || !start_date) {
    return errorResponse('Missing required fields', 'bad_request')
  }

  // Verify device is a guardian for this listing
  if (!isGuardianOf(listing_id, device_hash)) {
    return errorResponse('Not a guardian for this listing', 'unauthorized')
  }

  const sheet = getSheet('Events')
  const id = generateId('evt')
  sheet.appendRow([
    id, listing_id, device_hash, type || 'event', title,
    description || '', start_date, end_date || '', nowISO()
  ])

  return jsonResponse({ id: id, logged: true })
}

// ─── POST: Claim (Guardian) ─────────────────────────────────────────────────

function postClaim(body) {
  const { device_hash, listing_id, secret } = body
  if (!device_hash || !listing_id || !secret) {
    return errorResponse('Missing required fields', 'bad_request')
  }

  const sheet = getSheet('Listings')
  const result = findRow(sheet, 'id', listing_id)
  if (!result) {
    return errorResponse('Listing not found', 'not_found')
  }

  // Validate claim secret
  if (result.rowData.claim_secret && result.rowData.claim_secret !== secret) {
    return errorResponse('Invalid claim secret', 'unauthorized')
  }

  // Check if already a guardian
  if (isGuardianOf(listing_id, device_hash)) {
    return jsonResponse({ success: true, already_claimed: true })
  }

  // Add to Guardians sheet
  getSheet('Guardians').appendRow([listing_id, device_hash, nowISO()])

  // Also set legacy guardian_hash if not yet set (first guardian)
  if (!result.rowData.guardian_hash) {
    const headerMap = getHeaderMap(sheet)
    const token = 'grd-' + Utilities.getUuid().replace(/-/g, '').substring(0, 16)
    updateCell(sheet, result.rowIndex, headerMap, 'guardian_hash', device_hash)
    updateCell(sheet, result.rowIndex, headerMap, 'guardian_token', token)
    updateCell(sheet, result.rowIndex, headerMap, 'updated_at', nowISO())
  }

  return jsonResponse({ success: true, claimed: true })
}

// ─── POST: Update Listing (Guardian edits) ──────────────────────────────────

function postUpdateListing(body) {
  const { device_hash, listing_id, fields } = body
  if (!device_hash || !listing_id || !fields) {
    return errorResponse('Missing required fields', 'bad_request')
  }

  const sheet = getSheet('Listings')
  const result = findRow(sheet, 'id', listing_id)
  if (!result) {
    return errorResponse('Listing not found', 'not_found')
  }

  // Auth: must be a guardian of this listing
  if (!isGuardianOf(listing_id, device_hash)) {
    return errorResponse('Not authorized', 'unauthorized')
  }

  // Whitelist of editable fields
  const EDITABLE = [
    'name', 'address', 'category', 'subcategory', 'phone', 'website',
    'description', 'logo', 'home_based', 'rating', 'review_count',
    'hours_json', 'amenities_json', 'tags_json', 'photos_json', 'history_json'
  ]

  // Map shorthand field names to JSON column names
  const JSON_FIELD_MAP = {
    hours: 'hours_json',
    amenities: 'amenities_json',
    tags: 'tags_json',
    photos: 'photos_json',
    history: 'history_json',
  }

  const headerMap = getHeaderMap(sheet)
  const updated = []
  for (const [key, value] of Object.entries(fields)) {
    const colName = JSON_FIELD_MAP[key] || key
    if (EDITABLE.includes(colName)) {
      const cellValue = JSON_FIELD_MAP[key] ? JSON.stringify(value) : value
      updateCell(sheet, result.rowIndex, headerMap, colName, cellValue)
      updated.push(key)
    }
  }
  updateCell(sheet, result.rowIndex, headerMap, 'updated_at', nowISO())

  return jsonResponse({ updated: updated, success: true })
}

// ─── POST: Accept Listing ───────────────────────────────────────────────────

function postAcceptListing(body) {
  const { device_hash, listing_id } = body
  if (!device_hash || !listing_id) {
    return errorResponse('Missing required fields', 'bad_request')
  }

  const sheet = getSheet('Listings')
  const result = findRow(sheet, 'id', listing_id)
  if (!result) {
    return errorResponse('Listing not found', 'not_found')
  }

  if (!isGuardianOf(listing_id, device_hash)) {
    return errorResponse('Not authorized', 'unauthorized')
  }

  const headerMap = getHeaderMap(sheet)
  updateCell(sheet, result.rowIndex, headerMap, 'accepted', true)
  updateCell(sheet, result.rowIndex, headerMap, 'accepted_at', nowISO())
  updateCell(sheet, result.rowIndex, headerMap, 'status', 'active')
  updateCell(sheet, result.rowIndex, headerMap, 'updated_at', nowISO())

  return jsonResponse({ success: true })
}

// ─── POST: Remove Listing ───────────────────────────────────────────────────

function postRemoveListing(body) {
  const { device_hash, listing_id } = body
  if (!device_hash || !listing_id) {
    return errorResponse('Missing required fields', 'bad_request')
  }

  const sheet = getSheet('Listings')
  const result = findRow(sheet, 'id', listing_id)
  if (!result) {
    return errorResponse('Listing not found', 'not_found')
  }

  if (!isGuardianOf(listing_id, device_hash)) {
    return errorResponse('Not authorized', 'unauthorized')
  }

  const headerMap = getHeaderMap(sheet)
  updateCell(sheet, result.rowIndex, headerMap, 'status', 'removed')
  updateCell(sheet, result.rowIndex, headerMap, 'updated_at', nowISO())

  return jsonResponse({ success: true })
}

// ─── Helper: verify device is a townie (local) ─────────────────────────────

function isTownie(deviceHash) {
  const checkins = sheetToObjects(getSheet('Checkins'))
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - LOCAL_WINDOW_DAYS)
  const cutoffStr = Utilities.formatDate(cutoff, TIMEZONE, 'yyyy-MM-dd')
  const distinctDates = new Set()
  checkins.forEach(r => {
    if (r.device_hash === deviceHash && r.date >= cutoffStr) {
      distinctDates.add(r.date)
    }
  })
  return distinctDates.size >= LOCAL_THRESHOLD
}

// ─── GET: Claim secret for a listing ─────────────────────────────────────

function getClaimSecret(listingId, deviceHash, adminKey) {
  if (!listingId) return errorResponse('Missing lid', 'bad_request')
  const sheet = getSheet('Listings')
  const listing = findRow(sheet, 'id', listingId)
  if (!listing) return errorResponse('Not found', 'not_found')

  const isAdmin = adminKey === 'lafayette1850'
  const isGuardian = deviceHash && isGuardianOf(listingId, deviceHash)
  if (!isGuardian && !isAdmin) return errorResponse('Not authorized', 'unauthorized')

  // Auto-generate and persist a claim secret if none exists
  var secret = listing.rowData.claim_secret
  if (!secret) {
    secret = Utilities.getUuid().split('-')[0]  // 8-char hex
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    var colIdx = headers.indexOf('claim_secret')
    if (colIdx >= 0) {
      sheet.getRange(listing.rowIndex, colIdx + 1).setValue(secret)
    }
  }

  return jsonResponse({ claim_secret: secret })
}

// ─── Helper: check if device is a guardian for a listing ─────────────────

function isGuardianOf(listingId, deviceHash) {
  if (!listingId || !deviceHash) return false
  const rows = sheetToObjects(getSheet('Guardians'))
  return rows.some(r => r.listing_id === listingId && r.device_hash === deviceHash)
}

// ─── GET: Handle lookup ─────────────────────────────────────────────────────

function getHandle(deviceHash) {
  if (!deviceHash) return errorResponse('Missing dh parameter', 'bad_request')
  const result = findRow(getSheet('Handles'), 'device_hash', deviceHash)
  return jsonResponse({ handle: result ? result.rowData.handle : null })
}

// ─── GET: Check handle availability ─────────────────────────────────────────

function checkHandle(handle) {
  if (!handle) return errorResponse('Missing h parameter', 'bad_request')
  const sheet = getSheet('Handles')
  const rows = sheetToObjects(sheet)
  const taken = rows.some(r => (r.handle || '').toLowerCase() === handle.toLowerCase())
  return jsonResponse({ available: !taken })
}

// ─── POST: Set handle ───────────────────────────────────────────────────────

function postSetHandle(body) {
  const { device_hash, handle } = body
  if (!device_hash || !handle) {
    return errorResponse('Missing device_hash or handle', 'bad_request')
  }

  // Validate format: 3-20 chars, alphanumeric + underscores
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(handle)) {
    return errorResponse('Handle must be 3-20 characters, alphanumeric and underscores only', 'bad_request')
  }

  const sheet = getSheet('Handles')

  // Check if device already has a handle
  const existing = findRow(sheet, 'device_hash', device_hash)
  if (existing) {
    return jsonResponse({ success: true, handle: existing.rowData.handle, already_set: true })
  }

  // Check uniqueness (case-insensitive)
  const rows = sheetToObjects(sheet)
  const taken = rows.some(r => (r.handle || '').toLowerCase() === handle.toLowerCase())
  if (taken) {
    return errorResponse('Handle already taken', 'conflict')
  }

  sheet.appendRow([device_hash, handle, nowISO()])
  return jsonResponse({ success: true, handle: handle })
}

// ─── GET: Bulletins ─────────────────────────────────────────────────────────

function getBulletins(requesterHash) {
  const sheet = getSheet('Bulletins')
  const rows = sheetToObjects(sheet)
  const active = rows.filter(r =>
    r.status === 'active'
  ).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

  // Count comments per bulletin
  const commentSheet = getSheet('Comments')
  const commentRows = commentSheet ? sheetToObjects(commentSheet) : []
  const commentCounts = {}
  commentRows.forEach(c => {
    commentCounts[c.bulletin_id] = (commentCounts[c.bulletin_id] || 0) + 1
  })

  // Strip device_hash from response; hide handle on anonymous posts; flag own posts
  const cleaned = active.map(r => {
    const isMine = requesterHash && r.device_hash === requesterHash
    const out = { ...r }
    delete out.device_hash
    if (out.anonymous === true || out.anonymous === 'true' || out.anonymous === 'TRUE') {
      out.handle = null
    }
    out.is_mine = isMine
    out.comment_count = commentCounts[r.id] || 0
    return out
  })
  return jsonResponse(cleaned)
}

// ─── POST: Bulletin ─────────────────────────────────────────────────────────

function postBulletin(body) {
  const { device_hash, section, text, anonymous } = body
  if (!device_hash || !section || !text) {
    return errorResponse('Missing required fields', 'bad_request')
  }

  if (!isTownie(device_hash)) {
    return errorResponse('Must be a verified local to post', 'unauthorized')
  }

  // Look up handle
  const handleRow = findRow(getSheet('Handles'), 'device_hash', device_hash)
  if (!handleRow) {
    return errorResponse('Must set a handle before posting', 'bad_request')
  }
  const handle = handleRow.rowData.handle

  const sheet = getSheet('Bulletins')
  const id = generateId('blt')
  const now = nowISO()

  sheet.appendRow([id, device_hash, handle, section, text, anonymous ? true : false, now, '', 'active'])
  return jsonResponse({ id: id, success: true })
}

// ─── POST: Remove bulletin ──────────────────────────────────────────────────

function postRemoveBulletin(body) {
  const { device_hash, bulletin_id } = body
  if (!device_hash || !bulletin_id) {
    return errorResponse('Missing required fields', 'bad_request')
  }

  const sheet = getSheet('Bulletins')
  const result = findRow(sheet, 'id', bulletin_id)
  if (!result) return errorResponse('Bulletin not found', 'not_found')

  // Only author can remove
  if (result.rowData.device_hash !== device_hash) {
    return errorResponse('Not authorized', 'unauthorized')
  }

  // Delete all comments for this bulletin
  deleteRowsByColumn(getSheet('Comments'), 'bulletin_id', bulletin_id)

  // Delete the bulletin row itself
  sheet.deleteRow(result.rowIndex)
  return jsonResponse({ success: true })
}

// ─── GET: Comments ──────────────────────────────────────────────────────────

function getComments(bulletinId, requesterHash) {
  if (!bulletinId) return errorResponse('Missing bulletin_id', 'bad_request')
  const sheet = getSheet('Comments')
  const rows = sheetToObjects(sheet)
  const filtered = rows
    .filter(r => r.bulletin_id === bulletinId)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))

  const cleaned = filtered.map(r => {
    const isMine = requesterHash && r.device_hash === requesterHash
    const out = { ...r }
    delete out.device_hash
    if (out.anonymous === true || out.anonymous === 'true' || out.anonymous === 'TRUE') {
      out.handle = null
    }
    out.is_mine = isMine
    return out
  })
  return jsonResponse(cleaned)
}

// ─── POST: Comment ──────────────────────────────────────────────────────────

function postComment(body) {
  var device_hash = body.device_hash
  var bulletin_id = body.bulletin_id
  var text = body.text
  var anonymous = body.anonymous

  if (!device_hash || !bulletin_id || !text) {
    return errorResponse('Missing required fields', 'bad_request')
  }

  if (!isTownie(device_hash)) {
    return errorResponse('Must be a verified local to comment', 'unauthorized')
  }

  var handleRow = findRow(getSheet('Handles'), 'device_hash', device_hash)
  if (!handleRow) {
    return errorResponse('Must set a handle before commenting', 'bad_request')
  }
  var handle = handleRow.rowData.handle

  var sheet = getSheet('Comments')
  var id = generateId('cmt')
  var now = nowISO()

  sheet.appendRow([id, bulletin_id, device_hash, handle, anonymous ? true : false, text, now])
  return jsonResponse({ id: id, success: true })
}

// ─── POST: Remove comment ───────────────────────────────────────────────────

function postRemoveComment(body) {
  var device_hash = body.device_hash
  var comment_id = body.comment_id
  if (!device_hash || !comment_id) {
    return errorResponse('Missing required fields', 'bad_request')
  }

  var sheet = getSheet('Comments')
  var result = findRow(sheet, 'id', comment_id)
  if (!result) return errorResponse('Comment not found', 'not_found')

  if (result.rowData.device_hash !== device_hash) {
    return errorResponse('Not authorized', 'unauthorized')
  }

  sheet.deleteRow(result.rowIndex)
  return jsonResponse({ success: true })
}

// ─── POST: Start thread ─────────────────────────────────────────────────────

function postStartThread(body) {
  const { device_hash, bulletin_id } = body
  if (!device_hash || !bulletin_id) {
    return errorResponse('Missing required fields', 'bad_request')
  }

  if (!isTownie(device_hash)) {
    return errorResponse('Must be a verified local', 'unauthorized')
  }

  // Look up the bulletin to get the poster's device hash
  const bulletin = findRow(getSheet('Bulletins'), 'id', bulletin_id)
  if (!bulletin) return errorResponse('Bulletin not found', 'not_found')
  if (bulletin.rowData.status !== 'active') return errorResponse('Bulletin no longer active', 'bad_request')

  const posterHash = bulletin.rowData.device_hash
  if (posterHash === device_hash) {
    return errorResponse('Cannot message yourself', 'bad_request')
  }

  // Check for existing thread between same parties on same bulletin
  const threads = sheetToObjects(getSheet('Threads'))
  const existing = threads.find(t =>
    t.bulletin_id === bulletin_id &&
    t.status === 'active' &&
    ((t.party_a_hash === posterHash && t.party_b_hash === device_hash) ||
     (t.party_a_hash === device_hash && t.party_b_hash === posterHash))
  )
  if (existing) {
    return jsonResponse({ thread_id: existing.id, already_exists: true })
  }

  // Look up handles
  var aHandle = bulletin.rowData.handle || ''
  var bHandleRow = findRow(getSheet('Handles'), 'device_hash', device_hash)
  var bHandle = bHandleRow ? bHandleRow.rowData.handle : ''

  const sheet = getSheet('Threads')
  const id = generateId('thr')
  const now = nowISO()

  // party_a = bulletin poster, party_b = thread initiator
  sheet.appendRow([id, bulletin_id, posterHash, device_hash, aHandle, bHandle, 'active', now, ''])
  return jsonResponse({ thread_id: id, success: true })
}

// ─── POST: Send message ─────────────────────────────────────────────────────

function postSendMessage(body) {
  const { device_hash, thread_id, text } = body
  if (!device_hash || !thread_id || !text) {
    return errorResponse('Missing required fields', 'bad_request')
  }

  const threadResult = findRow(getSheet('Threads'), 'id', thread_id)
  if (!threadResult) return errorResponse('Thread not found', 'not_found')
  if (threadResult.rowData.status !== 'active') return errorResponse('Thread is closed', 'bad_request')

  // Verify sender is a party
  if (threadResult.rowData.party_a_hash !== device_hash && threadResult.rowData.party_b_hash !== device_hash) {
    return errorResponse('Not authorized', 'unauthorized')
  }

  const sheet = getSheet('Messages')
  const id = generateId('msg')
  const now = nowISO()
  sheet.appendRow([id, thread_id, device_hash, text, now])

  return jsonResponse({ id: id, success: true })
}

// ─── GET: Threads for a device ──────────────────────────────────────────────

function getThreads(deviceHash) {
  if (!deviceHash) return errorResponse('Missing dh parameter', 'bad_request')

  const threads = sheetToObjects(getSheet('Threads'))
  const messages = sheetToObjects(getSheet('Messages'))

  const active = threads.filter(t =>
    t.status === 'active' &&
    (t.party_a_hash === deviceHash || t.party_b_hash === deviceHash)
  )

  const result = active.map(t => {
    // Get last message for preview
    const threadMsgs = messages.filter(m => m.thread_id === t.id)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    const lastMsg = threadMsgs[0] || null

    // Determine the other party's handle
    const otherHandle = t.party_a_hash === deviceHash ? t.b_handle : t.a_handle

    return {
      id: t.id,
      bulletin_id: t.bulletin_id,
      other_handle: otherHandle,
      last_message: lastMsg ? lastMsg.text : null,
      last_message_at: lastMsg ? lastMsg.created_at : t.created_at,
      message_count: threadMsgs.length,
      created_at: t.created_at,
      expires_at: t.expires_at,
    }
  }).sort((a, b) => (b.last_message_at || '').localeCompare(a.last_message_at || ''))

  return jsonResponse(result)
}

// ─── GET: Thread messages ───────────────────────────────────────────────────

function getThreadMessages(threadId, deviceHash) {
  if (!threadId || !deviceHash) return errorResponse('Missing tid or dh parameter', 'bad_request')

  const threadResult = findRow(getSheet('Threads'), 'id', threadId)
  if (!threadResult) return errorResponse('Thread not found', 'not_found')

  // Verify requester is a party
  if (threadResult.rowData.party_a_hash !== deviceHash && threadResult.rowData.party_b_hash !== deviceHash) {
    return errorResponse('Not authorized', 'unauthorized')
  }

  const messages = sheetToObjects(getSheet('Messages'))
  const threadMsgs = messages
    .filter(m => m.thread_id === threadId)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
    .map(m => ({
      id: m.id,
      text: m.text,
      is_mine: m.sender_hash === deviceHash,
      created_at: m.created_at,
    }))

  return jsonResponse({ messages: threadMsgs })
}

// ─── POST: Close thread ─────────────────────────────────────────────────────

function postCloseThread(body) {
  const { device_hash, thread_id } = body
  if (!device_hash || !thread_id) {
    return errorResponse('Missing required fields', 'bad_request')
  }

  const threadSheet = getSheet('Threads')
  const threadResult = findRow(threadSheet, 'id', thread_id)
  if (!threadResult) return errorResponse('Thread not found', 'not_found')

  // Verify requester is a party
  if (threadResult.rowData.party_a_hash !== device_hash && threadResult.rowData.party_b_hash !== device_hash) {
    return errorResponse('Not authorized', 'unauthorized')
  }

  // Purge all messages then delete the thread row
  deleteRowsByColumn(getSheet('Messages'), 'thread_id', thread_id)
  threadSheet.deleteRow(threadResult.rowIndex)

  return jsonResponse({ success: true })
}

// ─── GET: QR design for a listing+type ──────────────────────────────────────

function getDesign(bizId) {
  if (!bizId) return errorResponse('Missing bizId', 'bad_request')
  var sheet = getSheet('Designs')
  if (!sheet) return jsonResponse({ design: null })
  const result = findRow(sheet, 'biz_id', bizId)
  if (!result) return jsonResponse({ design: null })
  return jsonResponse({ design: parseJsonField(result.rowData.design_json) })
}

// ─── POST: Save QR design for a listing+type ────────────────────────────────

function saveDesign(body) {
  var bizId = body.bizId
  var design = body.design
  if (!bizId) return errorResponse('Missing bizId', 'bad_request')
  if (!design || typeof design !== 'object') return errorResponse('Missing design', 'bad_request')

  var sheet = getSheet('Designs')
  if (!sheet) {
    // Auto-create Designs sheet if it doesn't exist
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID)
    sheet = ss.insertSheet('Designs')
    sheet.getRange(1, 1, 1, 3).setValues([['biz_id', 'design_json', 'updated_at']])
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold')
  }

  var designJson = JSON.stringify(design)
  var now = nowISO()
  var existing = findRow(sheet, 'biz_id', bizId)

  if (existing) {
    // Update existing row
    var headerMap = getHeaderMap(sheet)
    updateCell(sheet, existing.rowIndex, headerMap, 'design_json', designJson)
    updateCell(sheet, existing.rowIndex, headerMap, 'updated_at', now)
  } else {
    // Append new row: biz_id, design_json, updated_at
    sheet.appendRow([bizId, designJson, now])
  }

  return jsonResponse({ success: true })
}

// ─── Utility: Create all tabs with headers ──────────────────────────────────

function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID)

  const tabs = {
    'Listings': [
      'id', 'building_id', 'name', 'address', 'category', 'subcategory',
      'phone', 'website', 'description', 'logo', 'home_based', 'status',
      'rating', 'review_count', 'hours_json', 'amenities_json', 'tags_json',
      'photos_json', 'history_json', 'created_by', 'accepted', 'accepted_at',
      'guardian_hash', 'guardian_token', 'claim_secret', 'created_at', 'updated_at'
    ],
    'Checkins':  ['device_hash', 'location_id', 'timestamp', 'date'],
    'Reviews':   ['id', 'listing_id', 'device_hash', 'handle', 'text', 'rating', 'timestamp'],
    'Events':    ['id', 'listing_id', 'device_hash', 'type', 'title', 'description', 'start_date', 'end_date', 'created_at'],
    'Handles':   ['device_hash', 'handle', 'created_at'],
    'Bulletins': ['id', 'device_hash', 'handle', 'section', 'text', 'anonymous', 'created_at', 'expires_at', 'status'],
    'Threads':   ['id', 'bulletin_id', 'party_a_hash', 'party_b_hash', 'a_handle', 'b_handle', 'status', 'created_at', 'expires_at'],
    'Messages':  ['id', 'thread_id', 'sender_hash', 'text', 'created_at'],
    'Comments':  ['id', 'bulletin_id', 'device_hash', 'handle', 'anonymous', 'text', 'created_at'],
    'Replies':   ['id', 'review_id', 'listing_id', 'device_hash', 'handle', 'text', 'created_at'],
    'Guardians': ['listing_id', 'device_hash', 'created_at'],
    'Designs':   ['biz_id', 'design_json', 'updated_at'],
  }

  Object.entries(tabs).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name)
    if (!sheet) {
      sheet = ss.insertSheet(name)
    }
    if (sheet.getLastRow() === 0 || sheet.getRange(1, 1).getValue() !== headers[0]) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold')
    }
  })

  Logger.log('All tabs created with headers')
}

// ─── Utility: Seed listings from landmark data ─────────────────────────────

function seedListings() {
  const sheet = getSheet('Listings')
  if (sheet.getLastRow() > 1) {
    Logger.log('Listings already seeded, skipping')
    return
  }

  const now = nowISO()

  // Columns match Listings header order:
  // id, building_id, name, address, category, subcategory,
  // phone, website, description, logo, home_based, status,
  // rating, review_count, hours_json, amenities_json, tags_json,
  // photos_json, history_json, created_by, accepted, accepted_at,
  // guardian_hash, guardian_token, claim_secret, created_at, updated_at
  function row(id, buildingId, name, address, category, subcategory, opts) {
    const o = opts || {}
    const secret = Utilities.getUuid().split('-')[0]  // 8-char hex
    return [
      id, buildingId, name, address, category, subcategory,
      o.phone || '', o.website || '', o.description || '', o.logo || '', o.home_based || false, 'pending',
      o.rating || '', o.review_count || '', o.hours_json || '', o.amenities_json || '', o.tags_json || '',
      o.photos_json || '', o.history_json || '', 'seed', false, '',
      '', '', secret, now, now
    ]
  }

  const listings = [
    row('lmk-001', 'bldg-0652', 'Square One Brewery & Distillery', 'Park Avenue', 'dining', 'restaurants', {
      phone: '+13142312537', website: 'https://squareonebrewery.com/', logo: '/logos/square-one.png',
      rating: 4.5, review_count: 903,
      hours_json: JSON.stringify({monday:{open:"11:00",close:"21:00"},tuesday:{open:"11:00",close:"21:00"},wednesday:{open:"11:00",close:"21:00"},thursday:{open:"11:00",close:"21:00"},friday:{open:"11:00",close:"22:00"},saturday:{open:"10:00",close:"22:00"},sunday:{open:"10:00",close:"20:00"}}),
      amenities_json: JSON.stringify(["On-site brewery (15 beers on tap)","On-site distillery (Spirits of St. Louis)","Outdoor courtyard patio","Weekend brunch","Dog-friendly patio","Reservations via OpenTable","Kid-friendly"]),
      photos_json: JSON.stringify(["/photos/square-one/01.jpg","/photos/square-one/02.jpg","/photos/square-one/03.jpg","/photos/square-one/04.jpg"]),
      history_json: JSON.stringify([{year:1882,event:"Corner tavern built by Christopher Schumacher."},{year:1900,event:"Anheuser-Busch acquires building as a Tied House."},{year:2006,event:"Square One Brewery & Distillery opens."},{year:2008,event:"Becomes Missouri's first licensed micro-distillery since Prohibition."}]),
      description: "Neighborhood brewery, distillery, and gastropub in a storied 1882 corner building on Park Avenue.",
    }),
    row('lmk-002', 'bldg-0386', 'Park Avenue Coffee', 'Park Avenue', 'dining', 'cafes', {
      phone: '+13146214020', website: 'https://parkavenuecoffee.com/pages/lafayette-square', logo: '/logos/park-avenue-coffee.png',
      rating: 4.4, review_count: 107,
      hours_json: JSON.stringify({monday:{open:"07:00",close:"14:00"},tuesday:{open:"07:00",close:"18:00"},wednesday:{open:"07:00",close:"18:00"},thursday:{open:"07:00",close:"18:00"},friday:{open:"07:00",close:"18:00"},saturday:{open:"07:00",close:"18:00"},sunday:{open:"07:30",close:"14:00"}}),
      amenities_json: JSON.stringify(["Free WiFi","Outdoor patio","Indoor seating in historic bank vault","75 flavors of gooey butter cake"]),
      photos_json: JSON.stringify(["/photos/park-avenue-coffee/01.jpg","/photos/park-avenue-coffee/02.jpg","/photos/park-avenue-coffee/03.jpg"]),
    }),
    row('lmk-003', 'bldg-0086', 'Extra Wavy', 'Chouteau Avenue', 'dining', 'restaurants', {
      phone: '+13143461165', website: 'https://extrawavystl.com/', logo: '/logos/extra-wavy.png',
      rating: 4.6, review_count: 57,
      hours_json: JSON.stringify({tuesday:{open:"17:00",close:"22:00"},wednesday:{open:"17:00",close:"22:00"},thursday:{open:"17:00",close:"22:00"},friday:{open:"17:00",close:"22:00"},saturday:{open:"17:00",close:"22:00"}}),
      amenities_json: JSON.stringify(["Raw bar","Full bar with craft cocktails","Reservations via Resy","Historic cellar event space"]),
      photos_json: JSON.stringify(["/photos/extra-wavy/01.jpg","/photos/extra-wavy/02.jpg","/photos/extra-wavy/03.jpg"]),
    }),
    row('lmk-004', 'bldg-1594', 'Jefferson Chop Suey', 'South Jefferson Avenue', 'dining', 'restaurants', {
      phone: '+13147731688', rating: 3.6, review_count: 45,
      hours_json: JSON.stringify({monday:{open:"11:30",close:"22:00"},tuesday:{open:"11:30",close:"22:00"},wednesday:{open:"11:30",close:"22:00"},thursday:{open:"11:30",close:"22:00"},friday:{open:"11:30",close:"22:00"},saturday:{open:"11:30",close:"22:00"}}),
      amenities_json: JSON.stringify(["Cash only","Takeout available","Dine-in service","Family-owned"]),
      photos_json: JSON.stringify(["/photos/jefferson-chop-suey/01.jpg","/photos/jefferson-chop-suey/02.jpg","/photos/jefferson-chop-suey/03.jpg"]),
    }),
    row('lmk-005', 'bldg-1594', "Master G's Styling Studio", 'South Jefferson Avenue', 'services', 'beauty', {
      phone: '+13146699174', website: 'https://booksy.com/en-us/261565_master-g-s-styling-studio_hair-salon_117221_st-louis',
      description: "Neighborhood hair salon specializing in natural hair care.",
      amenities_json: JSON.stringify(["Natural hair care","Sew-in weaves","Braids","Retwists","Appointments via Booksy"]),
    }),
    row('lmk-006', 'bldg-1606', 'Save-A-Lot', '1631 South Jefferson Avenue', 'shopping', 'grocery', {
      phone: '(314) 776-3217', website: 'https://savealot.com/stores/30222',
      rating: 4.1, review_count: 922,
      hours_json: JSON.stringify({monday:{open:"08:00",close:"22:00"},tuesday:{open:"08:00",close:"22:00"},wednesday:{open:"08:00",close:"22:00"},thursday:{open:"08:00",close:"22:00"},friday:{open:"08:00",close:"22:00"},saturday:{open:"08:00",close:"22:00"},sunday:{open:"08:00",close:"22:00"}}),
      description: "Discount grocery store anchoring Jefferson Commons. Opened in 2013 to address a food desert.",
      amenities_json: JSON.stringify(["Full grocery","Accepts EBT/WIC","Delivery via DoorDash/Instacart","Recently remodeled"]),
      photos_json: JSON.stringify(["/photos/save-a-lot/01.jpg","/photos/save-a-lot/02.jpg","/photos/save-a-lot/03.jpg"]),
    }),
    row('lmk-007', 'bldg-1580', 'Subway', 'South Jefferson Avenue', 'dining', 'restaurants', {
      phone: '+1 314-771-1444', website: 'https://restaurants.subway.com/united-states/mo/st-louis/1641-s-jefferson-ave',
    }),
    row('lmk-008', 'bldg-0711', 'The Bellwether', '1419 Carroll St', 'dining', 'restaurants', {
      phone: '+1-314-380-3086', website: 'https://www.thebellwetherstl.com/', logo: '/logos/bellwether.jpg',
      rating: 4.6, review_count: 503,
      hours_json: JSON.stringify({tuesday:{open:"17:00",close:"21:00"},wednesday:{open:"17:00",close:"21:00"},thursday:{open:"17:00",close:"21:00"},friday:{open:"17:00",close:"21:30"},saturday:{open:"10:00",close:"21:30"},sunday:{open:"10:00",close:"14:00"}}),
      amenities_json: JSON.stringify(["Rooftop patio","Full craft cocktail bar","Weekend brunch","Reservations via Tock"]),
      photos_json: JSON.stringify(["/photos/bellwether/01.jpeg","/photos/bellwether/02.jpeg","/photos/bellwether/03.jpeg"]),
    }),
    row('lmk-009', 'bldg-0419', 'Frontenac Cleaners West End', '1937 Park Avenue', 'services', 'beauty', {
      phone: '(314) 436-1355',
      description: "Neighborhood dry cleaner established in 1950, one of the longest-running businesses in Lafayette Square.",
      hours_json: JSON.stringify({monday:{open:"07:30",close:"19:00"},tuesday:{open:"07:30",close:"19:00"},wednesday:{open:"07:30",close:"19:00"},thursday:{open:"07:30",close:"19:00"},friday:{open:"07:30",close:"19:00"},saturday:{open:"08:00",close:"16:00"}}),
      amenities_json: JSON.stringify(["Dry cleaning","Alterations","Shoe repair","Pick-up and delivery"]),
      photos_json: JSON.stringify(["/photos/frontenac-cleaners/01.jpg","/photos/frontenac-cleaners/02.jpg","/photos/frontenac-cleaners/03.jpg"]),
    }),
    row('lmk-010', 'bldg-0376', 'Polite Society', '1923 Park Ave', 'dining', 'restaurants', {
      phone: '(314) 325-2553', website: 'https://www.politesocietystl.com', logo: '/logos/polite-society.png',
      rating: 4.7, review_count: 1555,
      hours_json: JSON.stringify({monday:{open:"17:00",close:"21:00"},tuesday:{open:"17:00",close:"21:00"},wednesday:{open:"17:00",close:"21:00"},thursday:{open:"17:00",close:"21:00"},friday:{open:"17:00",close:"21:00"},saturday:{open:"10:00",close:"21:00"},sunday:{open:"09:00",close:"21:00"}}),
      amenities_json: JSON.stringify(["Full bar","Reservations (Tock)","Outdoor seating","Weekend brunch","Private dining","Speakeasy entrance"]),
      photos_json: JSON.stringify(["/photos/polite-society/01.jpeg","/photos/polite-society/02.jpeg","/photos/polite-society/03.jpeg","/photos/polite-society/04.jpeg"]),
      description: "A restaurant, bar & gathering place in the heart of Lafayette Square.",
    }),
    row('lmk-011', 'bldg-0387', "Baileys' Chocolate Bar", 'Park Avenue', 'dining', 'restaurants', {
      phone: '+13142418100', website: 'https://www.baileyschocolatebar.com/', logo: '/logos/baileys.png',
      rating: 4.4, review_count: 312,
      hours_json: JSON.stringify({wednesday:{open:"17:00",close:"22:00"},thursday:{open:"17:00",close:"22:00"},friday:{open:"17:00",close:"23:00"},saturday:{open:"17:00",close:"23:00"},sunday:{open:"17:00",close:"22:00"}}),
      amenities_json: JSON.stringify(["Outdoor heated patio","Full bar","Private event space","Live music","House-made chocolate desserts"]),
      photos_json: JSON.stringify(["/photos/baileys/01.jpg","/photos/baileys/02.jpg","/photos/baileys/03.jpg"]),
    }),
    row('lmk-012', 'bldg-0385', '33 Wine Shop & Bar', 'Park Avenue', 'dining', 'bars', {
      phone: '+13142319463', website: 'https://www.33wine.com',
      rating: 4.5, review_count: 107,
      hours_json: JSON.stringify({tuesday:{open:"17:00",close:"22:00"},wednesday:{open:"17:00",close:"22:00"},thursday:{open:"17:00",close:"22:00"},friday:{open:"17:00",close:"01:00"},saturday:{open:"17:00",close:"01:00"}}),
      description: "Beloved neighborhood wine bar celebrating 25 years in Lafayette Square.",
      amenities_json: JSON.stringify(["500+ curated wines","Free wine tastings Tuesdays","Spacious outdoor patio","Cheese and charcuterie boards"]),
      photos_json: JSON.stringify(["/photos/33-wine/01.jpg","/photos/33-wine/02.jpg","/photos/33-wine/03.jpg"]),
    }),
    row('lmk-013', 'bldg-0384', 'Acosta Hair Design', '1901 Park Avenue, Suite 1R', 'services', 'beauty', {
      phone: '(314) 899-5016', website: 'https://acostahairdesign.com',
      rating: 5, review_count: 67,
      description: "Boutique hair salon founded in 2017 by Josie Acosta.",
      hours_json: JSON.stringify({tuesday:{open:"13:00",close:"20:00"},thursday:{open:"12:00",close:"19:00"},friday:{open:"09:30",close:"15:30"}}),
      amenities_json: JSON.stringify(["Hair coloring","Precision cutting","Extensions","Brazilian blowouts","Online booking"]),
      photos_json: JSON.stringify(["/photos/acosta-hair-design/01.jpg","/photos/acosta-hair-design/02.jpg","/photos/acosta-hair-design/03.jpg"]),
    }),
    row('lmk-014', 'bldg-0379', 'Vicini Pastaria', 'Park Avenue', 'dining', 'restaurants', {
      phone: '(314) 827-6150', website: 'https://www.vicinipastaria.com',
      rating: 4.9, review_count: 58,
      description: "Handmade fresh pasta shop, café, and Italian market by chef Dawn Wilson.",
      hours_json: JSON.stringify({friday:{open:"11:30",close:"18:00"},saturday:{open:"11:30",close:"17:30"},sunday:{open:"11:30",close:"17:30"}}),
      amenities_json: JSON.stringify(["Handmade fresh pasta","16-seat café","Italian specialty market","Friday Aperitivo 4-6 PM"]),
      photos_json: JSON.stringify(["/photos/vicini-pastaria/01.jpg","/photos/vicini-pastaria/02.jpg","/photos/vicini-pastaria/03.jpg"]),
    }),
    row('lmk-015', 'bldg-0385', 'Chad M. Lawson Fine Art', 'Park Avenue', 'arts', 'galleries', {
      website: 'https://www.chadmlawson.com',
      description: "Contemporary art studio known for striking abstract paintings on salvaged wooden doors.",
      photos_json: JSON.stringify(["/photos/chad-lawson/01.jpg","/photos/chad-lawson/02.jpg","/photos/chad-lawson/03.jpg"]),
      amenities_json: JSON.stringify(["Working artist studio","Viewings by appointment","Commissioned projects"]),
    }),
    row('lmk-016', 'bldg-0379', 'Grow Hair Co', 'Park Avenue', 'services', 'beauty', {
      phone: '+13149160493', website: 'https://growhairco.glossgenius.com',
      description: "Suite-style salon collective for independent beauty professionals.",
      hours_json: JSON.stringify({monday:{open:"09:00",close:"16:00"},tuesday:{open:"10:00",close:"19:00"},wednesday:{open:"10:00",close:"19:00"},friday:{open:"09:30",close:"15:00"},saturday:{open:"09:00",close:"14:00"}}),
      amenities_json: JSON.stringify(["Hair coloring and cutting","Extensions","HydraFacials","Brow lamination","Spray tans"]),
    }),
    row('lmk-017', 'bldg-0380', 'Nu-Look Cleaners', '1817 Park Avenue', 'services', 'beauty', {
      phone: '(314) 621-1488',
      description: "Family-owned dry cleaner and self-service laundromat operating since 1984.",
      hours_json: JSON.stringify({monday:{open:"07:00",close:"19:00"},tuesday:{open:"07:00",close:"19:00"},wednesday:{open:"07:00",close:"19:00"},thursday:{open:"07:00",close:"19:00"},friday:{open:"07:00",close:"19:00"}}),
      amenities_json: JSON.stringify(["Full-service dry cleaning","Alterations","Self-service laundromat","Same-day rush"]),
      photos_json: JSON.stringify(["/photos/nu-look-cleaners/01.jpg","/photos/nu-look-cleaners/02.jpg","/photos/nu-look-cleaners/03.jpg"]),
    }),
    row('lmk-021', 'bldg-0082', "Winnie's Wine Bar", 'Chouteau Avenue', 'dining', 'bars', {
      phone: '(314) 242-9463', website: 'https://winnieswinebar.com',
      rating: 4.5, review_count: 65,
      hours_json: JSON.stringify({tuesday:{open:"15:00",close:"21:00"},wednesday:{open:"15:00",close:"21:00"},thursday:{open:"15:00",close:"21:00"},friday:{open:"15:00",close:"22:00"},saturday:{open:"15:00",close:"22:00"}}),
      amenities_json: JSON.stringify(["30+ wines by the glass","8 curated wine flights","Craft cocktails","Outdoor patio","Private dining room"]),
      photos_json: JSON.stringify(["/photos/winnies/01.jpg","/photos/winnies/02.jpg","/photos/winnies/03.jpg"]),
    }),
    row('lmk-022', 'bldg-0083', 'Rhone Rum Bar', 'Chouteau Avenue', 'dining', 'bars', {
      phone: '(314) 241-7867', website: 'https://www.rhonerumbar.com',
      rating: 4.4, review_count: 38,
      amenities_json: JSON.stringify(["101+ rums","Caribbean-inspired food","Indoor sand volleyball","Private event space","Outdoor patio"]),
      photos_json: JSON.stringify(["/photos/rhone-rum-bar/01.jpg","/photos/rhone-rum-bar/02.jpg","/photos/rhone-rum-bar/03.jpg"]),
    }),
    row('lmk-025', 'bldg-0086', 'Malt House Lofts', 'Chouteau Avenue', 'historic', 'landmarks', {
      website: 'https://malthousecellar.com',
      description: "Historic 1876 brewery malt house, now mixed-use with loft apartments and event venues.",
      amenities_json: JSON.stringify(["17 loft apartments","7 event venues","Rooftop with Arch views","Extra Wavy restaurant","Solar carport"]),
      photos_json: JSON.stringify(["/photos/malt-house-lofts/01.jpg","/photos/malt-house-lofts/02.jpg","/photos/malt-house-lofts/03.jpg"]),
    }),
    row('lmk-027', 'bldg-0892', 'SqWires Restaurant & Market', 'South 18th Street', 'dining', 'restaurants', {
      phone: '+1 314-865-3522', website: 'https://sqwires.com/', logo: '/logos/sqwires.png',
      rating: 4.4, review_count: 1498,
      hours_json: JSON.stringify({tuesday:{open:"11:00",close:"21:00"},wednesday:{open:"11:00",close:"21:00"},thursday:{open:"11:00",close:"21:00"},friday:{open:"11:00",close:"22:00"},saturday:{open:"09:00",close:"22:00"},sunday:{open:"09:00",close:"14:00"}}),
      amenities_json: JSON.stringify(["Full bar","Weekend brunch","Outdoor patio","On-site market","Private dining","Live jazz Thu-Sat","Green Dining Alliance"]),
      photos_json: JSON.stringify(["/photos/sqwires/01.jpg","/photos/sqwires/02.jpg","/photos/sqwires/03.jpg"]),
      description: "A Lafayette Square anchor since 2001, set inside a converted 1900s wire factory.",
    }),
    row('lmk-028', 'bldg-0464', 'Eleven Eleven Mississippi', 'Mississippi Avenue', 'dining', 'restaurants', {
      phone: '+13142419999', website: 'https://www.1111-m.com/', logo: '/logos/eleven-eleven.png',
      rating: 4.8, review_count: 4658,
      hours_json: JSON.stringify({tuesday:{open:"11:00",close:"21:00"},wednesday:{open:"11:00",close:"21:00"},thursday:{open:"11:00",close:"21:00"},friday:{open:"11:00",close:"22:00"},saturday:{open:"10:00",close:"22:00"}}),
      amenities_json: JSON.stringify(["Farm-to-table","Oak-fired brick oven","Wine cellar private dining","Fireplaces","Outdoor patio","Saturday brunch"]),
      photos_json: JSON.stringify(["/photos/eleven-eleven/01.jpg","/photos/eleven-eleven/02.jpg","/photos/eleven-eleven/03.jpg"]),
    }),
    row('lmk-029', 'bldg-0201', "Saint Joseph's Church", '2123 Park Avenue', 'community', 'churches', {
      description: "Former Church of the Unity (1869) turned St. Joseph Lithuanian Catholic Church (1916–1970).",
      photos_json: JSON.stringify(["/photos/st-josephs/01.jpg","/photos/st-josephs/02.jpg","/photos/st-josephs/03.jpg"]),
    }),
    row('lmk-030', 'bldg-0981', 'Lafayette Park United Methodist Church', '2300 Lafayette Avenue', 'community', 'churches', {
      phone: '(314) 771-9214', website: 'https://www.lp-umc.org',
      description: "Active Reconciling United Methodist congregation in a stunning Romanesque Revival limestone church.",
      amenities_json: JSON.stringify(["Sunday worship 9:30 AM","Reconciling congregation","Preschool","1901 Kilgen pipe organ"]),
      photos_json: JSON.stringify(["/photos/lafayette-park-umc/01.jpg","/photos/lafayette-park-umc/02.jpg","/photos/lafayette-park-umc/03.jpg"]),
    }),
    row('lmk-031', 'bldg-1114', 'City Church', '1916 Lafayette Avenue', 'community', 'churches', {
      website: 'https://citychurchstl.org',
      description: "Evangelical Presbyterian congregation in the former Immaculate Conception Catholic Church rectory.",
      amenities_json: JSON.stringify(["Sunday School 9:00 AM","Worship 10:15 AM","Community Groups"]),
      photos_json: JSON.stringify(["/photos/city-church/01.jpg","/photos/city-church/02.jpg","/photos/city-church/03.jpg"]),
    }),
    row('lmk-032', 'bldg-0082', "Hamilton's Urban Steakhouse & Bourbon Bar", 'Chouteau Avenue', 'dining', 'restaurants', {
      phone: '+13142412333', website: 'https://www.hamiltonsteak.com/', logo: '/logos/hamiltons.png',
      rating: 4.7, review_count: 1240,
      hours_json: JSON.stringify({tuesday:{open:"15:00",close:"22:00"},wednesday:{open:"15:00",close:"22:00"},thursday:{open:"15:00",close:"22:00"},friday:{open:"15:00",close:"22:00"},saturday:{open:"15:00",close:"22:00"}}),
      amenities_json: JSON.stringify(["Bourbon bar 70+ selections","Hydroponic greenhouse","Private dining","Heritage Breed Black Angus","Reservations via OpenTable/Tock"]),
      photos_json: JSON.stringify(["/photos/hamiltons/01.jpg","/photos/hamiltons/02.jpg","/photos/hamiltons/03.jpg"]),
    }),
    row('lmk-033', 'bldg-0050', "Planter's House", 'Mississippi Avenue', 'dining', 'bars', {
      phone: '(314) 696-2603', website: 'https://www.plantershousestl.com',
      rating: 4.6, review_count: 392,
      hours_json: JSON.stringify({tuesday:{open:"16:00",close:"00:00"},wednesday:{open:"16:00",close:"00:00"},thursday:{open:"16:00",close:"00:00"},friday:{open:"16:00",close:"01:00"},saturday:{open:"16:00",close:"01:00"},sunday:{open:"16:00",close:"22:00"}}),
      amenities_json: JSON.stringify(["Award-winning craft cocktails","The Bullock Room hidden bar","Happy hour Tue-Fri 4-6pm","Patio seating","Reservations via Tock"]),
      photos_json: JSON.stringify(["/photos/planters-house/01.jpg","/photos/planters-house/02.jpg","/photos/planters-house/03.jpg"]),
    }),
    row('lmk-034', 'bldg-1361', 'Saint Marcus United Church of Christ', 'Russell Boulevard', 'community', 'churches'),
    row('lmk-035', 'bldg-0604', "Saint Mary's Assumption Catholic Church", '1126 Dolman Street', 'community', 'churches', {
      phone: '(314) 436-4544', website: 'http://smastl.org',
      description: "English Gothic Revival church built in 1871. SSPX traditionalist Catholic chapel offering Latin Mass.",
      amenities_json: JSON.stringify(["Sunday Low Mass 7:30 AM","Sunday High Mass 10:00 AM","Traditional Latin Mass","Restored pipe organ"]),
      photos_json: JSON.stringify(["/photos/st-marys-assumption/01.jpg","/photos/st-marys-assumption/02.jpg","/photos/st-marys-assumption/03.jpg"]),
    }),
    row('lmk-036', 'bldg-1115', 'Lafayette Preparatory Academy', '1900 Lafayette Avenue', 'community', 'schools', {
      phone: '(314) 880-4458', website: 'https://lafayetteprep.org',
      description: "Top-ranked public charter school (PK-8) in a renovated 1868 Baptist church complex.",
      amenities_json: JSON.stringify(["PK-8 tuition-free","7:1 student-teacher ratio","#1 in STL City reading/science/math"]),
      photos_json: JSON.stringify(["/photos/lafayette-prep/01.jpg","/photos/lafayette-prep/02.jpg","/photos/lafayette-prep/03.jpg"]),
    }),
    row('lmk-037', 'bldg-1546', 'Berea Presbyterian Church', 'Russell Boulevard', 'community', 'churches'),
    row('lmk-038', 'bldg-0976', 'Seib House', 'Lafayette Avenue', 'historic', 'notable-homes', {
      description: "Historic 1882 Romanesque Revival mansion, home to the Seib family for over 90 years.",
      photos_json: JSON.stringify(["/photos/seib-house/01.jpg","/photos/seib-house/02.jpg","/photos/seib-house/03.jpg"]),
    }),
    row('lmk-039', 'bldg-0822', 'Rosé By Peno', 'South 18th Street', 'dining', 'restaurants', {
      phone: '+13144058500', website: 'https://www.rosestl.com/',
      rating: 4.7, review_count: 89,
      hours_json: JSON.stringify({monday:{open:"17:00",close:"21:00"},thursday:{open:"17:00",close:"22:00"},friday:{open:"17:00",close:"22:00"},saturday:{open:"17:00",close:"22:00"},sunday:{open:"10:00",close:"21:00"}}),
      amenities_json: JSON.stringify(["25-seat garden patio","Nitro wine system","Intimate 38-seat dining room","Reservations via Tock","Sunday brunch"]),
      photos_json: JSON.stringify(["/photos/rose-by-peno/01.jpg","/photos/rose-by-peno/02.jpg","/photos/rose-by-peno/03.jpg"]),
    }),
    // Extra businesses not in landmarks.json
    row('lmk-023', 'bldg-1262', 'Sigel Elementary School', '', 'community', 'schools'),
    row('lmk-024', 'bldg-1366', 'McKinley Classical Leadership Academy', 'Russell Boulevard', 'community', 'schools'),
    row('lmk-026', 'bldg-1244', 'Quoba Masjid', 'Allen Avenue', 'community', 'churches'),
    row('lmk-040', 'bldg-0720', 'KIPP Wisdom Academy', '', 'community', 'schools'),
    row('lmk-041', 'bldg-1295', 'Holy Trinity Serbian Eastern Orthodox Church', '', 'community', 'churches'),
    row('lmk-018', 'bldg-0752', 'A. T. Still University - MOSDOH', 'Park Avenue', 'services', 'medical'),
    row('lmk-019', 'bldg-0682', 'Kritique Designs', 'Chouteau Avenue', 'services', 'beauty', { phone: '+13142293002' }),
    row('lmk-020', 'bldg-0682', 'Salama Supermarket', 'Chouteau Avenue', 'shopping', 'grocery', { phone: '+13144367704' }),
  ]

  listings.forEach(r => sheet.appendRow(r))
  Logger.log('Seeded ' + listings.length + ' listings')
}

// ─── Utility: Seed sample events for the next 3 days ────────────────────────

function seedEvents() {
  var sheet = getSheet('Events')
  var now = nowISO()

  // Clear existing data (keep sheet) and set correct headers
  sheet.clear()
  var headers = ['id', 'listing_id', 'device_hash', 'type', 'title', 'description', 'start_date', 'end_date', 'created_at']
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold')

  // Build date strings for today + next 2 days
  var d = new Date()
  var dates = []
  for (var i = 0; i < 3; i++) {
    var dd = new Date(d)
    dd.setDate(dd.getDate() + i)
    dates.push(Utilities.formatDate(dd, TIMEZONE, 'yyyy-MM-dd'))
  }

  // Events sheet columns: id, listing_id, device_hash, type, title, description, start_date, end_date, created_at
  var events = [
    // ── Square One Brewery (lmk-001) ──
    [generateId('evt'), 'lmk-001', 'seed', 'special', 'Sunday Brunch & Bloody Mary Bar',
     'Build-your-own Bloody Mary bar with brunch classics and 15 beers on tap.',
     dates[0], '', now],
    [generateId('evt'), 'lmk-001', 'seed', 'event', 'Monday Night Trivia',
     'Six rounds of pub trivia with prizes. Teams of up to 6. Starts at 7 PM.',
     dates[1], '', now],
    [generateId('evt'), 'lmk-001', 'seed', 'special', 'Taco Tuesday & $5 House Beers',
     'Street tacos and $5 pints of all house-brewed beers.',
     dates[2], '', now],

    // ── SqWires (lmk-027) ──
    [generateId('evt'), 'lmk-027', 'seed', 'event', 'Sunday Jazz Brunch',
     'Live jazz trio accompanies weekend brunch in the converted wire factory.',
     dates[0], '', now],
    [generateId('evt'), 'lmk-027', 'seed', 'special', 'Industry Night — Half-Off Bottles',
     'Half-price bottles of wine for hospitality workers. Bring your pay stub.',
     dates[1], '', now],
    [generateId('evt'), 'lmk-027', 'seed', 'event', 'Live Jazz with the STL Quintet',
     'The STL Quintet plays standards and originals. 7–10 PM, no cover.',
     dates[2], '', now],

    // ── Polite Society (lmk-010) ──
    [generateId('evt'), 'lmk-010', 'seed', 'special', 'Sunday Supper — Prix Fixe Menu',
     'Three-course prix fixe dinner for $45. Rotating seasonal menu by Chef.',
     dates[0], '', now],
    [generateId('evt'), 'lmk-010', 'seed', 'event', 'Cocktail Class: Classic Sours',
     'Learn to shake a Whiskey Sour, Daiquiri, and more. 6 PM. $35/person.',
     dates[1], '', now],
    [generateId('evt'), 'lmk-010', 'seed', 'event', 'Wine & Cheese Pairing Night',
     'Five wines paired with artisan cheeses. Guided tasting at 7 PM.',
     dates[2], '', now],

    // ── The Bellwether (lmk-008) ──
    [generateId('evt'), 'lmk-008', 'seed', 'event', 'Bellwether Rooftop Brunch',
     'Weekend brunch on the rooftop patio with craft cocktails and Arch views.',
     dates[0], '', now],
    [generateId('evt'), 'lmk-008', 'seed', 'special', 'Pasta & Pinot Monday',
     'House-made pasta and half-price Pinot Noir. Perfect start to the week.',
     dates[1], '', now],
    [generateId('evt'), 'lmk-008', 'seed', 'special', "Chef's Table Tasting Menu",
     'Five-course tasting with wine pairings. Limited to 12 seats. Reserve via Tock.',
     dates[2], '', now],
  ]

  events.forEach(function(r) { sheet.appendRow(r) })
  Logger.log('Seeded ' + events.length + ' events across ' + dates.join(', '))
}
