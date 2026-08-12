#!/usr/bin/env node
/**
 * "DOES THE PER-ENDPOINT DEPTH RAMP CHANGE ANYTHING IT WAS NOT MEANT TO?"
 * (SKELETON §5d — "the outer curb runs straight through the transition")
 *
 * WHY THIS EXISTS. `offsetRingVariable` used to offset every ring edge at ONE
 * constant depth, so the curb was always PARALLEL to its ring edge. A divided
 * nose splays away from the spine's outer line, so no half-width — however good
 * the datum — could hold the outer curb on that line. The producer now accepts a
 * `[start, end]` PAIR and tapers along the edge.
 *
 * That is a contract change to the most-reverted code in the repo, shared with
 * LS's four park corners. So the claim that needs proving is NOT "the new curb is
 * better" — it is the narrow one:
 *
 *   ⭐ WHERE THE TWO ENDPOINTS ARE EQUAL, THE GENERALIZATION IS EXACTLY NEUTRAL.
 *
 * Every edge on the map outside a divided nose has equal endpoints. If that holds,
 * then every byte that moved is attributable to the ramp DATA, and the blast
 * radius is exactly the set of tiles named below — not "somewhere in the offset".
 *
 * HOW IT PROVES IT. Loads `tileGround.js` TWICE from the same source text: once
 * as-is, once with `depthAt`'s pair collapsed back to its mean (the pre-change
 * expression). Same ribbons, same options, same process. Then it compares the
 * frozen shape TILE BY TILE.
 *
 * ⛔ It reads the collapse expression out of the source and rewrites it; it never
 *    restates what the producer does. If the anchor drifts, it EXITS rather than
 *    quietly measuring nothing — an unapplied instrument edit would make every
 *    number below a false green (the pattern is `claims-ia-source-stamp.mjs`'s).
 *
 * ⛔ A tile that differs is NAMED with the streets on it. "N tiles changed" alone
 *    would let an unintended tile hide inside an intended count.
 *
 * Usage: node scratch/claims-curb-ramp-neutral.mjs [--only <substring>]
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRCDIR = path.join(ROOT, 'src/lib')
const TG = path.join(SRCDIR, 'tileGround.js')
const argv = process.argv.slice(2)
const ONLY = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null

// The RAMPING expression, verbatim from the producer. Collapsing it to its mean is
// exactly the code that stood here before the change.
const RAMP = /    return \[f\.prof\[0\] \?\? base, f\.prof\[1\] \?\? base\]\n/
const COLLAPSED = '    return ((f.prof[0] ?? base) + (f.prof[1] ?? base)) / 2\n'

const load = async (collapse) => {
  let out = fs.readFileSync(TG, 'utf8')
  const hits = out.match(new RegExp(RAMP.source, 'g')) || []
  if (hits.length !== 1) {
    console.error(`⛔ INSTRUMENT ANCHOR DRIFTED — matched ${hits.length}×, expected 1.`)
    console.error('   The collapse would be silently unapplied and this check would compare')
    console.error('   the ramped build against ITSELF, printing a perfect green that means nothing.')
    process.exit(2)
  }
  if (collapse) out = out.replace(RAMP, COLLAPSED)
  out = out.replace(/(from\s*['"])(\.[^'"]*)(['"])/g, (_, a, sp, z) => a + path.resolve(SRCDIR, sp) + z)
  const dir = path.join(ROOT, 'scratch/.ramp-probe')
  fs.mkdirSync(dir, { recursive: true })
  const f = path.join(dir, `tileGround.${collapse ? 'collapsed' : 'ramped'}.mjs`)
  fs.writeFileSync(f, out)
  return (await import(f)).buildTileGround
}

const buildRamped = await load(false)
const buildCollapsed = await load(true)

const OPTS = {
  smooth: 0, curbWidth: 0.15, cornerRadius: 3, cornerRadiusScale: 1,
  cornerRadiusOverrides: null, cornerCornerRadiusOverrides: null, emitArtifact: true,
}
const quiet = (fn) => { const w = console.log; console.log = () => {}; try { return fn() } finally { console.log = w } }
const round = (v) => (typeof v === 'number' ? +v.toFixed(6) : v)
const canon = (o) => JSON.stringify(o, (k, v) => round(v))
const h = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16)

// Same state list as the sibling checks: LS twice (authored + defaults — Layer 0
// q3), every other poured scene at its genuine default. A scene that cannot run is
// NAMED, never silently absent.
const lsRibbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const lsDesign = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/looks/lafayette-square/design.json'), 'utf8'))
const states = [
  { id: 'lafayette-square (authored)', ribbons: lsRibbons, blockCustoms: lsDesign.blockCustoms || {} },
  { id: 'lafayette-square (defaults)', ribbons: lsRibbons, blockCustoms: null },
]
const notChecked = []
const TOY = path.join(ROOT, 'src/data/toy/toy-ribbons.json')
if (fs.existsSync(TOY)) states.push({ id: 'toy (defaults)', ribbonsPath: TOY, blockCustoms: null })
else notChecked.push(['toy', 'src/data/toy/toy-ribbons.json missing'])
for (const d of fs.readdirSync(path.join(ROOT, 'cartograph/data')).sort()) {
  if (d === 'toy' || d === 'lafayette-square' || d === 'clean' || d === 'raw') continue
  const p = path.join(ROOT, 'cartograph/data', d, 'clean/ribbons.json')
  if (!fs.existsSync(p)) { notChecked.push([d, 'no clean/ribbons.json — the shape pass cannot be run']); continue }
  states.push({ id: `${d} (defaults)`, ribbonsPath: p, blockCustoms: null })
}
const selected = states.filter(s => !ONLY || s.id.includes(ONLY))
if (!selected.length) { console.error(`⛔ no state matched --only "${ONLY}". Nothing measured — this is NOT a pass.`); process.exit(2) }

console.log('THE PER-ENDPOINT DEPTH RAMP — is it neutral where the endpoints are equal?')
console.log('ramped build vs the SAME source with depthAt collapsed to its mean, tile by tile.\n')

// A carriageway carrying a divided-transition profile is where a ramped edge can
// exist at all. Read off the artifact, not restated.
const rampedStreets = (rb) => new Set((rb.streets || [])
  .filter(s => s.outerHWProfile && Object.keys(s.outerHWProfile).length)
  .map(s => s.skelId || s.name))

let bad = 0, statesRun = 0, totalMoved = 0
for (const s of selected) {
  let A, B, rb
  try {
    rb = s.ribbons || JSON.parse(fs.readFileSync(s.ribbonsPath))
    A = quiet(() => buildRamped(rb, { ...OPTS, blockCustoms: s.blockCustoms }))
    B = quiet(() => buildCollapsed(rb, { ...OPTS, blockCustoms: s.blockCustoms }))
  } catch (e) { console.log(`  ⛔ ${s.id.padEnd(34)} NOT MEASURED — ${e.message.slice(0, 70)}`); bad++; continue }
  const ta = A._shapeArtifact || [], tb = B._shapeArtifact || []
  if (!ta.length) { console.log(`  ⛔ ${s.id.padEnd(34)} NOT MEASURED — 0 tiles`); bad++; continue }
  if (ta.length !== tb.length) { console.log(`  ⛔ ${s.id.padEnd(34)} TILE COUNT MOVED ${tb.length} → ${ta.length} — the ramp changed topology, which it must never do`); bad++; continue }
  statesRun++

  const ramped = rampedStreets(rb)
  const moved = []
  for (let i = 0; i < ta.length; i++) {
    if (h(canon(ta[i])) === h(canon(tb[i]))) continue
    const ids = [...new Set((ta[i].runs || []).map(r => r.skelId).filter(Boolean))]
    moved.push({ i, ids, explained: ids.some(id => ramped.has(id)) })
  }
  totalMoved += moved.length
  // ⛔ THE GATE. A moved tile carrying NO street with a divided-transition profile
  // is a tile the ramp had no business touching — that is the regression this
  // whole check exists to catch, and it fails loudly and by name.
  const unexplained = moved.filter(m => !m.explained)
  const ok = unexplained.length === 0
  if (!ok) bad++
  console.log(`  ${ok ? '✅' : '⛔'} ${s.id.padEnd(34)} ${moved.length} of ${ta.length} tiles moved · ${unexplained.length} UNEXPLAINED`)
  for (const m of moved.slice(0, 40)) {
    console.log(`        ${m.explained ? '·' : '⛔'} tile ${String(m.i).padStart(4)}  ${m.ids.join(', ') || '(no run ids)'}`)
  }
  if (moved.length > 40) console.log(`        … ${moved.length - 40} more`)
  for (const m of unexplained) console.log(`     ⛔ tile ${m.i} moved but carries no street with an outerHWProfile — the ramp reached a tile it does not own`)
}

if (notChecked.length) {
  console.log('\n── NOT CHECKED (named, so it cannot read as a pass) ──')
  for (const [k, why] of notChecked) console.log(`  ⚠️  ${k.padEnd(32)} ${why}`)
}

console.log('\n══ VERDICT ══')
if (!statesRun) { console.log('⛔ FAIL — nothing was measured.'); process.exit(1) }
if (bad) { console.log(`⛔ FAIL — the ramp moved geometry it does not own, in ${bad} state(s) of ${statesRun}.`); process.exit(1) }
console.log(`✅ PASS — ${statesRun} state(s). Every one of the ${totalMoved} moved tiles carries a street with a`)
console.log('   divided-transition profile; every other tile on every scene is byte-identical.')
console.log('   ⇒ where the two endpoints are equal the producer change is exactly neutral, so the')
console.log('     blast radius is the divided noses and nothing else.')
console.log('   ⚠️  This proves CONFINEMENT, not correctness. Whether the curb is RIGHT is')
console.log('      claims-divided-seam-step.mjs and the operator\'s eye (SKELETON §5h).')
