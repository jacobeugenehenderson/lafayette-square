#!/usr/bin/env node
/**
 * Match NPS Historic District inventory addresses to buildings.json IDs.
 * Outputs a JSON mapping file.
 */
import { readFileSync, writeFileSync } from 'fs'

const CSV_PATH = '/Users/jacobhenderson/Desktop/inventory/lafayette-square-hd__explicit_buildings_master.csv'
const BUILDINGS_PATH = new URL('../src/data/buildings.json', import.meta.url).pathname

// --- CSV parser that handles multi-line quoted fields ---
function parseCSV(text) {
  const rows = []
  let i = 0, headers = null
  while (i < text.length) {
    const { fields, next } = parseCSVRecord(text, i)
    i = next
    if (!headers) { headers = fields; continue }
    if (fields.length === 0 || (fields.length === 1 && !fields[0].trim())) continue
    const obj = {}
    headers.forEach((h, idx) => obj[h] = fields[idx] || '')
    rows.push(obj)
  }
  return rows
}
function parseCSVRecord(text, start) {
  const fields = []
  let i = start, field = '', inQuote = false
  while (i < text.length) {
    const ch = text[i]
    if (inQuote) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2 }
      else if (ch === '"') { inQuote = false; i++ }
      else { field += ch; i++ }
    } else {
      if (ch === '"') { inQuote = true; i++ }
      else if (ch === ',') { fields.push(field); field = ''; i++ }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++
        i++
        break
      }
      else { field += ch; i++ }
    }
  }
  fields.push(field)
  return { fields, next: i }
}

// --- Load data ---
const csvRaw = readFileSync(CSV_PATH, 'utf8')
const npsRows = parseCSV(csvRaw)

const buildingsData = JSON.parse(readFileSync(BUILDINGS_PATH, 'utf8'))
const buildings = buildingsData.buildings

// --- Street name mapping: NPS → buildings.json suffix forms ---
const STREET_MAP = {
  park: 'PARK AV',
  lafayette: 'LAFAYETTE AV',
  chouteau: 'CHOUTEAU AV',
  mississippi: 'MISSISSIPPI AV',
  jefferson: 'S JEFFERSON AV',
  hickory: 'HICKORY ST',
  mackay: 'MACKAY PL',
  mackey: 'MACKAY PL',
  missouri: 'MISSOURI AV',
  carroll: 'CARROLL ST',
  dolman: 'DOLMAN ST',
  rutger: 'RUTGER ST',
  '18th': 'S 18TH ST',
  eighteenth: 'S 18TH ST',
  kennett: 'KENNETT PL',
  benton: 'BENTON PL',
  lasalle: 'LASALLE ST',
  vail: 'VAIL PL',
  waverly: 'WAVERLY PL',
  whittemore: 'WHITTEMORE PL',
  albion: 'ALBION PL',
  nicholson: 'NICHOLSON PL',
  simpson: 'SIMPSON PL',
  mcnulty: 'MCNULTY ST',
  preston: 'PRESTON PL',
}

// --- Parse building addresses into { number, street } ---
function parseBuildingAddr(addr) {
  if (!addr) return null
  const clean = addr.trim().replace(/\s+/g, ' ')
  const m = clean.match(/^(\d+)\s+(.+)$/)
  if (!m) return null
  return { number: parseInt(m[1], 10), street: m[2].toUpperCase() }
}

const buildingIndex = new Map() // street -> [{ id, number, building }]
for (const b of buildings) {
  const parsed = parseBuildingAddr(b.address)
  if (!parsed) continue
  if (!buildingIndex.has(parsed.street)) buildingIndex.set(parsed.street, [])
  buildingIndex.get(parsed.street).push({ id: b.id, number: parsed.number, building: b })
}

// --- Expand NPS address ranges ---
// "1923-37" → [1923, 1924, ..., 1937]
// "1808-12" → [1808, 1809, ..., 1812]
// "2229" → [2229]
function expandRange(numberRaw) {
  const raw = numberRaw.trim()
  const rangeMatch = raw.match(/^(\d+)-(\d+)$/)
  if (!rangeMatch) {
    const n = parseInt(raw, 10)
    return isNaN(n) ? [] : [n]
  }
  const startStr = rangeMatch[1]
  const endStr = rangeMatch[2]
  const start = parseInt(startStr, 10)
  // Short-form end: "1923-37" means 1937, not 37
  let end
  if (endStr.length < startStr.length) {
    const prefix = startStr.slice(0, startStr.length - endStr.length)
    end = parseInt(prefix + endStr, 10)
  } else {
    end = parseInt(endStr, 10)
  }
  if (isNaN(start) || isNaN(end) || end < start || end - start > 200) return [start]
  const nums = []
  for (let i = start; i <= end; i++) nums.push(i)
  return nums
}

// --- Match ---
const results = []
let matched = 0
let unmatched = 0

for (const row of npsRows) {
  const streetRaw = (row.street_raw || '').trim()
  const numberRaw = (row.number_raw || '').trim()
  const addressRaw = (row.address_raw || '').trim()
  const isRange = row.range_flag === 'True'
  const sourcePage = parseInt(row.source_page, 10)

  // Skip the mailing address entry (P.O. Box 176 Jefferson City)
  if (addressRaw === '176 Jefferson' && sourcePage >= 70) continue

  // Map NPS street to buildings.json street
  const streetKey = streetRaw.toLowerCase().replace(/\s+place$/i, '').replace(/\s+avenue$/i, '').replace(/\s+street$/i, '')
  const buildingStreet = STREET_MAP[streetKey]

  if (!buildingStreet) {
    console.error(`  No street mapping for "${streetRaw}" (${addressRaw})`)
    unmatched++
    results.push({
      nps_address: addressRaw,
      street_raw: streetRaw,
      number_raw: numberRaw,
      is_range: isRange,
      source_page: sourcePage,
      matched_buildings: [],
      match_type: 'no_street_mapping',
    })
    continue
  }

  const candidates = buildingIndex.get(buildingStreet) || []
  const numbers = expandRange(numberRaw)

  // Find buildings whose address number falls within the NPS range
  const matches = []
  for (const c of candidates) {
    if (numbers.includes(c.number)) {
      matches.push({ id: c.id, address: c.building.address?.trim() })
    }
  }

  // Also try nearby numbers (±4) for addresses with no exact match
  if (matches.length === 0) {
    const target = numbers[0] // use start of range
    for (const c of candidates) {
      if (Math.abs(c.number - target) <= 4) {
        matches.push({ id: c.id, address: c.building.address?.trim(), offset: c.number - target })
      }
    }
  }

  if (matches.length > 0) matched++
  else unmatched++

  results.push({
    nps_address: addressRaw,
    street_raw: streetRaw,
    number_raw: numberRaw,
    is_range: isRange,
    source_page: sourcePage,
    matched_buildings: matches,
    match_type: matches.length > 0
      ? (matches.some(m => m.offset) ? 'fuzzy' : 'exact')
      : 'no_match',
  })
}

// --- Report ---
console.log(`\nMatching complete:`)
console.log(`  Total NPS entries: ${results.length}`)
console.log(`  Matched: ${matched}`)
console.log(`  Unmatched: ${unmatched}`)

console.log(`\n--- Unmatched entries ---`)
for (const r of results) {
  if (r.match_type === 'no_match' || r.match_type === 'no_street_mapping') {
    console.log(`  ${r.nps_address} (page ${r.source_page}) — ${r.match_type}`)
  }
}

console.log(`\n--- Fuzzy matches (±2 offset) ---`)
for (const r of results) {
  if (r.match_type === 'fuzzy') {
    console.log(`  ${r.nps_address} → ${r.matched_buildings.map(m => `${m.id} (${m.address}, offset ${m.offset})`).join(', ')}`)
  }
}

console.log(`\n--- Multi-building matches ---`)
for (const r of results) {
  if (r.matched_buildings.length > 1) {
    console.log(`  ${r.nps_address} → ${r.matched_buildings.length} buildings: ${r.matched_buildings.map(m => m.id).join(', ')}`)
  }
}

// Write output
const outputPath = new URL('../src/data/nps-building-matches.json', import.meta.url).pathname
writeFileSync(outputPath, JSON.stringify(results, null, 2))
console.log(`\nWrote ${results.length} entries to ${outputPath}`)
