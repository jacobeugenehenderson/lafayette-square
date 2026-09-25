#!/usr/bin/env node
// CLAIM — THE GROUND COVERS EVERY BLOCK: nothing inside a block is painted by NOBODY.
//
// The Section painter (`sectionPassProtoTile`) fills a block from its curb inward — curb, walk, lawn, the
// deep tail, then the land use. Where those bands do not tile the block, a region is painted by no ground
// group at all, and the runtime shows the SKY through the ground (huron's US 6 roundabout, 2026-09-24:
// Jacob's "splits in the ground where you see the sky through"). ⛔ The T-junction check cannot see this: it
// finds a vertex lying on another group's edge, and an unpainted region has sound borders on every side —
// it is an ABSENCE, not a crack. This is the instrument for the absence.
// ASSERTS, per frozen ① tile (it carries the stamp inquiry — `iaStamp`): the block region (`iA`) minus the
// union of everything the painter paints for that tile — run with the look's authoring (design.json
// blockCustoms + curbWidth), never a copy of its rules — is EMPTY.
// TOLERANCE, DECLARED FROM THE CONSTRUCTION, never tuned: the painter's geometry lives on the Clipper integer
// grid (`SCALE` units per metre, read from tileGround.js). A leftover piece counts when its MEAN WIDTH
// (2·area / perimeter) exceeds TWO GRID STEPS — thinner is the grid's own rounding along a shared edge.
// ⛔ Not an erosion: ClipperOffset's result depends on ring orientation and join type, and a miter/round
// erosion both reported phantom holes on a clean synthetic block (the instrument, caught by the self-test).
// Reported red with its coordinates and area, per tile.
// ⭐ MEASURED ON SYNTHETIC BLOCKS (the painter's own class, 2026-09-24): a square block with ped bands and
// EASED corners leaves one ~0.07 m², 5 cm-wide piece per corner at the tangent points; square corners or no
// ped bands leave none. So the gaps are the corner treatment's, and grow on irregular real corners.
// A scene whose frozen shape predates ① (no stamped tile) is SKIPPED, SAID, with the reason.
//
//   node checks/claims-the-ground-covers-every-block.mjs [scene…] [--shape=path]
//   node checks/claims-the-ground-covers-every-block.mjs --selftest   (a clean synthetic block must be GREEN;
//        the same block with its land-use band dropped must be RED — the check seen to work both ways)
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import clipperLib from 'clipper-lib'
import { ROOT, scenes } from './_scenes.mjs'
import { sectionPassProtoTile, buildTileGround } from '../src/lib/tileGround.js'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
const src = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8')
const SCALE = +src.match(/^const SCALE = (\d+)/m)?.[1]
if (!SCALE) { console.error('⛔ NOT CHECKED — SCALE not found in tileGround.js'); process.exit(2) }
const MIN_WIDTH_GRID = 2                          // the tolerance: a piece must be wider than 2 grid steps (1/SCALE m each)
const toC = (r) => r.map(p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) }))
const areaC = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; s += p.X * q.Y - q.X * p.Y } return Math.abs(s / 2) / SCALE / SCALE }
const quiet = (f) => { const o = console.log, w = console.warn, e = console.error; console.log = console.warn = console.error = () => {}; try { return f() } finally { console.log = o; console.warn = w; console.error = e } }

// → [{ area, at:[x,z] }] — the unpainted pieces of one tile that survive the grid erosion
function holesOf(t, cw, blockCustoms, drop = null) {
  const out = quiet(() => sectionPassProtoTile(t, cw, { outer: 'LU', inner: 'SW' }, blockCustoms))
  const paint = [...(out.curb || []), ...(out.Wacc || []), ...Object.values(out.tlByLu || {}).flat(), ...(drop === 'lu' ? [] : Object.values(out.luByLu || {}).flat())]
  const region = (t.iA || []).filter(r => r?.length >= 3); if (!region.length) return []
  const c = new clipperLib.Clipper()
  for (const r of region) c.AddPath(toC(r), clipperLib.PolyType.ptSubject, true)
  for (const r of paint) if (r?.length >= 3) c.AddPath(toC(r), clipperLib.PolyType.ptClip, true)
  const diff = []; c.Execute(clipperLib.ClipType.ctDifference, diff, clipperLib.PolyFillType.pftNonZero, clipperLib.PolyFillType.pftNonZero)
  if (!diff.length) return []
  const perim = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; s += Math.hypot(q.X - p.X, q.Y - p.Y) } return s / SCALE }
  return diff.filter(r => r.length >= 3 && 2 * areaC(r) / perim(r) > MIN_WIDTH_GRID / SCALE)
    .map(r => ({ area: areaC(r), at: [r.reduce((s, p) => s + p.X, 0) / r.length / SCALE, r.reduce((s, p) => s + p.Y, 0) / r.length / SCALE] }))
}

if (process.argv.includes('--selftest')) {
  const m = { left: { pavementHW: 4, treelawn: 1.5, sidewalk: 1.5, terminal: 'sidewalk' }, right: { pavementHW: 4, treelawn: 1.5, sidewalk: 1.5, terminal: 'sidewalk' } }
  const line = (id, a, b) => ({ skelId: id, name: id, highway: 'residential', oneway: false, points: [a, b], measure: m, gradeSeparated: false })
  const streets = [line('n', [-200, -100], [200, -100]), line('s', [-200, 100], [200, 100]), line('w', [-100, -200], [-100, 200]), line('e', [100, -200], [100, 200])]
  const tileWith = (scale) => (quiet(() => buildTileGround({ streets }, { grout: 'proto', protoProducer: true, curbWidth: 0.1524, smooth: 0, emitArtifact: true, cornerRadiusScale: scale })).protoShapeTiles || []).find(x => x.iaStamp)
  const t = tileWith(0), te = tileWith(1)       // square corners (clean) · eased corners (the painter's known gap)
  if (!t || !te) { console.log('⛔ SELFTEST could not build a synthetic ① tile'); process.exit(2) }
  const clean = holesOf(t, 0.1524, null), dropped = holesOf(t, 0.1524, null, 'lu'), eased = holesOf(te, 0.1524, null)
  console.log(`selftest: the same block with EASED corners → ${eased.length} hole(s) (the painter's corner class, reported not gated)`)
  const ok = clean.length === 0 && dropped.length > 0
  console.log(`selftest: clean synthetic block → ${clean.length ? `⛔ ${clean.length} hole(s)` : '✅ covered'} · land use dropped → ${dropped.length ? `✅ red (${dropped.reduce((s, h) => s + h.area, 0).toFixed(0)} m² unpainted)` : '⛔ still green — the check is blind'}`)
  process.exit(ok ? 0 : 1)
}

let red = false
for (const scene of (arg('shape') ? named : scenes('public/baked/<scene>/shape.json'))) {
  const p = arg('shape') || join(ROOT, 'public/baked', scene, 'shape.json')
  if (!existsSync(p)) { console.log(`── ${scene}   ⛔ NOT CHECKED — no ${p}`); red = true; continue }
  const tiles = JSON.parse(readFileSync(p, 'utf8')).tiles || []
  const stamped = tiles.filter(t => t.iaStamp)
  if (!stamped.length) { console.log(`── ${scene}   SKIPPED — its frozen shape predates ① (no stamped tile): the painter this checks never drew it. Re-pour + re-bake to judge.`); continue }
  const dp = join(ROOT, 'public/looks', scene, 'design.json'), d = existsSync(dp) ? JSON.parse(readFileSync(dp, 'utf8')) : {}
  const cw = Number.isFinite(d.curbWidth) ? d.curbWidth : 6 * 0.0254
  let holed = 0, total = 0; const rows = []
  for (const [ti, t] of tiles.entries()) {
    if (!t.iaStamp) continue
    const hs = holesOf(t, cw, d.blockCustoms || null)
    if (!hs.length) continue
    const a = hs.reduce((s, h) => s + h.area, 0); holed++; total += a
    const big = hs.sort((x, y) => y.area - x.area)[0]
    rows.push(`tile ${ti} (${t.lu}) ${hs.length} hole(s), ${a.toFixed(2)} m² — largest ${big.area.toFixed(2)} m² at (${big.at[0].toFixed(1)}, ${big.at[1].toFixed(1)})`)
  }
  const legacy = tiles.length - stamped.length
  console.log(`── ${scene} ── ${stamped.length} ① tile(s)${legacy ? ` (+${legacy} legacy, not judged)` : ''} · ${holed} with ground painted by nobody · ${total.toFixed(1)} m² ${holed ? '⛔' : '✅'}`)
  for (const r of rows.sort((x, y) => parseFloat(y.split(', ')[1]) - parseFloat(x.split(', ')[1])).slice(0, 8)) console.log(`   ⛔ ${r}`)
  if (holed) red = true
}
console.log(red ? '\n⛔ Some block has ground painted by nobody — the sky shows through there.' : '\n✅ Every block is covered.')
process.exit(red ? 1 : 0)
