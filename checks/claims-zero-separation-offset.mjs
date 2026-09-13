#!/usr/bin/env node
/**
 * READ-ONLY. Three questions, none of which has been measured:
 *
 *  A. THE QUANTIZATION FLOOR. Clipper is integer-space and both converters round
 *     (`Math.round(x*SCALE)`). At what separation do two "distinct" nodes become
 *     the SAME IntPoint? Floors differ by stage: derive.js SCALE=100, tileGround/
 *     buildPathRibbons SCALE=1000.
 *
 *  B. DOES THE STROKE HANDLE ZERO SEPARATION?  `RIBBONS §1` carries this as the one
 *     open engineering question against the primitive-lanes model. Two coincident
 *     side-chains, offset and unioned.
 *
 *  C. DOES THE HOMUNCULUS OFFSET?  Stamp the bare chains as a zero-area CLOSED ring
 *     (out-and-back = the doubled-edge walk) and offset it as etClosedPolygon.
 *     GROUND TRUTH = the same polyline offset as an OPEN path (etOpenRound), which is
 *     what buildPathRibbons.js:114 already ships. If the two agree, the degenerate
 *     ring is a working primitive and no epsilon is needed.
 *
 * Usage: node scratch/claims-zero-separation-offset.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import clipperLib from 'clipper-lib'

const { ClipperOffset, Clipper, JoinType, EndType, ClipType, PolyType, PolyFillType } = clipperLib
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ---- read the scales out of the SOURCE, never restate them -------------------
function readScale(rel, re) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  const m = src.match(re)
  if (!m) throw new Error(`SCALE not found in ${rel} — probe is stale, fix it`)
  return { file: rel, scale: Number(m[1]) }
}
const SCALES = [
  readScale('cartograph/derive.js', /^const SCALE = (\d+)/m),
  readScale('src/lib/tileGround.js', /^const SCALE = (\d+)/m),
  readScale('src/lib/buildPathRibbons.js', /^const SCALE = (\d+)/m),
]

const area = ring => {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length
    a += ring[i].X * ring[j].Y - ring[j].X * ring[i].Y
  }
  return Math.abs(a / 2)
}
const totalArea = (paths, S) => paths.reduce((s, p) => s + area(p), 0) / (S * S)
const toC = (p, S) => ({ X: Math.round(p[0] * S), Y: Math.round(p[1] * S) })

function offsetOpen(pts, hw, S, arcTol) {
  const co = new ClipperOffset(2.0, arcTol)
  co.AddPath(pts.map(p => toC(p, S)), JoinType.jtRound, EndType.etOpenRound)
  const out = []; co.Execute(out, hw * S)
  return out
}
function offsetClosed(ring, hw, S, arcTol, jt = JoinType.jtRound) {
  const co = new ClipperOffset(2.0, arcTol)
  co.AddPath(ring.map(p => toC(p, S)), jt, EndType.etClosedPolygon)
  const out = []; co.Execute(out, hw * S)
  return out
}
// the doubled-edge walk of a PATH = out and back over the same vertices
const homunculus = pts => [...pts, ...pts.slice(0, -1).reverse()]

const len = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]); return L }

// ============================================================ A. THE FLOOR
console.log('A. QUANTIZATION FLOOR — when do two distinct nodes become one IntPoint?')
console.log('   (scales read live from source)')
for (const { file, scale } of SCALES) console.log(`     ${String(scale).padStart(5)}  ${file}   → unit = ${(1/scale).toFixed(4)} m`)
console.log('')
const EPS = [1e-5, 1e-4, 5e-4, 1e-3, 5e-3, 1e-2, 5e-2]
console.log('     eps(m)   ' + SCALES.map(s => `S=${s.scale}`.padStart(10)).join(''))
for (const e of EPS) {
  const cells = SCALES.map(({ scale }) => {
    const a = toC([0, 0], scale), b = toC([e, 0], scale)
    return (a.X === b.X && a.Y === b.Y ? 'COLLAPSED' : 'distinct').padStart(10)
  })
  console.log(`     ${e.toExponential(0).padStart(7)}   ` + cells.join(''))
}
console.log('')

// ============================================================ B + C fixtures
const FIX = {
  straight: [[0, 0], [60, 0]],
  bent:     [[0, 0], [40, 0], [70, 30]],
  hook:     [[0, 0], [40, 0], [70, 30], [70, 70]],
}
const HW = 6.0

console.log('B. ZERO SEPARATION — two COINCIDENT side-chains, each stroked, then unioned.')
console.log('   PASS = union area equals the single-chain stroke (they are the same road).')
for (const S of [100, 1000]) {
  const arcTol = 0.01 * S
  for (const [name, pts] of Object.entries(FIX)) {
    const one = offsetOpen(pts, HW, S, arcTol)
    const A = offsetOpen(pts, HW, S, arcTol)
    const B = offsetOpen([...pts].reverse(), HW, S, arcTol)   // the opposite-direction twin
    const cl = new Clipper()
    cl.AddPaths(A, PolyType.ptSubject, true)
    cl.AddPaths(B, PolyType.ptClip, true)
    const un = []
    const ok = cl.Execute(ClipType.ctUnion, un, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
    const a1 = totalArea(one, S), a2 = totalArea(un, S)
    const d = Math.abs(a1 - a2)
    console.log(`     S=${String(S).padEnd(5)} ${name.padEnd(9)} rings ${String(one.length)}→${String(un.length)}  ` +
      `single ${a1.toFixed(3)} m²  union ${a2.toFixed(3)} m²  Δ ${d.toFixed(6)}  ` +
      `${ok && un.length > 0 && d < 1e-3 ? 'PASS' : 'FAIL'}`)
  }
}
console.log('')

console.log('C. THE HOMUNCULUS — zero-area CLOSED ring offset as etClosedPolygon.')
console.log('   GROUND TRUTH = the same polyline as an OPEN path (etOpenRound, what we ship).')
for (const S of [100, 1000]) {
  const arcTol = 0.01 * S
  for (const [name, pts] of Object.entries(FIX)) {
    const truth = offsetOpen(pts, HW, S, arcTol)
    const ring = homunculus(pts)
    const rA = area(ring.map(p => toC(p, S))) / (S * S)
    const got = offsetClosed(ring, HW, S, arcTol)
    const a1 = totalArea(truth, S), a2 = totalArea(got, S)
    const d = Math.abs(a1 - a2)
    console.log(`     S=${String(S).padEnd(5)} ${name.padEnd(9)} ringArea ${rA.toFixed(6)}  ` +
      `open ${a1.toFixed(3)} m²  closed ${String(got.length)} ring(s) ${a2.toFixed(3)} m²  Δ ${d.toFixed(4)}  ` +
      `${got.length > 0 && d < 0.05 ? 'PASS' : 'FAIL'}`)
  }
}
console.log('')

// a TREE — a stem with two branches. The doubled-edge walk of a tree is ONE closed ring.
console.log('C2. A TREE (stem + 2 branches) — the doubled-edge walk is ONE ring. Offset it.')
const stem = [[0, 0], [40, 0]]
const bA = [[40, 0], [70, 25]]
const bB = [[40, 0], [70, -25]]
// Euler tour of the doubled tree: stem out, branch A out+back, branch B out+back, stem back
const tree = [...stem, ...bA.slice(1), ...bA.slice(0, -1).reverse(),
              ...bB.slice(1), ...bB.slice(0, -1).reverse(), ...stem.slice(0, -1).reverse()]
for (const S of [100, 1000]) {
  const arcTol = 0.01 * S
  const got = offsetClosed(tree, HW, S, arcTol)
  // truth = union of the three legs stroked independently
  const cl = new Clipper()
  for (const leg of [stem, bA, bB]) cl.AddPaths(offsetOpen(leg, HW, S, arcTol), PolyType.ptSubject, true)
  const un = []
  cl.Execute(ClipType.ctUnion, un, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  const a1 = totalArea(un, S), a2 = totalArea(got, S)
  console.log(`     S=${String(S).padEnd(5)} ringArea ${(area(tree.map(p=>toC(p,S)))/(S*S)).toFixed(6)}  ` +
    `union-of-legs ${a1.toFixed(3)} m²  homunculus ${String(got.length)} ring(s) ${a2.toFixed(3)} m²  ` +
    `Δ ${Math.abs(a1-a2).toFixed(4)}  ${got.length > 0 && Math.abs(a1-a2) < 0.05 ? 'PASS' : 'FAIL'}`)
}
console.log('')

// ============================================================ D. REAL LS SPURS
console.log('D. REAL DATA — LS dead-end spur chains from src/data/ribbons.json.')
const rib = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json'), 'utf8'))
// degree-1 endpoints from junctionMap
const deg = new Map()
const key = p => `${Math.round(p[0]*1e3)},${Math.round(p[1]*1e3)}`
for (const st of rib.streets) {
  for (const p of [st.points[0], st.points[st.points.length-1]]) deg.set(key(p), (deg.get(key(p))||0)+1)
}
const spurs = rib.streets.filter(st => {
  const a = deg.get(key(st.points[0])), b = deg.get(key(st.points[st.points.length-1]))
  return (a === 1 || b === 1) && st.points.length >= 2
})
console.log(`   spur chains (>=1 degree-1 endpoint): ${spurs.length} of ${rib.streets.length}`)
let pass = 0, empty = 0, offArea = 0
for (const S of [100, 1000]) {
  pass = 0; empty = 0; offArea = 0
  const emptyPts = new Set(), offList = []
  const arcTol = 0.01 * S
  for (const st of spurs) {
    const m = st.measure || {}
    const hwL = m.left?.pavementHW ?? m.pavementHW ?? 5, hwR = m.right?.pavementHW ?? m.pavementHW ?? 5
    const hw = (hwL + hwR) / 2
    if (!(hw > 0)) continue
    const truth = offsetOpen(st.points, hw, S, arcTol)
    const got = offsetClosed(homunculus(st.points), hw, S, arcTol)
    const a1 = totalArea(truth, S), a2 = totalArea(got, S)
    const rel = a1 > 0 ? Math.abs(a1 - a2) / a1 : (a2 > 0 ? 1 : 0)
    if (got.length === 0) { empty++; emptyPts.add(st.points.length) }
    else if (rel >= 0.01) { offArea++; if (offList.length < 6) offList.push(`${st.skelId} pts=${st.points.length} rel=${(rel*100).toFixed(2)}%`) }
    else pass++
  }
  console.log(`     S=${String(S).padEnd(5)} PASS ${pass}   EMPTY (0 rings) ${empty}   area-mismatch>1% ${offArea}`)
  console.log(`        EMPTY set — chain point-counts observed: {${[...emptyPts].sort((a,b)=>a-b).join(', ')}}`)
  for (const f of offList) console.log(`        area-mismatch  ${f}`)
}

// ---- THE PREDICATE. A 2-point chain's doubled walk is [A,B,A] = TWO distinct
// vertices, below Clipper's 3-vertex minimum for a closed polygon → dropped SILENTLY.
// (Collinearity is NOT the cause: 3- and 5-point collinear rings both survive.)
const twoPt = spurs.filter(s => s.points.length === 2).length
const allTwoPt = rib.streets.filter(s => s.points.length === 2).length
console.log(`\n   PREDICATE: homunculus returns ZERO rings <=> the chain has exactly 2 points.`)
console.log(`     spur chains with exactly 2 points : ${twoPt} of ${spurs.length}`)
console.log(`     ALL streets with exactly 2 points : ${allTwoPt} of ${rib.streets.length}`)
console.log(`   Control (S=1000, hw=6): 2pt=${(()=>{const co=new ClipperOffset(2,10);co.AddPath(homunculus([[0,0],[60,0]]).map(p=>toC(p,1000)),JoinType.jtRound,EndType.etClosedPolygon);const o=[];co.Execute(o,6000);return o.length})()} rings  ` +
  `3pt-COLLINEAR=${(()=>{const co=new ClipperOffset(2,10);co.AddPath(homunculus([[0,0],[30,0],[60,0]]).map(p=>toC(p,1000)),JoinType.jtRound,EndType.etClosedPolygon);const o=[];co.Execute(o,6000);return o.length})()} rings  <- collinearity is NOT the cause`)
