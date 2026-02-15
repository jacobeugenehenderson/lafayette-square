#!/usr/bin/env node
/**
 * Manual corrections for NPS data merged into buildings.json.
 * Fixes misattributions from OCR context bleed and fills in missing styles.
 */
import { readFileSync, writeFileSync } from 'fs'

const BUILDINGS_PATH = new URL('../src/data/buildings.json', import.meta.url).pathname
const buildingsData = JSON.parse(readFileSync(BUILDINGS_PATH, 'utf8'))

const byId = new Map(buildingsData.buildings.map(b => [b.id, b]))

const overrides = {
  'bldg-0316': { style: 'Greek Revival / Vernacular Classical' },

  // 1911-13 Park area — Mansard/Revival commercial strip
  'bldg-0385': { style: 'Second Empire / Mansard' },
  'bldg-0386': { style: 'Second Empire / Mansard' },
  'bldg-0387': { style: 'Second Empire / Mansard' },

  // German House — fix year (auto-extracted 1892 from Kunstler Verein)
  'bldg-1575': {
    style: 'German Revival',
    year_built: 1928,
    architect: 'Jacob Heim',
    historic_name: 'Deutsches Haus (German House)',
  },

  // 1808 Chouteau — three-story warehouse
  'bldg-0024': { style: 'Revival', year_built: 1893 },

  // MacKay Place — vernacular
  'bldg-0211': { style: 'Greek Revival / Vernacular Classical' },
  'bldg-0212': { style: 'Greek Revival / Vernacular Classical' },

  // 1705 Lafayette — James Luthy house c.1865
  'bldg-1158': {
    style: 'Greek Revival / Vernacular Classical',
    year_built: 1865,
    original_owner: 'James Luthy',
  },

  // 1713 Lafayette — St. Louis Mutual Building Co. #2, 1873
  'bldg-1152': { year_built: 1873 },

  // 1512 Mississippi — Lorenz Lampel house, 1878
  'bldg-0874': {
    style: 'Italianate',
    year_built: 1878,
    original_owner: 'Lorenz Lampel',
  },

  // 1554 Mississippi — first mansarded house in Barlow's Addition, 1866
  'bldg-0852': { year_built: 1866, original_owner: 'George F. Hume' },

  // 2115 Park — George Bain house, c.1874
  'bldg-0365': {
    style: 'Italianate',
    year_built: 1874,
    original_owner: 'George Bain',
  },

  // 1819 Park — pilastered brick commercial
  'bldg-0380': { style: 'Italianate' },
  'bldg-0382': { style: 'Italianate' },

  // 2012 Lafayette — Alexander Cameron for William S. Simpson, 1878
  'bldg-0992': {
    style: 'Italianate', year_built: 1878,
    architect: 'Alexander Cameron', original_owner: 'William S. Simpson',
  },
  'bldg-0993': {
    style: 'Italianate', year_built: 1878,
    architect: 'Alexander Cameron', original_owner: 'William S. Simpson',
  },

  // 1550 Mississippi — Cameron's own house (NOT John Maurice)
  'bldg-0855': {
    style: 'Italianate',
    architect: 'Alexander Cameron', original_owner: 'Alexander Cameron',
  },

  // 2001 Lafayette (fuzzy for 2004) — August Beinke for August Guye
  'bldg-0924': {
    style: 'Italianate', year_built: 1874,
    architect: 'August Beinke', original_owner: 'August Guye',
  },

  // 2018 Lafayette — Charles Bauer house, 1878, cupola
  'bldg-0991': {
    style: 'Italianate', year_built: 1878, original_owner: 'Charles Bauer',
  },

  // 1826-34 Lafayette — Kaeser row, 1885
  'bldg-1119': { original_owner: 'John H. Kaeser' },
  'bldg-1120': { original_owner: 'John H. Kaeser' },
  'bldg-1121': { original_owner: 'John H. Kaeser' },
  'bldg-1122': { original_owner: 'John H. Kaeser' },
  'bldg-1123': { original_owner: 'John H. Kaeser' },
  'bldg-1124': { original_owner: 'John H. Kaeser' },
  'bldg-1126': { original_owner: 'John H. Kaeser' },

  // Lafayette Park Baptist Church
  'bldg-1114': { historic_name: 'Lafayette Park Baptist Church' },

  // Boundary description references only — remove bogus style
  'bldg-0204': { _remove: ['style'] },
  'bldg-0205': { _remove: ['style'] },
  'bldg-0167': { _remove: ['style'] },

  // 2115 Hickory — industrial complex, 1919
  'bldg-0171': { style: 'Craftsman / Industrial', year_built: 1919 },
}

let count = 0
for (const [id, fixes] of Object.entries(overrides)) {
  const b = byId.get(id)
  if (!b) { console.error(`  Building ${id} not found!`); continue }
  if (!b.architecture) b.architecture = {}

  // Handle removals
  if (fixes._remove) {
    for (const key of fixes._remove) delete b.architecture[key]
  }

  for (const [key, val] of Object.entries(fixes)) {
    if (key === '_remove') continue
    b.architecture[key] = val
  }
  count++
}

console.log(`Applied manual overrides to ${count} buildings`)

console.log('\n=== FINAL NPS-ENRICHED BUILDINGS ===\n')
for (const b of buildingsData.buildings) {
  if (!b.architecture?.nps_listed) continue
  const a = b.architecture
  const addr = b.address?.trim() || '?'
  const parts = [
    a.style || '—',
    a.year_built ? `c.${a.year_built}` : '',
    a.architect ? `by ${a.architect}` : '',
    a.original_owner ? `for ${a.original_owner}` : '',
    a.historic_name ? `"${a.historic_name}"` : '',
  ].filter(Boolean)
  console.log(`  ${b.id} ${addr.padEnd(28)} ${parts.join(' | ')}`)
}

writeFileSync(BUILDINGS_PATH, JSON.stringify(buildingsData, null, 2) + '\n')
console.log('\nWrote corrected buildings.json')
