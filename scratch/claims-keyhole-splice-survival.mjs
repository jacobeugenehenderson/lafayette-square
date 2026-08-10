#!/usr/bin/env node
/**
 * "DOES THE LABELLED BASE CURB SURVIVE OUTSIDE THE BULB DISCS — AND IS THE A10
 *  DEFECT ON THESE TILES EVEN OUT THERE?"   (ROADMAP A10 ③, the keyhole pair)
 *
 * WHY THIS EXISTS. `tileGround.js` (the cul-de-sac keyhole splice) replaces the
 * curb ONLY inside a disc around each turning circle:
 *     blockRings = (base − discs) ∪ (keyhole ∩ discs)
 * and then throws the WHOLE tile's provenance away (`_iaNo = 'keyhole-splice'`).
 * `claims-ia-source-stamp.mjs` reports that refusal; this file asks whether the
 * refusal has to be per-TILE, by measuring what the splice actually destroyed.
 *
 * ⛔ IT IS NOT THE CURE and it changes nothing. It measures three things:
 *   1. SURVIVAL — of every vertex of the spliced result, how many EXACT-match a
 *      vertex of the pre-splice labelled `blockRings` on Clipper's own 1/SCALE
 *      integer grid. ⛔ NO TOLERANCE, ever: that exactness is the whole
 *      discipline of the stamp's re-attachment across a boolean, and the
 *      receipt for why proximity is forbidden is at `tileGround.js:3578` —
 *      the nearest-apex matcher whose own comment records it "collided 93x and
 *      orphaned 77x". If an answer here needs a tolerance, the answer is NO.
 *   2. LOCALITY — where the unmatched vertices sit relative to the discs, tested
 *      against THE CONSTRUCTION'S OWN disc polygons (the same 64-gons the splice
 *      clipped with), never a distance knob.
 *   3. ⭐ THE DECISION NUMBER — what fraction of these tiles' A10 defect area
 *      lies OUTSIDE the discs. If the broken band is AT the bulb, surviving
 *      labels out on the grid buy nothing and the wholesale refusal is honest.
 *      The A10 regions come from `claims-band-reaches-lu.mjs`'s own classifier
 *      (imported, never restated) run on the FROZEN `shape.json`.
 *
 * ⚠️ THE 473 m TRAP (`cartograph/_archive/CULDESAC-KEYHOLE-FORENSIC-2026-06-16.md`
 *    lesson (f)/3): a bulb can share one iA ring with a 90-vertex megatile that
 *    spans the neighbourhood, so a per-TILE aggregate hides where geometry sits.
 *    Everything below is therefore split by the disc footprint, never by tile.
 *
 * ⛔ Nothing under `src/` is written. The frozen-vs-live tile identity is
 *    ASSERTED by exact ring equality, and a mismatch aborts — a probe that
 *    silently measured the wrong tile would be a false green.
 *
 * USAGE
 *   node scratch/claims-keyhole-splice-survival.mjs
 *   node scratch/claims-keyhole-splice-survival.mjs --scene lafayette-square
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { loadInstrumented, classifyTile, NOISE_M2 } from './claims-band-reaches-lu.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const argv = process.argv.slice(2)
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i < 0 ? null : (argv[i + 1] ?? '') }
const SCENE = opt('scene') || 'lafayette-square'

// ── the keyhole instrument: pure additions, both anchored exactly once ───────
const KEYHOLE_EDITS = [
  { why: 'dump the pre-splice labelled rings, the discs, and the spliced result',
    find: /^      const spliced = unionRings\(\[\.\.\.differenceRings\(blockRings, _cdDisks\), \.\.\.intersectRings\(keyhole, _cdDisks\)\]\)$/m,
    to: `      const spliced = unionRings([...differenceRings(blockRings, _cdDisks), ...intersectRings(keyhole, _cdDisks)])
      if (globalThis.__khDump) globalThis.__khDump.push({ ring: tile.ring, pre: blockRings, labels: _iaLabels, discs: _cdDisks, post: spliced })` },
]

const SCALE = 1000                                   // tileGround.js:44 — Clipper's grid
const key = (p) => `${Math.round(p[0] * SCALE)},${Math.round(p[1] * SCALE)}`
const ringArea = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
const areaOf = (rings) => (rings || []).reduce((s, r) => s + ringArea(r), 0)
const inPoly = (p, poly) => {                        // even-odd, on the construction's own disc polygon
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c
  }
  return c
}
const distToDisc = (p, disc) => {                    // reported only, never used to decide
  let best = Infinity
  for (let i = 0, n = disc.length; i < n; i++) {
    const a = disc[i], b = disc[(i + 1) % n]
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2
    t = Math.max(0, Math.min(1, t))
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)))
  }
  return best
}
const sameRing = (a, b) => a.length === b.length && a.every((p, i) => key(p) === key(b[i]))

// ── load ONE instrumented copy: the band probe's edits + the keyhole dump ────
const mod = await loadInstrumented(KEYHOLE_EDITS, 'keyhole')
const { buildTileGround, sectionPassTile, bandDump, bandOps } = mod
if (!bandDump?.on) { console.error('⛔ the band dump is not armed — the instrument did not apply. Nothing measured.'); process.exit(2) }

// ── the SHAPE pass, live, with the scene's AUTHORED state (Layer 0 q3) ───────
const ribbonsPath = SCENE === 'lafayette-square'
  ? join(ROOT, 'src/data/ribbons.json')
  : join(ROOT, 'cartograph/data', SCENE, 'clean/ribbons.json')
const designPath = join(ROOT, 'public/looks', SCENE, 'design.json')
if (!existsSync(ribbonsPath) || !existsSync(designPath)) {
  console.error(`⛔ NOT MEASURED — ${SCENE} is missing ribbons.json or design.json. Read nothing into its absence.`)
  process.exit(2)
}
const design = JSON.parse(readFileSync(designPath, 'utf8'))
const ribbons = JSON.parse(readFileSync(ribbonsPath))
const cw = design.curbWidth
if (!Number.isFinite(cw)) { console.error('⛔ design.json has no numeric curbWidth — the construction cannot be run.'); process.exit(2) }

globalThis.__khDump = []
const quiet = (fn) => { const w = console.log; console.log = () => {}; try { return fn() } finally { console.log = w } }
const shape = quiet(() => buildTileGround(ribbons, {
  stencil: null, curbWidth: cw, smooth: 0, blockLandUse: null,
  cornerRadiusScale: 1, cornerRadiusOverrides: null, cornerCornerRadiusOverrides: null,
  emitArtifact: true, blockCustoms: design.blockCustoms || null,
}))
const liveTiles = shape._shapeArtifact || []
const dumps = globalThis.__khDump

console.log(`\n⭐ THE KEYHOLE SPLICE — what it destroys, and where.   scene: ${SCENE} (authored, cw=${cw})`)
console.log(`   live shape pass: ${liveTiles.length} tiles · ${dumps.length} tile(s) took the splice\n`)
if (!dumps.length) { console.error('⛔ NO TILE TOOK THE SPLICE — nothing measured. That is not a pass.'); process.exit(2) }

// ── the frozen bake, for the A10 half. Identity by EXACT ring equality ───────
const bakePath = join(ROOT, 'public/baked', SCENE, 'shape.json')
if (!existsSync(bakePath)) { console.error(`⛔ no bake at ${bakePath} — the A10 half cannot be measured.`); process.exit(2) }
const raw = JSON.parse(readFileSync(bakePath, 'utf8'))
const frozen = Array.isArray(raw) ? raw : (raw.tiles || [])

let bad = 0
const totals = { verts: 0, matched: 0, unIn: 0, unOut: 0, a10: 0, a10Out: 0 }

for (const [n, d] of dumps.entries()) {
  const liveIdx = liveTiles.findIndex(t => t.ring === d.ring)
  const t = liveTiles[liveIdx]
  const stampedBefore = !!d.labels
  console.log(`── splice #${n} · live tile ${liveIdx} · ring ${d.ring.length} vertices · ${d.discs.length} disc(s) ──`)
  console.log(`   pre-splice stamp: ${stampedBefore ? '✅ LABELLED (this is the provenance the splice throws away)' : '⛔ already unstamped before the splice'}`)
  console.log(`   today's refusal : ${t?.iaEdgeReason || (t?.iaEdge ? '(stamped?!)' : '(none)')}`)
  // the discs, located — so the pair can be identified against the archive's
  // Park Place / Saint Vincent turning circles without reading a centerline.
  for (const disc of d.discs) {
    const cx = disc.reduce((s, p) => s + p[0], 0) / disc.length, cy = disc.reduce((s, p) => s + p[1], 0) / disc.length
    console.log(`   disc centre (${cx.toFixed(1)}, ${cy.toFixed(1)}) · R ${Math.hypot(disc[0][0] - cx, disc[0][1] - cy).toFixed(2)} m (= loopR + 9)`)
  }
  // ⛔ PREMISE CHECK, not an assumption: the stamp at this point must be
  // per-vertex aligned to `blockRings`. If it is not, "the labelled base curb"
  // means nothing and every number below is about the wrong array.
  if (stampedBefore) {
    const aligned = d.labels.length === d.pre.length && d.labels.every((l, i) => Array.isArray(l) && l.length === d.pre[i].length)
    console.log(`   stamp alignment : ${aligned ? '✅' : '⛔ NOT ALIGNED —'} ${d.labels.length} label array(s) for ${d.pre.length} pre-splice ring(s)` +
                ` [${d.labels.map((l, i) => `${l.length}/${d.pre[i].length}`).join(' ')}]`)
    if (!aligned) bad++
  }

  // (1) SURVIVAL — exact match on Clipper's own integer grid. No tolerance.
  const preKeys = new Set()
  for (const r of d.pre) for (const p of r) preKeys.add(key(p))
  let matched = 0, unmatched = []
  for (const r of d.post) for (const p of r) (preKeys.has(key(p)) ? matched++ : unmatched.push(p))
  const nv = d.post.reduce((s, r) => s + r.length, 0)
  console.log(`   (1) EXACT survival: ${matched}/${nv} spliced vertices are bit-for-bit a pre-splice vertex` +
              ` (${(100 * matched / nv).toFixed(1)}%) · ${unmatched.length} unmatched`)

  // (2) LOCALITY — against the construction's own disc polygons.
  let unIn = 0; const unOutD = []
  for (const p of unmatched) {
    if (d.discs.some(disc => inPoly(p, disc))) unIn++
    else unOutD.push(Math.min(...d.discs.map(disc => distToDisc(p, disc))))
  }
  const far = unOutD.length ? unOutD.slice().sort((a, b) => b - a) : []
  console.log(`   (2) unmatched INSIDE a disc: ${unIn} · OUTSIDE: ${unOutD.length}` +
              (far.length ? `  (distance from the disc boundary: max ${(far[0] * 1000).toFixed(2)} mm, min ${(far[far.length - 1] * 1000).toFixed(2)} mm)` : ''))
  // ⭐ THE COMPLEMENTARY HALF, and the one that decides it: a labelled vertex
  // OUTSIDE every disc that the splice DESTROYED would falsify "only the inside
  // is replaced" — the 473 m leak the archive records, in its per-vertex form.
  const postKeys = new Set()
  for (const r of d.post) for (const p of r) postKeys.add(key(p))
  let preOut = 0, preOutLost = 0, preIn = 0
  for (const r of d.pre) for (const p of r) {
    if (d.discs.some(disc => inPoly(p, disc))) { preIn++; continue }
    preOut++; if (!postKeys.has(key(p))) preOutLost++
  }
  console.log(`       reverse: of ${preOut} pre-splice vertices OUTSIDE every disc, ${preOutLost} were DESTROYED by the splice` +
              ` · ${preIn} were inside a disc (legitimately replaced)`)
  // survivors that live outside the discs — the population a per-vertex refusal would keep
  let survOut = 0, survIn = 0
  for (const r of d.post) for (const p of r) {
    if (!preKeys.has(key(p))) continue
    if (d.discs.some(disc => inPoly(p, disc))) survIn++; else survOut++
  }
  console.log(`       of the ${matched} survivors: ${survOut} outside every disc · ${survIn} inside one`)

  totals.verts += nv; totals.matched += matched; totals.unIn += unIn; totals.unOut += unOutD.length

  // (3) THE DECISION NUMBER — A10 defect area, split by the disc footprint.
  const fi = frozen.findIndex(f => Array.isArray(f.ring) && sameRing(f.ring, d.ring))
  if (fi < 0) {
    console.log('   (3) ⛔ NOT MEASURED — this tile\'s ring has no EXACT match in the frozen shape.json.')
    console.log('       The bake and the live pass disagree about this tile; an index-based guess here')
    console.log('       would measure the wrong tile. LOUD, never skipped.')
    bad++
    console.log('')
    continue
  }
  bandDump.rows.length = 0
  try { sectionPassTile(frozen[fi], cw, { outer: 'LU', inner: 'SW' }, design.blockCustoms || null) }
  catch (e) { console.log(`   (3) ⛔ LOUD — frozen tile ${fi} threw (${e.message}); never a skip.`); bad++; bandDump.rows.length = 0; console.log(''); continue }
  let a10 = 0, a10Out = 0, a10In = 0
  for (const row of bandDump.rows) {
    const c = classifyTile(row, bandOps)
    if (c.bandArea <= NOISE_M2) continue
    a10 += c.a10Area
    const rings = (c.a10Rings || []).map(r => r.map(p => [p[0], p[1]]))
    if (!rings.length) continue
    const inD = bandOps.intersectRings(rings, d.discs)
    a10In += areaOf(inD)
    a10Out += areaOf(bandOps.differenceRings(rings, d.discs))
  }
  bandDump.rows.length = 0
  console.log(`   (3) A10 defect on frozen tile ${fi}: ${a10.toFixed(1)} m²  →  INSIDE the discs ${a10In.toFixed(1)} m²` +
              ` · OUTSIDE ${a10Out.toFixed(1)} m² (${a10 > 0 ? (100 * a10Out / a10).toFixed(1) : '0.0'}%)`)
  totals.a10 += a10; totals.a10Out += a10Out
  console.log('')
}

console.log('══ TOTALS ══')
console.log(`  (1) EXACT survival across the splice: ${totals.matched}/${totals.verts} vertices` +
            ` (${(100 * totals.matched / totals.verts).toFixed(1)}%) — no tolerance anywhere in this number.`)
console.log(`  (2) unmatched: ${totals.unIn} inside a disc · ${totals.unOut} outside every disc.`)
console.log(`  (3) ⭐ A10 defect on these tiles: ${totals.a10.toFixed(1)} m², of which ${totals.a10Out.toFixed(1)} m²` +
            ` (${totals.a10 > 0 ? (100 * totals.a10Out / totals.a10).toFixed(1) : '0.0'}%) lies OUTSIDE the bulb discs.`)
console.log('\n⚠️  THIS FILE ASSERTS NOTHING AND GATES NOTHING. It is a measurement for a ruling on')
console.log('    whether the keyhole refusal can be per-VERTEX instead of per-TILE. Exit 0 = it ran.')
process.exit(bad ? 1 : 0)
