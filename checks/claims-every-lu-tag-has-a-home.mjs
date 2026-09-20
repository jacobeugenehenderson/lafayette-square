// claims-every-lu-tag-has-a-home.mjs — CAN A TOWN BRING A WORD WE DO NOT KNOW?
//
// ⭐⭐ THE INVARIANT, and it is asserted on the VOCABULARY rather than on its effects:
//
//     Every LU-bearing OSM tag present in any town's raw/osm.json either MAPS to an
//     LU class, or is DECLARED not-a-land-use BY NAME with a reason. Anything else
//     fails, naming the tag and the town.
//
// ⛔ THIS DEFECT HAS NO SYMPTOM, which is why the assertion has to be direct. A tag
// with no mapping never becomes an LU polygon AT ALL — the face falls to the parcel
// vote, else to the bare 'residential' default — so the erased class arrives wearing
// a VALID class's name and every downstream surface looks fine. huron's cornfields
// rendered as somebody's lawn. A check that could only see symptoms would pass.
//
// ⛔⛔ AND IT IS TWO VOCABULARIES, NOT ONE. A tag can be missing from either and the
// symptom is identical — it is on disk and reaches nothing:
//   ① tag → LU class   (derive.js  OSM_TO_LU / OSM_LU_DECLARED)
//   ② tag → BUCKET     (fetch.js   HEAVY_WAYS/HEAVY_NODES ⊆ tagPriority)
// `man_made` was fetched and never bucketed for months — 443 features into
// `ground.other[]`, which has zero consumers. `railway` was the same bug before it.
// A check covering only ① passes a town whose piers are in other[].
//
// ⭐ AND THE THIRD: a class the producer can EMIT but a consumer cannot PAINT drops
// silently from the slab (that is how the divided median vanished). So every class
// OSM_TO_LU can emit is chased through every home the vocabulary has.
//
// ⛔ EVERY TABLE IS PARSED OUT OF THE SOURCE, never restated here. A second copy of
// the vocabulary is how the first one drifted (`CLAUDE.md`: a check READS the source,
// so it cannot go stale — `claims-revert-field-coverage.mjs` is the pattern).
//
//   node checks/claims-every-lu-tag-has-a-home.mjs            # every town with raw/osm.json
//   node checks/claims-every-lu-tag-has-a-home.mjs huron      # just that one
// Read-only. Exits 1 on an undeclared tag, an unbucketed fetch tag, or a homeless class.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

/** Parse an object literal's `'key': 'value'` pairs. Throws rather than returning {}. */
function objectLiteral(src, name, where) {
  const m = src.match(new RegExp(`(?:const|export const) ${name} = \\{([\\s\\S]*?)\\n  \\}`))
  if (!m) throw new Error(`⛔ could not parse ${name} from ${where} — the guard is blind; fix the parse before trusting a PASS`)
  const out = {}
  for (const kv of m[1].matchAll(/'((?:[^'\\]|\\.)+)'\s*:\s*'((?:[^'\\]|\\.)*)'/g)) out[kv[1]] = kv[2]
  if (!Object.keys(out).length) throw new Error(`⛔ ${name} parsed EMPTY from ${where} — blind guard`)
  return out
}
/** Parse an array literal's quoted strings. */
function arrayLiteral(src, name, where) {
  const m = src.match(new RegExp(`(?:const|export const) ${name} = \\[([\\s\\S]*?)\\]`))
  if (!m) throw new Error(`⛔ could not parse ${name} from ${where} — blind guard`)
  const out = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
  if (!out.length) throw new Error(`⛔ ${name} parsed EMPTY from ${where} — blind guard`)
  return out
}

const DERIVE = 'cartograph/derive.js'
const FETCH = 'cartograph/fetch.js'
const BAKE = 'cartograph/bake-ground.js'
const deriveSrc = read(DERIVE), fetchSrc = read(FETCH), bakeSrc = read(BAKE)

const OSM_TO_LU = objectLiteral(deriveSrc, 'OSM_TO_LU', DERIVE)
const DECLARED = objectLiteral(deriveSrc, 'OSM_LU_DECLARED', DERIVE)
const heavyWays = arrayLiteral(fetchSrc, 'HEAVY_WAYS', FETCH)
const heavyNodes = arrayLiteral(fetchSrc, 'HEAVY_NODES', FETCH)
const tagPriority = arrayLiteral(fetchSrc, 'tagPriority', FETCH)
const treelawn = arrayLiteral(bakeSrc, 'TREELAWN_LU_VARIANTS', BAKE)
// The Designer's Land Use tab — a TENTH home, found only because a class landed
// in the slab with no operator row. Parsed, never restated.
const SURFACES = 'src/cartograph/CartographSurfaces.jsx'
const surfacesSrc = read(SURFACES)
const luRows = [...surfacesSrc.matchAll(/\{\s*id:\s*'([^']+)',[^}]*kind:\s*'lu'\s*\}/g)].map(m => m[1])
if (!luRows.length) throw new Error(`⛔ parsed no kind:'lu' rows from ${SURFACES} — blind guard`)
const paintFaces = [...bakeSrc.matchAll(/\['face',\s*'([^']+)'\]/g)].map(m => m[1])
const { LU_POLICY, groundKindOf } = await import('../cartograph/lu-policy.mjs')
const { DEFAULT_LU_COLORS } = await import('../src/cartograph/m3Colors.js')
const { LAND_USE_COLORS } = await import('../src/lib/ribbonsGeometry.js')

console.log(`parsed from source:`)
console.log(`  OSM_TO_LU        ${String(Object.keys(OSM_TO_LU).length).padStart(3)} tag→class mappings   (${DERIVE})`)
console.log(`  OSM_LU_DECLARED  ${String(Object.keys(DECLARED).length).padStart(3)} declared not-a-LU     (${DERIVE})`)
console.log(`  tagPriority      ${String(tagPriority.length).padStart(3)} buckets               (${FETCH})`)

const fail = []

// ── ② THE FETCH→BUCKET VOCABULARY ────────────────────────────────────────────
// A tag we ASK OSM for and never bucket lands in `ground.other[]`, which nothing
// reads. Fetched-and-unreachable is indistinguishable from never-fetched.
const unbucketed = [...new Set([...heavyWays, ...heavyNodes])].filter(t => !tagPriority.includes(t)).sort()
if (unbucketed.length) {
  fail.push(`⛔ FETCHED BUT NEVER BUCKETED: ${unbucketed.join(', ')}`)
  fail.push(`   ${FETCH} asks OSM for these and \`tagPriority\` has no entry, so every such feature`)
  fail.push(`   falls to ground.other[] — which has no consumer anywhere in the kit. Append to tagPriority.`)
} else {
  console.log(`\n✅ ② every fetched tag is bucketed (HEAVY_WAYS ∪ HEAVY_NODES ⊆ tagPriority)`)
}

// ── ③ EVERY CLASS THE PRODUCER CAN EMIT HAS EVERY HOME ───────────────────────
// ⛔ The count is REPORTED, not asserted: how many homes the vocabulary has is a
// finding for `cartograph/_archive/BRIEF-lu-vocabulary-2026-09-20.md §5`, not an invariant to freeze in place.
const HOMES = [
  ['lu-policy.mjs  plantability', (lu) => lu in LU_POLICY],
  ['m3Colors.js    colour',       (lu) => lu in DEFAULT_LU_COLORS],
  ['ribbonsGeometry colour',      (lu) => lu in LAND_USE_COLORS],
  ['bake-ground    PAINT_ORDER',  (lu) => paintFaces.includes(lu)],
  ['bake-ground    treelawn',     (lu) => treelawn.includes(lu)],
  ['Designer       LU row',       (lu) => luRows.includes(lu)],
]
const emittable = [...new Set(Object.values(OSM_TO_LU))].sort()
console.log(`\n${emittable.length} classes OSM_TO_LU can emit, across ${HOMES.length} vocabulary homes:`)
for (const lu of emittable) {
  const missing = HOMES.filter(([, has]) => !has(lu)).map(([name]) => name)
  const kind = groundKindOf(LU_POLICY[lu]) || '—'
  console.log(`  ${missing.length ? '⛔' : '✅'} ${lu.padEnd(20)} ${String(kind).padEnd(8)} ${missing.join(' · ')}`)
  if (missing.length) fail.push(`⛔ CLASS "${lu}" IS HOMELESS IN: ${missing.join(', ')} — a class missing from PAINT_ORDER drops SILENTLY from the slab.`)
}

// ── ① THE TAG→CLASS VOCABULARY, against every town on disk ───────────────────
const LU_CATS = ['landuse', 'leisure', 'natural', 'amenity', 'man_made']
const towns = scenes('cartograph/data/<scene>/raw/osm.json')
const undeclared = new Map()   // 'cat:sub' -> Map(scene -> count)
let swept = 0

for (const scene of towns) {
  const p = join(ROOT, `cartograph/data/${scene}/raw/osm.json`)
  if (!existsSync(p)) continue
  const ground = JSON.parse(readFileSync(p, 'utf8')).ground || {}
  // ⛔ EVERY BUCKET IS SWEPT, INCLUDING `other`. A tag sitting in other[] because
  // nobody bucketed it is exactly the case ② exists to catch, and reading only the
  // named buckets would hide it from ① as well — the two halves covering for each
  // other's blind spot is how `man_made` survived.
  for (const [bucket, feats] of Object.entries(ground)) {
    if (!Array.isArray(feats)) continue
    for (const f of feats) {
      const tags = f.tags || {}
      const cat = LU_CATS.find(c => tags[c])
      if (!cat) continue
      const key = `${cat}:${tags[cat]}`
      swept++
      if (OSM_TO_LU[key] || DECLARED[key]) continue
      if (!undeclared.has(key)) undeclared.set(key, new Map())
      const per = undeclared.get(key)
      per.set(scene, (per.get(scene) || 0) + 1)
      void bucket
    }
  }
}

console.log(`\n① swept ${swept.toLocaleString()} LU-bearing features across ${towns.length} town(s): ${towns.join(', ')}`)
if (undeclared.size) {
  const rows = [...undeclared.entries()]
    .map(([k, per]) => ({ k, n: [...per.values()].reduce((a, b) => a + b, 0), per }))
    .sort((a, b) => b.n - a.n)
  fail.push(`⛔ ${undeclared.size} TAG(S) WITH NO HOME — neither mapped nor declared:`)
  for (const r of rows) {
    fail.push(`     ×${String(r.n).padStart(4)}  ${r.k.padEnd(34)} ${[...r.per].map(([s, n]) => `${s}:${n}`).join(' ')}`)
  }
  fail.push(`   ▶ Map it in OSM_TO_LU (${DERIVE}) if it names a land use, or declare it by name`)
  fail.push(`     in OSM_LU_DECLARED with the reason. ⛔ "Nobody has looked" and "we looked and`)
  fail.push(`     decided no" are the same silence until one of them is written down.`)
} else {
  console.log(`✅ ① every LU-bearing tag on disk is mapped or declared by name`)
}

if (fail.length) {
  console.error(`\n${fail.join('\n')}`)
  console.error(`\n⛔ FAIL`)
  process.exit(1)
}
console.log(`\n✅ PASS — the LU vocabulary has no silent holes in ${towns.length} town(s).`)
