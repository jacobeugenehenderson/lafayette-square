// ⛔⛔ RETRACTED 2026-08-06 — THIS PROBE'S HEADLINE RESULT IS VOID. DO NOT CITE IT.
//
// It reported "27 of 76 authored leg slots are never read" (commit c430f4e9).
// That number is void for TWO independent reasons, either one fatal:
//
//   1. IT WAS MEASURED AGAINST A FILE THAT CHANGED UNDER IT. Jacob was authoring
//      and reverting in the live app while this read design.json from disk. HEAD
//      had 49 Section-field slots; the working tree had 0 minutes later. The
//      number has no timestamp and cannot be reproduced.
//      → Snapshot an operator-authored artifact, measure the COPY, report "as of".
//
//   2. ITS PREMISE WAS WRONG. It assumed the write key is feCustomKey's
//      min(segOrds) while the read key is run.segOrd — a mismatch. But the store
//      FANS a write across every segOrd the fe owns (`feSegOrds`,
//      useCartographStore.js:26; RIBBONS §2, SECTION §5). There is no min-only
//      write. And RIBBONS §5 already names the harness for this exact question:
//      `scratch/t4-fe-parity.mjs`. Both facts were in the canon, unread.
//
// ⛔ AND THE FIX IT WAS HUNTING IS FORBIDDEN. SECTION §6.3, on this defect class:
//    "Do not fan the write across the leg range, do not restore the mouth on the
//     9, do not key differently. Answer the hole, not the cover." The addressing
//    fix was built, gated, and RETIRED — naming a leg does not give it edges. The
//    root is the missing second mouth corner (POLYGON-FIRST §2.1 Check 5).
//
// Kept, not deleted, because the earlier VERSION of this file was worse: it read
// `frontageEdges` off buildTileGround (which returns none) and reported the
// operator's entire authored corpus orphaned, off an empty array. That near-miss
// is the reason the rule exists: a probe whose result would be catastrophic if
// true is BROKEN until proven otherwise — print the denominator.
//
// The live, trustworthy sibling from that day is `claims-revert-field-coverage.mjs`.
//
// ─────────────────────────────────────────────────────────────────────────────
// claims-orphaned-customs.mjs — DOES EVERY AUTHORED CUSTOM HAVE SOMETHING TO READ IT?
//
// The operator's override is the product. A custom written to a slot that no
// frontage edge resolves to is a gesture that was accepted, stored, and is never
// read — silently. That is Layer 0 q2 (no silent substitution) applied to
// authoring, and it is kit-general: it fires on any town, needs no prior
// knowledge of the street, and its absence is provable.
//
// Cross-references every blockCustoms slot against the feCustomKey of every real
// frontage edge, plus the synthetic cap fes.
//
//   node scratch/claims-orphaned-customs.mjs [scene]
// Read-only. No pour, no bake.
import fs from 'fs'
import { feCustomKey, makeCapFe, CAP_SEGORD, isCapSegOrd } from '../src/lib/feCustomKey.js'

const scene = process.argv[2] || 'lafayette-square'
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const design = JSON.parse(fs.readFileSync(`public/looks/${scene}/design.json`, 'utf8'))
const bc = design.blockCustoms || {}

const nb = JSON.parse(fs.readFileSync(`cartograph/data/${scene}/neighborhood_boundary.json`, 'utf8'))
const sc0 = ((nb?.streetFade?.outer ?? nb.radius) + 50) / nb.radius
const [cx, cz] = nb.center
const stencil = nb.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])

const orig = console.log; console.log = () => {}
const { buildBlockGeometryV2 } = await import('../src/lib/buildBlockGeometryV2.js')
const v2 = buildBlockGeometryV2(ribbons, {
  stencil, blockCustoms: bc,
  curbWidth: design.curbWidth ?? 0.15, blockLandUse: design.blockLandUse,
})
console.log = orig

// The key a custom is READ under is feCustomKey = [skel, side, MIN(segOrds)].
const feKeys = new Set()
let feTotal = 0, feNoKey = 0
for (const fe of (v2.frontageEdges || [])) {
  feTotal++
  const k = feCustomKey(fe)
  if (!k) { feNoKey++; continue }
  feKeys.add(k.join('|'))
}

// every CAP key the frozen faces can resolve
const capKeys = new Set()
for (const t of ribbons.tiles || []) for (const c of (t.caps || [])) {
  const fe = makeCapFe(c.skelId, c.capEnd)
  const k = fe && feCustomKey(fe)
  if (k) capKeys.add(k.join('|'))
}

console.log(`scene: ${scene}`)
console.log(`frontage edges: ${feTotal}  (resolvable to a custom slot: ${feTotal - feNoKey}, NO KEY: ${feNoKey})`)
console.log(`cap slots available (frozen faces): ${capKeys.size}`)

// ── walk the authored customs ──
const orphans = [], live = []
for (const [skelId, sides] of Object.entries(bc)) {
  for (const [side, ords] of Object.entries(sides)) {
    for (const ord of Object.keys(ords)) {
      const seg = Number(ord)
      const key = [skelId, side, seg].join('|')
      const isCap = isCapSegOrd(seg)
      const found = isCap ? capKeys.has(key) : feKeys.has(key)
      const rec = { key, skelId, side, seg, isCap, kinds: Object.keys(ords[ord]) }
      ;(found ? live : orphans).push(rec)
    }
  }
}

console.log(`\nauthored slots: ${live.length + orphans.length}   live: ${live.length}   ⛔ ORPHANED: ${orphans.length}`)
if (orphans.length) {
  console.log(`\n⛔ ORPHANED — the operator authored these and NOTHING reads them:`)
  for (const o of orphans.sort((a, b) => a.key.localeCompare(b.key)))
    console.log(`   ${o.isCap ? 'CAP ' : 'LEG '}${o.skelId} [${o.side}][${o.seg}]  {${o.kinds.join(',')}}`)
} else {
  console.log(`\n✅ every authored slot resolves to something that reads it.`)
}
