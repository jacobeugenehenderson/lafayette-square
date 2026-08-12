#!/usr/bin/env node
/**
 * ⛔ EVERY ARC OF THE RING MUST BE PAINTED BY EXACTLY ONE CLAIM.
 *
 * Jacob: "The sidewalks, treelawns, and ADA concrete pads at the corners must be
 * uninterrupted and smooth." · "this won't be ABLE to happen."
 *
 * `bandSpans` yields a COMPLETE partition — every ring edge lands in exactly one
 * span, and `spanClaimPoly` closes each span on the ring's own inward bisector, so
 * neighbouring claims share a cut exactly: "no gap to fall into land use, no
 * overlap to double-paint." A gap is not constructible IN THE PARTITION.
 *
 * ⭐ SO A GAP CAN ONLY COME FROM THE CONSUMER DROPPING A SPAN. This counts that.
 * Four drop sites, all `continue`, all silent:
 *   1. `!tally.size`        — an arc whose stamp is all-null (keyhole-minted). Ruled:
 *                             "an arc with no owner is simply never walked."
 *   2. `!byIdx.get(s.owner)` — an owner index with no resolved run.
 *   3. `empty-pad`          — the span was DIVERTED to cornerSpans (so no run paints
 *                             it) and then the pad came back empty. ⛔ This is the
 *                             worst of the four: the partition allocated the arc and
 *                             the consumer threw it away.
 *   4. `zero-depth`         — same shape, c.T <= 1e-6.
 *
 * An unpainted arc is NOT a hole in the mesh — it falls to `luRemainder` and renders
 * as LAND USE (SECTION §7). So it is invisible to any area or coverage measure and
 * shows up only as the operator's eye seeing the walk cut to the curb by a green wedge.
 *
 * ⛔ Runs WITH the scene's authored blockCustoms (Rule 1). Unstamped tiles are
 * reported as their own class, never folded in (Rule 2) — they have no partition at
 * all, which is A06, not this.
 *
 * Usage: node scratch/claims-unpainted-arcs.mjs [--scene <name>]
 * Exit 0 = every allocated arc is painted · 1 = arcs dropped · 2 = instrument drift
 * → SECTION §7 · POLYGON-FIRST §2.1 · ROADMAP A07/A10/A06
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRCDIR = path.join(ROOT, 'src/lib')
const TG = path.join(SRCDIR, 'tileGround.js')

const SITES = [
  { id: 'span-total', n: 1,
    find: `        for (const s of spansRaw) {`,
    repl: `        for (const s of spansRaw) {
          __arc && __arc('allocated')` },
  { id: 'unowned-arc', n: 1,
    find: `      if (!tally.size) continue                    // unowned arc — not painted, not guessed`,
    repl: `      if (!tally.size) { __arc && __arc('drop:unowned-arc'); continue }` },
  { id: 'owner-unresolved', n: 1,
    find: `          if (!e) continue                       // an owner index with no resolved run: refuse the arc rather than guess an owner — the invariant still reports it`,
    repl: `          if (!e) { __arc && __arc('drop:owner-unresolved'); continue }` },
  { id: 'diverted-to-corner', n: 1,
    find: `          if (corner) { cornerSpans.set(s.fillet, poly); continue }`,
    repl: `          if (corner) { __arc && __arc('diverted-to-corner'); cornerSpans.set(s.fillet, poly); continue }` },
  // ⚠️ An empty pad is NOT automatically a hole. `pad = shallow ∩ sector`, and `shallow`
  // derives from `bandRem` — so it also comes back empty when a LEG has already painted
  // that ground, which is not a defect at all. Measured 2026-08-11: all 6 of LS's
  // empty-pads were of that harmless kind, and calling them holes nearly bought a "fix"
  // for a non-bug in the most-reverted file in the repo. So the test is the AREA still
  // unclaimed at that moment, never the mere fact of an empty pad.
  { id: 'empty-pad', n: 1,
    find: `        if (!pad.length) { dump('empty-pad'); continue }`,
    repl: `        if (!pad.length) {
          if (partitioned && cornerSpans.get(best)) {
            const free = intersectRings(bandRem, cornerSpans.get(best))
            let ar = 0
            for (const g of free) { let a2 = 0; for (let q = 0; q < g.length; q++) { const w = (q + 1) % g.length; a2 += g[q][0] * g[w][1] - g[w][0] * g[q][1] } ar += Math.abs(a2 / 2) }
            __arc && __arc(ar > 0.05 ? 'DROP:empty-pad-UNCLAIMED-GROUND' : 'empty-pad(ground already painted)')
          } else __arc && __arc('empty-pad(unstamped tile)')
          dump('empty-pad'); continue }` },
  { id: 'zero-depth', n: 1,
    find: `        if (c.T <= 1e-6) { dump('zero-depth'); continue }`,
    repl: `        if (c.T <= 1e-6) { __arc && __arc('drop:zero-depth'); dump('zero-depth'); continue }` },
]

let src = fs.readFileSync(TG, 'utf8')
for (const s of SITES) {
  const hits = src.split(s.find).length - 1
  if (hits !== s.n) {
    console.error(`⛔ INSTRUMENT ANCHOR DRIFTED — '${s.id}' matched ${hits}×, expected ${s.n}.`)
    console.error(`   Every number below would be a FALSE GREEN. Re-anchor first.`)
    process.exit(2)
  }
  src = src.split(s.find).join(s.repl)
}
src = `globalThis.__arcRows = globalThis.__arcRows || []
const __arc = (k) => { globalThis.__arcOn && globalThis.__arcRows.push(k) }
` + src
src = src.replace(/(from\s*['"])(\.[^'"]*)(['"])/g, (_, a, sp, z) => a + path.resolve(SRCDIR, sp) + z)
const dir = path.join(ROOT, 'scratch/.arc-probe')
fs.mkdirSync(dir, { recursive: true })
const f = path.join(dir, 'tileGround.arc.mjs')
fs.writeFileSync(f, src)
const { sectionPassTile } = await import(f)

const argScene = process.argv.includes('--scene') ? process.argv[process.argv.indexOf('--scene') + 1] : null
const scenes = (argScene ? [argScene] : fs.readdirSync(path.join(ROOT, 'public/baked')))
  .filter(s => fs.existsSync(path.join(ROOT, 'public/baked', s, 'shape.json')))

console.log(`EVERY ARC OF THE RING MUST BE PAINTED BY EXACTLY ONE CLAIM`)
console.log(`A dropped arc is not a hole — it falls to luRemainder and renders as LAND USE.\n`)

let red = false
for (const scene of scenes) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/baked', scene, 'shape.json'), 'utf8'))
  const tiles = Array.isArray(raw) ? raw : raw.tiles
  if (!Array.isArray(tiles) || !tiles.length) { console.log(`── ${scene}: no tiles — NOT MEASURED\n`); red = true; continue }
  const lp = path.join(ROOT, 'public/looks', scene, 'design.json')
  const bc = fs.existsSync(lp) ? (JSON.parse(fs.readFileSync(lp, 'utf8')).blockCustoms || null) : null

  const tot = {}
  let stamped = 0, unstamped = 0
  globalThis.__arcOn = true
  for (const st of tiles) {
    ;(Array.isArray(st.iaEdge) && st.iaEdge.length) ? stamped++ : unstamped++
    globalThis.__arcRows = []
    try { sectionPassTile(st, 0.381, { outer: 'LU', inner: 'SW' }, bc) } catch { globalThis.__arcRows = []; continue }
    for (const k of globalThis.__arcRows) tot[k] = (tot[k] || 0) + 1
    globalThis.__arcRows = []
  }
  globalThis.__arcOn = false

  const alloc = tot['allocated'] || 0
  const dropped = Object.entries(tot).filter(([k]) => k.startsWith('drop:') || k.startsWith('DROP:')).reduce((s, [, n]) => s + n, 0)
  console.log(`── ${scene} ──  ${tiles.length} tiles · ${stamped} stamped · ${unstamped} unstamped (A06, no partition to drop from)`)
  console.log(`   arcs allocated by the partition: ${alloc}`)
  for (const [k, n] of Object.entries(tot).sort((a, b) => b[1] - a[1])) {
    if (k === 'allocated') continue
    const bad = k.startsWith('drop:') || k.startsWith('DROP:')
    console.log(`   ${bad ? '⛔' : '  '} ${k.padEnd(32)} ${String(n).padStart(5)}`)
  }
  console.log(`   ⇒ ${dropped ? `⛔ ${dropped} ARC(S) ALLOCATED AND NEVER PAINTED` : '✅ every allocated arc is painted'}\n`)
  if (dropped) red = true
}

console.log(`⭐ \`DROP:empty-pad-ON-OWNED-ARC\` is the one that matters most: the span was taken OUT
   of its run's claim (diverted to the corner) and then the corner threw it away. The
   partition said who owns that ground and the consumer painted nobody there.
   ⛔ The cure is NOT a fallback to a neighbour — that is proximity recovery. The corner
   OWNS the arc, so a corner that cannot build its ADA pad must still paint its arc as
   band: "the ADA pad is a band-slice, NOT predicated on the arc" (SECTION §7, invariant 3).`)
process.exit(red ? 1 : 0)
