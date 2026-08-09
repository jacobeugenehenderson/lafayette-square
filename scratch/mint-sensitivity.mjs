#!/usr/bin/env node
/**
 * IS THE "0 FLIPS" RESULT MEANINGFUL, OR DID THE FIXTURE NEVER TOUCH THE MINT SET?
 *
 * `mint-under-authoring.mjs` found 0 flips on all three same-bake pairs. But the
 * fixtures move the curb on only 7/101 (LS), 8/196 (HPDM), 14/116 (staging) tiles.
 * A zero drawn from a sample that never reached the minting tiles is not evidence
 * of stability — it is evidence of nothing, and it fails toward "fine".
 *
 * Two measurements, both read out of the shape pass:
 *   1. OVERLAP — of the tiles whose curb actually moved, how many mint?
 *   2. SENSITIVITY — sweep pavementHW map-wide across a real range and watch the
 *      mint count. This is the OPERATOR'S GESTURE generalised (SURVEY §4.1: drag a
 *      strip = set pavementHW on a run), applied to every resolvable triple, and it
 *      answers "CAN the dial move the set at all" independently of which widths one
 *      historical fixture happened to contain.
 *      ⚠️ A sweep is not a claim about real authoring. It bounds the dial, nothing more.
 *
 * ⛔ Measurement only. Nothing re-poured, nothing re-baked, live source untouched.
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { buildTileGround } = await import(path.join(ROOT, 'src/lib/tileGround.js'))
const OPTS = { stencil: null, curbWidth: 0.15, smooth: 0, blockLandUse: null, cornerRadiusScale: 1, cornerRadiusOverrides: null, cornerCornerRadiusOverrides: null, emitArtifact: true }
const quiet = (f) => { const w = console.log; console.log = () => {}; try { return f() } finally { console.log = w } }
const h = (o) => crypto.createHash('sha256').update(JSON.stringify(o, (k, v) => (typeof v === 'number' ? +v.toFixed(6) : v))).digest('hex').slice(0, 12)
const rb = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const pre = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/looks/lafayette-square/design.json.pre-reset'), 'utf8')).blockCustoms || {}
const run = (bc) => (quiet(() => buildTileGround(rb, { ...OPTS, blockCustoms: bc }))._shapeArtifact || [])
const mintSet = (T) => new Set(T.map((t, i) => (!Array.isArray(t.iaEdge) && /minted/.test(t.iaEdgeReason || '')) ? i : -1).filter(i => i >= 0))

const A = run(null), B = run(pre)
const movedIdx = A.map((t, i) => t.iA && h(t.iA) !== h(B[i].iA) ? i : -1).filter(i => i >= 0)
const mA = mintSet(A)
console.log('\n── 1. OVERLAP — did the pre-reset fixture even touch a minting tile? ──')
console.log(`   tiles whose curb moved : ${movedIdx.length}  [${movedIdx.join(' ')}]`)
console.log(`   of those, MINTING      : ${movedIdx.filter(i => mA.has(i)).length}  [${movedIdx.filter(i => mA.has(i)).join(' ') || '—'}]`)
console.log(`   the 13 minting tiles   : [${[...mA].join(' ')}]`)

// every triple the bake can resolve — the operator's reachable surface
const triples = []
for (const t of A) for (const r of (t.runs || [])) if (r.skelId != null) triples.push([r.skelId, r.side, r.segOrd])
const bcAt = (hw) => { const o = {}; for (const [sk, side, ord] of triples) { ((o[sk] ||= {})[side] ||= {})[ord] = { pavementHW: hw }; } return o }

console.log('\n── 2. SENSITIVITY — pavementHW set map-wide, every resolvable triple ──')
console.log('   ⚠️ a SWEEP, not a claim about real authoring. It bounds the dial.')
console.log(`   ${'pavementHW'.padStart(11)} ${'minting'.padStart(8)} ${'stamped'.padStart(8)} ${'Δ vs default'.padStart(13)}`)
const base = mA.size
for (const hw of [2, 3, 4, 5, 6, 7, 8, 10, 14]) {
  const T = run(bcAt(hw))
  const m = mintSet(T)
  const st = T.filter(t => Array.isArray(t.iaEdge)).length
  const inOnly = [...m].filter(i => !mA.has(i)).length, outOnly = [...mA].filter(i => !m.has(i)).length
  console.log(`   ${String(hw).padStart(9)} m ${String(m.size).padStart(8)} ${String(st).padStart(8)} ${String(m.size - base).padStart(9)}      +${inOnly} new / −${outOnly} gone`)
}
console.log(`\n   (genuine default: ${base} minting, ${A.filter(t => Array.isArray(t.iaEdge)).length} stamped, of 101 tiles)`)

// ── 3. DOES A CROSSING TILE CARRY A BROKEN BAND? ───────────────────────────
// The A10 defect set at genuine default (from claims-band-reaches-lu.mjs; re-derive,
// don't quote: `node scratch/claims-band-reaches-lu.mjs --only lafayette-square/lafayette-square/default --rows 40`).
// ⚠️ The defect set MOVES under authoring too — this uses the default-state set as
// the reference, which is the operator's starting point, not an invariant.
const DEFECT = new Set([2,3,4,8,10,11,12,14,18,19,20,24,26,35,42,43,44,46,53,64,65,66,67,68,69,70,77,95])
console.log('\n── 3. WHICH TILES CROSS, AND DO THEY CARRY A BROKEN BAND? ──')
for (const hw of [2, 3, 4, 5, 6, 7, 8, 10, 14]) {
  const m = mintSet(run(bcAt(hw)))
  const gained = [...m].filter(i => !mA.has(i)), lost = [...mA].filter(i => !m.has(i))
  const gD = gained.filter(i => DEFECT.has(i)), lD = lost.filter(i => DEFECT.has(i))
  if (!gained.length && !lost.length) continue
  console.log(`   ${String(hw).padStart(2)} m  →  became minting [${gained.join(' ') || '—'}]  ·  stopped minting [${lost.join(' ') || '—'}]`)
  console.log(`         of which IN THE A10 DEFECT SET:  gained ${gD.length} [${gD.join(' ') || '—'}]  ·  lost ${lD.length} [${lD.join(' ') || '—'}]`)
}
