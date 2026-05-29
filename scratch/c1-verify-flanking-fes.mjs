// C1+C2 verification — dump corner records across the toy sampler.
// C1: flankingFes populates per cornersAtIx skip rules.
// C2: swCornerDepth resolves via existing rightDepth_A/leftDepth_B
//     (customs-aware transitively); blockScalars[blockKey].W is defined
//     for every block with fes>0. STUB-N corner with null flankingFes.B
//     resolves swCornerDepth via legRefs.B → chain.measure fallback.
//
// Disposable; delete by exact name after C5 sweep.
//
// Run: node scratch/c1-verify-flanking-fes.mjs

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ribbons = JSON.parse(readFileSync(join(ROOT, 'src/data/toy/toy-ribbons.json'), 'utf-8'))

// Load the toy stencil the same way bake-ground does — buildBlockGeometryV2
// needs a stencil to derive blockSharp / frontageEdges (without it the
// block polygons don't exist and feLookup is empty).
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
const v2 = buildBlockGeometryV2(ribbons, {
  stencil: stencilPolygon,
  blockCustoms: design.blockCustoms || null,
  blockLandUse: design.blockLandUse || null,
})
const corners = v2.corners || []

const fmt = (fe) => fe ? `ch${fe.chainIdx}/${fe.side}/eo${fe.edgeOrd}` : 'null'
const labelOfChain = (idx) => ribbons.streets?.[idx]?.name || `ch${idx}`

console.log(`\nTotal corner records: ${corners.length}\n`)

let bothPop = 0, oneNull = 0, bothNull = 0
const byIxKey = new Map()
for (const c of corners) {
  const A = c.flankingFes?.A, B = c.flankingFes?.B
  if (A && B) bothPop++
  else if (A || B) oneNull++
  else bothNull++
  const k = `${Math.round(c.V[0]*10)/10},${Math.round(c.V[1]*10)/10}`
  if (!byIxKey.has(k)) byIxKey.set(k, [])
  byIxKey.get(k).push(c)
}

console.log(`flankingFes: bothPop=${bothPop}  oneNull=${oneNull}  bothNull=${bothNull}`)
console.log(`Unique IX-V coords with at least one corner: ${byIxKey.size}\n`)

console.log('--- Per-IX summary (sorted by V) ---')
const ixKeys = [...byIxKey.keys()].sort()
for (const k of ixKeys) {
  const list = byIxKey.get(k)
  const streetNames = new Set()
  for (const c of list) {
    if (c.flankingFes?.A) streetNames.add(labelOfChain(c.flankingFes.A.chainIdx))
    if (c.flankingFes?.B) streetNames.add(labelOfChain(c.flankingFes.B.chainIdx))
  }
  console.log(`IX (${k}): ${list.length} corners — ${[...streetNames].join(' × ') || '(no flanking fes resolved)'}`)
  for (const c of list) {
    const A = c.flankingFes?.A, B = c.flankingFes?.B
    console.log(`    θ=${(c.theta*180/Math.PI).toFixed(1)}°  d_A=${c.rightDepth_A.toFixed(2)}  d_B=${c.leftDepth_B.toFixed(2)}  swCD=${(c.swCornerDepth ?? -1).toFixed(2)}  A:${fmt(A)}  B:${fmt(B)}  legRefs A:ch${c.legRefs?.A?.chainIdx}/${c.legRefs?.A?.side} B:ch${c.legRefs?.B?.chainIdx}/${c.legRefs?.B?.side}`)
  }
}

// Topology-specific spot checks.
console.log('\n--- Topology spot checks ---')

// (a) STUB-N dead-end: a chain endpoint with no IX-meeting-another-chain
//     should produce no corner records along the stub. Identify stub
//     chains by name match if present; otherwise note for manual review.
const stubChains = (ribbons.streets || []).filter(s => /stub/i.test(s.name || ''))
if (stubChains.length) {
  for (const s of stubChains) {
    const stubIdx = ribbons.streets.indexOf(s)
    const involved = corners.filter(c =>
      c.flankingFes?.A?.chainIdx === stubIdx || c.flankingFes?.B?.chainIdx === stubIdx)
    console.log(`STUB "${s.name}" (chainIdx=${stubIdx}): ${involved.length} corner records mention this chain` +
      ` (expect >0 only at the IX where the stub meets another chain; expect 0 along the free end)`)
  }
} else {
  console.log('STUB: no chains with /stub/i in name found in toy ribbons')
}

// (b) Waverly-toy couplet: divided-pair endpoint IXs — corners that would
//     produce parallel polylineCross misses get skipped at cornersAtIx
//     (line 518). Confirmed by ABSENCE of records, not by inspection.
//     Just list any chain whose name matches /waverly/i and count its
//     involvement in corner records.
const waverlyChains = (ribbons.streets || []).filter(s => /waverly/i.test(s.name || ''))
if (waverlyChains.length) {
  console.log(`WAVERLY chains: ${waverlyChains.map(s => s.name).join(', ')}` +
    ` — corner records involving any waverly chain: ` +
    corners.filter(c =>
      waverlyChains.some(s => {
        const idx = ribbons.streets.indexOf(s)
        return c.flankingFes?.A?.chainIdx === idx || c.flankingFes?.B?.chainIdx === idx
      })).length)
}

// (c) Benton-toy teardrop: closed-chain wraparound — IXs at body-stem
//     joins should each have flankingFes populated on the corners that
//     emit (the body-stem fork is a real IX, not a skipped one).
const bentonChains = (ribbons.streets || []).filter(s => /benton/i.test(s.name || ''))
if (bentonChains.length) {
  console.log(`BENTON chains: ${bentonChains.map(s => s.name).join(', ')}` +
    ` — corner records involving benton: ` +
    corners.filter(c =>
      bentonChains.some(s => {
        const idx = ribbons.streets.indexOf(s)
        return c.flankingFes?.A?.chainIdx === idx || c.flankingFes?.B?.chainIdx === idx
      })).length)
}

// (d) HW3 saw-tooth: 45° jog at (0,40) per RIBBONS doctrine. Same-chain
//     bend is NOT a corner record per cornersAtIx (theta-filter +
//     chain-identity rules); a corner record at HW3×anotherchain IS.
const hw3Chains = (ribbons.streets || []).filter(s => /^hw3$|hw3/i.test(s.name || ''))
if (hw3Chains.length) {
  console.log(`HW3 chains: ${hw3Chains.map(s => s.name).join(', ')}` +
    ` — corner records involving hw3: ` +
    corners.filter(c =>
      hw3Chains.some(s => {
        const idx = ribbons.streets.indexOf(s)
        return c.flankingFes?.A?.chainIdx === idx || c.flankingFes?.B?.chainIdx === idx
      })).length)
}

console.log('\n--- fe inventory probe ---')
const fes = v2.frontageEdges || []
console.log(`Total fes: ${fes.length}`)
let feWithSegOrds = 0, feWithoutSegOrds = 0, feWithChainIdx = 0
for (const fe of fes) {
  if (fe.segOrds?.length) feWithSegOrds++
  else feWithoutSegOrds++
  if (fe.chainIdx != null) feWithChainIdx++
}
console.log(`  with segOrds: ${feWithSegOrds}  without: ${feWithoutSegOrds}  with chainIdx: ${feWithChainIdx}`)
console.log(`  sample fe[0]:`, JSON.stringify(fes[0] && { chainIdx: fes[0].chainIdx, side: fes[0].side, blockKey: fes[0].blockKey, edgeOrd: fes[0].edgeOrd, segOrds: fes[0].segOrds, pointsLen: fes[0].points?.length }))
console.log(`  sample fe[1]:`, JSON.stringify(fes[1] && { chainIdx: fes[1].chainIdx, side: fes[1].side, blockKey: fes[1].blockKey, edgeOrd: fes[1].edgeOrd, segOrds: fes[1].segOrds, pointsLen: fes[1].points?.length }))

const stubIdx = (ribbons.streets || []).findIndex(s => /stub/i.test(s.name || ''))
const stubFes = fes.filter(fe => fe.chainIdx === stubIdx)
console.log(`  STUB-N fes (chainIdx=${stubIdx}): ${stubFes.length} — sides: ${stubFes.map(f => `${f.side}(segOrds=[${f.segOrds.join(',')}])`).join(' ')}`)

// --- C2 assertions ---
console.log('\n--- C2: blockScalars + swCornerDepth assertions ---')
const blockScalars = v2.blockScalars
console.log(`blockScalars entries: ${blockScalars?.size}`)

// Assertion 1: every block with fes>0 has blockScalars[blockKey].W defined.
const blocksWithFes = new Map()
for (const fe of fes) {
  if (!fe.blockKey) continue
  let arr = blocksWithFes.get(fe.blockKey)
  if (!arr) { arr = []; blocksWithFes.set(fe.blockKey, arr) }
  arr.push(fe)
}
let missingW = 0
for (const [blockKey] of blocksWithFes) {
  if (!blockScalars.has(blockKey)) missingW++
}
console.log(`Assertion 1 (blocks-with-fes have W): ${missingW === 0 ? 'PASS' : `FAIL — ${missingW} blocks missing W`}`)

// Assertion 2: per-block W is internally consistent (max of fes-on-block
// of cw + depthForSide(fe.measure)). Re-derive and compare.
const cw = 6 * 0.0254 // CURB_WIDTH from src/cartograph/streetProfiles.js — 6"
const depthForSide = (m) => m?.terminal === 'sidewalk' ? (m.treelawn || 0) + (m.sidewalk || 0) : 0
let wMismatch = 0
for (const [blockKey, blockFes] of blocksWithFes) {
  let maxStack = 0
  for (const fe of blockFes) {
    const d = depthForSide(fe.measure)
    if (d > maxStack) maxStack = d
  }
  const expectedW = maxStack > 0 ? cw + maxStack : 0
  const actualW = blockScalars.get(blockKey)?.W
  if (Math.abs(expectedW - actualW) > 1e-9) {
    console.log(`  MISMATCH block ${blockKey}: expected W=${expectedW}, got W=${actualW}`)
    wMismatch++
  }
}
console.log(`Assertion 2 (W reproducible from fes): ${wMismatch === 0 ? 'PASS' : `FAIL — ${wMismatch} blocks`}`)

// Assertion 3: every corner has swCornerDepth defined.
const cornersMissingSwCD = corners.filter(c => c.swCornerDepth == null).length
console.log(`Assertion 3 (corners have swCornerDepth): ${cornersMissingSwCD === 0 ? 'PASS' : `FAIL — ${cornersMissingSwCD} corners missing`}`)

// Assertion 4: STUB-N x HW3 one-null corner still resolves swCornerDepth
// > 0 via the legRefs fallback (B-side flankingFe is null, but legRef
// gives chainIdx=14 side that points back to STUB-N's chain.measure).
const stubIdx2 = (ribbons.streets || []).findIndex(s => /stub/i.test(s.name || ''))
const oneNullCorners = corners.filter(c =>
  ((!c.flankingFes?.A) ^ (!c.flankingFes?.B)) &&
  (c.legRefs?.A?.chainIdx === stubIdx2 || c.legRefs?.B?.chainIdx === stubIdx2))
console.log(`Assertion 4 (STUB-N null-fe corners resolve depth): ${oneNullCorners.length} candidate corners`)
for (const c of oneNullCorners) {
  const expected = cw + Math.max(c.rightDepth_A, c.leftDepth_B)
  console.log(`  IX (${c.V[0]},${c.V[1]}): swCD=${c.swCornerDepth.toFixed(2)} (expected ${expected.toFixed(2)}) — ${Math.abs(expected - c.swCornerDepth) < 1e-9 ? 'PASS' : 'FAIL'}`)
}

// Assertion 5: swCornerDepth = cw + max(d_A, d_B) (transitively customs-aware).
let swCDMismatch = 0
for (const c of corners) {
  const expected = Math.max(c.rightDepth_A, c.leftDepth_B) > 0
    ? cw + Math.max(c.rightDepth_A, c.leftDepth_B) : 0
  if (Math.abs(expected - c.swCornerDepth) > 1e-9) {
    swCDMismatch++
    if (swCDMismatch <= 3) console.log(`  MISMATCH at IX (${c.V[0]},${c.V[1]}): expected ${expected}, got ${c.swCornerDepth}`)
  }
}
console.log(`Assertion 5 (swCD = cw + max(d_A,d_B)): ${swCDMismatch === 0 ? 'PASS' : `FAIL — ${swCDMismatch} corners`}`)

// W-spread report: distribution of W across toy blocks.
const ws = [...blockScalars.values()].map(s => s.W).sort((a, b) => a - b)
console.log(`W distribution: min=${ws[0]?.toFixed(2)} max=${ws[ws.length-1]?.toFixed(2)} median=${ws[Math.floor(ws.length/2)]?.toFixed(2)} (n=${ws.length})`)

console.log('\n--- Chain inventory ---')
;(ribbons.streets || []).forEach((s, i) => {
  console.log(`  ch${i}: "${s.name}"  pts=${s.points?.length}  anchor=${s.anchor || 'center'}`)
})
