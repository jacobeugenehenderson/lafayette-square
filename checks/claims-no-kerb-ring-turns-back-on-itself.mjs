#!/usr/bin/env node
/**
 * claims-no-kerb-ring-turns-back-on-itself.mjs — DOES ANY ② RING DOUBLE BACK ALONG ITSELF?
 *
 * ⛔ Found 2026-10-14 (Brace's real Huron bake refused on 5,956 unowned ped vertices in tile 6; Tern's trace, Boz's ruling).
 *    ② ring 0 of Huron's tile 6 (block 22) runs 13.06 m out along its `__boundary__` edge to ①'s frame corner and comes
 *    3.378 m straight back: a turn of 180.00°. The painter's corner join (offsetRingByRects) takes the miter at every
 *    corner, and at an exact reversal its cone is degenerate (the two normals are antiparallel), so it accepted a miter
 *    point 123–1,219 km away; the wedge cut a straight 665 m swath through the block's insets and bands were painted
 *    along it, up to 178 m from any street. Dropping that one vertex removes every spike. The reversal itself comes from
 *    a frame edge struck at a street's depth beside a `__boundary__` edge struck at 0 (the mint's un-rotated block flip,
 *    reported separately).
 * ⭐ THE RULE, with no constant of its own: no ② vertex's two edges are ANTIPARALLEL AT LATTICE PRECISION — u·v < 0 and
 *    the sine of their deviation from 180° (|u × v| / |u||v|) under what one step of the lattice ① is minted on (1 /
 *    CLIP_SCALE) resolves along the longer edge (LATTICE / max(|u|, |v|)). That is the condition under which the join's cone
 *    has no width. A sharp corner on long edges (179° over 22 m legs deviates by 0.017, against 4.5e-5) is not this class. An edge of at most two grid steps has no direction on the lattice (booleanLabelled's own
 *    "a zero-length edge has no direction to own", ≤ 2 grid units), so it is skipped.
 * Reads each town's frozen shape (`public/baked/<scene>/shape.json`, every `iaFull` ring; a ring frozen onto several
 * tiles is read once) and names each offender by tile, ring, vertex and the runs of its two edges.
 * ⭐ MUTATION-TESTED every run: a synthetic out-and-back must be caught, a 179° corner on long legs must pass; and the
 *    rule with the lattice swapped for a fixed angle (≥ 179°) must FAIL the second (a 179.5° corner on 22 m legs: the selftest proves the
 *    criterion is the lattice, not an angle).
 *
 *   node checks/claims-no-kerb-ring-turns-back-on-itself.mjs [town ...]      (no town ⇒ every town with a baked shape)
 *   SLAB_DIR=<slab> node checks/claims-no-kerb-ring-turns-back-on-itself.mjs <town>
 * Read-only. Exit 1 on an offender, 2 if the selftest fails.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { CLIP_SCALE } from '../src/lib/lattice.js'

const LATTICE = 1 / CLIP_SCALE
/** the ② vertices whose two edges are antiparallel at lattice precision */
export const reversals = (ring, turnsBack = (u, v) => { const lu = Math.hypot(...u), lv = Math.hypot(...v)
  return (u[0] * v[0] + u[1] * v[1]) < 0 && Math.abs(u[0] * v[1] - u[1] * v[0]) / (lu * lv) < LATTICE / Math.max(lu, lv) }) => {
  const out = [], n = ring.length
  for (let j = 0; j < n; j++) {
    const a = ring[(j - 1 + n) % n], b = ring[j], c = ring[(j + 1) % n], u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]]
    // an edge of at most two grid steps has NO DIRECTION on the lattice (booleanLabelled's own rule: "a zero-length edge has no
    // direction to own", ≤ 2 grid units), so it cannot turn back
    if (!(Math.hypot(...u) > 2 * LATTICE) || !(Math.hypot(...v) > 2 * LATTICE)) continue
    if (turnsBack(u, v)) out.push({ j, inM: Math.hypot(...u), outM: Math.hypot(...v), turn: Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])) * 180 / Math.PI })
  }
  return out
}

// ── selftest: the rule, and the rule with an angle in place of the lattice (the mutation) ──
{ const fails = []
  // Huron tile 6's own three points (② ring 0 v3305–v3307): 13.060 m out along __boundary__, 3.378 m straight back
  const outAndBack = [[4932.459, 1730.195], [4945.403, 1731.931], [4942.055, 1731.482], [4942.055, 3040.215], [4700, 3000]]
  const sharp179 = (() => { const t = 179.5 * Math.PI / 180; return [[0, 0], [22, 0], [22 - 22 * Math.cos(Math.PI - t), 22 * Math.sin(Math.PI - t)], [-10, 20], [-10, -10]] })()
  if (reversals(outAndBack).length !== 1) fails.push(`an out-and-back was not caught (${reversals(outAndBack).length})`)
  if (reversals(sharp179).length !== 0) fails.push('a 179.5° corner on 22 m legs was called a reversal')
  const byAngle = (u, v) => Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])) * 180 / Math.PI >= 179
  if (reversals(sharp179, byAngle).length === 0) fails.push('the mutation (an angle in place of the lattice) was not seen to differ: the selftest proves nothing')
  if (fails.length) { console.error(`⛔ SELF-TEST FAILED:\n   ${fails.join('\n   ')}`); process.exit(2) }
  console.log('self-test: an out-and-back is caught, a 179.5° corner on long legs passes, and an angle rule would not tell them apart') }

const only = process.argv.slice(2).find(a => !a.startsWith('-'))
const slabOf = (s) => process.env.SLAB_DIR && only ? process.env.SLAB_DIR : join(ROOT, 'public', 'baked', s)
const list = only ? [only] : scenes('public/baked/<scene>/shape.json', { label: 'baked shape' })
const fail = []
for (const scene of list) {
  const p = join(slabOf(scene), 'shape.json')
  if (!existsSync(p)) { fail.push(`${scene}: no baked shape.json at ${p}`); continue }
  const tiles = JSON.parse(readFileSync(p, 'utf8')).tiles || [], seen = new Set()
  let rings = 0; const hits = []
  tiles.forEach((t, ti) => (t?.iaFull || []).forEach((ring, ri) => {
    const sig = JSON.stringify(ring); if (seen.has(sig)) return; seen.add(sig); rings++
    const own = (k) => { const s = t.iaStamp?.[ri]?.[k]; return s != null ? `${t.runs[s].skelId}|${t.runs[s].side}` : t.iaCap?.[ri]?.[k] != null ? 'a cap' : 'no run' }
    for (const r of reversals(ring)) { const n = ring.length
      hits.push(`tile ${ti} ring ${ri} v${r.j} (${ring[r.j].map(x => x.toFixed(3)).join(', ')}): ${r.turn.toFixed(2)}° · in ${r.inM.toFixed(3)} m ${own((r.j - 1 + n) % n)} · out ${r.outM.toFixed(3)} m ${own(r.j)}`) } }))
  console.log(`  ${hits.length ? '⛔' : '✅'} ${scene}: ${rings} ② ring(s), ${hits.length} turn(s) back on itself${hits.length ? ':' : ''}`)
  for (const h of hits) console.log(`      ${h}`)
  if (hits.length) fail.push(`${scene}: ${hits.length}`)
}
console.log(fail.length ? `⛔ a ② ring doubles back along itself (${fail.join(' · ')}) — the painter's corner join has no cone there` : '✅ no ② ring turns back on itself')
process.exit(fail.length ? 1 : 0)
