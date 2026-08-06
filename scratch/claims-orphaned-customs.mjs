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
