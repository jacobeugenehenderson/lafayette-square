#!/usr/bin/env node
/**
 * FORENSIC — WHY DOES THE OFFSET SELF-INTERSECT ON THE TILES THAT REFUSE THE STAMP?
 *
 * `offsetRingVariable` builds W (one or two points per ring vertex, fully
 * index-tracked) and then ends in `unionRings([W])` — a Clipper boolean. Where W
 * self-intersects, Clipper MINTS vertices at the crossings, and a minted vertex has
 * no source ring edge, so the A10-③ stamp refuses the tile
 * (`offset:clipper-minted-vertex`). LS 13 · altadena 88 · centrum 40 · HPDM 27 ·
 * staging 25 · ksi 0 · toy 0.
 *
 * ⛔ SIZE IT, DO NOT FIX IT. Nothing here changes live source. It instruments a
 *    COPY of tileGround.js via ONE declared edit, asserted to match exactly once, so
 *    anchor drift aborts loudly instead of silently measuring an unapplied
 *    instrument (the `claims-band-reaches-lu.mjs` pattern).
 * ⛔ NOTHING IS RE-POURED OR RE-BAKED — the shape pass runs live off
 *    `clean/ribbons.json` (Jacob's ruling, 2026-08-09).
 *
 * WHAT IT CLASSIFIES. For each refusing tile it takes W (the pre-union offset walk)
 * and finds every self-intersection, then splits them by INDEX DISTANCE along W —
 * which is the whole question, because the two candidate causes have different
 * signatures and different cures:
 *
 *   LOCAL  (|Δi| small)  — the fold NEEDLE: a bend tighter than the offset depth
 *          makes the walk double back on itself. This is exactly the class
 *          `dropFoldSpurs` + the SPUR_COS >165° pre-scan already target
 *          (POLYGON-FIRST §3, the D6a robust offset).
 *   GLOBAL (|Δi| large) — two DISTANT parts of the ring's offset colliding: the
 *          inward offset has passed the tile's medial axis, so opposite frontages
 *          meet in the middle. Different failure, different cure; the fold
 *          machinery cannot see it because there is no local reversal to detect.
 *
 * It additionally reports, per tile, whether the ≥165° reversal test that gates
 * `dropFoldSpurs` FIRES AT ALL — i.e. whether the existing machinery would even
 * recognise the tile — and whether the tile ran in `clean` mode (where the strip is
 * enabled) or not.
 *
 * Usage:  node scratch/fold-mint-forensic.mjs [--only <scene>] [--rows N]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import clipperLib from 'clipper-lib'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRCDIR = path.join(ROOT, 'src/lib')
const TG = path.join(SRCDIR, 'tileGround.js')
const TMP = path.join(ROOT, 'scratch/.fold-probe')

const argv = process.argv.slice(2)
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null }
const ONLY = opt('only')
const ROWS = +(opt('rows') || 8)

// ── THE INSTRUMENT — one declared edit, at the refusal site itself ───────────
// It captures the inputs to the refusal and nothing else; it cannot change a
// coordinate because it only pushes onto a global sink.
const EDITS = [{
  why: 'arm the fold dump at the non-clean refusal site',
  find: /    const keep = uni\.map\(\(r, k\) => k\)\.filter\(k => Math\.abs\(signedArea\(uni\[k\]\)\) > AREA_MIN\)\n/,
  to: `    const keep = uni.map((r, k) => k).filter(k => Math.abs(signedArea(uni[k])) > AREA_MIN)
    if (globalThis.__foldDump) globalThis.__foldDump.push({ reason: 'offset', ring, W, WL, uni, clean: false, seg: seg.map(s => s.d), AREA_MIN })
`,
}, {
  why: 'arm the fold dump at the clean (curved-tile) refusal site',
  find: /  const out = \[\], outL = \[\]\n/,
  to: `  if (globalThis.__foldDump) globalThis.__foldDump.push({ reason: 'offset', ring, W: W0, WL: L0, uni, clean: true, seg: seg.map(s => s.d), AREA_MIN })
  const out = [], outL = []
`,
}]

const loadInstrumented = async () => {
  const src = fs.readFileSync(TG, 'utf8')
  let out = src
  for (const e of EDITS) {
    const hits = out.match(new RegExp(e.find.source, 'g')) || []
    if (hits.length !== 1) {
      console.error(`⛔ INSTRUMENT ANCHOR DRIFTED — matched ${hits.length}×, expected exactly 1:\n   ${e.find}\n   ${e.why}`)
      console.error('   The edit would be silently unapplied and every number below would be a FALSE GREEN.')
      process.exit(2)
    }
    out = out.replace(e.find, e.to)
  }
  out = out.replace(/(from\s*['"])(\.[^'"]*)(['"])/g, (_, a, spec, z) => a + path.resolve(SRCDIR, spec) + z)
  fs.mkdirSync(TMP, { recursive: true })
  const p = path.join(TMP, 'tileGround.fold.mjs')
  fs.writeFileSync(p, out)
  return await import(p)
}

// ── plane geometry (NOT a restatement of any tileGround decision) ────────────
const SPUR_COS = Math.cos(165 * Math.PI / 180)
const turnCos = (a, v, b) => {
  const ix = v[0] - a[0], iy = v[1] - a[1], ox = b[0] - v[0], oy = b[1] - v[1]
  const li = Math.hypot(ix, iy) || 1, lo = Math.hypot(ox, oy) || 1
  return (ix / li) * (ox / lo) + (iy / li) * (oy / lo)
}
const segInt = (p1, p2, p3, p4) => {
  const d1x = p2[0] - p1[0], d1y = p2[1] - p1[1], d2x = p4[0] - p3[0], d2y = p4[1] - p3[1]
  const den = d1x * d2y - d1y * d2x
  if (Math.abs(den) < 1e-12) return null
  const t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / den
  const u = ((p3[0] - p1[0]) * d1y - (p3[1] - p1[1]) * d1x) / den
  if (t < 1e-9 || t > 1 - 1e-9 || u < 1e-9 || u > 1 - 1e-9) return null
  return [p1[0] + d1x * t, p1[1] + d1y * t]
}
const ringArea = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
// Largest inscribed reach, by the same bisection the capacity guard uses on iA —
// but run on the TILE RING, which is what W is offset from. Reported so "did the
// offset pass the medial axis?" is a measured quantity, not an adjective.
// (offsetRings is not exported from tileGround; this uses clipper-lib directly with
// the same SCALE/join the source does, so it is the same measurement, not a proxy.)
const SCALE = 1000
const erodes = (ring, d) => {
  const { ClipperOffset, JoinType, EndType } = clipperLib
  const co = new ClipperOffset(2, 0.25 * SCALE)
  co.AddPath(ring.map(p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })), JoinType.jtMiter, EndType.etClosedPolygon)
  const out = []
  co.Execute(out, -d * SCALE)
  return out.length > 0
}
const inradius = (ring) => {
  let lo = 0, hi = 200
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (erodes(ring, mid)) lo = mid; else hi = mid }
  return lo
}

// ── the states (live shape pass; nothing re-baked) ──────────────────────────
const OPTS = {
  stencil: null, curbWidth: 0.15, smooth: 0, blockLandUse: null,
  cornerRadiusScale: 1, cornerRadiusOverrides: null, cornerCornerRadiusOverrides: null,
  emitArtifact: true,
}
const states = []
const lsR = path.join(ROOT, 'src/data/ribbons.json')
states.push({ id: 'lafayette-square', ribbonsPath: lsR })
const toy = path.join(ROOT, 'src/data/toy/toy-ribbons.json')
if (fs.existsSync(toy)) states.push({ id: 'toy', ribbonsPath: toy })
for (const d of fs.readdirSync(path.join(ROOT, 'cartograph/data')).sort()) {
  if (d === 'toy' || d === 'lafayette-square' || d === 'clean' || d === 'raw') continue
  const p = path.join(ROOT, 'cartograph/data', d, 'clean/ribbons.json')
  if (fs.existsSync(p)) states.push({ id: d, ribbonsPath: p })
}
const selected = states.filter(s => !ONLY || s.id.includes(ONLY))

const mod = await loadInstrumented()
const { buildTileGround } = mod
const quiet = (fn) => { const w = console.log; console.log = () => {}; try { return fn() } finally { console.log = w } }

console.log('\n⭐ FORENSIC — WHY THE OFFSET SELF-INTERSECTS ON THE TILES THAT REFUSE THE STAMP')
console.log('   LOCAL = a fold needle (the class dropFoldSpurs/SPUR_COS already target).')
console.log('   GLOBAL = the inward offset passed the tile\'s medial axis; opposite frontages met.')
console.log('   ⛔ Nothing re-poured, nothing re-baked, live source untouched.\n')

const totals = { tiles: 0, local: 0, global: 0, both: 0, none: 0, spurFires: 0, cleanMode: 0, offsetTiles: 0 }
const perScene = []

for (const s of selected) {
  globalThis.__foldDump = []
  let pr
  try { pr = quiet(() => buildTileGround(JSON.parse(fs.readFileSync(s.ribbonsPath)), { ...OPTS, blockCustoms: null })) }
  catch (e) { console.log(`  ⛔ ${s.id} NOT MEASURED — ${e.message.slice(0, 60)}`); continue }
  const tiles = pr._shapeArtifact || []
  const offsetTiles = tiles.filter(t => t.producer === 'offset').length
  // ⚠️ RE-ANCHORED after the provenance channel landed: the old anchors were the
  // refusal sites, which no longer fire. The dump is now EVERY offset tile, so the
  // fold population is selected here, by the definition — W self-intersects.
  const selfX = (W) => { const n = W.length; for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (segInt(W[i], W[(i + 1) % n], W[j], W[(j + 1) % n])) return true } return false }
  const dump = globalThis.__foldDump.filter(d => selfX(d.W))

  const rows = []
  for (const d of dump) {
    const W = d.W, n = W.length
    // every self-intersection of W, split by index distance along the walk
    let local = 0, global = 0, minLocalGap = Infinity, maxGap = 0
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue                    // adjacent across the seam
        if (!segInt(W[i], W[(i + 1) % n], W[j], W[(j + 1) % n])) continue
        const gap = Math.min(j - i, n - (j - i))
        if (gap <= 3) { local++; minLocalGap = Math.min(minLocalGap, gap) } else { global++; maxGap = Math.max(maxGap, gap) }
      }
    }
    // would the EXISTING machinery even see this tile? (the >165° reversal pre-scan)
    let spur = 0
    for (let i = 0; i < n; i++) if (turnCos(W[(i - 1 + n) % n], W[i], W[(i + 1) % n]) < SPUR_COS) spur++
    const R = inradius(d.ring)
    const maxD = Math.max(...d.seg)
    rows.push({
      ring: d.ring.length, W: n, local, global, spur, clean: d.clean, minLocalGap,
      inradius: R, maxDepth: maxD, ratio: R > 1e-9 ? maxD / R : Infinity,
      area: Math.abs(ringArea(d.ring)),
    })
    totals.tiles++
    if (local && global) totals.both++; else if (local) totals.local++; else if (global) totals.global++; else totals.none++
    if (spur) totals.spurFires++
    if (d.clean) totals.cleanMode++
  }
  totals.offsetTiles += offsetTiles
  perScene.push({ id: s.id, offsetTiles, minted: rows.length, rows })
}

console.log('── RATE, normalised: a minted-vertex tile is a fraction of the OFFSET tiles, not of all tiles ──')
for (const p of perScene) {
  const pct = p.offsetTiles ? (100 * p.minted / p.offsetTiles).toFixed(1) : '—'
  const nLocal = p.rows.filter(r => r.local && !r.global).length
  const nGlobal = p.rows.filter(r => r.global && !r.local).length
  const nBoth = p.rows.filter(r => r.local && r.global).length
  const nNone = p.rows.filter(r => !r.local && !r.global).length
  const spur = p.rows.filter(r => r.spur > 0).length
  const cln = p.rows.filter(r => r.clean).length
  console.log(`  ${p.id.padEnd(24)} ${String(p.minted).padStart(4)}/${String(p.offsetTiles).padStart(4)} offset tiles mint  (${pct}%)` +
    `   LOCAL ${nLocal} · GLOBAL ${nGlobal} · BOTH ${nBoth} · NEITHER ${nNone}` +
    `   ·  >165° reversal present on ${spur} · ran in clean mode ${cln}`)
}

console.log('\n── THE TILES, worst-ratio first (ratio = max offset depth ÷ the tile ring\'s inscribed reach) ──')
console.log('   ratio ≥ 1 means the inward offset went past what the tile can hold — the medial-axis case.')
const all = perScene.flatMap(p => p.rows.map(r => ({ ...r, scene: p.id })))
all.sort((a, b) => b.ratio - a.ratio)
console.log(`   ${'scene'.padEnd(22)} ${'ring'.padStart(5)} ${'W'.padStart(5)} ${'local'.padStart(6)} ${'global'.padStart(7)} ${'spur'.padStart(5)} ${'depth'.padStart(7)} ${'reach'.padStart(7)} ${'ratio'.padStart(6)}  clean`)
for (const r of all.slice(0, ROWS)) {
  console.log(`   ${r.scene.padEnd(22)} ${String(r.ring).padStart(5)} ${String(r.W).padStart(5)} ${String(r.local).padStart(6)} ${String(r.global).padStart(7)} ${String(r.spur).padStart(5)} ${r.maxDepth.toFixed(2).padStart(7)} ${r.inradius.toFixed(2).padStart(7)} ${r.ratio.toFixed(2).padStart(6)}  ${r.clean ? 'yes' : 'no'}`)
}

const ratioOver = all.filter(r => r.ratio >= 1).length
console.log(`\n── SUMMARY (${totals.tiles} minting tiles across ${selected.length} scene(s), ${totals.offsetTiles} offset tiles total) ──`)
console.log(`   LOCAL only ${totals.local} · GLOBAL only ${totals.global} · BOTH ${totals.both} · NEITHER ${totals.none}`)
console.log(`   the >165° reversal the existing pre-scan gates on is present on ${totals.spurFires}/${totals.tiles}`)
console.log(`   ran in clean mode (where dropFoldSpurs is enabled) : ${totals.cleanMode}/${totals.tiles}`)
console.log(`   offset depth ≥ the ring's inscribed reach          : ${ratioOver}/${totals.tiles}`)
console.log('     ⚠️ that ratio uses the tile\'s LARGEST inscribed circle, so it answers "is the whole')
console.log('        tile swallowed at this depth", NOT "is there a local pinch". A narrow waist is')
console.log('        invisible to it. ⛔ Do not read ratio < 1 as "the depth is fine here".')

// ⭐ THE QUESTION THAT DECIDES "ONE CLASS OR SEVERAL": among the tiles whose offset
// crosses itself LOCALLY, does the ≥165° reversal — the only thing dropFoldSpurs can
// remove — actually exist? A crossing at index gap 2 is a NEEDLE (a reversal tip).
// A crossing at gap ≥3 is a small LOOP: three or more vertices turning ~90°, no
// reversal anywhere, so the existing strip is structurally unable to see it.
const loc = all.filter(r => r.local > 0)
const needle = loc.filter(r => r.spur > 0)
const loop = loc.filter(r => r.spur === 0)
console.log('\n── ONE CLASS OR SEVERAL — the local crossings, split by whether a reversal exists ──')
console.log(`   tiles with a LOCAL self-crossing            : ${loc.length}`)
console.log(`     · NEEDLE  — a ≥165° reversal is present   : ${needle.length}   (dropFoldSpurs CAN see these)`)
console.log(`     · LOOP    — no reversal anywhere on W     : ${loop.length}   ⛔ (dropFoldSpurs is structurally blind)`)
console.log(`   min index gap of the local crossing: gap2 ${loc.filter(r => r.minLocalGap === 2).length} · gap3 ${loc.filter(r => r.minLocalGap === 3).length}`)
console.log(`   tiles with ONLY a global (distant-part) crossing: ${all.filter(r => r.global > 0 && r.local === 0).length}`)

