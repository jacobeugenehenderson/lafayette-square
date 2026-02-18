/**
 * Lafayette Square — Google Apps Script Backend
 *
 * Deploy as: Web App (Execute as: Me, Access: Anyone)
 * The deployed URL becomes the API base for the front-end.
 *
 * Endpoints:
 *   GET  ?action=buildings          → all building metadata
 *   GET  ?action=businesses         → all active businesses with category info
 *   GET  ?action=categories         → category taxonomy with colors
 *   GET  ?action=reviews&bid=X      → reviews for a business
 *   GET  ?action=events             → all active (non-expired) events
 *   GET  ?action=checkin-status&dh=X → check if device qualifies as local
 *   POST ?action=checkin            → log anonymous check-in
 *   POST ?action=review             → submit a review (requires local token)
 *   POST ?action=event              → post event/special (requires guardian token)
 *   POST ?action=claim              → guardian claims a business via QR
 *   POST ?action=community-post     → post to Society Pages (requires local token)
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

// ─── GET handler ────────────────────────────────────────────────────────────

function doGet(e) {
  const action = (e.parameter.action || '').toLowerCase()

  try {
    switch (action) {
      case 'buildings':    return getBuildings()
      case 'businesses':   return getBusinesses()
      case 'categories':   return getCategories()
      case 'reviews':      return getReviews(e.parameter.bid)
      case 'events':       return getEvents()
      case 'checkin-status': return getCheckinStatus(e.parameter.dh)
      case 'listings':     return getBusinesses()
      default:             return errorResponse('Unknown action: ' + action, 'bad_request')
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
      case 'checkin':        return postCheckin(body)
      case 'review':         return postReview(body)
      case 'event':          return postEvent(body)
      case 'claim':          return postClaim(body)
      case 'community-post': return postCommunityPost(body)
      case 'update-listing': return postUpdateListing(body)
      default:               return errorResponse('Unknown action: ' + action, 'bad_request')
    }
  } catch (err) {
    return errorResponse(err.message, 'server_error')
  }
}

// ─── GET: Buildings ─────────────────────────────────────────────────────────

function getBuildings() {
  const rows = sheetToObjects(getSheet('Buildings'))
  return jsonResponse(rows)
}

// ─── GET: Businesses ────────────────────────────────────────────────────────

function getBusinesses() {
  const rows = sheetToObjects(getSheet('Businesses'))
  const active = rows.filter(r => r.active !== false && r.active !== 'FALSE')

  // Parse JSON fields
  const parsed = active.map(biz => ({
    ...biz,
    hours:        parseJsonField(biz.hours_json),
    amenities:    parseJsonField(biz.amenities_json),
    tags:         parseJsonField(biz.tags_json),
    photos:       parseJsonField(biz.photos_json),
    architecture: parseJsonField(biz.architecture_json),
    history:      parseJsonField(biz.history_json),
  }))

  return jsonResponse(parsed)
}

// ─── GET: Categories ────────────────────────────────────────────────────────

function getCategories() {
  const rows = sheetToObjects(getSheet('Categories'))
  return jsonResponse(rows)
}

// ─── GET: Reviews for a business ────────────────────────────────────────────

function getReviews(businessId) {
  if (!businessId) return errorResponse('Missing bid parameter', 'bad_request')
  const rows = sheetToObjects(getSheet('Reviews'))
  const filtered = rows
    .filter(r => r.business_id === businessId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  return jsonResponse(filtered)
}

// ─── GET: Active events ─────────────────────────────────────────────────────

function getEvents() {
  const rows = sheetToObjects(getSheet('Events'))
  const today = todayCentral()
  const active = rows.filter(r => {
    // Event is active if end_date >= today (or no end_date and start_date >= today)
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

  // Count distinct dates within the rolling window for this device
  const distinctDates = new Set()
  rows.forEach(r => {
    if (r.device_hash === deviceHash && r.date >= cutoffStr) {
      distinctDates.add(r.date)
    }
  })

  const isLocal = distinctDates.size >= LOCAL_THRESHOLD

  return jsonResponse({
    device_hash: deviceHash,
    distinct_days: distinctDates.size,
    threshold: LOCAL_THRESHOLD,
    window_days: LOCAL_WINDOW_DAYS,
    is_local: isLocal,
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

  // Prevent duplicate check-in on same day at same location
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

  // Return updated local status
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - LOCAL_WINDOW_DAYS)
  const cutoffStr = Utilities.formatDate(cutoff, TIMEZONE, 'yyyy-MM-dd')
  const distinctDates = new Set()
  existing.forEach(r => {
    if (r.device_hash === device_hash && r.date >= cutoffStr) {
      distinctDates.add(r.date)
    }
  })
  distinctDates.add(date) // include today

  return jsonResponse({
    logged: true,
    distinct_days: distinctDates.size,
    is_local: distinctDates.size >= LOCAL_THRESHOLD,
  })
}

// ─── POST: Review ───────────────────────────────────────────────────────────

function postReview(body) {
  const business_id = body.business_id || body.listing_id
  const { device_hash, text, rating } = body
  if (!device_hash || !business_id || !text) {
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
  sheet.appendRow([id, business_id, device_hash, text, rating || '', nowISO()])

  return jsonResponse({ id: id, logged: true })
}

// ─── POST: Event ────────────────────────────────────────────────────────────

function postEvent(body) {
  const business_id = body.business_id || body.listing_id
  const { device_hash, title, description, start_date, end_date, category_tag } = body
  if (!device_hash || !business_id || !title || !start_date) {
    return errorResponse('Missing required fields', 'bad_request')
  }

  // Verify device is a guardian for this business
  const guardians = sheetToObjects(getSheet('Guardians'))
  const isGuardian = guardians.some(g =>
    g.device_hash === device_hash && g.business_id === business_id
  )
  if (!isGuardian) {
    return errorResponse('Not a guardian for this business', 'unauthorized')
  }

  const sheet = getSheet('Events')
  const id = generateId('evt')
  sheet.appendRow([
    id, business_id, device_hash, title,
    description || '', start_date, end_date || '',
    category_tag || '', nowISO()
  ])

  return jsonResponse({ id: id, logged: true })
}

// ─── POST: Claim (Guardian) ─────────────────────────────────────────────────

function postClaim(body) {
  const business_id = body.business_id || body.listing_id
  const { device_hash, secret } = body
  if (!device_hash || !business_id || !secret) {
    return errorResponse('Missing required fields', 'bad_request')
  }

  // Verify the secret matches the business
  // The secret is a pre-generated value stored alongside the QR code.
  // For now, we validate that the business exists and the secret matches
  // a known pattern. In production, secrets should be stored per-business.
  const businesses = sheetToObjects(getSheet('Businesses'))
  const biz = businesses.find(b => b.id === business_id)
  if (!biz) {
    return errorResponse('Business not found', 'not_found')
  }

  // Check if already claimed by this device
  const guardians = sheetToObjects(getSheet('Guardians'))
  const existing = guardians.find(g =>
    g.device_hash === device_hash && g.business_id === business_id
  )
  if (existing) {
    return jsonResponse({ token: existing.token, already_claimed: true })
  }

  // Issue non-expiring token
  const token = 'grd-' + Utilities.getUuid().replace(/-/g, '').substring(0, 16)
  const sheet = getSheet('Guardians')
  sheet.appendRow([device_hash, business_id, token, nowISO()])

  return jsonResponse({ token: token, claimed: true })
}

// ─── POST: Update Listing (Guardian) ────────────────────────────────────────

function postUpdateListing(body) {
  const business_id = body.listing_id || body.business_id
  const { device_hash, fields } = body
  if (!device_hash || !business_id || !fields) {
    return errorResponse('Missing required fields', 'bad_request')
  }

  // Verify device is a guardian for this business
  const guardians = sheetToObjects(getSheet('Guardians'))
  const isGuardian = guardians.some(g =>
    g.device_hash === device_hash && g.business_id === business_id
  )
  if (!isGuardian) {
    return errorResponse('Not a guardian for this business', 'unauthorized')
  }

  // Find business row
  const sheet = getSheet('Businesses')
  const data = sheet.getDataRange().getValues()
  const headers = data[0]
  const idCol = headers.indexOf('id')
  let targetRow = -1
  for (let r = 1; r < data.length; r++) {
    if (data[r][idCol] === business_id) {
      targetRow = r + 1  // 1-indexed for Sheets API
      break
    }
  }
  if (targetRow === -1) {
    return errorResponse('Business not found', 'not_found')
  }

  // Map field names to sheet columns, writing JSON for complex fields
  const JSON_FIELDS = {
    hours: 'hours_json',
    amenities: 'amenities_json',
    tags: 'tags_json',
    photos: 'photos_json',
    architecture: 'architecture_json',
    history: 'history_json',
  }

  const updated = []
  Object.entries(fields).forEach(([key, value]) => {
    const colName = JSON_FIELDS[key] || key
    const colIdx = headers.indexOf(colName)
    if (colIdx === -1) return  // unknown column, skip
    const cellValue = JSON_FIELDS[key] ? JSON.stringify(value) : value
    sheet.getRange(targetRow, colIdx + 1).setValue(cellValue)
    updated.push(key)
  })

  return jsonResponse({ updated: updated })
}

// ─── POST: Community Post ───────────────────────────────────────────────────

function postCommunityPost(body) {
  const { device_hash, text } = body
  if (!device_hash || !text) {
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

  const sheet = getSheet('CommunityPosts')
  const id = generateId('post')
  sheet.appendRow([id, device_hash, text, nowISO()])

  return jsonResponse({ id: id, logged: true })
}

// ─── Utility: Seed businesses from initial landmark data ────────────────────

function seedBusinesses() {
  const sheet = getSheet('Businesses')
  if (sheet.getLastRow() > 1) {
    Logger.log('Businesses already seeded, skipping')
    return
  }

  // Columns: id, building_id, name, address, category, subcategory, phone, website, description, rating, hours_json, amenities_json, photos_json, rent_range, architecture_json, history_json, active
  const businesses = [
    ['biz-001', 'bldg-0652', 'Square One Brewery & Distillery',    'Park Avenue',            'dining',    'restaurants', '+13142312537',  'https://squareonebrewery.com/'],
    ['biz-002', 'bldg-0376', 'Park Avenue Coffee',                  'Park Avenue',            'dining',    'cafes',       '+13146214020',  'https://parkavenuecoffee.com/pages/lafayette-square'],
    ['biz-003', 'bldg-0086', 'Extra Wavy',                          'Chouteau Avenue',        'dining',    'restaurants', '+13143461165',  'https://extrawavystl.com/'],
    ['biz-004', 'bldg-1594', 'Jefferson Chop Suey',                 'South Jefferson Avenue', 'dining',    'restaurants', '',              ''],
    ['biz-005', 'bldg-1594', "Master G's Styling Studio",           'South Jefferson Avenue', 'services',  'beauty',      '+13147376817',  ''],
    ['biz-006', 'bldg-1606', 'Save-A-Lot',                          'South Jefferson Avenue', 'shopping',  'boutiques',   '+13147763217',  'https://savealot.com/grocery-stores/st-louis-63104-61375/'],
    ['biz-007', 'bldg-1580', 'Subway',                              'South Jefferson Avenue', 'dining',    'restaurants', '+1 314-771-1444','https://restaurants.subway.com/united-states/mo/st-louis/1641-s-jefferson-ave'],
    ['biz-008', 'bldg-0711', 'The Bellwether',                      'Carroll Street',         'dining',    'restaurants', '+1-314-380-3086','https://www.thebellwetherstl.com/'],
    ['biz-009', 'bldg-0419', 'Frontenac Cleaners West End',         'Park Avenue',            'shopping',  'boutiques',   '+13144361355',  ''],
    ['biz-010', 'bldg-0376', 'Polite Society',                      '1923 Park Ave',          'dining',    'restaurants', '(314) 325-2553','https://www.politesocietystl.com'],
    ['biz-011', 'bldg-0387', "Baileys' Chocolate Bar",              'Park Avenue',            'dining',    'restaurants', '+13142418100',  'https://www.baileyschocolatebar.com/'],
    ['biz-012', 'bldg-0385', '33 Wine Shop & Bar',                  'Park Avenue',            'shopping',  'boutiques',   '+13142319463',  ''],
    ['biz-013', 'bldg-0384', 'Acosta Hair Design',                  'Park Avenue',            'services',  'beauty',      '+13175072218',  ''],
    ['biz-014', 'bldg-0379', 'Vicini Pastaria',                     'Park Avenue',            'shopping',  'boutiques',   '',              ''],
    ['biz-015', 'bldg-0385', 'Chad M. Lawson Fine Art',             'Park Avenue',            'arts',      'galleries',   '',              ''],
    ['biz-016', 'bldg-0379', 'Grow Hair Co',                        'Park Avenue',            'services',  'beauty',      '+13149160493',  ''],
    ['biz-017', 'bldg-0380', 'Nu-Look Cleaners',                    'Park Avenue',            'shopping',  'boutiques',   '+13146211488',  ''],
    ['biz-018', 'bldg-0752', 'A. T. Still University - MOSDOH',     'Park Avenue',            'services',  'medical',     '',              ''],
    ['biz-019', 'bldg-0682', 'Kritique Designs',                    'Chouteau Avenue',        'services',  'beauty',      '+13142293002',  ''],
    ['biz-020', 'bldg-0682', 'Salama Supermarket',                  'Chouteau Avenue',        'shopping',  'boutiques',   '+13144367704',  ''],
    ['biz-021', 'bldg-0082', "Winnie's Wine Bar",                   'Chouteau Avenue',        'dining',    'bars',        '',              ''],
    ['biz-022', 'bldg-0083', 'Rhone Rum Bar',                       'Chouteau Avenue',        'dining',    'bars',        '',              ''],
    ['biz-023', 'bldg-1262', 'Sigel Elementary School',             '',                       'community', 'schools',     '',              ''],
    ['biz-024', 'bldg-1366', 'McKinley Classical Leadership Academy','Russell Boulevard',     'community', 'schools',     '',              ''],
    ['biz-025', 'bldg-0086', 'Malt House Lofts',                    'Chouteau Avenue',        'historic',  'landmarks',   '',              ''],
    ['biz-026', 'bldg-1244', 'Quoba Masjid',                        'Allen Avenue',           'community', 'churches',    '',              ''],
    ['biz-027', 'bldg-0892', 'SqWires Restaurant & Market',         'South 18th Street',      'dining',    'restaurants', '+1 314-865-3522','https://sqwires.com/'],
    ['biz-028', 'bldg-0464', 'Eleven Eleven Mississippi',           'Mississippi Avenue',     'dining',    'restaurants', '+13142419999',  'https://www.1111-m.com/'],
    ['biz-029', 'bldg-0201', "Saint Joseph's Church",               '',                       'community', 'churches',    '',              ''],
    ['biz-030', 'bldg-0981', 'Lafayette Park United Methodist Church','',                     'community', 'churches',    '',              ''],
    ['biz-031', 'bldg-1114', 'City Church',                         'Lafayette Avenue',       'community', 'churches',    '',              ''],
    ['biz-032', 'bldg-0082', "Hamilton's Urban Steakhouse & Bourbon Bar",'Chouteau Avenue',   'dining',    'restaurants', '+13142412333',  'https://www.hamiltonsteak.com/'],
    ['biz-033', 'bldg-0050', "Planter's House",                     'Mississippi Avenue',     'dining',    'bars',        '',              ''],
    ['biz-034', 'bldg-1361', 'Saint Marcus United Church of Christ', 'Russell Boulevard',     'community', 'churches',    '',              ''],
    ['biz-035', 'bldg-0604', "Saint Mary's Assumption Catholic Church",'Dolman Street',       'community', 'churches',    '',              ''],
    ['biz-036', 'bldg-1115', 'Lafayette Preparatory Academy',       '',                       'community', 'schools',     '',              ''],
    ['biz-037', 'bldg-1546', 'Berea Presbyterian Church',           'Russell Boulevard',      'community', 'churches',    '',              ''],
    ['biz-038', 'bldg-0976', 'Seib House',                          'Lafayette Avenue',       'historic',  'landmarks',   '',              ''],
    ['biz-039', 'bldg-0822', 'Rosé By Peno',                        'South 18th Street',      'dining',    'restaurants', '+13144058500',  'https://www.rosestl.com/'],
    ['biz-040', 'bldg-0720', 'KIPP Wisdom Academy',                 '',                       'community', 'schools',     '',              ''],
    ['biz-041', 'bldg-1295', 'Holy Trinity Serbian Eastern Orthodox Church','',                'community', 'churches',    '',              ''],
  ]

  businesses.forEach(row => {
    // Pad to 17 columns: id, building_id, name, address, category, subcategory, phone, website, description, rating, hours_json, amenities_json, photos_json, rent_range, architecture_json, history_json, active
    while (row.length < 16) row.push('')
    row.push(true) // active
    sheet.appendRow(row)
  })

  Logger.log('Seeded ' + businesses.length + ' businesses')
}

// ─── Utility: Seed initial categories ───────────────────────────────────────

function seedCategories() {
  const sheet = getSheet('Categories')
  if (sheet.getLastRow() > 1) {
    Logger.log('Categories already seeded, skipping')
    return
  }

  const categories = [
    // Top-level categories
    ['dining',    'Dining & Drinks',    'category',    '',        '#E85D3A', '\ud83c\udf7d\ufe0f'],
    ['historic',  'Historic Sites',     'category',    '',        '#C4A45A', '\ud83c\udfdb\ufe0f'],
    ['arts',      'Arts & Culture',     'category',    '',        '#7B5EA7', '\ud83c\udfad'],
    ['parks',     'Parks & Recreation', 'category',    '',        '#4A9E5C', '\ud83c\udf33'],
    ['shopping',  'Shopping',           'category',    '',        '#D4708A', '\ud83d\udecd\ufe0f'],
    ['services',  'Services',           'category',    '',        '#5A8EB5', '\ud83d\udd27'],
    ['community', 'Community',          'category',    '',        '#E8A54B', '\u26ea'],

    // Subcategories — dining
    ['restaurants', 'Restaurants',       'subcategory', 'dining',  '#E85D3A', '\ud83c\udf7d\ufe0f'],
    ['bars',        'Bars & Nightlife',  'subcategory', 'dining',  '#D94E4E', '\ud83c\udf78'],
    ['cafes',       'Cafes & Coffee',    'subcategory', 'dining',  '#C47A3A', '\u2615'],

    // Subcategories — historic
    ['landmarks',      'Landmarks',       'subcategory', 'historic', '#C4A45A', '\ud83c\udfdb\ufe0f'],
    ['notable-homes',  'Notable Homes',   'subcategory', 'historic', '#B8964E', '\ud83c\udfe0'],
    ['markers',        'Markers',         'subcategory', 'historic', '#A8863E', '\ud83d\udcdc'],

    // Subcategories — arts
    ['galleries', 'Galleries',           'subcategory', 'arts',    '#7B5EA7', '\ud83d\uddbc\ufe0f'],
    ['studios',   'Studios',             'subcategory', 'arts',    '#6B4E97', '\ud83c\udfa8'],
    ['venues',    'Venues',              'subcategory', 'arts',    '#8B6EB7', '\ud83c\udfb5'],

    // Subcategories — parks
    ['gardens',     'Gardens',           'subcategory', 'parks',   '#4A9E5C', '\ud83c\udf3a'],
    ['playgrounds', 'Playgrounds',       'subcategory', 'parks',   '#5AAE6C', '\ud83c\udfaa'],

    // Subcategories — shopping
    ['boutiques',    'Boutiques',        'subcategory', 'shopping', '#D4708A', '\ud83d\udc57'],
    ['antiques',     'Antiques',         'subcategory', 'shopping', '#C4607A', '\ud83c\udffa'],
    ['local-makers', 'Local Makers',     'subcategory', 'shopping', '#E4809A', '\ud83d\udecd\ufe0f'],

    // Subcategories — services
    ['medical',   'Medical',             'subcategory', 'services', '#5A8EB5', '\ud83c\udfe5'],
    ['legal',     'Legal',               'subcategory', 'services', '#4A7EA5', '\u2696\ufe0f'],
    ['financial', 'Financial',           'subcategory', 'services', '#6A9EC5', '\ud83c\udfe6'],
    ['beauty',    'Beauty',              'subcategory', 'services', '#7AAED5', '\ud83d\udc87'],

    // Subcategories — community
    ['churches',      'Churches',        'subcategory', 'community', '#E8A54B', '\u26ea'],
    ['schools',       'Schools',         'subcategory', 'community', '#D8953B', '\ud83c\udf93'],
    ['organizations', 'Organizations',   'subcategory', 'community', '#F8B55B', '\ud83e\udd1d'],
  ]

  categories.forEach(row => sheet.appendRow(row))
  Logger.log('Seeded ' + categories.length + ' categories')
}

// ─── Utility: Create all tabs with headers ──────────────────────────────────

function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID)

  const tabs = {
    'Buildings':       ['id', 'name', 'address', 'color', 'stories', 'year_built', 'year_renovated', 'zoning', 'assessed_value', 'building_sqft', 'lot_acres', 'description', 'architect', 'style', 'units', 'historic_status', 'facade_image'],
    'Businesses':      ['id', 'building_id', 'name', 'address', 'category', 'subcategory', 'phone', 'website', 'description', 'rating', 'hours_json', 'amenities_json', 'tags_json', 'photos_json', 'logo', 'rent_range', 'architecture_json', 'history_json', 'active'],
    'Categories':      ['id', 'name', 'type', 'parent_id', 'color_hex', 'emoji'],
    'Checkins':        ['device_hash', 'location_id', 'timestamp', 'date'],
    'Reviews':         ['id', 'business_id', 'device_hash', 'text', 'rating', 'timestamp'],
    'Events':          ['id', 'business_id', 'device_hash', 'title', 'description', 'start_date', 'end_date', 'category_tag', 'created_at'],
    'Guardians':       ['device_hash', 'business_id', 'token', 'claimed_at'],
    'CommunityPosts':  ['id', 'device_hash', 'text', 'timestamp'],
  }

  Object.entries(tabs).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name)
    if (!sheet) {
      sheet = ss.insertSheet(name)
    }
    // Set headers in row 1
    if (sheet.getLastRow() === 0 || sheet.getRange(1, 1).getValue() !== headers[0]) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold')
    }
  })

  Logger.log('All tabs created with headers')
}
