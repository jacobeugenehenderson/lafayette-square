// Revetment, 2026-09-24 — WHY DOESN'T PROVINCETOWN'S BEACH VOTE? It is not the vocabulary.
//
// The pour warns that `natural=sand` (9.2 km²), `natural=beach` (0.76 km²) and
// `natural=bay` (60.4 km²) are "unreadable classes" that cast no land-use vote, and the
// obvious reading is a vocabulary gap. ⛔ IT IS NOT: derive.js:3296 already maps
// `'natural:beach': 'beach', 'natural:sand': 'beach'`.
//
// ⭐ THE KEY IN THE WARNING CARRIES A PREFIX — `compound:natural=sand`, not
// `natural=sand` — and that prefix is the whole answer. `unreadableFace()` runs BEFORE the
// tag is looked up, so the vocabulary is never consulted at all:
//   · `compound` — the feature has HOLES. `f.coords` alone is the OUTER ring, so letting it
//     vote would FILL the hole.
//   · `clipped`  — the ring closes outside the fetch envelope; its interior is whatever the
//     shoelace happens to say.
//   · `open`     — not a closed way at all (`natural=coastline`, correctly).
// Each refusal is CORRECT on its own terms. What it means is that the LU vote reads only
// `f.coords` and therefore cannot accept a feature with holes — so on a richly mapped town
// the shape gate silently removes real land uses, and it removes the BIGGEST ones, because
// a large feature is the one likely to carry an island or a courtyard.
//
// ⭐⭐ THE KIT SHAPE OF IT: Lafayette Square has NO relations at all — its fetch predates
// them — so this is invisible on town #1 and severe on a richly mapped town #2. It is the
// same gradient `osm-vocabulary.mjs` was written about, one layer further down.
//
// ⛔ THIS PROBE DECIDES NOTHING. Making the LU vote hole-aware is a change to how area is
// counted and to what a face contains; that is a design question. This only says which
// reason each refusal was, so nobody argues about vocabulary again.
//
//   node scratch/lu-vote-shape-gate.mjs [scene]
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unreadableFace } from '../cartograph/osm-vocabulary.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const scene = process.argv[2] || 'provincetown'
const osm = JSON.parse(readFileSync(join(ROOT, 'cartograph', 'data', scene, 'raw', 'osm.json'), 'utf8'))

const ringArea = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) {
  const p = r[i], q = r[(i+1)%n]; a += (p.x ?? p[0]) * (q.z ?? q[1]) - (q.x ?? q[0]) * (p.z ?? p[1]) } return Math.abs(a/2) }

const byReason = new Map(), byTag = new Map()
let readable = 0, readableArea = 0
for (const [cat, key] of [['landuse','landuse'],['leisure','leisure'],['natural','natural'],['amenity','amenity']]) {
  for (const f of (osm.ground?.[cat] || [])) {
    const subtype = f.tags?.[key]
    if (!subtype) continue
    const why = unreadableFace(f)
    const area = Array.isArray(f.coords) && f.coords.length >= 3 ? ringArea(f.coords) : 0
    if (!why) { readable++; readableArea += area; continue }
    const tag = `${cat}=${subtype}`
    const r = byReason.get(why) || { n: 0, area: 0 }; r.n++; r.area += area; byReason.set(why, r)
    const t = byTag.get(`${why}:${tag}`) || { n: 0, area: 0, why, tag, holes: 0 }
    t.n++; t.area += area; t.holes += (f.holes?.length || 0); byTag.set(`${why}:${tag}`, t)
  }
}

console.log(`${scene} — land-use vote, SHAPE gate (unreadableFace) applied BEFORE the tag lookup\n`)
console.log(`  readable and voting: ${readable} feature(s), ${Math.round(readableArea).toLocaleString()} m²\n`)
for (const [why, r] of [...byReason].sort((a,b) => b[1].area - a[1].area)) {
  const meaning = { compound: 'HAS HOLES — f.coords is only the outer ring, so voting would fill the hole',
                    clipped: 'closes outside the fetch envelope — interior is undefined',
                    open: 'not a closed way at all',
                    degenerate: 'fewer than 3 coordinates' }[why] || '?'
  console.log(`  ⛔ ${why.padEnd(11)} ${String(r.n).padStart(3)} feature(s)  ${Math.round(r.area).toLocaleString().padStart(14)} m²  — ${meaning}`)
}
console.log(`\n  and whether the TAG would have resolved, had it been asked:`)
const LU = readFileSync(join(ROOT, 'cartograph', 'derive.js'), 'utf8')
for (const t of [...byTag.values()].sort((a,b) => b.area - a.area).slice(0, 12)) {
  const tagKey = t.tag.replace('=', ':')
  const mapped = new RegExp(`'${tagKey}'\\s*:`).test(LU)
  console.log(`    ${mapped ? '⭐ MAPPED  ' : '   unmapped'} ${t.why.padEnd(9)} ${t.tag.padEnd(28)} ×${String(t.n).padStart(3)}  ${Math.round(t.area).toLocaleString().padStart(13)} m²${t.holes ? `  (${t.holes} inner ring(s))` : ''}`)
}
console.log(`\n⭐ A "MAPPED" row is a land use the kit KNOWS and refuses on SHAPE alone. That is the`)
console.log(`   finding: those are not vocabulary gaps, and adding tags would change nothing.`)
