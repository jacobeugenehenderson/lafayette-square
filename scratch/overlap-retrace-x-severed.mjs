#!/usr/bin/env node
/**
 * READ-ONLY. One question: of the tiles whose sidewalk BAND is severed, how many
 * also contain a RETRACED edge (a dead-end slit)? Report the 2x2.
 *
 * Two artifacts, TWO ORDERINGS — never index-join.
 *   RETRACE  <- src/data/ribbons.json           tiles[] = { ring, edges }   (prebake freeze)
 *   SEVERED  <- public/baked/<scene>/shape.json tiles[] = { ring, runs, ... } (baked)
 * The join is GEOMETRIC and is PROVEN 1:1 and total before it is used.
 *
 * SEVERED reproduces predicate 1 of scratch/claims-band-is-one-ring.mjs ONLY.
 * (Its SLIT/FLAP predicates are declared UNVALIDATED there and are not touched.)
 *
 * Usage: node scratch/overlap-retrace-x-severed.mjs [--scene <name>] [--lists]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import clipperLib from 'clipper-lib'
import { sectionPassTile } from '../src/lib/tileGround.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argScene = process.argv.includes('--scene') ? process.argv[process.argv.indexOf('--scene') + 1] : 'lafayette-square'
const lists = process.argv.includes('--lists')

const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json'), 'utf8'))
const shapeP = path.join(ROOT, 'public/baked', argScene, 'shape.json')
const shape = (j => Array.isArray(j) ? j : j.tiles)(JSON.parse(fs.readFileSync(shapeP, 'utf8')))
const designP = path.join(ROOT, 'public/looks', argScene, 'design.json')
const bc = fs.existsSync(designP) ? (JSON.parse(fs.readFileSync(designP, 'utf8')).blockCustoms || null) : null

const R = ribbons.tiles
console.log(`ARTIFACTS`)
console.log(`  ribbons.json  tiles ${R.length}   sha256 ${crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,'src/data/ribbons.json'))).digest('hex').slice(0,16)}`)
console.log(`  shape.json    tiles ${shape.length}   sha256 ${crypto.createHash('sha256').update(fs.readFileSync(shapeP)).digest('hex').slice(0,16)}  bytes ${fs.statSync(shapeP).size}`)
console.log(`  blockCustoms  ${bc ? Object.keys(bc).length + ' streets (authored state loaded)' : 'NONE'}\n`)

// ---------- THE JOIN. Key = the ring as a rotation/direction-independent vertex multiset hash.
// Rings are compared at 1e-4 m quantisation; a tile's ring is its identity in both artifacts.
const Q = 1e4
const vkey = p => `${Math.round(p[0] * Q)},${Math.round(p[1] * Q)}`
const ringKey = ring => {
  const vs = ring.map(vkey)
  // drop a duplicated closing vertex if present
  if (vs.length > 1 && vs[0] === vs[vs.length - 1]) vs.pop()
  return crypto.createHash('sha1').update([...vs].sort().join('|')).digest('hex')
}
const centroidArea = ring => {
  let a = 0, cx = 0, cz = 0
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length
    const cr = ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1]
    a += cr; cx += (ring[i][0] + ring[j][0]) * cr; cz += (ring[i][1] + ring[j][1]) * cr
  }
  a /= 2
  return { area: a, c: a ? [cx / (6 * a), cz / (6 * a)] : ring[0] }
}

const rKeys = R.map(t => ringKey(t.ring))
const sKeys = shape.map(t => ringKey(t.ring))
const dup = arr => { const m = new Map(); arr.forEach((k, i) => m.set(k, [...(m.get(k) || []), i])); return [...m].filter(([, v]) => v.length > 1) }
const rDup = dup(rKeys), sDup = dup(sKeys)

const rIndex = new Map(); rKeys.forEach((k, i) => rIndex.set(k, i))
const pairs = []            // [shapeIdx, ribbonIdx]
const unmatched = []
sKeys.forEach((k, si) => { if (rIndex.has(k)) pairs.push([si, rIndex.get(k)]); else unmatched.push(si) })
const usedR = new Set(pairs.map(p => p[1]))

console.log(`JOIN — key: ring vertex-multiset hash @1e-4 m (rotation & direction independent)`)
console.log(`  duplicate keys within ribbons.json: ${rDup.length}   within shape.json: ${sDup.length}`)
console.log(`  matched pairs ${pairs.length} / ${shape.length} shape tiles / ${R.length} ribbons tiles`)
console.log(`  unmatched shape tiles ${unmatched.length}   unmatched ribbons tiles ${R.length - usedR.size}`)
const identity = pairs.filter(([s, r]) => s === r).length
console.log(`  join is 1:1 and TOTAL: ${pairs.length === shape.length && pairs.length === R.length && usedR.size === R.length && !rDup.length && !sDup.length ? 'YES' : 'NO'}`)
console.log(`  pairs where shapeIdx === ribbonIdx: ${identity} of ${pairs.length}  ⇒ orderings ${identity === pairs.length ? 'AGREE (index join would have worked, but was not used)' : 'DIFFER'}`)
if (unmatched.length) {
  console.log(`\n  ⛔ UNMATCHED — reporting geometry so the divergence can be judged:`)
  for (const si of unmatched.slice(0, 20)) {
    const { area, c } = centroidArea(shape[si].ring)
    console.log(`    shape[${si}] verts ${shape[si].ring.length} area ${area.toFixed(1)} c ${c[0].toFixed(2)},${c[1].toFixed(2)}`)
  }
}
if (pairs.length !== shape.length || usedR.size !== R.length || rDup.length || sDup.length) {
  console.log(`\n⛔ JOIN NOT PROVEN 1:1 AND TOTAL — STOPPING. The divergence is the finding.`)
  process.exit(2)
}

// ---------- RETRACE, off ribbons.json only.
// An edge walked A->B and later B->A in the same ring.
const retraceEdges = ring => {
  const m = ring.length
  const seen = new Map()
  let n = 0
  const idx = []
  for (let i = 0; i < m; i++) {
    const a = vkey(ring[i]), b = vkey(ring[(i + 1) % m])
    const fwd = `${a}>${b}`, rev = `${b}>${a}`
    if (seen.has(rev)) { n++; idx.push([seen.get(rev), i]) }
    seen.set(fwd, i)
  }
  return { n, idx }
}
const retrace = R.map(t => retraceEdges(t.ring))
const retraceTiles = retrace.map((r, i) => r.n ? i : -1).filter(i => i >= 0)
const retraceEdgeTotal = retrace.reduce((s, r) => s + r.n, 0)
console.log(`\nRETRACE (ribbons.json)  tiles with >=1 retraced edge: ${retraceTiles.length} / ${R.length}   retraced edges total: ${retraceEdgeTotal}`)

// ---------- SEVERED, off shape.json — predicate 1 of claims-band-is-one-ring.mjs, verbatim.
const SC = 1e5
const unionAll = (rings) => {
  const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
  const c = new Clipper(); let n = 0
  for (const r of rings) if (r && r.length >= 3) {
    c.AddPath(r.map(p => ({ X: Math.round(p[0] * SC), Y: Math.round(p[1] * SC) })), PolyType.ptSubject, true); n++ }
  if (!n) return []
  const out = []
  c.Execute(ClipType.ctUnion, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out.map(p => p.map(q => [q.X / SC, q.Y / SC]))
}
const area = r => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i][0] * r[j][1] - r[j][0] * r[i][1] } return a / 2 }

const state = shape.map((st, ti) => {
  let out
  try { out = sectionPassTile(st, 0.381, { outer: 'LU', inner: 'SW' }, bc) }
  catch (e) { return { ti, cls: 'THREW', pieces: 0 } }
  const band = unionAll([...(out.Wacc || []), ...Object.values(out.tlByLu || {}).flat()])
  const outers = band.filter(r => r.length >= 3 && area(r) > 0.05)
  if (!outers.length) return { ti, cls: 'NOBAND', pieces: 0 }
  return { ti, cls: outers.length > 1 ? 'SEVERED' : 'ONERING', pieces: outers.length }
})
const cnt = c => state.filter(s => s.cls === c).length
console.log(`SEVERED (shape.json, predicate 1 only)  severed ${cnt('SEVERED')}  one-ring ${cnt('ONERING')}  no band ${cnt('NOBAND')}  threw ${cnt('THREW')}`)

// ---------- THE 2x2, over the proven join.
const rOf = new Map(pairs)          // shapeIdx -> ribbonIdx
const label = si => {
  const st = shape[si]
  const who = [...new Set((st.runs || []).map(r => r.skelId).filter(Boolean))].slice(0, 3).join('/')
  return `s${si}(r${rOf.get(si)}) ${who || '—'}`
}
const cells = { 'SEVERED×retrace': [], 'SEVERED×no': [], 'ONERING×retrace': [], 'ONERING×no': [], 'NOBAND×retrace': [], 'NOBAND×no': [] }
for (const s of state) {
  if (s.cls === 'THREW') continue
  const rt = retrace[rOf.get(s.ti)].n > 0
  cells[`${s.cls}×${rt ? 'retrace' : 'no'}`].push(s.ti)
}
const n = k => cells[k].length
console.log(`\n⭐ THE 2x2 — banded tiles only (the acceptance population)`)
console.log(`                  retrace   no retrace   total`)
console.log(`  severed         ${String(n('SEVERED×retrace')).padStart(7)}   ${String(n('SEVERED×no')).padStart(10)}   ${String(n('SEVERED×retrace') + n('SEVERED×no')).padStart(5)}`)
console.log(`  not severed     ${String(n('ONERING×retrace')).padStart(7)}   ${String(n('ONERING×no')).padStart(10)}   ${String(n('ONERING×retrace') + n('ONERING×no')).padStart(5)}`)
console.log(`  total           ${String(n('SEVERED×retrace') + n('ONERING×retrace')).padStart(7)}   ${String(n('SEVERED×no') + n('ONERING×no')).padStart(10)}`)
console.log(`\n  (separate class, never a pass) no band at all: retrace ${n('NOBAND×retrace')}  no retrace ${n('NOBAND×no')}`)

for (const k of Object.keys(cells)) {
  console.log(`\n  ${k}  (${cells[k].length})`)
  if (lists) for (const si of cells[k]) console.log(`     ${label(si)}${retrace[rOf.get(si)].n ? `  [${retrace[rOf.get(si)].n} retraced edge(s)]` : ''}`)
}

// ---------- SECONDARY: severed x producer
console.log(`\nSECONDARY — severed × producer`)
const prod = new Map()
for (const s of state) {
  if (s.cls === 'THREW') continue
  const p = shape[s.ti].producer || '(none)'
  const k = `${p}`
  if (!prod.has(k)) prod.set(k, { SEVERED: 0, ONERING: 0, NOBAND: 0 })
  prod.get(k)[s.cls]++
}
console.log(`  producer            severed  one-ring  no-band`)
for (const [k, v] of prod) console.log(`  ${k.padEnd(18)} ${String(v.SEVERED).padStart(7)} ${String(v.ONERING).padStart(9)} ${String(v.NOBAND).padStart(8)}`)

// ---------- Q5: of the severed, how many are DEAD-END tiles at all?
// Dead-end tip = a chain endpoint coordinate shared with NO other chain's points.
// A tile is a dead-end tile iff that exact coordinate is a VERTEX of its ring.
// ⛔ No proximity, no nearest-chain query — exact vertex identity only.
const occ = new Map()
for (const st of (ribbons.streets || [])) {
  if (st.disabled || !Array.isArray(st.points)) continue
  for (const p of st.points) {
    const k = vkey(p)
    if (!occ.has(k)) occ.set(k, new Set())
    occ.get(k).add(st.skelId || st.id)
  }
}
const tips = new Set()
for (const st of (ribbons.streets || [])) {
  if (st.disabled || !Array.isArray(st.points) || st.points.length < 2) continue
  for (const p of [st.points[0], st.points[st.points.length - 1]]) {
    const k = vkey(p)
    if (occ.get(k).size === 1) tips.add(k)
  }
}
const deadEndTile = R.map(t => t.ring.some(p => tips.has(vkey(p))))
console.log(`\nQ5 — dead-end tips (chain endpoint on no other chain): ${tips.size}`)
const q5 = cls => state.filter(s => s.cls === cls && deadEndTile[rOf.get(s.ti)]).length
console.log(`  tiles containing >=1 dead-end tip as a ring vertex: ${deadEndTile.filter(Boolean).length} / ${R.length}`)
console.log(`  of the SEVERED (${cnt('SEVERED')}): dead-end tiles ${q5('SEVERED')}  |  not dead-end ${cnt('SEVERED') - q5('SEVERED')}`)
console.log(`  of the ONE-RING (${cnt('ONERING')}): dead-end tiles ${q5('ONERING')}`)
console.log(`  of the NO-BAND (${cnt('NOBAND')}): dead-end tiles ${q5('NOBAND')}`)
const deTiles = state.filter(s => s.cls === 'SEVERED' && deadEndTile[rOf.get(s.ti)]).map(s => s.ti)
console.log(`  severed dead-end tiles: ${deTiles.map(t => 's' + t).join(' ')}`)
// cross-check: is dead-end-tile === retrace-tile?
const dSet = new Set(R.map((_, i) => i).filter(i => deadEndTile[i]))
const rSet = new Set(retraceTiles)
console.log(`  dead-end set vs retrace set: |D|=${dSet.size} |R|=${rSet.size} |D∩R|=${[...dSet].filter(i => rSet.has(i)).length}  D\\R=${[...dSet].filter(i => !rSet.has(i)).map(i=>'r'+i).join(',') || '—'}  R\\D=${[...rSet].filter(i => !dSet.has(i)).map(i=>'r'+i).join(',') || '—'}`)
