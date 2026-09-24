#!/usr/bin/env node
// CLAIM — EVERY HIGHWAY SWEEP IS A VALID POLYGON (H-3 step 2; the Provincetown failure, 2026-09-24).
//
// `sweepHighway` (tileGround.js) sweeps a highway by its section. When the left and right profiles
// taper at the same station, their knots can differ by float noise; inserting both made a ZERO-LENGTH
// segment, its normal was (0, 0), the miter divided by zero, and an Infinity vertex went into Clipper —
// which took the WHOLE ground build down, live and bake (US 6 / trunk-45, the first MA pour).
//
// Runs the REAL `highwayWidthProfile` + `sweepHighway`, sliced out of tileGround.js (never a copy), on
//   · a FIXTURE: a straight line whose two sides step 1 → 2 lanes at stations that differ by 1e-12 m;
//   · every highway in every poured town's ribbons.
// ASSERTS every swept vertex is finite. A throw from the sweep's own guard is also a failure, named.
//
//   node checks/claims-highway-sweep-is-finite.mjs [scene…]
//
// MUTATION (must go red): remove the micron merge of the taper stations in `sweepHighway`.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'

const src = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8')
const a = src.indexOf('function highwayWidthProfile'), b = src.indexOf('function unionRings')
if (a < 0 || b < a) { console.error('⛔ NOT CHECKED — highwayWidthProfile/sweepHighway not found in tileGround.js'); process.exit(2) }
const { sweepHighway } = await import('data:text/javascript,' + encodeURIComponent(src.slice(a, b) + '\nexport { sweepHighway }'))

const finite = (sw) => sw && sw.ring.every(q => Number.isFinite(q[0]) && Number.isFinite(q[1]))
const trySweep = (pts, L, R) => { try { const sw = sweepHighway(pts, L, R); return sw == null ? { ok: true, skipped: true } : { ok: finite(sw) } } catch (e) { return { ok: false, err: e.message } } }
let red = false

// ── the fixture: both sides step at "the same" station ──
{
  // At MAP coordinates (thousands of metres), where two stations a float-ulp apart interpolate to the
  // SAME point — the case that failed. Near the origin the points stay distinct and nothing is tested.
  const X0 = -2137, Z0 = 541, pts = [0, 20, 40, 60, 100].map(t => [X0 + t * 0.78, Z0 - t * 0.63])
  const sec = (a1, a2, eps) => ({ length: 100, taper: { rate: 12 }, spans: [{ s0: 0, s1: 40 + eps, hw: a1 }, { s0: 40 + eps, s1: 100, hw: a2 }] })
  let r = { ok: true }
  for (const eps of [1e-13, 5e-14, 2e-14, 1e-14]) { const x = trySweep(pts, sec(3.048, 4.877, 0), sec(4.877, 6.706, eps)); if (!x.ok) { r = x; break } }
  console.log(`fixture (two-sided taper at map coordinates, stations a float-ulp apart): ${r.ok ? '✅ finite' : `⛔ ${r.err || 'NON-FINITE vertex'}`}`)
  if (!r.ok) red = true
}

const DEFAULT_MAP = readFileSync(join(ROOT, 'cartograph/scene.js'), 'utf8').match(/export const DEFAULT_MAP = '([^']+)'/)?.[1]
const ribbonsOf = (s) => s === DEFAULT_MAP ? join(ROOT, 'src/data/ribbons.json') : join(ROOT, 'cartograph/data', s, 'clean/ribbons.json')
const H = /^(motorway|motorway_link|trunk|trunk_link)$/
for (const scene of scenes('cartograph/data/<scene>/raw/osm.json')) {
  const p = ribbonsOf(scene)
  if (!existsSync(p)) { console.log(`── ${scene}   ⛔ NOT CHECKED — no ribbons`); red = true; continue }
  const hw = JSON.parse(readFileSync(p, 'utf8')).streets.filter(s => s.gradeSeparated && H.test(s.highway))
  const withSec = hw.filter(s => s.measure?.left?.section?.taper && s.measure?.right?.section?.taper)
  const bad = []
  for (const s of withSec) { const r = trySweep(s.points, s.measure.left.section, s.measure.right.section); if (!r.ok) bad.push(`${s.skelId}${r.err ? ` (${r.err.slice(0, 80)})` : ''}`) }
  console.log(`── ${scene} ── ${withSec.length}/${hw.length} highway(s) with a section swept · ${bad.length ? `⛔ ${bad.length} invalid: ${bad.join(', ')}` : '✅ all finite'}${withSec.length < hw.length ? ` · ${hw.length - withSec.length} poured before H-3 (not swept)` : ''}`)
  if (bad.length) red = true
}
console.log(red ? '\n⛔ A highway sweep is not a valid polygon.' : '\n✅ Every highway sweep is finite.')
process.exit(red ? 1 : 0)
