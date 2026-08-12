#!/usr/bin/env node
/**
 * WHICH CONSTRUCTION STEP PUTS THE NOTCH IN THE BLOCK SILHOUETTE?
 *
 * Jacob, 2026-08-11, on the Survey view of Park Place: "the spike defects are in
 * the survey." He is right — they are in the frozen block silhouette `iA`, not in
 * the ped FILL, and an earlier routing of them to the band-fold/capacity class was
 * wrong.
 *
 * MEASURED FIRST, so the target is bounded rather than described:
 *   8 notches, 2 tiles, map-wide, IDENTICAL in the live build and the baked artifact
 *   (so live == bake holds; this is not a freeze discrepancy):
 *     6 · [145.9, -872.9] · south-22nd · papin-street-0 · chouteau-avenue-0 · south-jefferson-avenue-0
 *     2 · [783.4,  101.0] · dillon-street · park-avenue-0 · dillon-drive · rutger-lane
 *
 * A NOTCH, defined so it can be counted rather than pointed at: a ring segment
 * under 2 m whose two ends each turn more than 40°, in OPPOSITE directions — a step
 * out and back. ⛔ Deliberately NOT an acute-angle test: an acute test finds needles
 * and returns 0 here, which is how I first mis-measured this and reported "no spikes
 * in iA" at a block that visibly has two.
 *
 * The silhouette passes through five steps. This counts notches after each, so the
 * one that INTRODUCES them is isolated rather than assumed:
 *   1 offset        `offsetRingVariable` — the per-edge parallel offset
 *   2 splice        the cul-de-sac keyhole splice (bounded to the turning-loop masks)
 *   3 despur-block  fold-spur strip on blockRings, adopted only if slivers drop
 *   4 fillet        `filletRings` — corner rounding, the step that becomes iA
 *   5 despur-iA     the second fold-spur strip, on iA
 *
 * ⛔ Read-only w.r.t. the repo; instruments a COPY. Anchors asserted 1× — a drifted
 *    anchor ABORTS, because a false zero would exonerate the wrong step.
 * ⛔ Runs the AUTHORED state (Rule 1); a silhouette defect measured on bare defaults
 *    is measuring a different map.
 *
 * Usage: node scratch/claims-notch-origin-bisect.mjs
 * → SURVEY §3 · SECTION §7.1 (a silhouette defect is Survey's, not Section's) · A10
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRCDIR = path.join(ROOT, 'src/lib')
const TG = path.join(SRCDIR, 'tileGround.js')

const SCAN = `((stage, rings) => { if (!globalThis.__nOn) return
  const turn = (a,b,c) => { const u=[b[0]-a[0],b[1]-a[1]], v=[c[0]-b[0],c[1]-b[1]]
    const lu=Math.hypot(u[0],u[1]), lv=Math.hypot(v[0],v[1]); if(!lu||!lv) return 0
    return Math.atan2((u[0]*v[1]-u[1]*v[0])/(lu*lv),(u[0]*v[0]+u[1]*v[1])/(lu*lv))*180/Math.PI }
  let n = 0; const at = []
  for (const r of rings || []) { const m = r.length; if (m < 4) continue
    for (let i=0;i<m;i++){ const A=r[(i-1+m)%m],B=r[i],C=r[(i+1)%m],D=r[(i+2)%m]
      const seg=Math.hypot(C[0]-B[0],C[1]-B[1]), t1=turn(A,B,C), t2=turn(B,C,D)
      if (seg<2.0 && Math.abs(t1)>40 && Math.abs(t2)>40 && Math.sign(t1)!==Math.sign(t2)) { n++; at.push([+B[0].toFixed(1),+B[1].toFixed(1)]) } } }
  const row = globalThis.__nRows[stage] || (globalThis.__nRows[stage] = { n:0, tiles:0, at:[] })
  row.n += n; if (n) { row.tiles++; row.at.push(...at.slice(0,4)) }
})`

const SITES = [
  { id: '1 offset', n: 1,
    find: `        blockRings = off`,
    repl: `        blockRings = off
        ;${SCAN}('1 offset', blockRings)` },
  { id: '2 splice', n: 1,
    find: `        blockRings = spliced`,
    repl: `        blockRings = spliced
        ;${SCAN}('2 splice', blockRings)` },
  { id: '3 despur-block', n: 1,
    find: `        blockRings = cleaned`,
    repl: `        blockRings = cleaned
        ;${SCAN}('3 despur-block', blockRings)` },
  { id: '4 fillet', n: 1,
    find: `    let iA = filletRings(blockRings, cornerRfn, fSink, _iaLabels, _fLabs)   // rounded asphalt-inner (curb line)`,
    repl: `    let iA = filletRings(blockRings, cornerRfn, fSink, _iaLabels, _fLabs)   // rounded asphalt-inner (curb line)
    ;${SCAN}('4 fillet', iA)` },
  { id: '5 despur-iA', n: 1,
    find: `        iA = cleaned`,
    repl: `        iA = cleaned
        ;${SCAN}('5 despur-iA', iA)` },
]

let src = fs.readFileSync(TG, 'utf8')
for (const s of SITES) {
  const hits = src.split(s.find).length - 1
  if (hits !== s.n) {
    console.error(`⛔ INSTRUMENT ANCHOR DRIFTED — '${s.id}' matched ${hits}×, expected ${s.n}.`)
    console.error(`   A false zero would exonerate the wrong step. Re-anchor first.`)
    process.exit(2)
  }
  src = src.split(s.find).join(s.repl)
}
src = `globalThis.__nRows = globalThis.__nRows || {}\n` + src
src = src.replace(/(from\s*['"])(\.[^'"]*)(['"])/g, (_, a, sp, z) => a + path.resolve(SRCDIR, sp) + z)
const dir = path.join(ROOT, 'scratch/.notch-probe')
fs.mkdirSync(dir, { recursive: true })
const f = path.join(dir, 'tileGround.notch.mjs')
fs.writeFileSync(f, src)
const { buildTileGround } = await import(f)

const rib = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const design = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/looks/lafayette-square/design.json')))
const quiet = f2 => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f2() } finally { console.log = l; console.warn = w } }

globalThis.__nRows = {}
globalThis.__nOn = true
quiet(() => buildTileGround(rib, { curbWidth: 0.381, stripMat: { outer: 'LU', inner: 'SW' }, blockCustoms: design.blockCustoms || {}, emitArtifact: true }))
globalThis.__nOn = false

console.log(`WHICH STEP PUTS THE NOTCH IN — lafayette-square, AUTHORED`)
console.log(`notch = a <2 m segment turning >40° in OPPOSITE directions at each end (a step out and back)\n`)
console.log(`   step               tiles reaching it   notches   first sites`)
let prev = null
for (const s of ['1 offset', '2 splice', '3 despur-block', '4 fillet', '5 despur-iA']) {
  const r = globalThis.__nRows[s]
  if (!r) { console.log(`   ${s.padEnd(18)}   — did not run on any tile`); continue }
  const flag = prev !== null && r.n > prev ? `  ⛔ +${r.n - prev} INTRODUCED HERE` : ''
  console.log(`   ${s.padEnd(18)} ${String(r.tiles).padStart(8)} ${String(r.n).padStart(12)}   ${[...new Set(r.at.map(String))].slice(0, 3).join(' ')}${flag}`)
  prev = r.n
}
console.log(`\n⛔ These steps are CONDITIONAL — despur only adopts its result when slivers drop,`)
console.log(`   and the splice only runs on a tile with a turning loop. A step that did not run on`)
console.log(`   the notched tile leaves the previous count standing, so read the TILES column`)
console.log(`   before reading any jump as a cause.`)
