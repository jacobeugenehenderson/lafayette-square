#!/usr/bin/env node
// claims-the-frame-makes-no-intersection.mjs — IS EVERY `ribbons.intersections` ENTRY A PLACE WHERE STREETS MEET?
//
// ⭐ THE CLASS (Boz, 2026-10-25, BRIEF-the-disc-is-one-source §2b): derive's land-use face walk nodes the street polylines
// together with a CLOSING edge, and its intersection pass took every noded vertex of degree ≥ 3. A street that runs off
// the closing edge meets it at such a vertex, so where two streets reached the edge within the snap distance an
// "intersection" of those two streets was recorded on the edge itself. The closing edge was the disc ring (8 entries at
// exactly R on LS) and is now the bb rectangle (9 entries on the bb lines on LS, before the guard). An intersection is
// where ≥ 2 STREET polylines meet; the frame, like the rim, is an edge of the drawing.
// READS the pour (`ribbons.intersections`, the town's ribbons by scene.js#ribbonsPathOf, or --ribbons=<file>) against the
// town's frame (geography.mjs#localBB through projectorOf, on snap.js's grid: derive's own functions, called) and its
// disc ring (neighborhood_boundary.json). RED where an entry lies within ON_EDGE of a bb line or of the ring.
//   node checks/claims-the-frame-makes-no-intersection.mjs [scene …] [--ribbons=<file> --scene=<s>] [--selftest]
// ⭐ MUTATION TEST: --selftest adds one entry on a bb line and one on the ring to a copy of a real town's list (must go
// RED) and moves each 1 m inside (must stay green). The pour-level mutant (derive's `onFrame` guard removed) was run once
// on LS at the guard's commit and is recorded in its message.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, ribbonsPath, ribbonScenes, refuseUnknownFlags } from './_scenes.mjs'
import { geographyFor, projectorOf, localBB } from '../cartograph/geography.mjs'
import { GRID, onGrid } from '../cartograph/snap.js'

refuseUnknownFlags(['ribbons', 'scene', 'selftest'])
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const ON_EDGE = GRID   // one cell of the noding grid (snap.js, read): an entry this close to a frame line or the ring sits ON it

function frameOf(scene) {
  const osm = JSON.parse(readFileSync(join(ROOT, 'cartograph/data', scene, 'raw/osm.json'), 'utf8'))
  // derive's own frame, by derive's own functions: the bb through the scene's projection, on the noding grid
  const bb = onGrid(localBB(osm, projectorOf(geographyFor(scene))))
  if (!bb) throw new Error(`⛔ ${scene}: raw/osm.json carries no bbox — the frame cannot be placed`)
  const nb = JSON.parse(readFileSync(join(ROOT, 'cartograph/data', scene, 'neighborhood_boundary.json'), 'utf8'))
  if (!Array.isArray(nb.boundary) || nb.boundary.length < 3) throw new Error(`⛔ ${scene}: neighborhood_boundary.json carries no ring`)
  return { bb, ring: nb.boundary }
}
const segD = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
function judge(ixs, { bb, ring }) {
  const bad = []
  for (const x of ixs) {
    const p = x.point
    const fr = Math.min(Math.abs(p[0] - bb.x0), Math.abs(p[0] - bb.x1), Math.abs(p[1] - bb.z0), Math.abs(p[1] - bb.z1))
    let rg = Infinity; for (let i = 0; i < ring.length; i++) rg = Math.min(rg, segD(p, ring[i], ring[(i + 1) % ring.length]))
    if (fr < ON_EDGE) bad.push({ p, on: 'the bb', streets: x.streets })
    else if (rg < ON_EDGE) bad.push({ p, on: 'the disc ring', streets: x.streets })
  }
  return bad
}
const names = (s) => (s || []).map(t => t.name ?? t).join(' + ')

if (process.argv.includes('--selftest')) {
  const scene = ribbonScenes().find(s => existsSync(join(ROOT, 'cartograph/data', s, 'raw/osm.json')))
  if (!scene) { console.log('⛔ NOT RUN — no town with ribbons and raw/osm.json'); process.exit(2) }
  const F = frameOf(scene), base = JSON.parse(readFileSync(join(ROOT, ribbonsPath(scene)), 'utf8')).intersections
  if (!Array.isArray(base)) { console.log(`⛔ NOT RUN — ${scene}'s ribbons carry no \`intersections\``); process.exit(2) }
  const mid = [(F.bb.x0 + F.bb.x1) / 2, F.bb.z0], r0 = F.ring[0], r1 = F.ring[1], onRing = [(r0[0] + r1[0]) / 2, (r0[1] + r1[1]) / 2]
  const c = F.ring.reduce((m, q) => [m[0] + q[0] / F.ring.length, m[1] + q[1] / F.ring.length], [0, 0])
  const inward = (p) => { const d = Math.hypot(c[0] - p[0], c[1] - p[1]); return [p[0] + (c[0] - p[0]) / d, p[1] + (c[1] - p[1]) / d] }
  const before = judge(base, F).length
  let bad = 0
  for (const [name, pt, want] of [['an entry on a bb line', mid, true], ['an entry on the ring', onRing, true],
    ['the bb entry moved 1 m inside', [mid[0], mid[1] + 1], false], ['the ring entry moved 1 m inside', inward(onRing), false]]) {
    const got = judge([...base, { point: pt, streets: [{ name: 'mutant' }] }], F).length > before
    if (got !== want) bad++
    console.log(`  ${got === want ? '✅' : '⛔'} ${scene}: ${name} → ${got ? 'RED' : 'green'} (must be ${want ? 'RED' : 'green'})`)
  }
  process.exit(bad ? 1 : 0)
}

const one = arg('ribbons')
const towns = one ? [arg('scene')] : ribbonScenes()
if (one && !towns[0]) { console.log('⛔ --ribbons needs --scene=<town> (the frame and ring are the town\'s)'); process.exit(2) }
let red = 0
for (const scene of towns) {
  const rp = one || join(ROOT, ribbonsPath(scene))
  if (!existsSync(join(ROOT, 'cartograph/data', scene, 'raw/osm.json'))) { console.log(`⛔ ${scene}: no raw/osm.json — NOT CHECKED`); red++; continue }
  const ixs = JSON.parse(readFileSync(rp, 'utf8')).intersections
  if (!Array.isArray(ixs)) { console.log(`⛔ ${scene}: the ribbons carry no \`intersections\` — NOT CHECKED`); red++; continue }
  const bad = judge(ixs, frameOf(scene))
  if (bad.length) red++
  console.log(`${bad.length ? '⛔' : '✅'} ${scene}: ${ixs.length} intersection(s) · ${bad.length} on the frame or the ring`
    + bad.slice(0, 6).map(b => `\n     (${b.p.map(v => v.toFixed(1)).join(', ')}) on ${b.on} · ${names(b.streets)}`).join(''))
}
console.log(red ? '\n⛔ RED — an intersection was recorded where a street meets the edge of the drawing (derive.js, the IX pass)'
  : '\n✅ GREEN — every intersection is where streets meet')
process.exit(red ? 1 : 0)
