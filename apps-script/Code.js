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

// ─── GET handler ────────────────────────────────────────────────────────────

function doGet(e) {
  const action = (e.parameter.action || '').toLowerCase()

  try {
    switch (action) {
      case 'listings':       return getListings()
      case 'reviews':        return getReviews(e.parameter.lid)
      case 'events':         return getEvents()
      case 'checkin-status': return getCheckinStatus(e.parameter.dh)
      default:               return errorResponse('Unknown action: ' + action, 'bad_request')
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
      case 'checkin':         return postCheckin(body)
      case 'review':          return postReview(body)
      case 'event':           return postEvent(body)
      case 'claim':           return postClaim(body)
      case 'update-listing':  return postUpdateListing(body)
      case 'accept-listing':  return postAcceptListing(body)
      case 'remove-listing':  return postRemoveListing(body)
      default:                return errorResponse('Unknown action: ' + action, 'bad_request')
    }
  } catch (err) {
    return errorResponse(err.message, 'server_error')
  }
}

// ─── GET: Listings ──────────────────────────────────────────────────────────

function getListings() {
  const rows = sheetToObjects(getSheet('Listings'))
  const visible = rows.filter(r => r.status !== 'removed')

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
    delete out.hours_json
    delete out.amenities_json
    delete out.tags_json
    delete out.photos_json
    delete out.history_json
    // Expose guardian status as boolean
    out.has_guardian = !!(listing.guardian_hash)
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
  return jsonResponse(filtered)
}

// ─── GET: Active events ─────────────────────────────────────────────────────

function getEvents() {
  const rows = sheetToObjects(getSheet('Events'))
  const today = todayCentral()
  const active = rows.filter(r => {
    const end = r.end_date || r.start_date
    return end >= today
  })
  return jsonResponse(active.sort((a, b) => a.start_date.localeCompare(b.start_date)))
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
    if (r.device_hash === deviceHash && r.date >= cutoffStr) {
      distinctDates.add(r.date)
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
    r.date === date
  )
  if (alreadyToday) {
    return jsonResponse({ logged: false, reason: 'Already checked in here today' })
  }

  sheet.appendRow([device_hash, location_id, timestamp, date])

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - LOCAL_WINDOW_DAYS)
  const cutoffStr = Utilities.formatDate(cutoff, TIMEZONE, 'yyyy-MM-dd')
  const distinctDates = new Set()
  existing.forEach(r => {
    if (r.device_hash === device_hash && r.date >= cutoffStr) {
      distinctDates.add(r.date)
    }
  })
  distinctDates.add(date)

  return jsonResponse({
    logged: true,
    distinct_days: distinctDates.size,
    is_local: distinctDates.size >= LOCAL_THRESHOLD,
  })
}

// ─── POST: Review ───────────────────────────────────────────────────────────

function postReview(body) {
  const { device_hash, listing_id, text, rating } = body
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
    return errorResponse('Not a verified local', 'unauthorized')
  }

  const sheet = getSheet('Reviews')
  const id = generateId('rev')
  sheet.appendRow([id, listing_id, device_hash, text, rating || '', nowISO()])

  return jsonResponse({ id: id, logged: true })
}

// ─── POST: Event ────────────────────────────────────────────────────────────

function postEvent(body) {
  const { device_hash, listing_id, title, description, start_date, end_date, type } = body
  if (!device_hash || !listing_id || !title || !start_date) {
    return errorResponse('Missing required fields', 'bad_request')
  }

  // Verify device is a guardian for this listing
  const listing = findRow(getSheet('Listings'), 'id', listing_id)
  if (!listing || listing.rowData.guardian_hash !== device_hash) {
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

  // Already claimed by this device?
  if (result.rowData.guardian_hash === device_hash) {
    return jsonResponse({ token: result.rowData.guardian_token, already_claimed: true })
  }

  // Already claimed by someone else?
  if (result.rowData.guardian_hash) {
    return errorResponse('Listing already claimed by another device', 'conflict')
  }

  // Write guardian fields directly to the Listings row
  const headerMap = getHeaderMap(sheet)
  const token = 'grd-' + Utilities.getUuid().replace(/-/g, '').substring(0, 16)
  updateCell(sheet, result.rowIndex, headerMap, 'guardian_hash', device_hash)
  updateCell(sheet, result.rowIndex, headerMap, 'guardian_token', token)
  updateCell(sheet, result.rowIndex, headerMap, 'updated_at', nowISO())

  return jsonResponse({ token: token, claimed: true, success: true })
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

  // Auth: guardian_hash must match
  if (result.rowData.guardian_hash !== device_hash) {
    return errorResponse('Not authorized', 'unauthorized')
  }

  // Whitelist of editable fields
  const EDITABLE = [
    'name', 'address', 'category', 'subcategory', 'phone', 'website',
    'description', 'logo', 'home_based', 'rating', 'review_count',
    'hours_json', 'amenities_json', 'tags_json', 'photos_json', 'history_json'
  ]

  const headerMap = getHeaderMap(sheet)
  const updated = []
  for (const [key, value] of Object.entries(fields)) {
    if (EDITABLE.includes(key)) {
      updateCell(sheet, result.rowIndex, headerMap, key, value)
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

  if (result.rowData.guardian_hash !== device_hash) {
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

  if (result.rowData.guardian_hash !== device_hash) {
    return errorResponse('Not authorized', 'unauthorized')
  }

  const headerMap = getHeaderMap(sheet)
  updateCell(sheet, result.rowIndex, headerMap, 'status', 'removed')
  updateCell(sheet, result.rowIndex, headerMap, 'updated_at', nowISO())

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
      'guardian_hash', 'guardian_token', 'created_at', 'updated_at'
    ],
    'Checkins': ['device_hash', 'location_id', 'timestamp', 'date'],
    'Reviews':  ['id', 'listing_id', 'device_hash', 'text', 'rating', 'timestamp'],
    'Events':   ['id', 'listing_id', 'device_hash', 'type', 'title', 'description', 'start_date', 'end_date', 'created_at'],
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
  // guardian_hash, guardian_token, created_at, updated_at
  function row(id, buildingId, name, address, category, subcategory, opts) {
    const o = opts || {}
    return [
      id, buildingId, name, address, category, subcategory,
      o.phone || '', o.website || '', o.description || '', o.logo || '', o.home_based || false, 'pending',
      o.rating || '', o.review_count || '', o.hours_json || '', o.amenities_json || '', o.tags_json || '',
      o.photos_json || '', o.history_json || '', 'seed', false, '',
      '', '', now, now
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
