#!/usr/bin/env node
/**
 * ⛔ THE REVERSAL SIGN TEST — does an offset segment run AGAINST the ring edge that
 *    produced it? RED until no offset segment reverses.
 *
 * WHY THIS AND NOT A CLAMP. `POLYGON-FIRST §3` D6a, measured: 27.8% of self-
 * intersection crossing endpoints are miter/bevel vertices — vertices that went
 * THROUGH the existing clamp and still landed in a fold. Both existing branches are
 * PER-VERTEX LOCAL tests, and offset self-intersection is a GLOBAL property of the
 * walk, so no constant could have saved either. The prescription that used to sit in
 * the canon — "add a miter clamp to the averaged-normal branch" — was proven DEAD
 * (the branch emits at (A.d+B.d)/2, which is bounded below `lim` by construction:
 * 0 of 27,241 vertices across 7 scenes could ever trip it).
 *
 * ⭐ WHAT THE SIGN TEST IS. Offset vertex i is emitted alongside ring edge i. So the
 * emitted segment W[i]→W[i+1] should run in the SAME direction as ring edge WL[i].
 * If it runs backwards, the offset has folded over itself there. **Pure sign — no
 * epsilon, no tuned distance, no radius.** That is the difference between a
 * "topological capacity guard" and a "doctrine clamp" (`RIBBONS §6.9.5`), and it is
 * why this one is allowed where a clamp is not.
 *
 * ⛔ WHAT THIS IS NOT. It changes no geometry and repairs nothing. Today's lesson,
 * twice over: a cure built on an unmeasured premise is worse than no cure, and this
 * is the most-reverted file in the repo. The detector first; the repair only once
 * its population is known and can be re-measured after.
 *
 * ⚠️ EXPECTED COVERAGE, and it is NOT total. The canon records segment-level sign
 * catching 149/193 tiles (77%) against 92/193 for the vertex-level ≥165° reversal
 * `dropFoldSpurs` already uses — with 44 tiles (23%) caught by NEITHER, because a
 * wide loop can cross while every segment still runs forward. Those need the
 * self-intersection detected directly rather than predicted per vertex. ⛔ So a
 * green sign test does not mean "no folds"; it means "no REVERSED segments". Do not
 * let it stand in for the crossing count.
 *
 * ⛔ Read-only; instruments a COPY, anchor asserted 1×, drift ABORTS.
 * ⛔ AUTHORED state (Rule 1) and every poured scene — a fold class measured on one
 *    town is measured on one town.
 *
 * Usage: node scratch/claims-offset-reversal.mjs
 * Exit 0 = no reversed segments anywhere · 1 = RED · 2 = the instrument failed
 * → POLYGON-FIRST §3 (D6a) · RIBBONS §6.9.5 · SURVEY §3
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRCDIR = path.join(ROOT, 'src/lib')
const TG = path.join(SRCDIR, 'tileGround.js')

// Fire AFTER the emit loop, BEFORE the union — the union is what hides a fold by
// resolving it into a small kept ring, so testing after it measures the cover.
const ANCHOR = `  let maxD = 0; for (const s of seg) if (s.d > maxD) maxD = s.d`
const PATCH = `  ;((ring, W, WL) => { if (!globalThis.__revOn) return
    let rev = 0, tot = 0
    const at = []
    for (let i = 0; i < W.length; i++) {
      const j = (i + 1) % W.length
      const e = WL[i]
      if (e == null || WL[j] === e) continue          // same source vertex → a corner, not an edge run
      const a = ring[e], b = ring[(e + 1) % ring.length]
      const ex = b[0] - a[0], ey = b[1] - a[1]
      const wx = W[j][0] - W[i][0], wy = W[j][1] - W[i][1]
      const le = Math.hypot(ex, ey), lw = Math.hypot(wx, wy)
      if (!le || !lw) continue
      tot++
      if ((ex * wx + ey * wy) < 0) { rev++; at.push([+W[i][0].toFixed(1), +W[i][1].toFixed(1)]) }
    }
    const R = globalThis.__rev
    R.segs += tot; R.rev += rev; R.tiles++
    if (rev) { R.badTiles++; R.at.push(...at.slice(0, 4)) }
  })(ring, W, WL)
` + ANCHOR

let src = fs.readFileSync(TG, 'utf8')
const hits = src.split(ANCHOR).length - 1
if (hits !== 1) {
  console.error(`⛔ INSTRUMENT ANCHOR DRIFTED — matched ${hits}×, expected 1.`)
  console.error(`   A false ZERO would read as "the offset is clean". Re-anchor first.`)
  process.exit(2)
}
src = src.replace(ANCHOR, PATCH)
src = src.replace(/(from\s*['"])(\.[^'"]*)(['"])/g, (_, a, sp, z) => a + path.resolve(SRCDIR, sp) + z)
const dir = path.join(ROOT, 'scratch/.rev-probe')
fs.mkdirSync(dir, { recursive: true })
const f = path.join(dir, 'tileGround.rev.mjs')
fs.writeFileSync(f, src)
const { buildTileGround } = await import(f)

const quiet = fn => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn() } finally { console.log = l; console.warn = w } }
const OPTS = { curbWidth: 0.381, stripMat: { outer: 'LU', inner: 'SW' }, emitArtifact: true }

// LS authored FIRST — the most-worked-on town, where a check that ignores authoring
// is blindest (POLYGON-FIRST §5 Rule 1). Then every other poured scene at defaults.
const states = []
const lsRib = path.join(ROOT, 'src/data/ribbons.json')
const lsDes = path.join(ROOT, 'public/looks/lafayette-square/design.json')
if (fs.existsSync(lsRib)) {
  states.push({ id: 'lafayette-square (AUTHORED)', ribbons: JSON.parse(fs.readFileSync(lsRib)), bc: fs.existsSync(lsDes) ? (JSON.parse(fs.readFileSync(lsDes)).blockCustoms || {}) : null })
  states.push({ id: 'lafayette-square (defaults)', ribbons: JSON.parse(fs.readFileSync(lsRib)), bc: null })
}
const notChecked = []
for (const d of fs.readdirSync(path.join(ROOT, 'cartograph/data'))) {
  const p = path.join(ROOT, 'cartograph/data', d, 'clean/ribbons.json')
  if (!fs.existsSync(p)) { notChecked.push([d, 'no clean/ribbons.json — the shape pass cannot be run']); continue }
  states.push({ id: `${d} (defaults)`, ribbons: JSON.parse(fs.readFileSync(p)), bc: null })
}

console.log(`THE REVERSAL SIGN TEST — offset segments that run AGAINST their source ring edge`)
console.log(`Pure sign, no epsilon, no tuned distance. RED until zero.\n`)
console.log('   scene'.padEnd(38), 'tiles  w/ reversal   segments   REVERSED')
let red = false
for (const s of states) {
  globalThis.__rev = { segs: 0, rev: 0, tiles: 0, badTiles: 0, at: [] }
  globalThis.__revOn = true
  try { quiet(() => buildTileGround(s.ribbons, { ...OPTS, blockCustoms: s.bc })) }
  catch (e) { globalThis.__revOn = false; console.log(`   ${s.id.padEnd(36)} BUILD THREW — ${e.message} (NOT MEASURED)`); red = true; continue }
  globalThis.__revOn = false
  const R = globalThis.__rev
  if (R.rev) red = true
  console.log(`   ${(R.rev ? '⛔ ' : '✅ ') + s.id}`.padEnd(38),
    String(R.tiles).padStart(5), String(R.badTiles).padStart(11), String(R.segs).padStart(10), String(R.rev).padStart(10),
    R.at.length ? '  e.g. ' + [...new Set(R.at.map(String))].slice(0, 2).join(' ') : '')
}
if (notChecked.length) {
  console.log(`\n── NOT CHECKED (named, so it cannot read as a pass) ──`)
  for (const [d, why] of notChecked) console.log(`   ⚠️  ${d}: ${why}`)
}
console.log(`\n⛔ A GREEN SIGN TEST IS NOT "NO FOLDS". It means no segment REVERSED. The canon`)
console.log(`   measures 44 of 193 tiles crossing while every segment still runs forward — wide`)
console.log(`   loops that need the self-intersection found directly. Do not quote this as a`)
console.log(`   crossing count, and do not let it retire the crossing measurement.`)
process.exit(red ? 1 : 0)
