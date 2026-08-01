/**
 * parcel-landuse.mjs — an assessor parcel code → the ground's land-use class.
 *
 * ⭐ THE KIT RULE, and it is the whole reason this module exists: a parcel code
 * the kit cannot read must NOT become a plausible land use. It must become
 * `underived` — a class that says "no evidence" out loud, in the render and in
 * the pour log — so an operator pouring a town nobody has looked at learns the
 * join failed instead of being shown a confident map.
 *
 * ⛔ THERE IS NO CATCH-ALL HERE. `classifyParcelLandUse` returns null for a code
 * it does not recognize. The previous mapper (derive.js:691) ended
 * `return 'residential'`, and that one line is the defect this module replaces:
 *
 *   - It read as data. A County parcel coded 110 (SINGLE FAMILY) and a County
 *     parcel coded 601 (a commercial bucket) both came back 'residential',
 *     because the mapper only knew St. Louis CITY's 4-digit ranges and every
 *     3-digit County code falls through all of them.
 *   - Measured 2026-08-01: 14,587 of hipointe-demun's 14,597 County parcels
 *     flunk the city-only ranges. The County half of that neighborhood would
 *     have been mapped wholesale to a wrong answer that renders beautifully —
 *     `CLAUDE.md` Layer 0's fallback shape exactly. Not reading the file at all
 *     was, by a small margin, the less-wrong of the two.
 *
 * ⭐ TWO JURISDICTIONS, TWO TAXONOMIES — that is the portable lesson, not "St.
 * Louis has two files." Any US metro that spans a city/county assessor line
 * brings two code systems, and they are not compatible. So jurisdiction is a
 * REQUIRED argument, never inferred, and the County's meaning comes from the
 * County's OWN published code table rather than ranges someone reverse-engineered
 * from the codes they happened to see.
 *
 *   City   — 4-digit, ranges below (lifted verbatim from derive.js's mapper,
 *            minus its catch-all; the ranges themselves were never in dispute).
 *   County — 3-digit, resolved through `county-land-use-codes.csv` (189 codes,
 *            each carrying the assessor's own LUCODE bucket). We map the ~10
 *            buckets, not the 189 codes, so a code the County adds tomorrow
 *            still lands correctly.
 *
 * ⚠️ SHARED FACT, TWO CONSUMERS. `bake-content.js:297 classifyUse()` reads the
 * same parcel codes for a DIFFERENT vocabulary — the building roster's
 * structural `use` + `use_subtype` + `use_confidence`, refined downstream by
 * OSM listing tags. It deliberately stays separate: its output is per-BUILDING
 * and feeds the property atlas, this one is per-GROUND-FACE and feeds the paint.
 * The code→bucket fact is what is shared, and it lives here — bake-content
 * carries a pointer comment at its own site. If you change a bucket's meaning,
 * change it here and check that site.
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The class a face gets when nothing could derive it. NOT 'unknown' — that name
 * is already taken by derive.js's face-TYPE bucket (a face it could not classify
 * as block/park/island/parking at all) and is ratified HARD in lu-policy.mjs,
 * i.e. hardscape, i.e. grey and treeless. Routing a data gap into a hardscape
 * class is how a missing join comes out looking like a parking lot.
 *
 * `underived` is soft: it plants, it paints as land. Wrong-but-visible beats
 * wrong-and-silent (`lu-policy.mjs`).
 */
export const UNDERIVED = 'underived'

// ── St. Louis CITY — 4-digit assessor codes ─────────────────────────────────
// Verbatim from derive.js's classifyLandUse, catch-all removed.
function classifyCity(code) {
  const c = Number(code)
  if (!Number.isFinite(c)) return null
  if (c >= 1010 && c <= 1019) return 'vacant'             // vacant residential
  if (c === 1185)             return 'parking'            // residential parking
  if (c >= 1100 && c <= 1199) return 'residential'        // all residential types
  if (c >= 1300 && c <= 1399) return 'institutional'      // schools, churches
  if (c === 3000 || c === 3300 || c === 3900) return 'vacant-commercial'
  if (c >= 4000 && c <= 4999) return 'recreation'         // parks, rec
  if (c >= 5000 && c <= 5999) return 'commercial'         // commercial/retail
  if (c >= 6000 && c <= 6999) return 'institutional'      // govt, utilities
  if (c >= 7000 && c <= 7999) return 'industrial'
  return null                                             // ⛔ no catch-all
}

/**
 * St. Louis COUNTY LUCODE bucket → our ground vocabulary.
 *
 * The buckets are the assessor's, not ours; the right-hand side is the kit's
 * paint vocabulary (`bake-ground.js` PAINT_ORDER). 'Park' and 'Common Ground'
 * map to `recreation` rather than `park` on purpose: `park` is a face TYPE in
 * derive.js (the authored 4-corner park polygon) and giving a parcel that name
 * would let an ordinary lot inherit the park face's handling. Both paint green.
 */
const COUNTY_BUCKET_TO_LU = {
  'Single Family':      'residential',
  'Duplex/Townhome':    'residential',
  'Multi-Family':       'residential',
  'Commercial':         'commercial',
  'Industrial/Utility': 'industrial',
  'Institution':        'institutional',
  'Recreation':         'recreation',
  'Park':               'recreation',
  'Common Ground':      'recreation',
  'Vacant/Agriculture': 'vacant',
}

/**
 * Load a scene's County code table. Returns a Map code → { desc, bucket }, or
 * an EMPTY map when the file is absent — the caller is expected to notice that
 * every County parcel then classifies `underived` and say so. Same CSV
 * `bake-content.js:170 loadLandUseCodes()` reads.
 */
export function loadCountyCodeTable(scene) {
  const map = new Map()
  if (!scene) return map
  const p = path.join(REPO_ROOT, 'cartograph', 'data', scene, 'content', 'county-land-use-codes.csv')
  if (!existsSync(p)) return map
  const lines = readFileSync(p, 'utf8').replace(/^﻿/, '').split(/\r?\n/)
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i])
    if (row.length < 3 || !row[0]) continue
    map.set(String(row[0]).trim(), { desc: row[1], bucket: String(row[2]).trim() })
  }
  return map
}

function parseCsvLine(line) {
  const out = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

/**
 * @param {string|number} code          the assessor's land-use code
 * @param {'city'|'county'} jurisdiction REQUIRED — the taxonomies are not compatible
 * @param {Map} countyTable             from loadCountyCodeTable(scene); ignored for city
 * @returns {string|null} an LU class, or null when nothing could be derived
 */
export function classifyParcelLandUse(code, jurisdiction, countyTable) {
  if (code === null || code === undefined || code === '') return null
  if (jurisdiction === 'city') return classifyCity(code)
  if (jurisdiction === 'county') {
    const key = String(code).trim()
    const bucket = countyTable?.get(key)?.bucket
    if (!bucket) return null
    return COUNTY_BUCKET_TO_LU[bucket] || null
  }
  // An unrecognized jurisdiction is a wiring bug, not a data gap — the caller
  // controls this argument. Loud, because a silent null here would look like
  // an unreadable parcel and hide the real fault.
  throw new Error(`[parcel-landuse] unknown jurisdiction "${jurisdiction}" — expected 'city' or 'county'`)
}

/**
 * The pour-time announcement (`lu-policy.mjs`'s report(), same intent). Counts
 * what each jurisdiction contributed and what it could not read, so a failed
 * join is visible in the pour log rather than weeks later on the render.
 */
export function parcelLandUseReport(scene, stats) {
  const lines = [`[parcel-lu] ${scene || '(no scene)'} — assessor parcels by jurisdiction:`]
  for (const jur of ['city', 'county']) {
    const s = stats[jur]
    if (!s || !s.total) { lines.push(`   ${jur.padEnd(7)} —  (no file)`); continue }
    const pct = (100 * s.underived / s.total).toFixed(1)
    lines.push(`   ${jur.padEnd(7)} ${String(s.total).padStart(6)} parcels · ${String(s.total - s.underived).padStart(6)} classified · ${String(s.underived).padStart(6)} UNREADABLE (${pct}%)`)
  }
  if (stats.county?.total && !stats.countyTableSize) {
    lines.push('')
    lines.push(`   ⛔ County parcels are present but county-land-use-codes.csv is MISSING at`)
    lines.push(`      cartograph/data/${scene}/content/county-land-use-codes.csv — every County`)
    lines.push(`      parcel classified '${UNDERIVED}'. Fetch the assessor's code table; do not`)
    lines.push(`      guess ranges from the codes present.`)
  } else if (stats.county?.underived) {
    lines.push('')
    lines.push(`   ⚠️  ${stats.county.underived} County parcel(s) carry a code absent from the`)
    lines.push(`      ${stats.countyTableSize}-row code table, or a bucket this kit has no mapping for.`)
    lines.push(`      They classified '${UNDERIVED}'. Add the bucket to COUNTY_BUCKET_TO_LU in`)
    lines.push(`      cartograph/parcel-landuse.mjs if it is a real land use.`)
  }
  return lines.join('\n')
}
