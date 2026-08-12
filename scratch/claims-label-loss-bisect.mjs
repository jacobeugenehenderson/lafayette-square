#!/usr/bin/env node
/**
 * WHERE DOES THE OWNER LABEL GET LOST?
 *
 * MEASURED FIRST (this is the premise, and it is not a guess):
 *   LS carries 156 iA vertices whose `iaEdge` stamp is null — 137 m of curb across
 *   tiles 26 and 35. ⛔ NONE of them is inside a cul-de-sac bulb disc; the furthest
 *   is 306 m from any tip. So the reason written at the splice site — "the splice
 *   mints vertices with no ring-edge source, INSIDE the discs … the unmatched ones
 *   sit 0.04–0.61 mm from a boundary" — does not describe this population.
 *
 * ⭐ AND JACOB'S PREMISE HOLDS: the Survey draws the street correctly. Nothing here
 *   is about geometry. The curb is right; the LABEL riding on it is being dropped.
 *
 * The label crosses five stages between the offset that mints it and the artifact.
 * This counts nulls after each, so the loss is ISOLATED rather than attributed to
 * the documented suspect:
 *   1 offset-labels     the offset emits one source ring-edge index per iA vertex
 *   2 keyhole-splice    exact-coordinate re-attach across the cul-de-sac splice
 *   3 blockRing-despur  fold-spur removal remaps labels through `tracked.src`
 *   4 fillet            filletRings densifies the ring and carries labels across
 *   5 iA-despur         a second fold-spur removal, same remap
 *
 * Nulls should be 0 until the stage that introduces them. The first stage with a
 * nonzero count IS the site.
 *
 * ⛔ Read-only w.r.t. the repo; instruments a COPY. Every anchor asserted 1×, so a
 *    drifted anchor ABORTS rather than printing a false zero.
 * ⛔ Runs LS in BOTH the authored and bare-default state (Rule 1) — a label bug that
 *    only appears in one of them is a different bug.
 *
 * Usage: node scratch/claims-label-loss-bisect.mjs
 * → SECTION §7 · ROADMAP A10 ③ · project_polygon_must_ask_the_stamp
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRCDIR = path.join(ROOT, 'src/lib')
const TG = path.join(SRCDIR, 'tileGround.js')

const COUNT = `((s) => { if (!globalThis.__labOn) return
  const L = _iaLabels
  let v = 0, n = 0
  if (Array.isArray(L)) for (const a of L) { if (!Array.isArray(a)) continue; for (const x of a) { v++; if (!Number.isInteger(x)) n++ } }
  const row = globalThis.__labRows[s] || (globalThis.__labRows[s] = { verts: 0, nulls: 0, tiles: 0, tilesWithNull: 0 })
  row.verts += v; row.nulls += n; row.tiles++; if (n) row.tilesWithNull++
})`

const SITES = [
  // ⚠️ The anchor MUST span the else — this site is an if/else pair and inserting
  // between the two halves is a syntax error, not a measurement.
  { id: '1 offset-labels', n: 1,
    find: [
      '      if (_offStamp.labels) _iaLabels = _offStamp.labels',
      '      else _iaNo = `offset:${_offStamp.refused || \'no-labels\'}`',
    ].join('\n'),
    repl: [
      '      if (_offStamp.labels) _iaLabels = _offStamp.labels',
      '      else _iaNo = `offset:${_offStamp.refused || \'no-labels\'}`',
      `      ;${COUNT}('1 offset-labels')`,
    ].join('\n') },
  { id: '2 keyhole-splice', n: 1,
    find: `          _iaSpliced = true`,
    repl: `          _iaSpliced = true
          ;${COUNT}('2 keyhole-splice')` },
  { id: '3 blockRing-despur', n: 1,
    find: `        if (_iaLabels) _iaLabels = tracked.map((t, k) => t.src.map(j => _iaLabels[k][j])).filter((_, k) => tracked[k].ring.length >= 3)
        blockRings = cleaned`,
    repl: `        if (_iaLabels) _iaLabels = tracked.map((t, k) => t.src.map(j => _iaLabels[k][j])).filter((_, k) => tracked[k].ring.length >= 3)
        ;${COUNT}('3 blockRing-despur')
        blockRings = cleaned` },
  { id: '4 fillet', n: 1,
    find: `    if (_fLabs) _iaLabels = _fLabs`,
    repl: `    if (_fLabs) _iaLabels = _fLabs
    ;${COUNT}('4 fillet')` },
  { id: '5 iA-despur', n: 1,
    find: `        if (_iaLabels) _iaLabels = tracked.map((t, k) => t.src.map(j => _iaLabels[k][j])).filter((_, k) => tracked[k].ring.length >= 3)
        iA = cleaned`,
    repl: `        if (_iaLabels) _iaLabels = tracked.map((t, k) => t.src.map(j => _iaLabels[k][j])).filter((_, k) => tracked[k].ring.length >= 3)
        ;${COUNT}('5 iA-despur')
        iA = cleaned` },
]

let src = fs.readFileSync(TG, 'utf8')
for (const s of SITES) {
  const hits = src.split(s.find).length - 1
  if (hits !== s.n) {
    console.error(`⛔ INSTRUMENT ANCHOR DRIFTED — '${s.id}' matched ${hits}×, expected ${s.n}.`)
    console.error(`   A false ZERO here would point the fix at the wrong stage. Re-anchor first.`)
    process.exit(2)
  }
  src = src.split(s.find).join(s.repl)
}
src = `globalThis.__labRows = globalThis.__labRows || {}\n` + src
src = src.replace(/(from\s*['"])(\.[^'"]*)(['"])/g, (_, a, sp, z) => a + path.resolve(SRCDIR, sp) + z)
const dir = path.join(ROOT, 'scratch/.lab-probe')
fs.mkdirSync(dir, { recursive: true })
const f = path.join(dir, 'tileGround.lab.mjs')
fs.writeFileSync(f, src)
const { buildTileGround } = await import(f)

const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const design = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/looks/lafayette-square/design.json')))
const OPTS = { curbWidth: 0.381, stripMat: { outer: 'LU', inner: 'SW' }, emitArtifact: true }

console.log(`WHERE THE OWNER LABEL IS LOST — nulls after each stage of the shape pass`)
console.log(`Premise, measured: 156 null-stamp iA vertices on LS, 0 of them inside a bulb disc.\n`)

for (const [label, bc] of [['lafayette-square (AUTHORED)', design.blockCustoms || {}], ['lafayette-square (bare defaults)', null]]) {
  globalThis.__labRows = {}
  globalThis.__labOn = true
  const quiet = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn() } finally { console.log = l; console.warn = w } }
  try { quiet(() => buildTileGround(ribbons, { ...OPTS, blockCustoms: bc })) }
  catch (e) { console.log(`── ${label}: BUILD THREW — ${e.message}\n`); globalThis.__labOn = false; continue }
  globalThis.__labOn = false
  console.log(`── ${label} ──`)
  console.log(`   stage                tiles  tiles w/ null   iA verts   NULL labels`)
  const order = ['1 offset-labels', '2 keyhole-splice', '3 blockRing-despur', '4 fillet', '5 iA-despur']
  let prev = 0
  for (const s of order) {
    const r = globalThis.__labRows[s]
    if (!r) { console.log(`   ${s.padEnd(20)}    — did not run on any tile`); continue }
    const jump = r.nulls > prev ? `   ⛔ +${r.nulls - prev} INTRODUCED HERE` : ''
    console.log(`   ${s.padEnd(20)} ${String(r.tiles).padStart(5)} ${String(r.tilesWithNull).padStart(14)} ${String(r.verts).padStart(10)} ${String(r.nulls).padStart(13)}${jump}`)
    prev = r.nulls
  }
  console.log()
}
console.log(`⭐ The first stage with a nonzero count is the site. ⛔ Stage counts are NOT a`)
console.log(`   pipeline — a stage that does not run on a tile leaves the previous count standing,`)
console.log(`   so read the TILES column before reading a jump as a cause.`)
