#!/usr/bin/env node
/**
 * READ-ONLY. Does `claims-band-is-one-ring.mjs` feed `sectionPassTile` the SAME
 * inputs the live render and the bake feed it — and is its "band" the object the
 * operator sees?
 *
 * Writes nothing, edits nothing, re-bakes nothing. Re-implements the claims
 * probe's union + SEVERED predicate verbatim (it is not imported, so the original
 * stays untouched) and re-runs it under each live parameterisation.
 *
 * Usage: node scratch/bandgate-parameterisation.mjs [--scene <name>]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import clipperLib from 'clipper-lib'
import { sectionPassTile } from '../src/lib/tileGround.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argScene = process.argv.includes('--scene') ? process.argv[process.argv.indexOf('--scene') + 1] : 'lafayette-square'

const shapeP = path.join(ROOT, 'public/baked', argScene, 'shape.json')
if (!fs.existsSync(shapeP)) { console.error(`⛔ no baked shape for ${argScene} — NOT MEASURED`); process.exit(2) }
const tiles = (j => Array.isArray(j) ? j : j.tiles)(JSON.parse(fs.readFileSync(shapeP, 'utf8')))
const designP = path.join(ROOT, 'public/looks', argScene, 'design.json')
const design = fs.existsSync(designP) ? JSON.parse(fs.readFileSync(designP, 'utf8')) : {}
const bcRaw = design.blockCustoms || null

// ── the claims probe's own machinery, copied verbatim ────────────────────────
const SC = 1e5
const unionAll = (rings) => {
  const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
  const c = new Clipper(); let n = 0
  for (const r of rings) if (r && r.length >= 3) {
    c.AddPath(r.map(p => ({ X: Math.round(p[0]*SC), Y: Math.round(p[1]*SC) })), PolyType.ptSubject, true); n++ }
  if (!n) return []
  const out = []
  c.Execute(ClipType.ctUnion, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out.map(p => p.map(q => [q.X/SC, q.Y/SC]))
}
const area = r => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i][0]*r[j][1] - r[j][0]*r[i][1] } return a/2 }

const bandRings = (out) => unionAll([...(out.Wacc || []), ...Object.values(out.tlByLu || {}).flat()])
const outersOf  = (band) => band.filter(r => r.length >= 3 && area(r) > 0.05)

// One variant → { banded, oneRing, severed, noBand, threw, severedSet }
function run(label, cw, stripMat, bc) {
  let oneRing = 0, severed = 0, noBand = 0, threw = 0
  const severedSet = new Set(), pieces = new Map()
  for (const [ti, st] of tiles.entries()) {
    let out
    try { out = sectionPassTile(st, cw, stripMat, bc) } catch { threw++; continue }
    const band = bandRings(out)
    const outers = outersOf(band)
    if (!outers.length) { noBand++; continue }
    if (outers.length > 1) { severed++; severedSet.add(ti); pieces.set(ti, outers) } else oneRing++
  }
  return { label, cw, bc: bc === bcRaw ? 'raw' : (bc ? 'variant' : 'null'), oneRing, severed, noBand, threw, banded: oneRing + severed, severedSet, pieces }
}

const LU_SW = { outer: 'LU', inner: 'SW' }

// ── MAXIMAL blockCustoms expansion — an UPPER BOUND on what the live render does.
// The render passes expandCustomsAcrossFeSegOrds(blockCustoms, fes): each fe's
// custom, stored at min(fe.segOrds), copied to that fe's OTHER segOrds. The fes
// live only in the live V2 path (buildBlockGeometryV2), so they cannot be rebuilt
// from the frozen artifact. This copies each authored custom to EVERY segOrd that
// appears in any tile run for the same (skelId, side) — a strict superset of the
// real per-fe expansion. If baseline and this agree, the divergence is immaterial.
function maximalExpansion(bc) {
  if (!bc) return null
  const present = new Map()   // skelId|side -> Set(segOrd)
  for (const st of tiles) for (const r of (st.runs || [])) {
    if (!r.skelId || r.side == null || !Number.isFinite(r.segOrd)) continue
    const k = r.skelId + '|' + r.side
    if (!present.has(k)) present.set(k, new Set())
    present.get(k).add(r.segOrd)
  }
  const out = JSON.parse(JSON.stringify(bc))
  let copied = 0
  for (const skel of Object.keys(bc)) for (const side of Object.keys(bc[skel] || {})) {
    const segs = present.get(skel + '|' + side)
    if (!segs) continue
    for (const seg of Object.keys(bc[skel][side])) {
      const c = bc[skel][side][seg]
      if (!c || Number(seg) < 0) continue        // negative = reserved CAP slot, never spread
      for (const so of segs) {
        if (String(so) === String(seg)) continue
        if (out[skel][side][so]) continue        // authored — never clobber
        out[skel][side][so] = c; copied++
      }
    }
  }
  return { bc: out, copied }
}

console.log(`BANDGATE — is claims-band-is-one-ring parameterised like the producer?  (${argScene})\n`)
console.log(`  design.json curbWidth            ${design.curbWidth}`)
console.log(`  probe literal                    0.381`)
console.log(`  CURB_WIDTH fallback constant     ${6 * 0.0254}`)
console.log(`  blockCustoms chains authored     ${bcRaw ? Object.keys(bcRaw).length : 0}\n`)

const exp = maximalExpansion(bcRaw)
console.log(`  maximal (upper-bound) expansion would add ${exp ? exp.copied : 0} slot(s)\n`)

const variants = [
  run('A  baseline — probe as written (cw=0.381, raw customs)', 0.381, LU_SW, bcRaw),
  run('B  cw = design.curbWidth (the bake\'s value)', Number.isFinite(design.curbWidth) ? design.curbWidth : 6*0.0254, LU_SW, bcRaw),
  run('C  cw = CURB_WIDTH fallback (a scene with no authored curbWidth)', 6 * 0.0254, LU_SW, bcRaw),
  run('D  customs OFF (Layer 0 rule 1 sensitivity — NOT a live path)', 0.381, LU_SW, null),
  run('E  customs MAXIMALLY expanded (upper bound on the live render)', 0.381, LU_SW, exp ? exp.bc : null),
  run('F  stripMat flipped {outer:SW, inner:LU}', 0.381, { outer: 'SW', inner: 'LU' }, bcRaw),
]
console.log('  variant                                                              banded  1-ring  SEVERED  no-band  threw')
for (const v of variants) {
  console.log(`  ${v.label.padEnd(66)} ${String(v.banded).padStart(6)} ${String(v.oneRing).padStart(7)} ${String(v.severed).padStart(8)} ${String(v.noBand).padStart(8)} ${String(v.threw).padStart(6)}`)
}

// ── THE DEFINITION CHECK ────────────────────────────────────────────────────
// (1) Is a "severed" tile materially severed — is there a GAP between the pieces?
// (2) The producer (sectionOpen) unions W across ALL tiles and clips to the
//     boundary stencil; the probe unions ONE tile at a time. Do a tile's pieces
//     rejoin in the whole-map union the operator actually sees?
const A = variants[0]
const segDist = (p, a, b) => {
  const vx = b[0]-a[0], vy = b[1]-a[1], wx = p[0]-a[0], wy = p[1]-a[1]
  const L = vx*vx + vy*vy; let t = L ? (wx*vx + wy*vy)/L : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0]-(a[0]+t*vx), p[1]-(a[1]+t*vy))
}
const ringDist = (r1, r2) => {   // min distance between two closed rings
  let m = Infinity
  for (const p of r1) for (let i = 0; i < r2.length; i++) {
    const d = segDist(p, r2[i], r2[(i+1)%r2.length]); if (d < m) m = d }
  for (const p of r2) for (let i = 0; i < r1.length; i++) {
    const d = segDist(p, r1[i], r1[(i+1)%r1.length]); if (d < m) m = d }
  return m
}
const pointInRing = (p, r) => { let c = false
  for (let i = 0, j = r.length-1; i < r.length; j = i++) {
    if (((r[i][1] > p[1]) !== (r[j][1] > p[1])) &&
        (p[0] < (r[j][0]-r[i][0]) * (p[1]-r[i][1]) / (r[j][1]-r[i][1]) + r[i][0])) c = !c }
  return c }
const interiorProbe = (r) => {   // a point strictly inside the ring
  const sgn = Math.sign(area(r)) || 1
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i+1)%r.length]
    const dx = b[0]-a[0], dy = b[1]-a[1], L = Math.hypot(dx, dy); if (L < 1e-6) continue
    const nx = (-dy/L) * sgn, ny = (dx/L) * sgn
    for (const eps of [1e-3, 1e-2, 5e-2]) {
      const p = [(a[0]+b[0])/2 + nx*eps, (a[1]+b[1])/2 + ny*eps]
      if (pointInRing(p, r)) return p
    }
  }
  return null
}

// whole-map union — the object the producer paints
const allRings = []
for (const st of tiles) {
  let out; try { out = sectionPassTile(st, 0.381, LU_SW, bcRaw) } catch { continue }
  allRings.push(...(out.Wacc || []), ...Object.values(out.tlByLu || {}).flat())
}
const globalBand = outersOf(unionAll(allRings))

let zeroGap = 0, realGap = 0, unprobed = 0, rejoined = 0, stillSplit = 0
const gaps = []
for (const ti of A.severedSet) {
  const ps = A.pieces.get(ti)
  let minGap = Infinity
  for (let i = 0; i < ps.length; i++) for (let j = i+1; j < ps.length; j++) {
    const d = ringDist(ps[i], ps[j]); if (d < minGap) minGap = d }
  gaps.push([ti, minGap, ps.length])
  if (minGap < 1e-6) zeroGap++; else realGap++
  // whole-map containment
  const comps = new Set(); let ok = true
  for (const p of ps) {
    const q = interiorProbe(p)
    if (!q) { ok = false; break }
    let found = -1
    for (let g = 0; g < globalBand.length; g++) if (pointInRing(q, globalBand[g])) { found = g; break }
    if (found < 0) { ok = false; break }
    comps.add(found)
  }
  if (!ok) unprobed++
  else if (comps.size === 1) rejoined++
  else stillSplit++
}

console.log(`\n  ── the SEVERED verdict, examined ──`)
console.log(`  severed tiles (variant A)                                   ${A.severedSet.size}`)
console.log(`    pieces separated by a MATERIAL gap (> 1 µm)               ${realGap}`)
console.log(`    pieces touching at gap 0.000 (a topological split only)   ${zeroGap}`)
console.log(`  in the WHOLE-MAP union the producer paints:`)
console.log(`    all pieces land in ONE global component (operator sees one band)  ${rejoined}`)
console.log(`    still in different global components                              ${stillSplit}`)
console.log(`    could not be probed                                              ${unprobed}`)

// ── set identity, not just counts ───────────────────────────────────────────
const diff = (x, y) => [...x].filter(t => !y.has(t))
for (const v of variants.slice(1)) {
  const only = diff(A.severedSet, v.severedSet), extra = diff(v.severedSet, A.severedSet)
  console.log(`\n  set vs A — ${v.label}`)
  console.log(`    same set: ${only.length === 0 && extra.length === 0 ? 'YES' : 'NO'}   in A only: [${only.join(',')}]   in ${v.label[0]} only: [${extra.join(',')}]`)
}

// ── is the 0.000 contact a POINT PINCH or a shared EDGE clipper failed to merge? ──
// Sample each piece's perimeter and measure how much of it lies within 1 µm of a
// sibling piece. Near-zero total length ⇒ the pieces meet at isolated vertices
// (a pinch: continuous paint, zero-width throat). Non-zero length ⇒ a shared
// border the union did not dissolve.
const STEP = 0.02
let pinchOnly = 0, sharedEdge = 0
const contact = []
for (const ti of A.severedSet) {
  const ps = A.pieces.get(ti)
  let contactLen = 0, clusters = 0
  for (let i = 0; i < ps.length; i++) {
    const others = ps.filter((_, k) => k !== i)
    let prevOn = false
    for (let e = 0; e < ps[i].length; e++) {
      const a = ps[i][e], b = ps[i][(e+1)%ps[i].length]
      const L = Math.hypot(b[0]-a[0], b[1]-a[1]); if (L < 1e-9) continue
      const n = Math.max(1, Math.ceil(L / STEP))
      for (let s = 0; s < n; s++) {
        const t = (s + 0.5) / n, p = [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t]
        let d = Infinity
        for (const o of others) for (let j = 0; j < o.length; j++) {
          const dd = segDist(p, o[j], o[(j+1)%o.length]); if (dd < d) d = dd }
        const on = d < 1e-6
        if (on) { contactLen += L / n; if (!prevOn) clusters++ }
        prevOn = on
      }
    }
  }
  contact.push([ti, contactLen, clusters, ps.length])
  if (contactLen < 0.01) pinchOnly++; else sharedEdge++
}
console.log(`\n  ── the 0.000-gap contacts, characterised (sampled at ${STEP} m) ──`)
console.log(`    contact is effectively a POINT PINCH (<1 cm of shared border)   ${pinchOnly}`)
console.log(`    pieces share a real BORDER the union did not dissolve           ${sharedEdge}`)

// Is one positive-area piece NESTED inside another (i.e. the "second ring" sits in
// the first's hole)? A containment, not a severance of the walk. Measured, not assumed.
let nested = 0
for (const ti of A.severedSet) {
  const ps = A.pieces.get(ti)
  let anyIn = false
  for (let i = 0; i < ps.length && !anyIn; i++) {
    const q = interiorProbe(ps[i]); if (!q) continue
    for (let j = 0; j < ps.length; j++) if (j !== i && pointInRing(q, ps[j])) { anyIn = true; break }
  }
  if (anyIn) nested++
}
console.log(`    at least one piece NESTED inside another piece's outline        ${nested}`)

gaps.sort((a, b) => a[1] - b[1])
const cByTi = new Map(contact.map(c => [c[0], c]))
console.log(`\n  tile   pieces   min gap (m)   shared-border length (m)   contact runs`)
for (const [ti, g, n] of gaps) {
  const c = cByTi.get(ti) || [ti, 0, 0]
  console.log(`  ${String(ti).padStart(4)}   ${String(n).padStart(6)}   ${g.toFixed(6).padStart(11)}   ${c[1].toFixed(3).padStart(22)}   ${String(c[2]).padStart(11)}`)
}
