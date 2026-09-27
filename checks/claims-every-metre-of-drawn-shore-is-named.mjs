// claims-every-metre-of-drawn-shore-is-named.mjs — IS ANY DRAWN SHORE BARE FOR NO REASON?
//
// ⭐⭐ THE INVARIANT: every metre of shoreline in the drawing is either ARMOURED or bare for a
// NAMED predicate — soft shore, below one course of stone, no terrain beneath it, an arc too
// short to carry a station. ⛔ Never "not at the water": since 2026-09-26 the drawn water IS
// the shore (Jacob: "The drawn water's edge IS the mapped shoreline, and the revetment sits on
// it"), so a metre of shoreline ink beside the drawn water cannot be declined as dry.
//
// ⛔ WHY (2026-09-26). Under `r-coast-trust-the-lidar` the bake asked the heightfield whether
// each arc reached the water, and Provincetown declined 42 km of its drawn shore as "not at
// the water per the lidar" — the drawing then showed water meeting land with nothing between,
// and every revetment check stayed green because none of them asked about the declined metres.
//
// WHAT FAILS:
//   · an artifact not ruled against the drawn water (`shoreFrom !== 'drawn-water'`) — stale
//   · metres missing from the accounting: arcs + refused ≠ the slab's shoreline in the disc
//   · a refused arc whose `kind` is not a named predicate in `shore-armour.mjs`
//   · a refused arc of kind `ink-without-water` — the slab's ink and its drawing disagree
//   · an unarmoured station whose `why` is not a named predicate in `shore-armour.mjs`
// ⭐ The named predicates are READ from shore-armour.mjs (every `why:`/`kind:` literal), never
//   restated here, so a new predicate is covered the day it lands.
//
//   node checks/claims-every-metre-of-drawn-shore-is-named.mjs            # the shipped artifacts
//   node checks/claims-every-metre-of-drawn-shore-is-named.mjs --code     # what the code would bake (in memory, nothing written)
//   node checks/claims-every-metre-of-drawn-shore-is-named.mjs --self-test
// Read-only. Exits 1 on any unnamed or missing metre.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { waterRuns } from '../cartograph/shoreRuns.mjs'
import { clipTraceToDisc, bakeRevetment } from '../cartograph/bake-revetment.js'

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const len = (t) => t.reduce((a, p, i) => i ? a + Math.hypot(p[0] - t[i-1][0], p[1] - t[i-1][1]) : 0, 0)

// ── the named predicates, read from the source ─────────────────────────────────
const armourSrc = read('cartograph/shore-armour.mjs')
// every slug literal in a `why:` / `kind:` expression, ternaries included
const NAMED = new Set([...armourSrc.matchAll(/\b(?:why|kind):\s*([^,}\n]*)/g)]
  .flatMap(m => [...m[1].matchAll(/'([a-z][a-z-]*)'/g)].map(x => x[1])))
const FAILING_KIND = 'ink-without-water'
if (!NAMED.has(FAILING_KIND) || !NAMED.has('soft-shore')) {
  console.error(`⛔ could not read the named predicates from shore-armour.mjs (found: ${[...NAMED].join(', ') || 'none'})`)
  process.exit(2)
}

/** @returns {string[]} failures, empty when every metre is accounted and named */
export function audit(doc, drawnShoreM) {
  const f = []
  if (doc.shoreFrom !== 'drawn-water') f.push(`ruled against ${doc.shoreFrom ? `"${doc.shoreFrom}"` : 'the lidar (no shoreFrom stamp)'} — not the drawn water. Re-bake: node cartograph/bake-revetment.js --scene=${doc.scene}`)
  // A breakwater's own walk (`structure`) is not drawn shore: it is audited by claims-every-mapped-stone-structure-is-stone.
  const shoreArcs = (doc.arcs || []).filter(a => !a.structure)
  const accounted = shoreArcs.reduce((a, x) => a + x.lengthM, 0) + (doc.refused || []).reduce((a, x) => a + x.lengthM, 0)
  // Each length is stamped to 0.1 m, so the sum may differ by 0.05 m per entry and no more.
  const tol = 0.05 * (shoreArcs.length + (doc.refused || []).length + 1)
  if (Math.abs(accounted - drawnShoreM) > tol) {
    f.push(`${(drawnShoreM - accounted).toFixed(1)} m of shoreline in the drawing is in NO bucket (arcs + refused = ${accounted.toFixed(1)} m of ${drawnShoreM.toFixed(1)} m)`)
  }
  for (const r of (doc.refused || [])) {
    if (r.kind === FAILING_KIND) f.push(`arc #${r.index} (${r.lengthM} m): ${r.why}`)
    else if (!NAMED.has(r.kind)) f.push(`arc #${r.index} (${r.lengthM} m) refused for NO NAMED PREDICATE: kind=${r.kind ?? '(none)'} — "${r.why}"`)
  }
  let unnamed = 0, first = null
  for (const a of (doc.arcs || [])) for (const s of a.stations) {
    if (s.armour) continue
    if (!NAMED.has(s.why)) { unnamed++; first ??= `arc #${a.index} @ ${s.x},${s.z}: why=${s.why ?? '(none)'}` }
  }
  if (unnamed) f.push(`${unnamed} bare station(s) name no predicate — first ${first}`)
  return f
}

if (process.argv.includes('--self-test')) {
  const good = () => ({ scene: 't', shoreFrom: 'drawn-water',
    arcs: [{ index: 0, lengthM: 100, stations: [{ x: 0, z: 0, armour: true }, { x: 50, z: 0, armour: false, why: 'soft-shore' }] }],
    refused: [{ index: 1, lengthM: 5, kind: 'stub', why: 'short' }] })
  const cases = [
    ['a sound artifact passes', good(), 105, false],
    ['an arc dropped silently', { ...good(), arcs: [] }, 105, true],
    ['declined "not at the water" (the lidar rule)', { ...good(), refused: [{ index: 1, lengthM: 5, why: 'neither side reaches the water within 30 m — this arc is not at a water edge' }] }, 105, true],
    ['ink with no drawn water', { ...good(), refused: [{ index: 1, lengthM: 5, kind: FAILING_KIND, why: 'x' }] }, 105, true],
    ['a bare station with no reason', (() => { const d = good(); delete d.arcs[0].stations[1].why; return d })(), 105, true],
    ['an artifact ruled by the lidar', (() => { const d = good(); delete d.shoreFrom; return d })(), 105, true],
  ]
  let bad = 0
  for (const [n, doc, m, wantFail] of cases) {
    const got = audit(doc, m).length > 0
    if (got !== wantFail) bad++
    console.log(`${got === wantFail ? '✅' : '⛔'} ${wantFail ? 'caught' : 'passed'} — ${n}`)
  }
  process.exit(bad ? 1 : 0)
}

const fromCode = process.argv.includes('--code')
const argv = process.argv.filter(a => a !== '--code')
process.argv = argv
const list = scenes('public/baked/<scene>/shape.json', { label: 'baked shape' })
let failed = false, shores = 0
for (const scene of list) {
  const runs = waterRuns(JSON.parse(read(`public/baked/${scene}/shape.json`)))
  if (!runs.length) { console.log(`  ${scene.padEnd(24)} no shoreline in the slab — nothing to name`); continue }
  shores++
  const bnd = JSON.parse(read(`cartograph/data/${scene}/neighborhood_boundary.json`))
  const drawnShoreM = runs.reduce((a, r) => a + clipTraceToDisc(r, bnd.center, bnd.radius).inside.reduce((b, t) => b + len(t), 0), 0)
  let doc
  if (fromCode) {
    const log = console.log, warn = console.warn
    console.log = () => {}; console.warn = () => {}
    try { doc = bakeRevetment({ scene, write: false }) } finally { console.log = log; console.warn = warn }
  } else {
    const p = `public/baked/${scene}/revetment.json`
    if (!existsSync(join(ROOT, p))) { console.log(`  ⛔ ${scene.padEnd(22)} has ${(drawnShoreM / 1000).toFixed(2)} km of shoreline and NO revetment.json — never ruled`); failed = true; continue }
    doc = JSON.parse(read(p))
  }
  const f = audit(doc, drawnShoreM)
  const t = doc.totals || {}
  const bare = Object.entries(doc.bareM || {}).map(([k, v]) => `${(v / 1000).toFixed(2)} km ${k}`).join(', ')
  console.log(`  ${f.length ? '⛔' : '✅'} ${scene.padEnd(22)} armoured ${((t.armouredM || 0) / 1000).toFixed(2)} of ${(drawnShoreM / 1000).toFixed(2)} km drawn shore${bare ? ` · bare: ${bare}` : ''}`)
  for (const x of f.slice(0, 6)) console.log(`       ${x}`)
  if (f.length > 6) console.log(`       … and ${f.length - 6} more`)
  if (f.length) failed = true
}
console.log(`\n  ${shores} town(s) with shoreline · source: ${fromCode ? 'the CODE (in memory)' : 'the shipped revetment.json'} · named predicates: ${[...NAMED].sort().join(', ')}`)
if (failed) { console.log('\n⛔ drawn shore is bare, or missing, for no named reason'); process.exit(1) }
console.log('\n✅ every metre of drawn shore is armoured or bare for a named predicate')
