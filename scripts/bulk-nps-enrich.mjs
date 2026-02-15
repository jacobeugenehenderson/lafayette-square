#!/usr/bin/env node
/**
 * Bulk-assign NPS style groups to all historic-era buildings based on year_built.
 * Also sets district, contributing status, and style group description.
 *
 * NPS Style Groups (from Item 7 of the nomination):
 *   Greek Revival / Vernacular Classical  c.1860–1885  ~30 buildings
 *   Italianate                            c.1855–1880  ~160 buildings
 *   Second Empire / Mansard               c.1866–1895  ~200 buildings (largest)
 *   Revival Styles                        c.1885–1923  ~100 buildings
 *   Craftsman                             c.1900–1932  ~40 buildings
 *   Miscellaneous / Modernistic           1930s        ~20 buildings
 *
 * Overlap handling strategy:
 *   The NPS doc notes ~170 of 200 Mansard buildings have "Italianate characteristics"
 *   and many 1880s-90s buildings are "double-coded" Mansard/Revival.
 *   We assign PRIMARY style by year and note the overlap.
 */
import { readFileSync, writeFileSync } from 'fs'

const BUILDINGS_PATH = new URL('../src/data/buildings.json', import.meta.url).pathname
const buildingsData = JSON.parse(readFileSync(BUILDINGS_PATH, 'utf8'))

// NPS style group definitions with descriptions from the nomination
const STYLE_GROUPS = {
  greek_revival: {
    name: 'Greek Revival / Vernacular Classical',
    period: 'c. 1860–1885',
    description: 'Conservative building traditions well established in St. Louis. Typically two-story, two or three-bay red brick houses with side-gabled or flat roofs, wood modillioned or brick denticulated cornices, and segmentally arched openings.',
  },
  italianate: {
    name: 'Italianate',
    period: 'c. 1855–1880',
    description: 'One of the largest stylistic groups in the District. Typically two or three stories with flat or low-hipped roofs, elaborate cornice treatments with ornamental wood brackets or corbeled brick, paired front doors, round-arched and rectangular-headed openings, and projecting bays.',
  },
  mansard: {
    name: 'Second Empire / Mansard',
    period: 'c. 1866–1895',
    description: 'The largest group in the District. Identified by the slate-clad mansard roof with straight and concave sides, sometimes with iron cresting. More than half feature primary elevations faced with smooth grey-white stone. About 170 exhibit Italianate characteristics.',
  },
  revival: {
    name: 'Revival Styles',
    period: 'c. 1885–1923',
    description: 'Largely represented by detached two-story houses articulated in Queen Anne, Romanesque, and Georgian/Colonial Revival styles. Typical features include irregular plans, hipped or compound roofs, broad arched parlor windows, dominant facade gables, turrets, oriels, decorative pressed brick banding, and classically detailed entry porches.',
  },
  craftsman: {
    name: 'Craftsman',
    period: 'c. 1900–1932',
    description: 'A little over 40 buildings, mostly two-story brick residential. Virtually all exhibit flat roofs, sometimes with a shaped parapet coped with terra cotta. Cornices expressed in patterned masonry or simple projecting horizontal bands.',
  },
  modernistic: {
    name: 'Modernistic / Art Deco',
    period: 'c. 1928–1935',
    description: 'A small group of commercial and industrial buildings expressing Art Deco and Modernistic designs, representing a departure from historicism.',
  },
}

/**
 * Assign primary NPS style group based on year_built.
 * Uses the NPS document's date ranges and approximate counts to resolve overlaps.
 *
 * Key insight: In the overlap zone (1866-1885), Mansard (200) outnumbers
 * Italianate (160) and Greek Revival (30). But pre-1866, only Greek Revival
 * and Italianate exist. Post-1885, only Revival styles.
 */
function assignStyleGroup(yearBuilt, stories) {
  if (!yearBuilt || yearBuilt > 1935) return null

  // Clear-cut ranges (no overlap)
  if (yearBuilt <= 1855) return 'greek_revival'
  if (yearBuilt >= 1924 && yearBuilt <= 1935) return 'modernistic'
  if (yearBuilt >= 1900 && yearBuilt <= 1923) return 'craftsman'
  if (yearBuilt >= 1895 && yearBuilt < 1900) return 'revival'
  if (yearBuilt >= 1885 && yearBuilt < 1895) {
    // Late Mansard OR early Revival — NPS notes "double-coded" common here
    // Revival was gaining dominance by late 1880s
    return yearBuilt < 1890 ? 'mansard' : 'revival'
  }

  // Overlap zone: 1856-1884
  if (yearBuilt < 1866) {
    // Pre-Mansard era: Greek Revival vs Italianate
    // Italianate was dominant (160 vs 30), especially in the 1860s
    return yearBuilt < 1860 ? 'italianate' : 'italianate'
  }

  // 1866-1884: Triple overlap (Greek Revival waning, Italianate, Mansard rising)
  // Mansard is the largest group (200) and was the dominant new style from 1866+
  // Many Mansard buildings have Italianate characteristics
  // Greek Revival essentially ended by late 1870s
  if (yearBuilt <= 1870) return 'italianate'  // Italianate still dominant early
  if (yearBuilt <= 1879) return 'mansard'      // Mansard takes over mid-1870s
  return 'mansard'                              // 1880-1884: peak Mansard
}

// --- Process all buildings ---
let enriched = 0
let alreadyHadStyle = 0
let noYear = 0
let postHistoric = 0

const styleCounts = {}

for (const b of buildingsData.buildings) {
  const yearBuilt = b.year_built
  const isContributing = b.historic_status === 'contributing'

  // Ensure architecture object
  if (!b.architecture) b.architecture = {}
  const arch = b.architecture

  // Set district for all contributing buildings
  if (isContributing) {
    arch.district = 'Lafayette Square Historic District'
    arch.contributing = true
  }

  // Copy year_built into architecture if not already there
  if (yearBuilt && !arch.year_built) {
    arch.year_built = yearBuilt
  }

  // Assign NPS style group
  if (!yearBuilt) { noYear++; continue }
  if (yearBuilt > 1935) { postHistoric++; continue }

  const groupKey = assignStyleGroup(yearBuilt, b.stories)
  if (!groupKey) continue

  const group = STYLE_GROUPS[groupKey]

  // Don't overwrite hand-curated or NPS-sourced styles
  if (arch.style && !arch.nps_style_inferred) {
    alreadyHadStyle++
  } else {
    arch.style = group.name
    arch.nps_style_inferred = true
  }

  // Always set the group metadata (even if style was already set)
  if (!arch.nps_style_group) {
    arch.nps_style_group = groupKey
    arch.nps_style_period = group.period
  }

  styleCounts[groupKey] = (styleCounts[groupKey] || 0) + 1
  enriched++
}

// --- Report ---
console.log('=== BULK NPS ENRICHMENT ===\n')
console.log('Buildings processed:', buildingsData.buildings.length)
console.log('Historic-era enriched:', enriched)
console.log('  Already had curated style:', alreadyHadStyle)
console.log('  No year_built:', noYear)
console.log('  Post-1935:', postHistoric)
console.log('')
console.log('Style group assignments:')
for (const [key, count] of Object.entries(styleCounts).sort((a,b) => b[1]-a[1])) {
  const nps = STYLE_GROUPS[key]
  console.log(`  ${nps.name.padEnd(42)} ${count.toString().padStart(4)}  (NPS estimate: ${key === 'greek_revival' ? '~30' : key === 'italianate' ? '~160' : key === 'mansard' ? '~200' : key === 'revival' ? '~100' : key === 'craftsman' ? '~40' : '~20'})`)
}

// Final stats
const allWithStyle = buildingsData.buildings.filter(x => x.architecture && x.architecture.style)
const allWithDistrict = buildingsData.buildings.filter(x => x.architecture && x.architecture.district)
const allWithYearInArch = buildingsData.buildings.filter(x => x.architecture && x.architecture.year_built)
console.log('\n=== FINAL TOTALS ===')
console.log('architecture.style:', allWithStyle.length)
console.log('architecture.district:', allWithDistrict.length)
console.log('architecture.year_built:', allWithYearInArch.length)
console.log('architecture.contributing:', buildingsData.buildings.filter(x => x.architecture && x.architecture.contributing).length)

writeFileSync(BUILDINGS_PATH, JSON.stringify(buildingsData, null, 2) + '\n')
console.log('\nWrote enriched buildings.json')
