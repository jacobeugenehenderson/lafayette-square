#!/usr/bin/env node
/**
 * Merge NPS Historic District data into buildings.json.
 * Adds architecture.nps_notes, architecture.style (if missing), etc.
 */
import { readFileSync, writeFileSync } from 'fs'

const MATCHES_PATH = new URL('../src/data/nps-building-matches.json', import.meta.url).pathname
const BUILDINGS_PATH = new URL('../src/data/buildings.json', import.meta.url).pathname

const matches = JSON.parse(readFileSync(MATCHES_PATH, 'utf8'))
const buildingsData = JSON.parse(readFileSync(BUILDINGS_PATH, 'utf8'))

// --- Style inference from context keywords ---
function inferStyle(context, sourcePage) {
  const lc = context.toLowerCase()

  // Explicit mentions win
  if (/craftsman|modernistic|art deco|streamlined/i.test(context)) return 'Craftsman / Modernistic'
  if (/tudor gothic/i.test(context)) return 'Tudor Gothic Revival'
  if (/georgian\s+revival/i.test(context)) return 'Georgian Revival'
  if (/romanesque\s+revival/i.test(context)) return 'Romanesque Revival'
  if (/queen\s+anne/i.test(context)) return 'Queen Anne'
  if (/colonial\s+revival/i.test(context)) return 'Colonial Revival'
  if (/gothic\s+revival/i.test(context)) return 'Gothic Revival'
  if (/chateauesque|château/i.test(context)) return 'Chateauesque'
  if (/mansard|french roof|mansarded/i.test(context)) return 'Second Empire / Mansard'
  if (/italianate|bracketed wood cornice|paired front doors/i.test(context)) return 'Italianate'
  if (/greek revival|vernacular classicis|modillioned|denticulated/i.test(context)) return 'Greek Revival / Vernacular Classical'
  if (/revival/i.test(context)) return 'Revival'

  // Fall back to page-based section mapping (Item 7 sections)
  if (sourcePage === 42) return 'Greek Revival / Vernacular Classical'
  if (sourcePage === 43) return 'Italianate'
  if (sourcePage === 44 || sourcePage === 45) return 'Second Empire / Mansard'
  if (sourcePage >= 45 && sourcePage <= 47) return 'Revival'
  if (sourcePage === 48 || sourcePage === 49) return 'Craftsman'

  return null
}

// --- Extract structured facts from context ---
function extractFacts(context) {
  const facts = {}

  // Year built - look for patterns like "built in 1878", "erected in 1885", "completed in 1928", "circa 1874"
  const yearPatterns = [
    /(?:built|erected|completed|constructed|designed|issued)\s+(?:in\s+)?(?:circa\s+)?(\d{4})/i,
    /circa\s+(\d{4})/i,
    /\((\d{4})\)/,
  ]
  for (const pat of yearPatterns) {
    const m = context.match(pat)
    if (m) {
      const y = parseInt(m[1], 10)
      if (y >= 1800 && y <= 1950) { facts.year_built = y; break }
    }
  }

  // Architect - "by architect X", "designed by X", "from plans drawn up by architect X"
  const archPatterns = [
    /(?:designed\s+(?:in\s+\d{4}\s+)?by|by\s+architects?|from\s+plans\s+(?:drawn\s+up\s+)?by\s+architect)\s+([A-Z][A-Za-z.\s&']+?)(?:\s*[,;.(]|$|\s+(?:is|was|who|for|in|the|a|an))/,
    /architects?\s+([A-Z][A-Za-z.\s&']+?)(?:\s*[,;.(]|$|\s+(?:is|was|who|for|in|the|a|an|designed))/,
  ]
  for (const pat of archPatterns) {
    const m = context.match(pat)
    if (m) {
      let arch = m[1].trim().replace(/\s+/g, ' ')
      if (arch.length > 5 && arch.length < 80) { facts.architect = arch; break }
    }
  }

  // Original owner - "for X", "built for X"
  const ownerPatterns = [
    /(?:built|erected|constructed|issued)\s+(?:in\s+\d{4}\s+)?for\s+(?:(?:German-born\s+)?(?:tailor|lawyer|merchant|painter|dealer|secretary|banker)\s+)?([A-Z][A-Za-z.\s]+?)(?:\s*[,;]|\s+who|\s+a\s|\s+at\s|\s+for\s)/,
  ]
  for (const pat of ownerPatterns) {
    const m = context.match(pat)
    if (m) {
      let owner = m[1].trim().replace(/\s+/g, ' ')
      if (owner.length > 4 && owner.length < 60) { facts.original_owner = owner; break }
    }
  }

  // Named building - look for proper building names
  const namePatterns = [
    /the\s+((?:German|Eden|Metropolitan|St\.\s*Louis)\s+[A-Z][A-Za-z.\s&']+?)(?:\s*\(|\s+at\s|\s+was|\s+is)/i,
    /((?:Church|Baptist|Presbyterian|Episcopal|Unitarian)\s+(?:Church|of)[A-Za-z\s]+?)(?:\s*[,;]|\s+at\s|\s+was|\s+designed)/i,
    /(Lafayette\s+Par[ik]\s+(?:Baptist|Presbyterian|Methodist)\s+Church)/i,
    /(Deutsches\s+Haus)/i,
    /(Künstler\s+Verein)/i,
  ]
  for (const pat of namePatterns) {
    const m = context.match(pat)
    if (m) {
      let name = m[1].trim().replace(/\s+/g, ' ')
      if (name.length > 4 && name.length < 80) { facts.historic_name = name; break }
    }
  }

  return facts
}

// --- Clean OCR artifacts for display ---
function cleanExcerpt(text) {
  return text
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[~}{]/g, '')
    .replace(/\s*\|\s*/g, ' ')
    .trim()
}

// --- Build a map of building ID → NPS data (deduplicate, merge across pages) ---
const buildingNPS = new Map()

for (const match of matches) {
  if (match.matched_buildings.length === 0) continue

  const style = inferStyle(match.nps_address + ' ' + (match.context_excerpt || ''), match.source_page)
  const facts = extractFacts(match.context_excerpt || '')
  const excerpt = cleanExcerpt(match.context_excerpt || '')

  for (const mb of match.matched_buildings) {
    const existing = buildingNPS.get(mb.id)
    if (!existing) {
      buildingNPS.set(mb.id, {
        nps_address: match.nps_address,
        source_pages: [match.source_page],
        style,
        facts,
        excerpts: excerpt ? [excerpt] : [],
        is_fuzzy: !!mb.offset,
      })
    } else {
      // Merge additional mentions
      if (!existing.source_pages.includes(match.source_page)) {
        existing.source_pages.push(match.source_page)
      }
      if (excerpt && !existing.excerpts.includes(excerpt)) {
        existing.excerpts.push(excerpt)
      }
      // Merge facts (later mentions may have more info)
      Object.assign(existing.facts, { ...existing.facts, ...facts })
      // Prefer more specific style
      if (style && (!existing.style || existing.style === 'Revival')) {
        existing.style = style
      }
    }
  }
}

// --- Now read context_excerpt from the original match data ---
// We need context_excerpt but the match JSON doesn't have it - re-read from CSV
import { fileURLToPath } from 'url'

const CSV_PATH = '/Users/jacobhenderson/Desktop/inventory/lafayette-square-hd__explicit_buildings_master.csv'
const csvRaw = readFileSync(CSV_PATH, 'utf8')

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

const npsRows = parseCSV(csvRaw)

// Re-do the matching with context available
buildingNPS.clear()

// Need to replicate the address matching from the match script
const STREET_MAP = {
  park: 'PARK AV', lafayette: 'LAFAYETTE AV', chouteau: 'CHOUTEAU AV',
  mississippi: 'MISSISSIPPI AV', jefferson: 'S JEFFERSON AV', hickory: 'HICKORY ST',
  mackay: 'MACKAY PL', mackey: 'MACKAY PL', missouri: 'MISSOURI AV',
  carroll: 'CARROLL ST', dolman: 'DOLMAN ST', rutger: 'RUTGER ST',
  kennett: 'KENNETT PL', benton: 'BENTON PL', lasalle: 'LASALLE ST',
  vail: 'VAIL PL', waverly: 'WAVERLY PL',
}

function parseBuildingAddr(addr) {
  if (!addr) return null
  const clean = addr.trim().replace(/\s+/g, ' ')
  const m = clean.match(/^(\d+)\s+(.+)$/)
  if (!m) return null
  return { number: parseInt(m[1], 10), street: m[2].toUpperCase() }
}

const buildingIndex = new Map()
for (const b of buildingsData.buildings) {
  const parsed = parseBuildingAddr(b.address)
  if (!parsed) continue
  if (!buildingIndex.has(parsed.street)) buildingIndex.set(parsed.street, [])
  buildingIndex.get(parsed.street).push({ id: b.id, number: parsed.number })
}

function expandRange(numberRaw) {
  const raw = numberRaw.trim()
  const rangeMatch = raw.match(/^(\d+)-(\d+)$/)
  if (!rangeMatch) { const n = parseInt(raw, 10); return isNaN(n) ? [] : [n] }
  const startStr = rangeMatch[1], endStr = rangeMatch[2]
  const start = parseInt(startStr, 10)
  let end = endStr.length < startStr.length
    ? parseInt(startStr.slice(0, startStr.length - endStr.length) + endStr, 10)
    : parseInt(endStr, 10)
  if (isNaN(start) || isNaN(end) || end < start || end - start > 200) return [start]
  const nums = []
  for (let i = start; i <= end; i++) nums.push(i)
  return nums
}

for (const row of npsRows) {
  const streetRaw = (row.street_raw || '').trim()
  const numberRaw = (row.number_raw || '').trim()
  const addressRaw = (row.address_raw || '').trim()
  const sourcePage = parseInt(row.source_page, 10)
  const contextExcerpt = row.context_excerpt || ''

  if (addressRaw === '176 Jefferson' && sourcePage >= 70) continue

  const streetKey = streetRaw.toLowerCase()
  const buildingStreet = STREET_MAP[streetKey]
  if (!buildingStreet) continue

  const candidates = buildingIndex.get(buildingStreet) || []
  const numbers = expandRange(numberRaw)

  let matchedIds = []
  for (const c of candidates) {
    if (numbers.includes(c.number)) matchedIds.push(c.id)
  }
  if (matchedIds.length === 0 && numbers.length > 0) {
    const target = numbers[0]
    for (const c of candidates) {
      if (Math.abs(c.number - target) <= 4) matchedIds.push(c.id)
    }
  }

  if (matchedIds.length === 0) continue

  const style = inferStyle(contextExcerpt, sourcePage)
  const facts = extractFacts(contextExcerpt)
  const excerpt = cleanExcerpt(contextExcerpt)

  for (const id of matchedIds) {
    const existing = buildingNPS.get(id)
    if (!existing) {
      buildingNPS.set(id, {
        nps_address: addressRaw,
        source_pages: [sourcePage].filter(p => !isNaN(p)),
        style,
        facts: { ...facts },
        excerpts: excerpt ? [excerpt] : [],
      })
    } else {
      if (!isNaN(sourcePage) && !existing.source_pages.includes(sourcePage)) {
        existing.source_pages.push(sourcePage)
      }
      if (excerpt && !existing.excerpts.includes(excerpt)) {
        existing.excerpts.push(excerpt)
      }
      // Merge facts
      for (const [k, v] of Object.entries(facts)) {
        if (v && !existing.facts[k]) existing.facts[k] = v
      }
      if (style && (!existing.style || existing.style === 'Revival')) {
        existing.style = style
      }
    }
  }
}

// --- Apply to buildings.json ---
let updated = 0
for (const building of buildingsData.buildings) {
  const nps = buildingNPS.get(building.id)
  if (!nps) continue

  // Ensure architecture object exists
  if (!building.architecture) building.architecture = {}
  const arch = building.architecture

  // Set district
  arch.district = 'Lafayette Square Historic District'

  // Set NPS listed
  arch.nps_listed = true
  arch.nps_source_pages = nps.source_pages

  // Set style if not already set (don't overwrite curated styles)
  if (!arch.style && nps.style) {
    arch.style = nps.style
  }

  // Add NPS-sourced facts
  if (nps.facts.year_built && !arch.year_built) {
    arch.year_built = nps.facts.year_built
  }
  if (nps.facts.architect && !arch.architect) {
    arch.architect = nps.facts.architect
  }
  if (nps.facts.original_owner && !arch.original_owner) {
    arch.original_owner = nps.facts.original_owner
  }
  if (nps.facts.historic_name && !arch.historic_name) {
    arch.historic_name = nps.facts.historic_name
  }

  // Add NPS context as a note (take the longest/most detailed excerpt)
  if (nps.excerpts.length > 0) {
    const best = nps.excerpts.sort((a, b) => b.length - a.length)[0]
    arch.nps_context = best
  }

  updated++
}

console.log(`Updated ${updated} buildings with NPS data`)

// Summary
for (const [id, nps] of buildingNPS) {
  const b = buildingsData.buildings.find(x => x.id === id)
  const addr = b?.address?.trim() || '?'
  const style = nps.style || '(no style)'
  const year = nps.facts.year_built || ''
  const arch = nps.facts.architect || ''
  const owner = nps.facts.original_owner || ''
  console.log(`  ${id} ${addr.padEnd(28)} ${style.padEnd(35)} ${year ? 'c.' + year : ''.padEnd(7)} ${arch ? '— ' + arch : ''} ${owner ? 'for ' + owner : ''}`)
}

// Write back
writeFileSync(BUILDINGS_PATH, JSON.stringify(buildingsData, null, 2) + '\n')
console.log(`\nWrote updated buildings.json`)
