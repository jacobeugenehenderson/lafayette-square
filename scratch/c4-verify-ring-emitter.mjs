// C4 verification — compare legacy vs ring-band emitter on toy. Dumps
// frontageBands counts + per-block band-coverage stats so the operator
// can eyeball the bake numerically before opening Toy designer.
//
// Disposable; delete by exact name after C5 sweep.
//
// Run: node scratch/c4-verify-ring-emitter.mjs

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ribbons = JSON.parse(readFileSync(join(ROOT, 'src/data/toy/toy-ribbons.json'), 'utf-8'))

const stencilRaw = JSON.parse(readFileSync(join(ROOT, 'cartograph/data/toy/neighborhood_boundary.json'), 'utf-8'))
const center = stencilRaw.center || [0, 0]
const radius = stencilRaw.radius || 1
const streetFade = stencilRaw.streetFade || null
let stencilPolygon = null
if (stencilRaw.boundary?.length) {
  const targetR = streetFade ? streetFade.outer + 50 : radius
  const scale = radius > 0 ? targetR / radius : 1
  stencilPolygon = stencilRaw.boundary.map(([x, z]) => [center[0] + (x - center[0]) * scale, center[1] + (z - center[1]) * scale])
}

const designPath = join(ROOT, 'cartograph/data/toy/design.json')
const design = existsSync(designPath) ? JSON.parse(readFileSync(designPath, 'utf-8')) : {}

const baseOpts = {
  stencil: stencilPolygon,
  blockCustoms: design.blockCustoms || null,
  blockLandUse: design.blockLandUse || null,
}

const v2Legacy = buildBlockGeometryV2(ribbons, { ...baseOpts, useRingBandEmitter: false })
const v2New    = buildBlockGeometryV2(ribbons, { ...baseOpts, useRingBandEmitter: true  })

const summary = (label, v2) => {
  const bands = v2.frontageBands || []
  let nTl = 0, nSw = 0, nAsphalt = 0
  let areaTl = 0, areaSw = 0
  for (const b of bands) {
    for (const r of (b.treelawnRings || [])) {
      nTl++; areaTl += Math.abs(ringArea(r))
    }
    for (const r of (b.sidewalkRings || [])) {
      nSw++; areaSw += Math.abs(ringArea(r))
    }
    for (const r of (b.asphaltRings || [])) nAsphalt++
  }
  const cornerEntries = bands.filter(b => b.corner).length
  const straightEntries = bands.length - cornerEntries
  console.log(`${label}:`)
  console.log(`  entries: ${bands.length} (straight=${straightEntries}, corner=${cornerEntries})`)
  console.log(`  rings:   treelawn=${nTl}, sidewalk=${nSw}, asphalt=${nAsphalt}`)
  console.log(`  area:    treelawn=${areaTl.toFixed(1)} m², sidewalk=${areaSw.toFixed(1)} m²`)
  return { bands, nTl, nSw, areaTl, areaSw, straightEntries, cornerEntries }
}

const ringArea = (r) => {
  let a = 0
  for (let i = 0, n = r.length; i < n; i++) {
    const [x1, z1] = r[i]
    const [x2, z2] = r[(i + 1) % n]
    a += x1 * z2 - x2 * z1
  }
  return a * 0.5
}

console.log('=== FrontageBands comparison: Legacy vs Ring-band emitter ===\n')
const L = summary('LEGACY', v2Legacy)
console.log()
const N = summary('NEW   ', v2New)

console.log('\n=== Per-block coverage check ===')
const blockKeys = new Set([
  ...((v2Legacy.frontageBands || []).map(b => b.blockKey)),
  ...((v2New.frontageBands || []).map(b => b.blockKey)),
])
console.log(`blocks touched: legacy ${new Set((v2Legacy.frontageBands || []).map(b => b.blockKey)).size}, new ${new Set((v2New.frontageBands || []).map(b => b.blockKey)).size}, union ${blockKeys.size}`)

console.log('\n=== Ring sanity: self-intersection / area checks ===')
let badArea = 0, smallRings = 0
for (const b of (v2New.frontageBands || [])) {
  for (const r of [...(b.treelawnRings || []), ...(b.sidewalkRings || [])]) {
    const a = Math.abs(ringArea(r))
    if (a < 0.01) smallRings++
    if (a < 0) badArea++  // shouldn't happen with abs, here for shape
  }
}
console.log(`tiny rings (<0.01 m²): ${smallRings}, negative-area: ${badArea}`)

console.log('\n=== Corner-entry asphaltRings attribution preserved? ===')
console.log(`legacy corner entries with corner-record set: ${v2Legacy.frontageBands.filter(b => b.corner).length}`)
console.log(`new    corner entries with corner-record set: ${v2New.frontageBands.filter(b => b.corner).length}`)
console.log(`cornerOrphanAsphalt: legacy ${v2Legacy.cornerOrphanAsphalt?.length}, new ${v2New.cornerOrphanAsphalt?.length}`)

console.log('\n=== Per-block ribbon coverage ===')
const blocksAll = v2New.blockScalars || new Map()
const legacyKeys = new Set((v2Legacy.frontageBands || []).map(b => b.blockKey))
const newKeys    = new Set((v2New.frontageBands || []).map(b => b.blockKey))
console.log(`blockScalars (W>0 blocks): ${blocksAll.size}`)
for (const [bk, { W }] of blocksAll) {
  const inL = legacyKeys.has(bk), inN = newKeys.has(bk)
  const tag = inL && inN ? '  ' : (inL ? 'L-' : (inN ? '-N' : '!!'))
  console.log(`  ${tag} block ${bk}  W=${W.toFixed(2)}  legacy=${inL?'✓':'✗'} new=${inN?'✓':'✗'}`)
}
