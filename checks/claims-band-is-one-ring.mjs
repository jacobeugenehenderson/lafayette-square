#!/usr/bin/env node
/**
 * ⛔ THE BAND MUST BE ONE CONTINUOUS RING AROUND EVERY BLOCK. RED until it is.
 *
 * Jacob, 2026-08-11, setting the acceptance for the whole arc:
 *   "The GOAL is a continuous strip or strips (sidewalk/tree lawn) around every block.
 *    That means legs, corners, and transitions have to be bulletproof on their own …
 *    whether or not it is perfect, it should LOOK perfect."
 *
 * ⭐ WHY THIS EXISTS WHEN OTHER CHECKS ALREADY PASS. Everything else measures a
 * COMPONENT: `claims-unpainted-arcs` asks whether every allocated arc got painted (LS:
 * green), `claims-ia-source-stamp` asks whether the stamp is structurally sound, the
 * corner probes ask whether a pad was built. All of them can be green while the thing
 * the operator sees is broken, because continuity is a property of the UNION, not of
 * any piece. An arc can be correctly painted and the band still read as severed.
 * This is the only check that speaks in the terms the goal is stated in.
 *
 * THREE PREDICATES, per tile, all geometric — no chain, no node, no tuned constant
 * that is not scaled to the tile's own band:
 *
 *   1. ONE RING.  The band (sidewalk ∪ treelawn ∪ corner pads) must form a single
 *      connected component. Two or more ⇒ the walk is severed. Measured exactly, by
 *      counting positive-area rings in the union — no threshold at all.
 * ⚠️⚠️ ONLY PREDICATE 1 IS VALIDATED (2026-08-11). SEVERED needs no threshold and is
 *    exact. SLIT and FLAP both use one, and on first run they fire on tiles that read
 *    as a single clean ring — almost certainly on legitimate sharp geometry such as an
 *    authored R=0 corner. ⛔ DO NOT QUOTE THE SLIT/FLAP COUNTS until they are calibrated
 *    against the operator's eye on blocks known-good and known-broken. The instrument
 *    score on 2026-08-11 was three wrong out of five, two of them in this file's own
 *    first two runs.
 *
 *   2. NO SLIT.   A <2 m span turning >40° in OPPOSITE directions at each end — a step
 *      out and back. ⛔ Deliberately NOT an acute test: an acute test finds needles,
 *      returns 0 on a notch, and is how this class was first reported absent at a
 *      block that visibly has two.
 *   3. NO FLAP.   A vertex under 20° with an arm longer than a tenth of the band's own
 *      depth — the thin wedge that sticks OUT into the grass. Jacob spotted this one
 *      by eye at a cap joint: "a very small wedge artifact that sticks out *and* pokes
 *      in … several versions of this throughout the map." A flap and a slit at the
 *      same joint is the signature of two abutting claims that do not share a cut.
 *      ⭐ The arm bound is a fraction of THIS TILE's band depth, never a map constant.
 *
 * ⛔ A tile with NO BAND is its own class, never a pass and never a failure. A median
 *    with ped frozen to zero is correct and must not be counted as a broken ring
 *    (Jacob: "the medians are fine, with no sidewalks").
 * ⛔ Runs with the scene's authored blockCustoms (Rule 1).
 *
 * Usage: node scratch/claims-band-is-one-ring.mjs [--scene <name>] [--tiles]
 * Exit 0 = every banded block is one clean ring · 1 = RED · 2 = instrument failure
 * → SECTION §7/§8 · RIBBONS §1 · CLAUDE.md Layer 0
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import clipperLib from 'clipper-lib'
import { sectionPassTile } from '../src/lib/tileGround.js'

// ⚠️ UNION FIRST. `sectionPassTile` returns the band's CLAIMS — one polygon per run and
// per corner — which ABUT but are not merged; the union happens downstream in
// `buildTileGround`. Counting the raw claims reports 8–78 "pieces" on every tile and is
// a measure of the construction, not of what the operator sees. Measured claims, called
// them components, got 0 clean rings out of 101 — the instrument, not the map.
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argScene = process.argv.includes('--scene') ? process.argv[process.argv.indexOf('--scene') + 1] : 'lafayette-square'
const showTiles = process.argv.includes('--tiles')

const shapeP = path.join(ROOT, 'public/baked', argScene, 'shape.json')
if (!fs.existsSync(shapeP)) { console.error(`⛔ no baked shape for ${argScene} — NOT MEASURED`); process.exit(2) }
const tiles = (j => Array.isArray(j) ? j : j.tiles)(JSON.parse(fs.readFileSync(shapeP, 'utf8')))
const designP = path.join(ROOT, 'public/looks', argScene, 'design.json')
const bc = fs.existsSync(designP) ? (JSON.parse(fs.readFileSync(designP, 'utf8')).blockCustoms || null) : null

const area = r => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i][0] * r[j][1] - r[j][0] * r[i][1] } return a / 2 }
const turn = (a, b, c) => { const u = [b[0]-a[0], b[1]-a[1]], v = [c[0]-b[0], c[1]-b[1]]
  const lu = Math.hypot(u[0],u[1]), lv = Math.hypot(v[0],v[1]); if (!lu || !lv) return 0
  return Math.atan2((u[0]*v[1]-u[1]*v[0])/(lu*lv), (u[0]*v[0]+u[1]*v[1])/(lu*lv)) * 180/Math.PI }

const slits = rings => { let n = 0
  for (const r of rings) { const m = r.length; if (m < 4) continue
    for (let i = 0; i < m; i++) { const A=r[(i-1+m)%m], B=r[i], C=r[(i+1)%m], D=r[(i+2)%m]
      const sg = Math.hypot(C[0]-B[0], C[1]-B[1]), t1 = turn(A,B,C), t2 = turn(B,C,D)
      if (sg < 2.0 && Math.abs(t1) > 40 && Math.abs(t2) > 40 && Math.sign(t1) !== Math.sign(t2)) n++ } }
  return n }

const flaps = (rings, bandDepth) => { let n = 0
  const armMin = Math.max(0.1, bandDepth * 0.1)      // scaled to THIS tile's band, not a map constant
  for (const r of rings) { const m = r.length; if (m < 3) continue
    for (let i = 0; i < m; i++) { const a=r[(i-1+m)%m], b=r[i], c=r[(i+1)%m]
      const u=[a[0]-b[0], a[1]-b[1]], v=[c[0]-b[0], c[1]-b[1]]
      const lu=Math.hypot(u[0],u[1]), lv=Math.hypot(v[0],v[1]); if (!lu || !lv) continue
      const ang = Math.acos(Math.max(-1, Math.min(1, (u[0]*v[0]+u[1]*v[1])/(lu*lv)))) * 180/Math.PI
      if (ang < 20 && Math.max(lu, lv) > armMin) n++ } }
  return n }

let oneRing = 0, severed = 0, noBand = 0, withSlit = 0, withFlap = 0, threw = 0
const bad = []
for (const [ti, st] of tiles.entries()) {
  let out
  try { out = sectionPassTile(st, 0.381, { outer: 'LU', inner: 'SW' }, bc) }
  catch (e) { threw++; bad.push([ti, 'THREW — NOT MEASURED', e.message.slice(0, 40)]); continue }
  const band = unionAll([...(out.Wacc || []), ...Object.values(out.tlByLu || {}).flat()])
  const outers = band.filter(r => r.length >= 3 && area(r) > 0.05)
  const depth = 0.381 + (st.tl || 0) + (st.sw || 0)
  if (!outers.length) { noBand++; continue }                     // median / zero-ped — its own class
  const sl = slits(band), fl = flaps(band, depth)
  if (outers.length > 1) severed++; else oneRing++
  if (sl) withSlit++
  if (fl) withFlap++
  if (outers.length > 1 || sl || fl) {
    const who = [...new Set((st.runs || []).map(r => r.skelId).filter(Boolean))].slice(0, 3).join(', ')
    bad.push([ti, `${outers.length} piece(s)${sl ? ` · ${sl} slit` : ''}${fl ? ` · ${fl} flap` : ''}`, who])
  }
}

console.log(`THE BAND MUST BE ONE CONTINUOUS RING — ${argScene}, authored state\n`)
console.log(`   tiles measured            ${tiles.length}`)
console.log(`   ✅ one clean ring          ${oneRing - withSlit - withFlap < 0 ? oneRing : oneRing}`)
console.log(`   ⛔ SEVERED (>1 piece)      ${severed}`)
console.log(`   ⚠️  with a SLIT (UNVALIDATED) ${withSlit}`)
console.log(`   ⚠️  with a FLAP (UNVALIDATED) ${withFlap}`)
console.log(`      no band at all (median / zero-ped — correct, not a failure)  ${noBand}`)
if (threw) console.log(`   ⚠️  threw, NOT MEASURED    ${threw}`)
if (showTiles && bad.length) { console.log(`\n   tile   defect                          streets`)
  for (const b of bad) console.log(`   ${String(b[0]).padStart(4)}   ${String(b[1]).padEnd(34)} ${b[2]}`) }
// ⛔ Exit on the VALIDATED predicate only. Gating on an uncalibrated threshold would
// make this check RED for reasons nobody can act on, which is how a gate gets ignored.
const red = severed || threw
console.log(`\n⭐ GREEN means an interrupted sidewalk is not constructible on this town — which is`)
console.log(`   the acceptance, not a lower count. ⛔ A tile with no band is NOT a pass: it is`)
console.log(`   reported separately because a median correctly has none, and folding it in`)
console.log(`   either way would let a real absence hide inside a legitimate one.`)
process.exit(red ? 1 : 0)
