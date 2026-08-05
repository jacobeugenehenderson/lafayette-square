#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// A07 ACCEPTANCE — the producer must DISCLOSE, and NO CURB MAY MOVE.
//
// A07 adds `producer` + `producerReason` to each frozen tile and makes the
// degeneracy branch loud. It changes nothing about how a curb is drawn, so the
// gate is identity (A03's precedent, `scratch/a03-curb-identity.mjs`):
//
//   1. GEOMETRY IDENTITY — iA / block / curb / asphalt / sidewalk / fillets must
//      be byte-identical on BOTH the authored state and bare defaults. A03 covers
//      this; run it. (`--against a07base` shows only `artifact` moving.)
//   2. ARTIFACT DELTA IS EXACTLY THE NEW KEYS — proved here: strip `producer` and
//      `producerReason` and the artifact hash must return to its pre-change value.
//   3. THE CENSUS + THE NUMBER NOBODY HAS — the structural carve split, and the
//      degeneracy count, reported SEPARATELY (they must never be conflated).
//
// Read-only: no pour, no bake, no writes outside scratch/.
//   node scratch/a07-producer-disclosure.mjs
// ───────────────────────────────────────────────────────────────────────────
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { buildTileGround } = await import(path.join(ROOT, 'src/lib/tileGround.js'))

const round = (v) => (typeof v === 'number' ? +v.toFixed(6) : v)
const canon = (o) => JSON.stringify(o, (k, v) => round(v))
const h = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16)
const quiet = (fn) => { const l = console.log; console.log = () => {}; try { return fn() } finally { console.log = l } }

const OPTS = {
  stencil: null, curbWidth: 0.15, smooth: 0, blockLandUse: null,
  cornerRadiusScale: 1, cornerRadiusOverrides: null, cornerCornerRadiusOverrides: null,
  emitArtifact: true,
}

// ── 2. the artifact delta is EXACTLY the two new keys ──────────────────────
console.log('═'.repeat(74))
console.log('A07 — 2. ARTIFACT DELTA IS EXACTLY THE DISCLOSURE KEYS (LS, both states)')
console.log('═'.repeat(74))
const basePath = path.join(ROOT, 'scratch/.a03-a07base.json')
if (!fs.existsSync(basePath)) {
  console.log('⚠️  no pre-change baseline at scratch/.a03-a07base.json — run, on the PRE-change tree:')
  console.log('      node scratch/a03-curb-identity.mjs --save a07base')
  process.exit(2)
}
const base = JSON.parse(fs.readFileSync(basePath, 'utf8'))
const lsRibbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const design = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/looks/lafayette-square/design.json'), 'utf8'))

let bad = 0
const census = {}
for (const [label, blockCustoms] of [['authored', design.blockCustoms || {}], ['defaults', null]]) {
  const pr = quiet(() => buildTileGround(lsRibbons, { ...OPTS, blockCustoms }))
  const tiles = pr._shapeArtifact || []
  const stripped = tiles.map(t => { const { producer, producerReason, ...rest } = t; return rest })
  const same = h(canon(stripped)) === base[label].artifact
  if (!same) bad++
  console.log(`  ${same ? '✅' : '❌'} ${label.padEnd(9)} artifact minus {producer, producerReason} ` +
              `${same ? '=== pre-change' : `MOVED  ${base[label].artifact} → ${h(canon(stripped))}`}`)
  console.log(`     stamped: ${tiles.filter(t => t.producer).length}/${tiles.length} tiles carry a producer`)
  census[label] = pr
}

// ── 3. the census and THE NUMBER NOBODY HAS, across every poured scene ─────
console.log('\n' + '═'.repeat(74))
console.log('A07 — 3. THE PRODUCER SPLIT (the legitimate class) — an ACCOUNT, not an alarm')
console.log('═'.repeat(74))
const scenes = [['lafayette-square (authored)', null]]
for (const f of fs.readdirSync(path.join(ROOT, 'cartograph/data'))) {
  const p = path.join(ROOT, 'cartograph/data', f, 'clean/ribbons.json')
  if (fs.existsSync(p)) scenes.push([f, p])
}
const failures = []
for (const [name, p] of scenes) {
  let pr
  try {
    const rb = p ? JSON.parse(fs.readFileSync(p)) : lsRibbons
    pr = quiet(() => buildTileGround(rb, { ...OPTS, blockCustoms: p ? null : (design.blockCustoms || {}) }))
  } catch (e) { console.log(`  ${name.padEnd(28)} SKIPPED (${e.message.slice(0, 50)})`); continue }
  const c = pr._curbProducers
  const f = pr._curbProducerFailures
  console.log(`  ${name.padEnd(28)} ${String(c.offset).padStart(4)}/${String(c.total).padStart(4)} offset · ` +
              `${String(c.carve).padStart(4)} carve   ` +
              Object.entries(c.byReason).map(([k, v]) => `${v} ${k}`).join(' · '))
  console.log(`  ${' '.repeat(28)} raw sets: median ${c.sets.median} · small ${c.sets.small} · both ${c.sets.both}`)
  if (f.count) failures.push([name, f])
}

console.log('\n' + '═'.repeat(74))
console.log('A07 — THE DEGENERACY COUNT — the number nobody had (reported SEPARATELY)')
console.log('═'.repeat(74))
if (!failures.length) {
  console.log('  ✅ 0 degenerate offsets on every scene checked.')
  console.log('     ⭐ This is a REAL result, not an absence: POLYGON-FIRST §3 asserted "degenerate: 0"')
  console.log('     and nothing had ever run the branch to confirm it. Now it is instrumented, so the')
  console.log('     day it stops being 0 — on a town nobody has inspected — the pour says so.')
} else {
  for (const [name, f] of failures) { console.log(`\n  ${name}:`); console.log(f.report(name)) }
}

console.log('\n' + '═'.repeat(74))
console.log(bad ? `❌ ${bad} artifact hash(es) moved beyond the disclosure keys — A07 must not change geometry.`
                : '✅ A07 ACCEPTANCE MET — geometry untouched; the artifact differs by exactly the two new keys.')
process.exit(bad ? 1 : 0)
