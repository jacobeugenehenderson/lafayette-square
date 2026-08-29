/**
 * tree-lu-exclusion-census.mjs — WHAT is the tree filter actually excluding?
 *
 * Jacob, 2026-07-23: *"I would rather have more lamps and trees, since they're
 * vibes"* — so before relaxing anything, measure which gate drops what. The
 * question that prompted this: LS's census is ~5211 across 3 wells but only
 * 5001 bake. Where do the rest go, and how much of it is the LU allow-model?
 *
 * Reads the SAME classifier the bake uses (`cartograph/forbidden-surface.mjs`
 * `makeZoneTester`) against the SAME frozen shape, so this reports the real
 * gate, not a re-derivation of it. Read-only — writes nothing, bakes nothing.
 *
 * Usage:  node scratch/tree-lu-exclusion-census.mjs [scene]
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeZoneTester } from '../cartograph/forbidden-surface.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scene = process.argv[2] || 'lafayette-square'

const WELLS = [
  ['park_trees.json', 'park'],
  ['park_census.json', 'park-census'],
  ['osm_trees.json', 'osm'],
]

const cleanDir = path.join(ROOT, 'cartograph', 'data', scene, 'clean')
const shapePath = path.join(ROOT, 'public', 'baked', scene, 'shape.json')
const mapPath = path.join(cleanDir, 'map.json')

if (!existsSync(shapePath)) {
  console.error(`no frozen shape at ${shapePath} — the honest gate needs it; refusing to guess.`)
  process.exit(1)
}

// ── the census, unioned across wells (the census IS the union — never one well)
const trees = []
for (const [file, well] of WELLS) {
  const p = path.join(cleanDir, file)
  if (!existsSync(p)) continue
  const layer = JSON.parse(readFileSync(p, 'utf8'))
  for (const t of (layer.trees || [])) trees.push({ ...t, __well: well })
  console.log(`  well ${well.padEnd(12)} ${String((layer.trees || []).length).padStart(5)}  (${file})`)
}
console.log(`  ${'UNION'.padEnd(17)} ${String(trees.length).padStart(5)}\n`)

// ⛔⛔ designPath IS NOT OPTIONAL — bake-trees.js:757 passes it so the rebuilt Section
// surfaces match what the OPERATOR AUTHORED (blockCustoms + curbWidth). Without it this
// harness ran the gate against UN-AUTHORED strips and reported a different verdict than
// the bake takes: measured 2026-08-28, kept 4572 vs 4547, curb 39 vs 109, sidewalk 546
// vs 511. That is Layer 0 question 3 committed by an instrument — the same shape as
// litmus-curb-parallel's `blockCustoms: null`, and it fails WORST on the most-authored
// town. The numbers in BAKE.md §4.6 were taken before this line existed.
const designPath = path.join(ROOT, 'public', 'looks', scene, 'design.json')
if (!existsSync(designPath)) console.warn(`  ⚠️ no design.json for '${scene}' — measuring the un-authored surfaces, which is NOT what the bake gates on`)
const tester = makeZoneTester({ shapePath, mapPath, designPath: existsSync(designPath) ? designPath : undefined, scene, quiet: false })
const zoneOf = tester.zoneOf || tester.classify?.zoneOf

// ── classify every tree by the zone it stands on
const byZone = {}
const byZoneWell = {}
for (const t of trees) {
  const x = t.x ?? t.pos?.[0], z = t.z ?? t.pos?.[2] ?? t.pos?.[1]
  if (!Number.isFinite(x) || !Number.isFinite(z)) continue
  const zone = zoneOf(x, z)
  byZone[zone] = (byZone[zone] || 0) + 1
  ;(byZoneWell[zone] ||= {})[t.__well] = (byZoneWell[zone][t.__well] || 0) + 1
}

const ALLOWED = new Set(['treelawn', 'lu'])
const rows = Object.entries(byZone).sort((a, b) => b[1] - a[1])
const tot = rows.reduce((s, [, n]) => s + n, 0)

console.log('\n── every tree by the surface it stands on ──')
for (const [zone, n] of rows) {
  const verdict = ALLOWED.has(zone) ? 'KEPT' : 'DROPPED'
  const pct = ((n / tot) * 100).toFixed(1).padStart(5)
  console.log(`  ${verdict.padEnd(8)} ${zone.padEnd(22)} ${String(n).padStart(5)}  ${pct}%   ${JSON.stringify(byZoneWell[zone])}`)
}

const kept = rows.filter(([z]) => ALLOWED.has(z)).reduce((s, [, n]) => s + n, 0)
const luDrops = rows.filter(([z]) => z.startsWith('lu:'))
const luTot = luDrops.reduce((s, [, n]) => s + n, 0)

console.log(`\n  zone verdict: kept ${kept} / ${tot}   dropped ${tot - kept}`)
console.log(`  ⚠️ "dropped" here is the RAW ZONE VERDICT, not the bake's final answer.`)
console.log(`     bake-trees then (a) dedups coincident records across wells and`)
console.log(`     (b) NUDGES trees from SURVEYED wells onto legal ground rather than`)
console.log(`     dropping them (our strips are guesses; surveyed reality wins —`)
console.log(`     only INVENTED wells get dropped). So the baked count is higher`)
console.log(`     than "kept" above. Use this to see WHICH GATE bites, not as a yield.`)
console.log(`\n── the LU allow-model specifically (the "hard" land-use interiors) ──`)
if (!luTot) console.log('  nothing dropped for land use.')
for (const [zone, n] of luDrops) console.log(`  ${zone.padEnd(24)} ${String(n).padStart(5)}   ← flip this class to "soft" in lu-policy to keep them`)
console.log(`  LU-attributable drops: ${luTot} (${((luTot / tot) * 100).toFixed(1)}% of the census)`)
console.log(`\n  Per-scene override: cartograph/data/${scene}/lu-policy.json  { "commercial": "soft" }`)
console.log('  (kit defaults + rationale: cartograph/lu-policy.mjs)')
