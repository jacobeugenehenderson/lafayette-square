// claims-intake-is-consumed.mjs — WHAT DID THIS TOWN FETCH THAT NOTHING USES?
//
// ⭐ THE QUESTION (Jacob, 2026-09-20): "The kit must be able to either anticipate
// or manage whatever inputs it gets. I don't know how much OSM data we're getting
// and not using but I feel like we should anticipate making use of all of it
// unless it's well and truly unrelated or vestigial or something."
//
// ⛔ IT WAS NOT ANSWERABLE BY READING ANYTHING. The kit decides what an OSM
// feature becomes in FOUR separate enumerated lists across THREE files, and no
// two of them are near each other:
//   fetch.js      tagPriority          — which bucket a feature lands in
//   skeleton.js   VEHICULAR_UNNAMED    — which UNNAMED way still becomes a street
//   derive.js     the path filters     — which highway value becomes a drawn path
//   derive.js     OSM_TO_LU            — which polygon votes on land use
//   coastline.mjs isWaterFeature       — which polygon can be a coast
// A feature named by none of them is fetched, stored, and drawn nowhere — and
// nothing anywhere prints that fact. Measured on huron the day this was written:
// 591 of 1,496 highway ways (40%) reach no consumer at all.
//
// ⛔⛔ THE LISTS ARE PARSED OUT OF SOURCE, NEVER RESTATED HERE. A second copy is
// how a census starts lying: it would keep reporting the vocabulary we had on the
// day it was written while the code moved underneath it, and it would report that
// with total confidence. If a list cannot be parsed this EXITS 1 rather than
// falling back to a copy — a blind guard that prints a number is worse than no
// guard (`POLYGON-FIRST §5` RULE 2, and the same reason `claims-revert-field-
// coverage` refuses to restate the store's field lists).
//
// ⭐ WHAT THIS IS NOT: it is not a pass/fail on "use everything". Plenty of OSM is
// legitimately irrelevant, and a check that failed the build on 40% would be
// switched off by Friday. It is a CENSUS with a number that moves as classes are
// closed, per town, runnable on a town nobody has looked at. That is the town-#2
// test: no operator has to have seen the place for this to be true.
//
// ⛔ AND IT REPORTS ITS OWN LIMIT. "Unclaimed" means "claimed by none of the
// consumers modelled below" — it cannot prove that nothing anywhere reads a
// feature. The modelled set is printed every run so the claim is never wider
// than the evidence.
//
//   node checks/claims-intake-is-consumed.mjs [scene] [--json]
//
// Read-only. Exits 1 only when a vocabulary cannot be parsed, or when the
// classifier fails to account for every feature.

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const args = process.argv.slice(2)
const JSON_OUT = args.includes('--json')
const only = args.find(a => !a.startsWith('--')) || null

// ── THE VOCABULARIES, PARSED FROM SOURCE ────────────────────────────────────
// ⛔ Each `must` throws. There is no default and no partial read: a vocabulary we
// failed to parse would silently shrink the "claimed" set and inflate the finding.

const must = (val, what, where) => {
  if (!val || (Array.isArray(val) && !val.length)) {
    console.error(`⛔ could not parse ${what} from ${where} — the census would be blind.`)
    console.error(`   Fix the parse before trusting any number this prints.`)
    process.exit(1)
  }
  return val
}

const quoted = (s) => [...s.matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1])

const fetchSrc = R('cartograph/fetch.js')
const skelSrc = R('cartograph/skeleton.js')
const deriveSrc = R('cartograph/derive.js')
const coastSrc = R('cartograph/coastline.mjs')

// fetch.js — the bucket vocabulary. A tag NOT here lands in `other`.
const tagPriority = must(
  quoted((fetchSrc.match(/const tagPriority\s*=\s*\[([\s\S]*?)\]/) || [])[1] || ''),
  'tagPriority', 'cartograph/fetch.js')

// skeleton.js — an UNNAMED way becomes a street only if its highway is here.
const vehicularUnnamed = must(
  quoted((skelSrc.match(/const VEHICULAR_UNNAMED\s*=\s*new Set\(\[([\s\S]*?)\]\)/) || [])[1] || ''),
  'VEHICULAR_UNNAMED', 'cartograph/skeleton.js')

// derive.js — OSM_TO_LU keys are `category:value`; a polygon not here does not vote.
const luKeys = must(
  quoted((deriveSrc.match(/const OSM_TO_LU\s*=\s*\{([\s\S]*?)\n\s*\}/) || [])[1] || '')
    .filter(k => k.includes(':')),
  'OSM_TO_LU', 'cartograph/derive.js')

// derive.js — which highway VALUES become a drawn path ribbon. Parsed from the
// filters themselves (`f.tags?.highway === 'footway'` …) rather than from the
// `centerlinesFor` kind labels, because the kind label and the tag it matches are
// not the same string (`pedestrian` is drawn as kind `path`).
const pathBlock = must(
  (deriveSrc.match(/const footways\s*=\s*highways\.filter[\s\S]*?const pathCenterlines/) || [])[0],
  'the path filters', 'cartograph/derive.js')
const pathHighways = must(
  [...new Set([...pathBlock.matchAll(/highway\s*===\s*['"]([^'"]+)['"]/g)].map(m => m[1]))],
  'the path highway values', 'cartograph/derive.js')
// …and the two footway SUBTYPES the same block excludes.
const footwayExcluded = [...new Set(
  [...pathBlock.matchAll(/footway\s*!==\s*['"]([^'"]+)['"]/g)].map(m => m[1]))]

// derive.js — the alley filter (a service road with service=alley IS consumed).
const alleyBlock = must(
  (deriveSrc.match(/const alleys\s*=\s*highways\.filter\(([\s\S]*?)\)\n/) || [])[0],
  'the alley filter', 'cartograph/derive.js')
const alleyService = must(
  [...alleyBlock.matchAll(/service\s*===\s*['"]([^'"]+)['"]/g)].map(m => m[1]),
  'the alley service value', 'cartograph/derive.js')

// derive.js — sidewalks are consumed separately from paths.
const sidewalkConsumed = /const sidewalks\s*=\s*highways\.filter/.test(deriveSrc)

// coastline.mjs — which polygon can be water.
const waterBlock = must(
  (coastSrc.match(/export const isWaterFeature[\s\S]*?\n\}/) || [])[0],
  'isWaterFeature', 'cartograph/coastline.mjs')
const waterPairs = [...waterBlock.matchAll(/t\.(\w+)\s*===\s*['"]([^'"]+)['"]/g)].map(m => [m[1], m[2]])
const waterBare = [...waterBlock.matchAll(/!!t\.(\w+)/g)].map(m => m[1])
must(waterPairs.length + waterBare.length, 'the water vocabulary', 'cartograph/coastline.mjs')

// derive.js — barriers are consumed as lines.
const barrierConsumed = /barrierLines\.push/.test(deriveSrc)

// classify.js — the FACE classifier, a consumer entirely separate from OSM_TO_LU.
// ⛔⛔ THIS WAS MISSING ON THE FIRST RUN AND THE CENSUS OVER-REPORTED BECAUSE OF IT.
// `leisure=park` was printed as unclaimed and reported to Jacob as "Lafayette Park
// does not vote on its own land use" — false: classify.js types that face `park`,
// derive.js:1176 uses the OSM trace as the park-polygon fallback, and
// bake-content.js files it under `parks`. The check's own output said "unclaimed
// means claimed by none of THESE" and the limit was real; naming a limit does not
// excuse reading past it. ⭐ A census is only as honest as its consumer list, so a
// consumer added to the kit must be added here — that is the standing cost of this
// instrument and it is cheaper than the wrong number.
const classifySrc = R('cartograph/classify.js')
const classifyBlock = must(
  (classifySrc.match(/let type = null[\s\S]*?\n\s*if \(type\)/) || [])[0],
  'the classify.js type block', 'cartograph/classify.js')
const classifyPairs = [...classifyBlock.matchAll(/tags\.(\w+)\s*===\s*['"]([^'"]+)['"]/g)].map(m => [m[1], m[2]])
// …plus the `[…].includes(tags.X)` form.
const classifyIncludes = [...classifyBlock.matchAll(/\[([^\]]*)\]\.includes\(tags\.(\w+)\)/g)]
  .flatMap(m => quoted(m[1]).map(v => [m[2], v]))
// …plus bare-truthy tests (`tags.waterway`).
const classifyBare = [...classifyBlock.matchAll(/tags\.(\w+)\s*\)/g)].map(m => m[1])
must(classifyPairs.length + classifyIncludes.length, 'the classify.js vocabulary', 'cartograph/classify.js')

// bake-content.js — the CONTENT categoriser, a third independent reader.
const contentSrc = R('cartograph/bake-content.js')
const contentPairs = [...contentSrc.matchAll(/(?:const\s+)?(\w+)\s*===\s*['"]([^'"]+)['"]\s*\)\s*return\s*\[/g)].map(m => [m[1], m[2]])

// ── THE CONSUMERS, MODELLED ─────────────────────────────────────────────────
// ⛔ This is the LIMIT of the claim and it is printed every run. "Unclaimed" means
// none of THESE claims it — never "nothing in the repo reads it".
const MODELLED = [
  'STREET  — named highway, or unnamed in VEHICULAR_UNNAMED (skeleton.js)',
  'PATH    — highway in the derive.js path filters (footway subtypes excluded)',
  'ALLEY   — highway=service with service=alley (derive.js)',
  'SIDEWALK— footway=sidewalk (derive.js)',
  'LANDUSE — category:value in OSM_TO_LU (derive.js)',
  'WATER   — matches isWaterFeature (coastline.mjs)',
  'BARRIER — bucketed `barrier` (derive.js barrierLines)',
  'FACE    — typed by the classify.js face classifier (park/parking/water/block)',
  'CONTENT — categorised by bake-content.js',
]

const claimsOf = (cat, tags) => {
  const c = []
  const hw = tags.highway
  if (hw) {
    if (tags.name || vehicularUnnamed.includes(hw)) c.push('STREET')
    if (pathHighways.includes(hw) && !(hw === 'footway' && footwayExcluded.includes(tags.footway))) c.push('PATH')
    if (hw === 'service' && alleyService.includes(tags.service)) c.push('ALLEY')
  }
  if (sidewalkConsumed && tags.footway === 'sidewalk') c.push('SIDEWALK')
  for (const k of luKeys) {
    const [kc, kv] = k.split(':')
    if (tags[kc] === kv) { c.push('LANDUSE'); break }
  }
  if (waterPairs.some(([k, v]) => tags[k] === v) || waterBare.some(k => tags[k])) c.push('WATER')
  if (cat === 'barrier' && barrierConsumed) c.push('BARRIER')
  if (classifyPairs.some(([k, v]) => tags[k] === v) ||
      classifyIncludes.some(([k, v]) => tags[k] === v) ||
      classifyBare.some(k => tags[k])) c.push('FACE')
  if (contentPairs.some(([k, v]) => tags[k] === v)) c.push('CONTENT')
  return c
}

// ── THE CENSUS ──────────────────────────────────────────────────────────────

const dataDir = path.join(ROOT, 'cartograph/data')
const scenes = fs.readdirSync(dataDir)
  .filter(s => fs.existsSync(path.join(dataDir, s, 'raw/osm.json')))
  .filter(s => !only || s === only)

if (!scenes.length) {
  console.error(`⛔ no scene with raw/osm.json${only ? ` matching "${only}"` : ''}.`)
  process.exit(1)
}

const ringArea = (coords) => {
  if (!coords || coords.length < 3) return 0
  let a = 0
  for (let i = 0; i < coords.length; i++) {
    const p = coords[i], q = coords[(i + 1) % coords.length]
    a += (p.x ?? 0) * (q.z ?? 0) - (q.x ?? 0) * (p.z ?? 0)
  }
  return Math.abs(a / 2)
}

const report = {}
let hadAccountingError = false

for (const scene of scenes) {
  const osm = JSON.parse(R(`cartograph/data/${scene}/raw/osm.json`))
  const byConsumer = {}, unclaimed = {}
  let total = 0, claimedN = 0, unclaimedN = 0, unclaimedArea = 0

  for (const [cat, list] of Object.entries(osm.ground || {})) {
    for (const f of list) {
      total++
      const tags = f.tags || {}
      const c = claimsOf(cat, tags)
      if (c.length) {
        claimedN++
        for (const k of c) byConsumer[k] = (byConsumer[k] || 0) + 1
      } else {
        unclaimedN++
        // Name the feature by the tag that put it in its BUCKET, so the row is
        // the thing you would go and add to a vocabulary.
        // ⛔ A feature with NO tagPriority tag lands in `other`, and then the tag
        // we name it by is whichever came first — `floating=yes` on a pier, say.
        // That row is the INSTRUMENT, not a class, so the bucket is printed with
        // it: `other/…` means "we never bucketed this", which is a different
        // finding from "we bucketed it and no consumer wants it".
        const bucketed = tagPriority.find(t => tags[t])
        const keyTag = bucketed || Object.keys(tags)[0] || '(untagged)'
        const key = `${bucketed ? cat : 'other'}/${keyTag}=${tags[keyTag] ?? '?'}`
        const area = f.isClosed ? ringArea(f.coords) : 0
        unclaimed[key] = unclaimed[key] || { n: 0, area: 0 }
        unclaimed[key].n++
        unclaimed[key].area += area
        unclaimedArea += area
      }
    }
  }

  if (claimedN + unclaimedN !== total) {
    console.error(`⛔ ${scene}: classifier accounted for ${claimedN + unclaimedN} of ${total} features — the census cannot be trusted.`)
    hadAccountingError = true
  }

  report[scene] = { total, claimedN, unclaimedN, unclaimedArea, byConsumer, unclaimed }
}

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(hadAccountingError ? 1 : 0)
}

console.log(`\nINTAKE CONSUMED — what each town fetched, and what nothing reads.`)
console.log(`Vocabularies parsed live from source (never restated here):`)
console.log(`   tagPriority ${tagPriority.length} · VEHICULAR_UNNAMED ${vehicularUnnamed.length} · OSM_TO_LU ${luKeys.length}` +
            ` · path highways ${pathHighways.length} · water rules ${waterPairs.length + waterBare.length}` +
            ` · classify.js ${classifyPairs.length + classifyIncludes.length} · bake-content ${contentPairs.length}`)
console.log(`Consumers modelled — ⛔ "unclaimed" means none of THESE, not "nothing reads it":`)
for (const m of MODELLED) console.log(`   ${m}`)

for (const [scene, r] of Object.entries(report)) {
  const pct = r.total ? (100 * r.unclaimedN / r.total).toFixed(0) : '0'
  console.log(`\n── ${scene} ─────────────────────────────────────`)
  console.log(`   fetched ${r.total} ground feature(s)`)
  const cons = Object.entries(r.byConsumer).sort((a, b) => b[1] - a[1])
  console.log(`   claimed ${r.claimedN}: ${cons.map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}`)
  console.log(`   ⛔ UNCLAIMED ${r.unclaimedN} (${pct}%)${r.unclaimedArea ? `, ${Math.round(r.unclaimedArea).toLocaleString()} m² of closed area` : ''}`)
  const rows = Object.entries(r.unclaimed).sort((a, b) => b[1].n - a[1].n).slice(0, 12)
  for (const [k, v] of rows) {
    console.log(`        ${String(v.n).padStart(5)} × ${k.padEnd(28)}${v.area ? Math.round(v.area).toLocaleString() + ' m²' : ''}`)
  }
  const more = Object.keys(r.unclaimed).length - rows.length
  if (more > 0) console.log(`        … and ${more} more class(es)`)
}

console.log(`\n▶ To close a class: a land use goes in OSM_TO_LU (derive.js), a way that`)
console.log(`  should draw goes in the path filters or VEHICULAR_UNNAMED, water goes in`)
console.log(`  isWaterFeature. Re-run this; the number moves.`)
console.log(`⛔ A class left open is a decision, not an oversight — but it has to be a`)
console.log(`  decision someone made, which is what this prints.\n`)

process.exit(hadAccountingError ? 1 : 0)
